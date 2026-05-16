import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

/**
 * Auth refresh middleware.
 *
 * Touches `supabase.auth.getUser()` so the session cookies stay
 * rotated — without this, the access token expires after ~1 hour and
 * the user looks logged out even though they have a valid refresh
 * token sitting in cookies.
 *
 * Defensive on purpose:
 *   - Wrapped in try/catch so any Supabase outage / mis-config / SDK
 *     bug *can never take down the site*. Failures log to stderr and
 *     the request continues without a refreshed session.
 *   - Matcher excludes `/api/*` because every route handler already
 *     calls its own resolveUser() — running the refresh in the
 *     middleware too just doubles the call count + latency.
 *   - Static assets (next/_next, public images, fonts) are also
 *     skipped to keep middleware off the hot path.
 *
 * If Supabase env vars aren't configured the middleware is an immediate
 * no-op.
 */
/** Inline URL normalizer (same rules as lib/supabase/{server,browser}.ts).
 *  Edge middleware can't import from app code reliably, so we duplicate
 *  the 8-line check here rather than chase shared-module boundaries. */
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

export async function middleware(request: NextRequest) {
  const url = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: { [key: string]: unknown }) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: { [key: string]: unknown }) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    });

    // Touching getUser refreshes the session cookie when needed.
    // The user object itself is unused here — handlers will call
    // their own `resolveUser()` from the server lib.
    await supabase.auth.getUser();
  } catch (err) {
    // Never block a request on a Supabase failure. Surface in the
    // logs so we can spot it, then carry on with an unrefreshed
    // (but still valid) session.
    console.error(
      `[middleware] supabase refresh failed: ${(err as Error).message?.slice(0, 200)}`,
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Run on page navigations only — NOT on API routes (those do
    // their own resolveUser) and NOT on static assets. Keeping the
    // matcher tight means a Supabase hiccup only affects auth-page
    // rendering, never API throughput.
    '/((?!api|_next/static|_next/image|favicon.ico|hero\\.webp|roster|reference|fonts|mock-checkout).*)',
  ],
};
