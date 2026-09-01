import { Router } from 'express';
import { getSupabaseUrl } from '../services/storage.js';

const router = Router();

// --- Supabase Config ---
router.get('/api/supabase-config', (req, res) => {
  res.json({
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'dummy-anon-key'
  });
});

export default router;
