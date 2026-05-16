import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

/**
 * Auth refresh middleware.
 *
 * Runs on every request and calls `supabase.auth.getUser()` so the
 * session cookies stay rotated. Without this, the access token
 * expires after ~1 hour and the user looks logged out even though
 * they have a valid refresh token sitting in cookies.
 *
 * We skip image/audio static asset paths and the _next internals
 * to keep middleware overhead off the hot path.
 *
 * If Supabase isn't configured, the middleware is a no-op — the
 * site keeps running anonymously and route handlers fall back to
 * the existing behaviour.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

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

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and the Next internals.
    '/((?!_next/static|_next/image|favicon.ico|hero\\.webp|roster|reference|fonts).*)',
  ],
};
