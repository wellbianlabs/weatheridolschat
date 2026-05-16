import { NextResponse } from 'next/server';

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/diag/auth
 *
 * One-shot diagnostic for "why isn't login working?". Reports — with
 * secrets redacted — exactly what the running lambda sees for the
 * Supabase env vars, whether each value passes our normaliser, and
 * whether we can actually instantiate a client + reach Supabase.
 *
 * Safe to expose publicly:
 *   - NEXT_PUBLIC_* values are designed to be public (they ship in
 *     the JS bundle anyway).
 *   - SUPABASE_SERVICE_ROLE_KEY is redacted to first 8 chars only.
 *   - We never log the full secret to Vercel either.
 *
 * Usage: open https://<host>/api/diag/auth in a browser. Paste the
 * JSON output back to support.
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

function fingerprintString(s: string | undefined, headLen: number, tailLen: number) {
  if (s == null) return { present: false };
  return {
    present: true,
    length: s.length,
    head: s.slice(0, headLen),
    tail: s.length > headLen + tailLen ? s.slice(-tailLen) : undefined,
    leadingWhitespace: /^\s/.test(s),
    trailingWhitespace: /\s$/.test(s),
    surroundingQuotes:
      (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")),
    containsNewline: /[\r\n]/.test(s),
  };
}

export async function GET(): Promise<Response> {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = process.env.ADMIN_EMAILS;

  const normalized = normalizeUrl(rawUrl);

  // Try to actually instantiate a client. If this fails the error
  // message tells us the SDK's verdict ("Invalid supabaseUrl: Provided
  // URL is malformed" etc.) without leaking the value.
  let clientStatus: { ok: boolean; error?: string } = { ok: false };
  if (normalized && rawAnon) {
    try {
      const c = createClient(normalized, rawAnon.trim(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Make a tiny network call so we know reachability + the anon
      // key is actually accepted. getSession() is harmless (no row
      // reads) and returns quickly for an empty cookie context.
      const { error } = await c.auth.getSession();
      if (error) {
        clientStatus = { ok: false, error: error.message };
      } else {
        clientStatus = { ok: true };
      }
    } catch (err) {
      clientStatus = { ok: false, error: (err as Error).message?.slice(0, 200) };
    }
  } else {
    clientStatus = {
      ok: false,
      error: !normalized
        ? 'URL normalization failed — see env_vars.url details below'
        : 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing',
    };
  }

  return NextResponse.json({
    env_vars: {
      NEXT_PUBLIC_SUPABASE_URL: {
        ...fingerprintString(rawUrl, 30, 0),
        passesNormalizer: !!normalized,
        normalizedSample: normalized ? `${normalized.slice(0, 40)}…` : null,
        expectedFormat: 'https://<project-ref>.supabase.co',
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        ...fingerprintString(rawAnon, 8, 4),
        startsWithEyJ: rawAnon?.trim().startsWith('eyJ') ?? false,
        note: 'Should start with "eyJ" (it is a JWT). Length is typically 200+ chars.',
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        ...fingerprintString(rawService, 8, 4),
        startsWithEyJ: rawService?.trim().startsWith('eyJ') ?? false,
        note: 'Server-only; Phase 2/4 quotas + payments use this.',
      },
      ADMIN_EMAILS: {
        present: !!adminEmails,
        value: adminEmails ?? null,
      },
    },
    client_check: clientStatus,
    runtime: {
      node_env: process.env.NODE_ENV,
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_url: process.env.VERCEL_URL ?? null,
      now: new Date().toISOString(),
    },
    next_steps_if_broken: [
      'If url.present=false → env var missing in Vercel. Add it.',
      'If url.passesNormalizer=false → fix the URL format (need https:// prefix, no trailing slash).',
      'If url.trailingWhitespace=true or surroundingQuotes=true → re-paste the value clean.',
      'If anon.startsWithEyJ=false → wrong key copied. Use Project API keys → anon public.',
      'If client_check.ok=false but env_vars look right → check the error.message field.',
    ],
  });
}
