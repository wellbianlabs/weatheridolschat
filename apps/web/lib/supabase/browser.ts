'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client. Reads the public anon key from env
 * and persists the session via cookies (managed by @supabase/ssr).
 *
 * Returns null when the env vars aren't configured — components can
 * gracefully fall back to "auth not available" copy instead of
 * crashing. That keeps preview deploys runnable without secrets.
 */
let cached: SupabaseClient | null = null;
let cachedFailed = false; // remember a malformed-URL failure so we don't retry every call

/**
 * Validate the Supabase URL before handing it to the SDK. The SDK's
 * own validation throws "Invalid supabaseUrl: Provided URL is
 * malformed", which used to bubble up as a global "client-side
 * exception" white screen. We catch it here and return null so the
 * page keeps rendering in anon mode while the operator fixes the
 * env var.
 *
 * Accepts: https://<24-char-or-so>.supabase.co (no trailing slash)
 * Also tolerates: trailing slashes, accidental quotes, surrounding
 * whitespace (we strip those before validation).
 */
function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Strip surrounding quotes (a frequent paste mistake).
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip trailing slashes.
  s = s.replace(/\/+$/, '');
  // Must parse as an absolute URL with an https scheme.
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getBrowserSupabase(): SupabaseClient | null {
  if (cached) return cached;
  if (cachedFailed) return null;
  const url = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  try {
    cached = createBrowserClient(url, anon);
    return cached;
  } catch (err) {
    // Bad URL / bad key — log once, then permanently no-op so we
    // don't fire the same error on every component mount.
    console.warn(
      '[supabase] createBrowserClient failed:',
      (err as Error).message?.slice(0, 200),
    );
    cachedFailed = true;
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
