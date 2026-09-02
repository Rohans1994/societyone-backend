import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Scheduling facility maintenance/closures is an admin-only action.
router.use('/api/facility-blocks', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

// --- Facility Maintenance Blocks ---
router.get('/api/facility-blocks', async (req, res) => {
  try {
    const { societyId, facilityId } = req.query;
    let query = 'SELECT * FROM society_facility_blocks';
    const params: any[] = [];
    const conditions: string[] = [];

    if (societyId) {
      params.push(societyId);
      conditions.push(`society_id = $${params.length}`);
    }
    if (facilityId) {
      params.push(facilityId);
      conditions.push(`facility_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY date DESC, start_time ASC';

    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      facilityId: row.facility_id,
      facilityName: row.facility_name,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      reason: row.reason,
      blockedBy: row.blocked_by,
      societyId: row.society_id,
      createdAt: row.created_at
    })));
  } catch (err: any) {
    console.error('Error fetching facility blocks:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/facility-blocks', async (req, res) => {
  const { id, facilityId, facilityName, date, startTime, endTime, reason, blockedBy, societyId } = req.body;
  try {
    const blockId = id || 'blk-' + Date.now();
    await pool.query(
      `INSERT INTO society_facility_blocks (id, facility_id, facility_name, date, start_time, end_time, reason, blocked_by, society_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         facility_id = EXCLUDED.facility_id,
         facility_name = EXCLUDED.facility_name,
         date = EXCLUDED.date,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         reason = EXCLUDED.reason,
         blocked_by = EXCLUDED.blocked_by,
         society_id = EXCLUDED.society_id`,
      [
        blockId,
        facilityId,
        facilityName || 'Facility',
        date,
        startTime || '00:00',
        endTime || '23:59',
        reason || 'Scheduled Maintenance',
        blockedBy || 'Super Admin',
        societyId || 'soc-mtb32pfk',
        new Date().toISOString()
      ]
    );
    res.json({ success: true, id: blockId });
  } catch (err: any) {
    console.error('Error adding facility block:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/facility-blocks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_facility_blocks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting facility block:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
