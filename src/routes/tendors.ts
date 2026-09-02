import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Tendor Management is an admin-only feature (see Layout.tsx nav).
router.use('/api/tendors', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

// --- Tendors & Quotations ---
router.get('/api/tendors', async (req, res) => {
  try {
    const { societyId } = req.query;
    let tQuery = 'SELECT * FROM society_tendors';
    const tParams: any[] = [];
    if (societyId) {
      tQuery += ' WHERE society_id = $1';
      tParams.push(societyId);
    }
    const tendorsRes = await pool.query(tQuery, tParams);
    const quotationsRes = await pool.query('SELECT * FROM society_quotations');
    
    const result = tendorsRes.rows.map(t => {
      const qs = quotationsRes.rows
        .filter(q => q.tendor_id === t.id)
        .map(q => ({
          vendorId: q.vendor_id,
          vendorName: q.vendor_name,
          quotation: parseFloat(q.quotation),
          pdfUrl: q.pdf_url,
          pdfName: q.pdf_name,
          societyId: q.society_id
        }));
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        societyId: t.society_id,
        quotations: qs
      };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tendors', async (req, res) => {
  const { id, name, description, quotations, societyId } = req.body;
  const targetSocId = societyId || 'soc-mtb32pfk';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO society_tendors (id, name, description, society_id) VALUES ($1, $2, $3, $4)', [id, name, description, targetSocId]);
    if (quotations && Array.isArray(quotations)) {
      for (const q of quotations) {
        await client.query(
          'INSERT INTO society_quotations (tendor_id, vendor_id, vendor_name, quotation, pdf_url, pdf_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, q.vendorId, q.vendorName, q.quotation, q.pdfUrl, q.pdfName, targetSocId]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/api/tendors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, quotations, societyId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE society_tendors SET name = $1, description = $2, society_id = COALESCE($3, society_id) WHERE id = $4', [name, description, societyId || null, id]);
    await client.query('DELETE FROM society_quotations WHERE tendor_id = $1', [id]);
    if (quotations && Array.isArray(quotations)) {
      for (const q of quotations) {
        await client.query(
          'INSERT INTO society_quotations (tendor_id, vendor_id, vendor_name, quotation, pdf_url, pdf_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, q.vendorId, q.vendorName, q.quotation, q.pdfUrl, q.pdfName, q.societyId || societyId || 'soc-mtb32pfk']
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/api/tendors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_tendors WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
