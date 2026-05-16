import { NextResponse } from 'next/server';

import { resolveUser } from '@/lib/supabase/identity';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/diag/session
 *
 * Reports whether the calling browser has a valid Supabase session
 * cookie right now. Useful for verifying the "logged in → still
 * logged in?" flow after the magic link click.
 *
 * Returns:
 *   has_supabase_client    — env vars accept-able
 *   has_session            — getUser() returned a user
 *   user_email             — masked
 *   resolved_tier          — admin / premium / free
 *   resolved_isAdmin       — true / false
 *   sb_cookies_present     — count of "sb-*" auth cookies the
 *                            browser actually sent (good sanity check)
 *
 * Safe to call from any logged-in browser to confirm session state.
 */
export async function GET(req: Request): Promise<Response> {
  const supabase = getServerSupabase();
  const cookieHeader = req.headers.get('cookie') ?? '';
  const sbCookies = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith('sb-'))
    .map((c) => {
      const eq = c.indexOf('=');
      const name = eq === -1 ? c : c.slice(0, eq);
      const value = eq === -1 ? '' : c.slice(eq + 1);
      return { name, length: value.length };
    });

  let supabaseSession: { ok: boolean; email?: string | null; error?: string } = { ok: false };
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser();
      const maskedEmail = (() => {
        const e = data.user?.email;
        if (!e) return null;
        const [local, domain] = e.split('@');
        if (!local || !domain) return null;
        return `${local.slice(0, 3)}…@${domain}`;
      })();
      supabaseSession = {
        ok: !!data.user && !error,
        email: maskedEmail,
        error: error?.message,
      };
    } catch (err) {
      supabaseSession = { ok: false, error: (err as Error).message };
    }
  }

  const resolved = await resolveUser();

  return NextResponse.json({
    has_supabase_client: !!supabase,
    has_session: supabaseSession.ok,
    supabase_session: supabaseSession,
    sb_cookies_present: sbCookies.length,
    sb_cookie_names: sbCookies.map((c) => `${c.name} (${c.length}B)`),
    resolved_tier: resolved?.tier ?? 'anon',
    resolved_isAdmin: resolved?.isAdmin ?? false,
    subscription: resolved?.subscription ?? null,
    notes: [
      'sb_cookies_present should be ≥ 1 when logged in.',
      'has_session=false but sb_cookies_present>0 means cookie exists but token is invalid/expired.',
      'After successful login, all of the above should report your account.',
    ],
  });
}
