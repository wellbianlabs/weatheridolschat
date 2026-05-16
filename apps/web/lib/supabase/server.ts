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
export function getServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const cookieStore = cookies();
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
}
