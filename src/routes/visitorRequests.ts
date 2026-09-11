import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendPushToUser } from '../services/pushNotifications.js';
import { emitToUser, emitToSocietyAdmins } from '../services/realtime.js';

const router = Router();

// Gate/visitor management: a guard (currently the admin login — no separate
// Guard role exists yet) logs a visitor at the gate against one specific
// resident (this society allows only one registered owner per flat, so
// targeting a resident is equivalent to targeting "this flat"). The
// resident approves/denies in real time. No auto-expiry — an unanswered
// request just stays 'Pending' and the guard follows up by phone.
router.use('/api/visitor-requests', requireAuth);

function mapRow(row: any) {
  return {
    id: row.id,
    societyId: row.society_id,
    residentUid: row.resident_uid,
    residentName: row.resident_name || '',
    wing: row.wing || '',
    apartmentNo: row.apartment_no || '',
    visitorName: row.visitor_name,
    visitorPhone: row.visitor_phone || '',
    purpose: row.purpose || '',
    photoUrl: row.photo_url || '',
    status: row.status,
    createdBy: row.created_by || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    respondedAt: row.responded_at || ''
  };
}

// Guards/admins see every request for their society (optionally filtered by
// status, e.g. the live "Pending" queue at the gate desk); residents only
// ever see their own — enforced server-side, same privacy principle as the
// targeted-notices feature.
router.get('/api/visitor-requests', async (req, res) => {
  try {
    const { societyId, status } = req.query;
    const isAdmin = req.user!.role === 'SuperAdmin' || req.user!.role === 'WingAdmin' || req.user!.role === 'Guard';

    let query = 'SELECT * FROM society_visitor_requests WHERE 1=1';
    const params: any[] = [];

    if (societyId) {
      params.push(societyId);
      query += ` AND society_id = $${params.length}`;
    }
    if (!isAdmin) {
      params.push(req.user!.uid);
      query += ` AND resident_uid = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(mapRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/visitor-requests', requireRole('SuperAdmin', 'WingAdmin', 'Guard'), async (req, res) => {
  const {
    id, societyId, residentUid, residentName, wing, apartmentNo,
    visitorName, visitorPhone, purpose, photoUrl
  } = req.body;

  if (!residentUid || !visitorName) {
    return res.status(400).json({ error: 'residentUid and visitorName are required' });
  }
  if (!societyId) {
    return res.status(400).json({ error: 'societyId is required.' });
  }

  try {
    const requestId = id || `visit-${Date.now()}`;
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO society_visitor_requests
        (id, society_id, resident_uid, resident_name, wing, apartment_no, visitor_name, visitor_phone, purpose, photo_url, status, created_by, created_by_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', $11, $12, $13)`,
      [
        requestId,
        societyId,
        residentUid,
        residentName || null,
        wing || null,
        apartmentNo || null,
        visitorName,
        visitorPhone || null,
        purpose || null,
        photoUrl || null,
        req.user!.uid,
        req.user!.name,
        createdAt
      ]
    );

    const requestPayload = mapRow({
      id: requestId, society_id: societyId, resident_uid: residentUid, resident_name: residentName,
      wing, apartment_no: apartmentNo, visitor_name: visitorName, visitor_phone: visitorPhone,
      purpose, photo_url: photoUrl, status: 'Pending', created_by: req.user!.uid,
      created_by_name: req.user!.name, created_at: createdAt
    });

    // Real-time: instant, no-refresh update to the resident if they have the
    // app/web session actively open right now.
    emitToUser(residentUid, 'visitor-request:new', requestPayload);

    // Push: reliably reaches the resident's Android app even if it's
    // backgrounded or closed — the case that matters most (a visitor is
    // physically waiting at the gate). Best-effort, fire-and-forget.
    // dataOnly so the custom VisitorMessagingService (android/app) can build
    // its own notification with native Approve/Deny action buttons, instead
    // of Android auto-displaying a plain non-actionable one.
    sendPushToUser(residentUid, {
      title: 'Visitor at the Gate',
      body: `${visitorName} is here to see you${purpose ? ` (${purpose})` : ''}.`,
      data: { type: 'visitor_request', requestId },
      dataOnly: true
    }).catch((err) => console.warn('[VisitorRequests] Push send failed:', err));

    res.json({ success: true, request: requestPayload });
  } catch (err: any) {
    console.error('Error creating visitor request:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resident approves/denies. Only the resident this request was actually
// created for can respond — checked server-side, not just hidden in the UI.
router.post('/api/visitor-requests/:id/respond', async (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;

  if (decision !== 'Approved' && decision !== 'Denied') {
    return res.status(400).json({ error: "decision must be 'Approved' or 'Denied'" });
  }

  try {
    const existing = await pool.query('SELECT * FROM society_visitor_requests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Visitor request not found' });
    }
    const row = existing.rows[0];

    if (row.resident_uid !== req.user!.uid) {
      return res.status(403).json({ error: 'You can only respond to visitor requests addressed to you' });
    }
    if (row.status !== 'Pending') {
      return res.status(409).json({ error: `This request has already been ${row.status.toLowerCase()}` });
    }

    const respondedAt = new Date().toISOString();
    const updated = await pool.query(
      'UPDATE society_visitor_requests SET status = $1, responded_at = $2 WHERE id = $3 RETURNING *',
      [decision, respondedAt, id]
    );

    const requestPayload = mapRow(updated.rows[0]);

    // Real-time: the guard's screen (if open) updates instantly — this is
    // specifically the gap FCM alone can't cover (no push channel to an
    // arbitrary open browser tab).
    if (row.society_id) {
      emitToSocietyAdmins(row.society_id, 'visitor-request:updated', requestPayload);
    }

    res.json({ success: true, request: requestPayload });
  } catch (err: any) {
    console.error('Error responding to visitor request:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
