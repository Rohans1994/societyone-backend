import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ensureSocietyBucket } from '../services/supabaseAdmin.js';

const router = Router();

// --- Societies ---
router.get('/api/societies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM society_societies ORDER BY created_at DESC, name ASC');
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      pincode: row.pincode,
      wings: typeof row.wings === 'string' ? JSON.parse(row.wings) : (row.wings || []),
      adminEmail: row.admin_email,
      adminName: row.admin_name,
      adminPhone: row.admin_phone || row.phone || '',
      phone: row.phone || row.admin_phone || '',
      createdAt: row.created_at,
      storageBucket: row.storage_bucket
    })));
  } catch (err: any) {
    console.error('Error fetching societies:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/societies', async (req, res) => {
  const { id, name, address, city, pincode, wings, adminEmail, adminName, adminPhone, phone, createdAt } = req.body;
  const contactPhone = adminPhone || phone || '';

  // Create this society's dedicated Storage bucket (tendor/amc/assets will
  // live in folders within it). Done before the INSERT so the bucket name is
  // available to store alongside the rest of the society's record. Failure
  // here doesn't block society creation — uploads simply fall back to the
  // old shared flat buckets if storage_bucket ends up null.
  let storageBucket: string | null = null;
  try {
    storageBucket = await ensureSocietyBucket(id, name);
  } catch (err: any) {
    console.error('Could not create Storage bucket for new society (uploads will use legacy shared buckets):', err.message);
  }

  try {
    await pool.query(
      `INSERT INTO society_societies (id, name, address, city, pincode, wings, admin_email, admin_name, admin_phone, phone, created_at, storage_bucket) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         city = EXCLUDED.city,
         pincode = EXCLUDED.pincode,
         wings = EXCLUDED.wings,
         admin_email = EXCLUDED.admin_email,
         admin_name = EXCLUDED.admin_name,
         admin_phone = EXCLUDED.admin_phone,
         phone = EXCLUDED.phone,
         created_at = EXCLUDED.created_at,
         storage_bucket = COALESCE(society_societies.storage_bucket, EXCLUDED.storage_bucket)`,
      [id, name, address, city, pincode, JSON.stringify(wings || []), adminEmail, adminName, contactPhone, contactPhone, createdAt, storageBucket]
    );
    res.json({ success: true, storageBucket });
  } catch (err: any) {
    console.error('Error creating/updating society in database:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
