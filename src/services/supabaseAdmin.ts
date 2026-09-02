import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './storage.js';

// Server-side Supabase client using the SERVICE ROLE key. Never expose this
// client or its key to the frontend — it bypasses Row Level Security and can
// perform admin actions (creating/deleting auth users, etc).
//
// Used for:
// 1. Verifying the Supabase Auth JWT that the frontend attaches to API
//    requests (see middleware/auth.ts).
// 2. Admin API calls during signup/migration (creating Supabase Auth users
//    on behalf of residents/admins).
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Set it in your .env file — required for auth token verification and admin user management.'
    );
  }

  cachedClient = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return cachedClient;
}

/**
 * Verifies a Supabase Auth JWT (as sent by the frontend in the
 * `Authorization: Bearer <token>` header) and returns the authenticated
 * Supabase user (id, email, etc), or null if the token is missing/invalid/expired.
 */
export async function verifySupabaseToken(token: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}
