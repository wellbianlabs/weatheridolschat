import { getServerSupabase } from './server';

/**
 * Compact identity record used by API routes. Decoupled from the
 * full Supabase User shape so callers don't depend on the SDK type
 * (which changes between minor versions).
 */
export interface ResolvedUser {
  id: string;
  email: string | null;
  tier: 'admin' | 'premium' | 'free' | 'anon';
  /** True when this is the hard-coded admin account — bypasses all quotas. */
  isAdmin: boolean;
}

/**
 * Admin allowlist. Defaults to the founder's address; extendable via
 * ADMIN_EMAILS env var (comma-separated). Case-insensitive match.
 *
 *   ADMIN_EMAILS=admin@wellbianlabs.io,founder@example.com
 */
function getAdminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS;
  const list = fromEnv
    ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (!list.length) list.push('admin@wellbianlabs.io');
  return list.map((s) => s.toLowerCase());
}

/**
 * Resolve the calling user for a server-side handler.
 *
 *   - Reads Supabase session cookies via getServerSupabase()
 *   - Returns `null` when Supabase isn't configured OR there's no
 *     active session (visitor / anon flow)
 *   - Returns a ResolvedUser with `isAdmin=true` and `tier='admin'`
 *     when the signed-in email matches the allowlist
 *
 * In Phase 1 every non-admin signed-in user is treated as 'free'.
 * Phase 2/3 will swap this for a real DB lookup against `profiles`
 * + `payments` tables.
 */
export async function resolveUser(): Promise<ResolvedUser | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const email = data.user.email ?? null;
  const isAdmin = !!email && getAdminEmails().includes(email.toLowerCase());
  return {
    id: data.user.id,
    email,
    tier: isAdmin ? 'admin' : 'free',
    isAdmin,
  };
}

/**
 * Convenience for handlers that just need to know whether the
 * caller bypasses quota/billing gates. Equivalent to
 * `(await resolveUser())?.isAdmin === true`.
 */
export async function isAdminCaller(): Promise<boolean> {
  const u = await resolveUser();
  return u?.isAdmin === true;
}
