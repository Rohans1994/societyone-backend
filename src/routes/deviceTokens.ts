import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// The Android app registers its FCM device token here (on login / app
// start) so the backend knows where to send push notifications for that
// resident. Any authenticated user can register their own device — there's
// no admin-only restriction here, unlike most other write routes, since a
// resident registering their own token isn't a privileged action.
router.use('/api/device-tokens', requireAuth);

router.post('/api/device-tokens', async (req, res) => {
  const { token, platform } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }
  try {
    await pool.query(
      `INSERT INTO society_device_tokens (id, uid, token, platform, society_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO UPDATE SET
         uid = EXCLUDED.uid,
         platform = EXCLUDED.platform,
         society_id = EXCLUDED.society_id,
         created_at = EXCLUDED.created_at`,
      [
        `dt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        req.user!.uid,
        token,
        platform || 'android',
        req.user!.societyId || null,
        new Date().toISOString()
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error registering device token:', err);
    res.status(500).json({ error: err.message });
  }
});

// Called on logout so a shared/reset device stops receiving push
// notifications meant for the account that just signed out.
router.delete('/api/device-tokens/:token', async (req, res) => {
  const { token } = req.params;
  try {
    await pool.query('DELETE FROM society_device_tokens WHERE token = $1 AND uid = $2', [token, req.user!.uid]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error removing device token:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
