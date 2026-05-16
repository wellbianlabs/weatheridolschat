import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS, used for writing
 * server-side state (e.g. usage_daily counters) on behalf of any user.
 *
 * Must NEVER be exposed to the browser — guarded by being in a
 * server-only module and using SUPABASE_SERVICE_ROLE_KEY which is
 * non-public.
 *
 * Returns null when the key isn't configured — quota helper falls
 * back to no-op enforcement (counts not persisted), so the site
 * keeps running even before the key is set in Vercel.
 */
let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
