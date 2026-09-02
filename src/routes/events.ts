import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Residents view events; admins create/manage them.
router.use('/api/events', requireAuth);

// --- Events ---
router.get('/api/events', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_events';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY date ASC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      time: row.time,
      location: row.location,
      description: row.description,
      organizer: row.organizer,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/events', async (req, res) => {
  const { id, title, date, time, location, description, organizer, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_events (id, title, date, time, location, description, organizer, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, title, date, time, location, description, organizer, societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const { title, date, time, location, description, organizer, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_events SET title = $1, date = $2, time = $3, location = $4, description = $5, organizer = $6, society_id = COALESCE($7, society_id) WHERE id = $8',
      [title, date, time, location, description, organizer, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_events WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
