import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteStorageFile } from '../services/storageCleanup.js';
import { sendPushToUser, sendPushToSociety } from '../services/pushNotifications.js';

const router = Router();

// Residents view notices; admins create/manage them.
router.use('/api/notices', requireAuth);

// --- Notices ---
// A notice with a NULL target_uid is a broadcast/common notice visible to
// everyone in the society (the original, only behavior). A notice with
// target_uid set is only meant for that one resident. Admins can see every
// notice (so they can manage/edit anything they've sent); residents only
// ever get broadcast notices plus their own targeted ones — enforced here,
// server-side, so a resident can never see another resident's private notice
// even by inspecting network responses directly.
router.get('/api/notices', async (req, res) => {
  try {
    const { societyId } = req.query;
    const isAdmin = req.user!.role === 'SuperAdmin' || req.user!.role === 'WingAdmin';

    let query = 'SELECT * FROM society_notices WHERE 1=1';
    const params: any[] = [];

    if (societyId) {
      params.push(societyId);
      query += ` AND society_id = $${params.length}`;
    }
    if (!isAdmin) {
      params.push(req.user!.uid);
      query += ` AND (target_uid IS NULL OR target_uid = $${params.length})`;
    }
    query += ' ORDER BY date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category || 'General',
      date: row.date,
      priority: row.priority || 'Normal',
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      societyId: row.society_id,
      attachmentUrl: row.attachment_url || '',
      targetUid: row.target_uid || '',
      targetUserName: row.target_user_name || ''
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notices', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { id, title, description, category, date, priority, createdBy, createdByName, societyId, attachmentUrl, targetUid, targetUserName } = req.body;
  try {
    await pool.query(
      `INSERT INTO society_notices
        (id, title, description, category, date, priority, created_by, created_by_name, society_id, attachment_url, target_uid, target_user_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id || `notif-${Date.now()}`,
        title,
        description,
        category || 'General',
        date || new Date().toISOString().split('T')[0],
        priority || 'Normal',
        createdBy || null,
        createdByName || 'Admin',
        societyId || 'soc-mtb32pfk',
        attachmentUrl || null,
        targetUid || null,
        targetUserName || null
      ]
    );

    // Push notification is best-effort and fire-and-forget — never blocks or
    // fails the response below. A targeted notice pushes to just that one
    // resident's device(s); a broadcast notice pushes to the whole society.
    const pushPayload = { title: title || 'New Notice', body: description || '', data: { type: 'notice', noticeId: id || '' } };
    if (targetUid) {
      sendPushToUser(targetUid, pushPayload).catch((err) => console.warn('[Notices] Push send failed:', err));
    } else {
      sendPushToSociety(societyId || 'soc-mtb32pfk', pushPayload).catch((err) => console.warn('[Notices] Push send failed:', err));
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/notices/:id', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { id } = req.params;
  const { title, description, category, date, priority, createdByName, societyId, attachmentUrl, targetUid, targetUserName } = req.body;
  try {
    // If the attachment is being replaced/removed, clean up the old file
    // afterward (best-effort — never blocks the update itself).
    const existingRes = await pool.query('SELECT attachment_url FROM society_notices WHERE id = $1', [id]);
    const oldAttachmentUrl = existingRes.rows[0]?.attachment_url;

    await pool.query(
      `UPDATE society_notices
       SET title = $1, description = $2, category = $3, date = $4, priority = $5,
           created_by_name = COALESCE($6, created_by_name), society_id = COALESCE($7, society_id),
           attachment_url = $8, target_uid = $9, target_user_name = $10
       WHERE id = $11`,
      [
        title,
        description,
        category || 'General',
        date,
        priority || 'Normal',
        createdByName || null,
        societyId || null,
        attachmentUrl || null,
        targetUid || null,
        targetUserName || null,
        id
      ]
    );

    if (oldAttachmentUrl && oldAttachmentUrl !== attachmentUrl) {
      deleteStorageFile(oldAttachmentUrl).catch((err) =>
        console.warn('[Notices] Storage cleanup failed for replaced attachment:', err)
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/notices/:id', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM society_notices WHERE id = $1 RETURNING attachment_url', [id]);
    const attachmentUrl = result.rows[0]?.attachment_url;
    if (attachmentUrl) {
      deleteStorageFile(attachmentUrl).catch((err) =>
        console.warn('[Notices] Storage cleanup failed for deleted notice:', err)
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
