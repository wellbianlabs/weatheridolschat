import { NextResponse } from 'next/server';

import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Magic-link + OAuth callback.
 *
 *   /auth/callback?code=<otp_code>&next=/wherever
 *
 * Both signInWithOtp() and signInWithOAuth() land here. We exchange
 * the code for a session and attach the auth cookies directly to the
 * redirect response object — using the request's own cookie store
 * for reads and the response.cookies API for writes.
 *
 * Why not just use getServerSupabase()? In Next 14 App Router, the
 * cookies set via `next/headers` cookies() do not reliably attach to
 * a NextResponse.redirect(). Setting them on the response object
 * directly (the pattern @supabase/ssr docs recommend for callbacks)
 * is the foolproof way — every cookie definitely lands in the
 * browser when the redirect resolves. This is the fix for the
 * "log in via email → bounced back to login screen, no session"
 * bug that showed up after Site URL fix.
 *
 * Token-hash style links (PKCE off) also land here with `token_hash`
 * + `type` params — we forward those to verifyOtp as a fallback so
 * either flavour works without configuring the Supabase project.
 */
function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\/+$/, '');
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/';

  const supaUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supaUrl || !supaAnon) {
    console.error('[auth/callback] supabase env missing');
    return NextResponse.redirect(new URL('/login?error=not_configured', url));
  }

  // Build the redirect response FIRST so we have a concrete object
  // to attach cookies to. The redirect URL will get overwritten with
  // an error variant below if exchange fails.
  const response = NextResponse.redirect(new URL(next, url));

  const supabase = createServerClient(supaUrl, supaAnon, {
    cookies: {
      get(name: string) {
        return req.headers
          .get('cookie')
          ?.split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${name}=`))
          ?.slice(name.length + 1);
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        // Attach the cookie directly to the redirect response — this
        // is the cookie the browser receives when it follows the 302.
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // ── Code exchange (PKCE flow — magic links + OAuth) ─────────────
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(`[auth/callback] exchangeCodeForSession fail: ${error.message}`);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
    console.info(
      `[auth/callback] OK code-exchange user=${data.user?.email ?? data.user?.id?.slice(0, 8)}…`,
    );
    return response;
  }

  // ── Token-hash fallback (older email-OTP setups) ────────────────
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
      token_hash: tokenHash,
    });
    if (error) {
      console.error(`[auth/callback] verifyOtp fail: ${error.message}`);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
    console.info(`[auth/callback] OK verify-otp`);
    return response;
  }

  return NextResponse.redirect(new URL('/login?error=missing_code', url));
}
