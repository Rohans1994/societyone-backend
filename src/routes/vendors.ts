import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Vendors ---
router.get('/api/vendors', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_vendors';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      serviceCategory: row.service_category,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      status: row.status,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/vendors', async (req, res) => {
  const { id, name, serviceCategory, contactPerson, phone, email, status, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_vendors (id, name, service_category, contact_person, phone, email, status, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, serviceCategory, contactPerson, phone, email, status || 'Active', societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/vendors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, serviceCategory, contactPerson, phone, email, status, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_vendors SET name = $1, service_category = $2, contact_person = $3, phone = $4, email = $5, status = $6, society_id = COALESCE($7, society_id) WHERE id = $8',
      [name, serviceCategory, contactPerson, phone, email, status, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/vendors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_vendors WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
