import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteStorageFiles } from '../services/storageCleanup.js';

const router = Router();

// AMC & Assets management is an admin-only feature (see Layout.tsx nav).
router.use('/api/assets', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

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
  if (!societyId) {
    return res.status(400).json({ error: 'societyId is required.' });
  }
  try {
    await pool.query(
      'INSERT INTO society_assets (id, name, category, location, purchase_date, model_no, status, image_url, description, has_warranty, warranty_pdf_url, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [id, name, category, location, purchaseDate, modelNo, status, imageUrl, description, hasWarranty || false, warrantyPdfUrl, societyId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import assets from a CSV parsed client-side into an array of rows.
// Warranty PDFs/images can't be attached via CSV (no binary file support) —
// admins can upload those individually afterward via the normal edit flow.
router.post('/api/assets/bulk', async (req, res) => {
  const { assets, societyId: bodySocietyId } = req.body;
  if (!Array.isArray(assets) || assets.length === 0) {
    return res.status(400).json({ error: 'assets must be a non-empty array' });
  }
  const societyId = bodySocietyId || req.user?.societyId;
  if (!societyId) {
    return res.status(400).json({ error: 'societyId is required.' });
  }

  const results: { row: number; name: string; status: 'imported' | 'failed'; reason?: string }[] = [];
  for (let i = 0; i < assets.length; i++) {
    const row = assets[i] || {};
    const rowNum = i + 1;
    const name = (row.name || '').trim();
    if (!name) {
      results.push({ row: rowNum, name: '(missing)', status: 'failed', reason: 'name is required' });
      continue;
    }
    try {
      const id = `ast-${crypto.randomBytes(6).toString('hex')}`;
      await pool.query(
        'INSERT INTO society_assets (id, name, category, location, purchase_date, model_no, status, description, has_warranty, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          id,
          name,
          (row.category || 'General').trim(),
          (row.location || '').trim(),
          (row.purchaseDate || '').trim() || null,
          (row.modelNo || '').trim() || null,
          (row.status || 'Operational').trim(),
          (row.description || '').trim() || null,
          String(row.hasWarranty).toLowerCase() === 'true' || row.hasWarranty === true,
          societyId
        ]
      );
      results.push({ row: rowNum, name, status: 'imported' });
    } catch (err: any) {
      results.push({ row: rowNum, name, status: 'failed', reason: err.message });
    }
  }

  res.json({
    success: true,
    total: assets.length,
    imported: results.filter((r) => r.status === 'imported').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results
  });
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
    const result = await pool.query(
      'DELETE FROM society_assets WHERE id = $1 RETURNING image_url, warranty_pdf_url',
      [id]
    );
    if (result.rows.length > 0) {
      const { image_url, warranty_pdf_url } = result.rows[0];
      deleteStorageFiles([image_url, warranty_pdf_url]).catch((err) =>
        console.warn('[Assets] Storage cleanup failed for deleted asset:', err)
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
