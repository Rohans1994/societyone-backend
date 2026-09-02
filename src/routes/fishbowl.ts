import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Community chat — any logged-in resident/admin in a society can participate.
router.use('/api/fishbowl', requireAuth);

// --- Fishbowl Messages ---
router.get('/api/fishbowl', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_fishbowl';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      text: row.text,
      timestamp: row.timestamp,
      userId: row.user_id,
      userName: row.user_name,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      isDeleted: row.is_deleted,
      replyToId: row.reply_to_id,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/fishbowl', async (req, res) => {
  const { id, text, timestamp, userId, userName, wing, apartmentNo, replyToId, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_fishbowl (id, text, timestamp, user_id, user_name, wing, apartment_no, reply_to_id, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, text, timestamp, userId, userName, wing, apartmentNo, replyToId, societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/fishbowl/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE society_fishbowl SET is_deleted = TRUE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
