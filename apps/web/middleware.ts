import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware — intentionally a no-op pass-through.
 *
 * Earlier versions called supabase.auth.getUser() here to keep the
 * access token fresh on every navigation. That's the pattern
 * @supabase/ssr documentation recommends BUT in our deployment it
 * turned into a session-killer: any error inside the Supabase call
 * (transient network blip, env var hiccup, race with the /auth/
 * callback cookie write) would drop the session cookie and force
 * a re-login. Symptom: user logs in, then on the very next page
 * navigation they're back to anonymous.
 *
 * Trade-off without the refresh: the 1-hour access token will
 * eventually expire while the user is browsing. The Supabase client
 * SDK auto-refreshes on demand (it has the refresh_token in cookies)
 * the next time it makes an API call, so the user doesn't notice.
 * The only visible difference is that the cookie is rotated slightly
 * later than it would have been here — purely an optimization, not
 * a correctness issue. Stable session lifetime is 1 week (the
 * refresh token), so day-to-day auth still works.
 *
 * If we ever NEED middleware refresh again (e.g., to gate routes
 * server-side without an extra round trip), do it on a much smaller
 * matcher (just / and /chat/*) and wrap every Supabase call in
 * try/catch that DOES NOT touch response.cookies on error.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

// Keep the matcher in place for the future, but its body does nothing
// right now. Static assets and /api are still excluded for performance.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|hero\\.webp|roster|reference|fonts|mock-checkout).*)'],
};
