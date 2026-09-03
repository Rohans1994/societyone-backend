import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getSupabaseAdminClient, ensureSocietyBucket } from '../services/supabaseAdmin.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// One-time migration: creates a Supabase Auth user for every existing
// society_users row that doesn't have one yet (auth_uid IS NULL), reusing
// their existing plaintext password so residents don't need to reset it.
// Links the resulting Supabase user id back via auth_uid.
//
// Bootstrapping problem: this can't be gated behind requireAuth, because no
// one can obtain a Supabase Auth token until at least one user is migrated.
// Instead it's gated behind a one-time shared secret (MIGRATION_SECRET env
// var). Set MIGRATION_SECRET in .env, call this route once with that secret
// in the x-migration-secret header, then remove MIGRATION_SECRET (or this
// route) from your deployment — it's not needed again after migration.
router.post('/api/admin/migrate-users-to-auth', async (req, res) => {
  const expectedSecret = process.env.MIGRATION_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'MIGRATION_SECRET is not configured on the server. Set it in .env to run this migration.' });
  }
  if (req.headers['x-migration-secret'] !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid or missing x-migration-secret header' });
  }

  const supabase = getSupabaseAdminClient();
  const results: { uid: string; email: string; status: string; error?: string }[] = [];

  try {
    const { rows } = await pool.query(
      `SELECT uid, email, password FROM society_users WHERE auth_uid IS NULL AND email IS NOT NULL AND password IS NOT NULL`
    );

    for (const row of rows) {
      try {
        const { data, error } = await supabase.auth.admin.createUser({
          email: row.email,
          password: row.password,
          email_confirm: true // they've already verified via the app's own OTP flow historically
        });

        if (error || !data?.user) {
          results.push({ uid: row.uid, email: row.email, status: 'failed', error: error?.message || 'Unknown error' });
          continue;
        }

        await pool.query('UPDATE society_users SET auth_uid = $1 WHERE uid = $2', [data.user.id, row.uid]);
        results.push({ uid: row.uid, email: row.email, status: 'migrated' });
      } catch (err: any) {
        results.push({ uid: row.uid, email: row.email, status: 'failed', error: err.message });
      }
    }

    res.json({
      success: true,
      total: rows.length,
      migrated: results.filter((r) => r.status === 'migrated').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    });
  } catch (err: any) {
    console.error('[Migration] Error migrating users to Supabase Auth:', err);
    res.status(500).json({ error: err.message });
  }
});

// One-time backfill: creates a dedicated Storage bucket for every existing
// society that doesn't have one yet (storage_bucket IS NULL), for the new
// per-society bucket structure (tendor/amc/assets as folders within it).
// Safe to call repeatedly — only processes societies still missing a bucket.
// Unlike the user-auth migration above, this can be gated behind normal
// login (no bootstrapping problem — SuperAdmins can already log in).
router.post('/api/admin/backfill-society-buckets', requireAuth, requireRole('SuperAdmin'), async (req, res) => {
  const results: { societyId: string; name: string; status: string; bucket?: string; error?: string }[] = [];

  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM society_societies WHERE storage_bucket IS NULL`
    );

    for (const row of rows) {
      try {
        const bucketName = await ensureSocietyBucket(row.id, row.name);
        await pool.query('UPDATE society_societies SET storage_bucket = $1 WHERE id = $2', [bucketName, row.id]);
        results.push({ societyId: row.id, name: row.name, status: 'created', bucket: bucketName });
      } catch (err: any) {
        results.push({ societyId: row.id, name: row.name, status: 'failed', error: err.message });
      }
    }

    res.json({
      success: true,
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    });
  } catch (err: any) {
    console.error('[Backfill] Error backfilling society buckets:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
