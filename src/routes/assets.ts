import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Assets ---
router.get('/api/assets', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_assets';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      location: row.location,
      purchaseDate: row.purchase_date,
      modelNo: row.model_no,
      status: row.status,
      imageUrl: row.image_url,
      description: row.description,
      hasWarranty: row.has_warranty,
      warrantyPdfUrl: row.warranty_pdf_url,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/assets', async (req, res) => {
  const { id, name, category, location, purchaseDate, modelNo, status, imageUrl, description, hasWarranty, warrantyPdfUrl, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_assets (id, name, category, location, purchase_date, model_no, status, image_url, description, has_warranty, warranty_pdf_url, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [id, name, category, location, purchaseDate, modelNo, status, imageUrl, description, hasWarranty || false, warrantyPdfUrl, societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/assets/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, location, purchaseDate, modelNo, status, imageUrl, description, hasWarranty, warrantyPdfUrl, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_assets SET name = $1, category = $2, location = $3, purchase_date = $4, model_no = $5, status = $6, image_url = $7, description = $8, has_warranty = $9, warranty_pdf_url = $10, society_id = COALESCE($11, society_id) WHERE id = $12',
      [name, category, location, purchaseDate, modelNo, status, imageUrl, description, hasWarranty, warrantyPdfUrl, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/assets/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_assets WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
