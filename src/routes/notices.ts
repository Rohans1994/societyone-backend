import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Notices ---
router.get('/api/notices', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_notices';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
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
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notices', async (req, res) => {
  const { id, title, description, category, date, priority, createdBy, createdByName, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_notices (id, title, description, category, date, priority, created_by, created_by_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        id || `notif-${Date.now()}`,
        title,
        description,
        category || 'General',
        date || new Date().toISOString().split('T')[0],
        priority || 'Normal',
        createdBy || null,
        createdByName || 'Admin',
        societyId || 'soc-mtb32pfk'
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/notices/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, category, date, priority, createdByName, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_notices SET title = $1, description = $2, category = $3, date = $4, priority = $5, created_by_name = COALESCE($6, created_by_name), society_id = COALESCE($7, society_id) WHERE id = $8',
      [title, description, category || 'General', date, priority || 'Normal', createdByName || null, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/notices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_notices WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
