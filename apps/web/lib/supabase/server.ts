import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for App Router. Reads/writes session
 * cookies via Next's `cookies()` store so the user's auth state
 * survives across requests.
 *
 * Returns null when the public env vars aren't configured —
 * downstream handlers should treat that as "no auth available"
 * (anonymous mode) rather than throwing.
 */
/** Mirror of browser.ts normalizeUrl — same validation rules. */
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

export function getServerSupabase(): SupabaseClient | null {
  const url = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const cookieStore = cookies();
  try {
    return createServerClient(url, anon, {
      cookies: {
        // @supabase/ssr v0.5+ uses get/set/remove. Next 14's cookies()
        // returns a synchronous store; we forward straight through.
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: { [key: string]: unknown }) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // `cookies()` is read-only in some App Router contexts
            // (e.g. Server Components without an Action). Supabase
            // will retry the write on the next response cycle.
          }
        },
        remove(name: string, options: { [key: string]: unknown }) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* see comment above */
          }
        },
      },
    });
  } catch (err) {
    // Malformed URL / key — log + degrade gracefully. resolveUser()
    // returns null in that case which surfaces as "anonymous" mode.
    console.warn(
      '[supabase] createServerClient failed:',
      (err as Error).message?.slice(0, 200),
    );
    return null;
  }
}
