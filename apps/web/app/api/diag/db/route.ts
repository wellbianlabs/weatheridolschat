import { NextResponse } from 'next/server';

import { getServiceSupabase } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/diag/db
 *
 * Reports whether each Phase 2 + Phase 4 SQL migration has been run.
 * The check is "does a count() against the table succeed?" — if the
 * table exists and the service role can read it, we report `ok: true`
 * for that table. Otherwise we capture the error message verbatim
 * so the operator can see whether it's "table does not exist", "no
 * permission", or "service role key missing".
 *
 * Safe to expose publicly: counts are aggregates, no row content
 * leaves the server. Service role key itself is never returned.
 */
const TABLES: Array<{ name: string; phase: 2 | 4; purpose: string; doc: string }> = [
  {
    name: 'usage_daily',
    phase: 2,
    purpose: 'Per-user daily quota counters (messages/selfies/songs/tts_chars/vision)',
    doc: 'docs/DB_USAGE_QUOTA.md',
  },
  {
    name: 'subscriptions',
    phase: 4,
    purpose: 'Active subscription rows — promotes resolveUser to tier=premium',
    doc: 'docs/DB_PAYMENTS.md',
  },
  {
    name: 'credit_balance',
    phase: 4,
    purpose: 'Per-user credit balance for pay-as-you-go selfies/songs',
    doc: 'docs/DB_PAYMENTS.md',
  },
  {
    name: 'payments',
    phase: 4,
    purpose: 'Audit trail of every Toss / mock payment',
    doc: 'docs/DB_PAYMENTS.md',
  },
  {
    name: 'waitlist',
    phase: 4,
    purpose: 'Email waitlist captured by the pricing page',
    doc: 'docs/DB_PAYMENTS.md',
  },
];

export async function GET(): Promise<Response> {
  const svc = getServiceSupabase();
  if (!svc) {
    return NextResponse.json({
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY missing or supabase URL malformed.',
      tip: 'Run /api/diag/auth first to confirm Supabase env vars are valid.',
      tables: {},
    });
  }

  // Check each table with a no-op count query. PostgREST returns a
  // structured error when the table doesn't exist; we surface the
  // first hint of the actual problem.
  const results: Record<
    string,
    {
      ok: boolean;
      phase: number;
      purpose: string;
      doc: string;
      rowCount?: number;
      error?: string;
    }
  > = {};
  for (const t of TABLES) {
    try {
      const { count, error } = await svc
        .from(t.name)
        .select('*', { count: 'exact', head: true });
      if (error) {
        results[t.name] = {
          ok: false,
          phase: t.phase,
          purpose: t.purpose,
          doc: t.doc,
          error: error.message?.slice(0, 200) ?? 'unknown error',
        };
      } else {
        results[t.name] = {
          ok: true,
          phase: t.phase,
          purpose: t.purpose,
          doc: t.doc,
          rowCount: count ?? 0,
        };
      }
    } catch (err) {
      results[t.name] = {
        ok: false,
        phase: t.phase,
        purpose: t.purpose,
        doc: t.doc,
        error: (err as Error).message?.slice(0, 200) ?? 'unknown',
      };
    }
  }

  const phase2Ok = TABLES.filter((t) => t.phase === 2).every((t) => results[t.name]?.ok);
  const phase4Ok = TABLES.filter((t) => t.phase === 4).every((t) => results[t.name]?.ok);
  const allOk = phase2Ok && phase4Ok;

  return NextResponse.json({
    ok: allOk,
    summary: {
      phase2: phase2Ok ? 'ok' : 'missing',
      phase4: phase4Ok ? 'ok' : 'missing',
    },
    tables: results,
    next_steps: allOk
      ? ['모든 마이그레이션 적용 완료. /account 페이지가 정상 동작합니다.']
      : [
          phase2Ok
            ? null
            : 'docs/DB_USAGE_QUOTA.md 의 SQL 을 Supabase Studio → SQL Editor에서 실행하세요.',
          phase4Ok
            ? null
            : 'docs/DB_PAYMENTS.md 의 SQL 을 Supabase Studio → SQL Editor에서 실행하세요.',
        ].filter(Boolean),
  });
}
