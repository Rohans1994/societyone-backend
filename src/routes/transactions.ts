import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Finance & Accounting is an admin-only feature (see Layout.tsx nav).
router.use('/api/transactions', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

// --- Transactions ---
router.get('/api/transactions', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_transactions';
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
      amount: parseFloat(row.amount),
      type: row.type,
      category: row.category,
      date: row.date,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/transactions', async (req, res) => {
  const { id, title, amount, type, category, date, societyId } = req.body;
  if (!societyId) {
    return res.status(400).json({ error: 'societyId is required.' });
  }
  try {
    await pool.query(
      'INSERT INTO society_transactions (id, title, amount, type, category, date, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, title, amount, type, category, date, societyId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
