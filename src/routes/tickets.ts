import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Helpdesk Tickets ---
router.get('/api/tickets', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_tickets';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY date_created DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      dateCreated: row.date_created,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      progressUpdate: row.progress_update,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tickets', async (req, res) => {
  const { id, title, description, category, priority, status, assignedTo, createdBy, createdByName, wing, apartmentNo, dateCreated, attachments, progressUpdate, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_tickets (id, title, description, category, priority, status, assigned_to, created_by, created_by_name, wing, apartment_no, date_created, attachments, progress_update, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [id, title, description, category, priority, status, assignedTo, createdBy, createdByName, wing, apartmentNo, dateCreated, JSON.stringify(attachments || []), progressUpdate, societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, category, priority, status, assignedTo, progressUpdate, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_tickets SET title = $1, description = $2, category = $3, priority = $4, status = $5, assigned_to = $6, progress_update = $7, society_id = COALESCE($8, society_id) WHERE id = $9',
      [title, description, category, priority, status, assignedTo, progressUpdate, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
