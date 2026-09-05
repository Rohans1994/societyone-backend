import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteStorageFile, deleteStorageFiles } from '../services/storageCleanup.js';

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
    res.json(result.rows.map(row => {
      // Up to 4 admin-defined slots replace the old single open_time/close_time
      // range. Legacy rows (created before this feature) have no `slots` value yet —
      // synthesize a single slot from their old open/close time as a fallback until
      // they're next saved through the app (see PUT/POST below).
      const parsedSlots = Array.isArray(row.slots)
        ? row.slots
        : (typeof row.slots === 'string' ? JSON.parse(row.slots) : null);
      const slots = parsedSlots && parsedSlots.length > 0
        ? parsedSlots
        : [{ startTime: row.open_time || '06:00', endTime: row.close_time || '22:00' }];

      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        capacity: row.capacity || 10,
        slots,
        imageUrl: row.image_url,
        images: Array.isArray(row.images) ? row.images : (typeof row.images === 'string' ? JSON.parse(row.images) : (row.image_url ? [row.image_url] : [])),
        canBook: row.can_book !== false,
        requiresPayment: Boolean(row.requires_payment),
        price: row.price || 0,
        paymentQrUrl: row.payment_qr_url || '',
        upiId: row.upi_id || '',
        bankAccountNumber: row.bank_account_number || '',
        bankIfscCode: row.bank_ifsc_code || '',
        rules: row.rules || '',
        societyId: row.society_id
      };
    }));
  } catch (err: any) {
    console.error('Error fetching facilities:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/facilities', async (req, res) => {
  const { id, name, description, capacity, slots, imageUrl, images, canBook, requiresPayment, price, paymentQrUrl, upiId, bankAccountNumber, bankIfscCode, rules, societyId } = req.body;
  try {
    const imagesJson = JSON.stringify(Array.isArray(images) && images.length > 0 ? images : (imageUrl ? [imageUrl] : []));
    const slotsJson = JSON.stringify(Array.isArray(slots) && slots.length > 0 ? slots.slice(0, 4) : [{ startTime: '06:00', endTime: '22:00' }]);
    await pool.query(
      `INSERT INTO society_facilities (id, name, description, capacity, slots, image_url, images, can_book, requires_payment, price, payment_qr_url, upi_id, bank_account_number, bank_ifsc_code, rules, society_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         capacity = EXCLUDED.capacity,
         slots = EXCLUDED.slots,
         image_url = EXCLUDED.image_url,
         images = EXCLUDED.images,
         can_book = EXCLUDED.can_book,
         requires_payment = EXCLUDED.requires_payment,
         price = EXCLUDED.price,
         payment_qr_url = EXCLUDED.payment_qr_url,
         upi_id = EXCLUDED.upi_id,
         bank_account_number = EXCLUDED.bank_account_number,
         bank_ifsc_code = EXCLUDED.bank_ifsc_code,
         rules = EXCLUDED.rules,
         society_id = EXCLUDED.society_id`,
      [
        id,
        name,
        description || '',
        capacity || 10,
        slotsJson,
        imageUrl || '',
        imagesJson,
        canBook !== false,
        Boolean(requiresPayment),
        price || 0,
        paymentQrUrl || null,
        upiId || null,
        bankAccountNumber || null,
        bankIfscCode || null,
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
  const { name, description, capacity, slots, imageUrl, images, canBook, requiresPayment, price, paymentQrUrl, upiId, bankAccountNumber, bankIfscCode, rules, societyId } = req.body;
  try {
    const imagesJson = JSON.stringify(Array.isArray(images) && images.length > 0 ? images : (imageUrl ? [imageUrl] : []));
    const slotsJson = JSON.stringify(Array.isArray(slots) && slots.length > 0 ? slots.slice(0, 4) : [{ startTime: '06:00', endTime: '22:00' }]);

    // If the QR code is being replaced/removed, clean up the old file
    // afterward (best-effort — never blocks the update itself).
    const existingRes = await pool.query('SELECT payment_qr_url FROM society_facilities WHERE id = $1', [id]);
    const oldQrUrl = existingRes.rows[0]?.payment_qr_url;

    await pool.query(
      `UPDATE society_facilities 
       SET name = $1, description = $2, capacity = $3, slots = $4, image_url = $5, images = $6, can_book = $7, requires_payment = $8, price = $9, payment_qr_url = $10, upi_id = $11, bank_account_number = $12, bank_ifsc_code = $13, rules = $14, society_id = COALESCE($15, society_id)
       WHERE id = $16`,
      [
        name,
        description,
        capacity,
        slotsJson,
        imageUrl,
        imagesJson,
        canBook !== false,
        Boolean(requiresPayment),
        price || 0,
        paymentQrUrl || null,
        upiId || null,
        bankAccountNumber || null,
        bankIfscCode || null,
        rules,
        societyId || null,
        id
      ]
    );

    if (oldQrUrl && oldQrUrl !== paymentQrUrl) {
      deleteStorageFile(oldQrUrl).catch((err) =>
        console.warn('[Facilities] Storage cleanup failed for replaced QR code:', err)
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating facility:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/facilities/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM society_facilities WHERE id = $1 RETURNING image_url, images, payment_qr_url',
      [id]
    );
    if (result.rows.length > 0) {
      const { image_url, images, payment_qr_url } = result.rows[0];
      const urls: string[] = [image_url, payment_qr_url, ...(Array.isArray(images) ? images : [])];
      deleteStorageFiles(urls).catch((err) =>
        console.warn('[Facilities] Storage cleanup failed for deleted amenity:', err)
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting facility:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
