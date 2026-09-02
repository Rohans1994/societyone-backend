import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Residents browse facilities to book them; admins manage the facility list.
router.use('/api/facilities', requireAuth);

// --- Facilities / Amenities ---
router.get('/api/facilities', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_facilities';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      capacity: row.capacity || 10,
      openTime: row.open_time,
      closeTime: row.close_time,
      imageUrl: row.image_url,
      images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : (row.image_url ? [row.image_url] : [])),
      canBook: row.can_book !== false,
      requiresPayment: Boolean(row.requires_payment),
      price: row.price || 0,
      rules: row.rules || '',
      societyId: row.society_id
    })));
  } catch (err: any) {
    console.error('Error fetching facilities:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/facilities', async (req, res) => {
  const { id, name, description, capacity, openTime, closeTime, imageUrl, images, canBook, requiresPayment, price, rules, societyId } = req.body;
  try {
    const imagesJson = JSON.stringify(Array.isArray(images) && images.length > 0 ? images : (imageUrl ? [imageUrl] : []));
    await pool.query(
      `INSERT INTO society_facilities (id, name, description, capacity, open_time, close_time, image_url, images, can_book, requires_payment, price, rules, society_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         capacity = EXCLUDED.capacity,
         open_time = EXCLUDED.open_time,
         close_time = EXCLUDED.close_time,
         image_url = EXCLUDED.image_url,
         images = EXCLUDED.images,
         can_book = EXCLUDED.can_book,
         requires_payment = EXCLUDED.requires_payment,
         price = EXCLUDED.price,
         rules = EXCLUDED.rules,
         society_id = EXCLUDED.society_id`,
      [
        id,
        name,
        description || '',
        capacity || 10,
        openTime || '06:00',
        closeTime || '22:00',
        imageUrl || '',
        imagesJson,
        canBook !== false,
        Boolean(requiresPayment),
        price || 0,
        rules || '',
        societyId || 'soc-mtb32pfk'
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error creating facility:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/facilities/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, capacity, openTime, closeTime, imageUrl, images, canBook, requiresPayment, price, rules, societyId } = req.body;
  try {
    const imagesJson = JSON.stringify(Array.isArray(images) && images.length > 0 ? images : (imageUrl ? [imageUrl] : []));
    await pool.query(
      `UPDATE society_facilities 
       SET name = $1, description = $2, capacity = $3, open_time = $4, close_time = $5, image_url = $6, images = $7, can_book = $8, requires_payment = $9, price = $10, rules = $11, society_id = COALESCE($12, society_id)
       WHERE id = $13`,
      [
        name,
        description,
        capacity,
        openTime,
        closeTime,
        imageUrl,
        imagesJson,
        canBook !== false,
        Boolean(requiresPayment),
        price || 0,
        rules,
        societyId || null,
        id
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating facility:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/facilities/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_facilities WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting facility:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
