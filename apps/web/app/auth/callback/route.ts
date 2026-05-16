import { NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Magic-link landing route.
 *
 *   /auth/callback?code=<otp_code>&next=/wherever
 *
 * Supabase appends `?code=...` when the user clicks their email link.
 * We exchange that code for a session cookie via
 * `exchangeCodeForSession`, then redirect to `next` (or `/`).
 *
 * Token-hash style links (PKCE off) also land here with `token_hash`
 * + `type` params — we forward those to `verifyOtp` as a fallback so
 * either flavour works without configuring the Supabase project.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/';

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login?error=not_configured', url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(`[auth/callback] exchangeCodeForSession fail: ${error.message}`);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
  } else if (tokenHash && type) {
    // Older email-OTP variant — Supabase emails sometimes include
    // token_hash instead of code depending on project settings.
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
  } else {
    return NextResponse.redirect(new URL('/login?error=missing_code', url));
  }

  return NextResponse.redirect(new URL(next, url));
}
