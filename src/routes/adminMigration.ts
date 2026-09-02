import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getSupabaseAdminClient } from '../services/supabaseAdmin.js';

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

export default router;
