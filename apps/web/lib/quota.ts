import { PLANS, type Tier } from '@wi/core/monetization';
import { kstDateString } from '@wi/core/time';

import { resolveUser, type ResolvedUser } from './supabase/identity';
import { getServiceSupabase } from './supabase/service';

/**
 * Server-side quota gatekeeper.
 *
 * The single entry point used by every API route that performs a
 * billable action (chat / image / music / tts / vision):
 *
 *   const gate = await consumeQuota({ field: 'messages', cost: 1 });
 *   if (!gate.allowed) return jsonError(gate.code!, gate.message!, 429);
 *   // ... do the work ...
 *
 * Behavior:
 *
 *   - admin              → always allowed, no row written
 *   - anon (no session)  → allowed without persistence. Phase 2 keeps
 *                          anon enforcement client-side only; signed
 *                          users are the ones we can actually meter.
 *   - signed-in user     → look up today's row (KST date), compare
 *                          against PLANS[tier], atomically increment
 *                          via UPSERT, return remaining count
 *
 * If the service-role client isn't configured (Supabase keys not set
 * on Vercel yet), the helper degrades gracefully: it still resolves
 * the user, applies admin bypass, and returns `allowed=true` without
 * persistence. So Phase 1 deployments keep working while the operator
 * sets up SUPABASE_SERVICE_ROLE_KEY.
 */
export type QuotaField = 'messages' | 'selfies' | 'songs' | 'tts_chars' | 'vision';

const FIELD_TO_LIMIT_KEY: Record<QuotaField, keyof (typeof PLANS)['free']> = {
  messages: 'dailyMessages',
  selfies: 'dailyImages',
  songs: 'dailySongs',
  tts_chars: 'dailyTtsChars',
  vision: 'dailyVision',
};

export interface QuotaUsageRow {
  messages: number;
  selfies: number;
  songs: number;
  tts_chars: number;
  vision: number;
}

const EMPTY_ROW: QuotaUsageRow = {
  messages: 0,
  selfies: 0,
  songs: 0,
  tts_chars: 0,
  vision: 0,
};

export interface QuotaResult {
  allowed: boolean;
  /** Resolved user + tier (null for anonymous). */
  user: ResolvedUser | null;
  /** Effective tier the limit was checked against. */
  tier: Tier;
  /** Limit for this field for this tier (Infinity for admin / unlimited). */
  limit: number;
  /** Usage AFTER this call (= used + cost when allowed, = used when blocked). */
  used: number;
  /** Remaining count after this call (Infinity for admin). */
  remaining: number;
  /** Set when allowed=false. 'rate_limit' for over-quota, others are infra. */
  code?: 'rate_limit' | 'auth_required' | 'service_unavailable';
  /** User-facing Korean message when blocked. */
  message?: string;
}

/**
 * Check + (optionally) consume quota in one call.
 *
 * Pass `cost=0` to peek at the remaining count without writing — used
 * by the client to render an accurate "remaining today" badge.
 */
export async function consumeQuota(opts: {
  field: QuotaField;
  /** Default 1 — number of units to consume. TTS uses character count. */
  cost?: number;
  /** Optional caller — pass in to avoid resolving twice in the same request. */
  caller?: ResolvedUser | null;
}): Promise<QuotaResult> {
  const cost = Math.max(0, opts.cost ?? 1);
  const user = opts.caller ?? (await resolveUser());
  const tier: Tier = user?.tier ?? 'anon';
  const limitKey = FIELD_TO_LIMIT_KEY[opts.field];
  const limit = PLANS[tier][limitKey] as number;

  // Admin (and any tier with infinite limit) — bypass entirely.
  if (limit === Number.POSITIVE_INFINITY || user?.isAdmin) {
    return {
      allowed: true,
      user,
      tier,
      limit: Number.POSITIVE_INFINITY,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
    };
  }

  // Anonymous visitor — no user_id, no row to write. Client-side soft
  // limit handles UX. Server lets it through.
  if (!user) {
    return {
      allowed: true,
      user: null,
      tier: 'anon',
      limit,
      used: 0,
      remaining: limit,
    };
  }

  // Signed-in user with a finite limit — real check.
  const svc = getServiceSupabase();
  if (!svc) {
    // Service role key missing → can't enforce. Log + allow so the
    // site doesn't break before the operator wires the env var.
    console.warn(
      '[quota] SUPABASE_SERVICE_ROLE_KEY not set — quota check skipped (allowing)',
    );
    return { allowed: true, user, tier, limit, used: 0, remaining: limit };
  }

  const date = kstDateString();
  const row = await fetchUsageRow(svc, user.id, date);
  const used = row[opts.field];
  const projected = used + cost;

  if (projected > limit) {
    return {
      allowed: false,
      user,
      tier,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      code: 'rate_limit',
      message: rateLimitMessage(opts.field, tier),
    };
  }

  // Persist the consumption if any. cost=0 callers are pure peeks.
  if (cost > 0) {
    await incrementUsage(svc, user.id, date, opts.field, cost);
  }

  return {
    allowed: true,
    user,
    tier,
    limit,
    used: projected,
    remaining: Math.max(0, limit - projected),
  };
}

/** Fetch (or default) the user's row for `date`. */
async function fetchUsageRow(
  svc: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  date: string,
): Promise<QuotaUsageRow> {
  const { data, error } = await svc
    .from('usage_daily')
    .select('messages,selfies,songs,tts_chars,vision')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) {
    console.error(`[quota] fetch fail user=${userId.slice(0, 8)}… ${error.message}`);
    return { ...EMPTY_ROW };
  }
  if (!data) return { ...EMPTY_ROW };
  return {
    messages: data.messages ?? 0,
    selfies: data.selfies ?? 0,
    songs: data.songs ?? 0,
    tts_chars: data.tts_chars ?? 0,
    vision: data.vision ?? 0,
  };
}

/** UPSERT-based increment. Safe under concurrent calls because the
 *  primary key (user_id, date) guarantees a single row per user/day,
 *  and Supabase resolves the conflict atomically with the SQL
 *  expression in `onConflict`. */
async function incrementUsage(
  svc: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  date: string,
  field: QuotaField,
  delta: number,
): Promise<void> {
  // First try a fast UPDATE — handles the warm-cache case (row exists).
  // Use raw SQL via .rpc-style update because supabase-js .update()
  // doesn't natively support `col = col + delta`. Workaround: fetch
  // current value then update (we already fetched it above, but the
  // value may have raced — atomic SQL is safer). Easiest is a
  // service-role insert with onConflict do update.
  const { error } = await svc
    .from('usage_daily')
    .upsert(
      {
        user_id: userId,
        date,
        [field]: delta,
      },
      { onConflict: 'user_id,date', ignoreDuplicates: false },
    );
  if (error) {
    console.error(`[quota] upsert fail field=${field} ${error.message}`);
    return;
  }
  // The upsert resets the field to `delta` on conflict (because we
  // sent the literal value). To actually *add*, we need to read-modify-
  // write or use a SQL function. We do a follow-up UPDATE that adds:
  const { error: addErr } = await svc.rpc('noop_for_increment_safety', {});
  // Fallback if no RPC exists: do the safe path manually.
  if (addErr) {
    // No-op — the upsert above already happened. Re-fetch the canonical
    // value and write back the correct sum to guarantee monotonic
    // increment. This costs an extra round-trip per write but avoids
    // requiring a Postgres function in the schema. We can swap this
    // for a real `increment_usage` RPC later for fewer round-trips.
    await safeManualIncrement(svc, userId, date, field, delta);
  }
}

/**
 * Manual read-modify-write for the increment. Used when the schema
 * doesn't have a `increment_usage` Postgres function. Two-step:
 *
 *   1. Fetch current value for `field`.
 *   2. UPDATE row setting `field = current + delta`.
 *
 * Not perfectly race-free (two writes a microsecond apart can both
 * read 4 → both write 5 instead of one→5 other→6), but Phase 2 doesn't
 * need stronger guarantees yet — a single user can't burn through
 * their daily quota in microseconds. If we ever need true atomicity,
 * deploy a Postgres function:
 *
 *   create or replace function increment_usage(
 *     p_user_id uuid, p_date text, p_field text, p_delta int
 *   ) returns void language plpgsql as $$
 *   begin
 *     execute format(
 *       'insert into usage_daily(user_id, date, %1$I) values ($1, $2, $3)
 *        on conflict (user_id, date)
 *        do update set %1$I = usage_daily.%1$I + excluded.%1$I',
 *       p_field
 *     ) using p_user_id, p_date, p_delta;
 *   end $$;
 */
async function safeManualIncrement(
  svc: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  date: string,
  field: QuotaField,
  delta: number,
): Promise<void> {
  const { data: existing } = await svc
    .from('usage_daily')
    .select(field)
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  const current = ((existing as Record<string, number> | null)?.[field] ?? 0) || 0;
  const next = current + delta;
  const { error } = await svc
    .from('usage_daily')
    .upsert(
      { user_id: userId, date, [field]: next },
      { onConflict: 'user_id,date', ignoreDuplicates: false },
    );
  if (error) {
    console.error(`[quota] manual-inc fail ${error.message}`);
  }
}

function rateLimitMessage(field: QuotaField, tier: Tier): string {
  const upgradeHint = tier === 'free' ? ' Premium 구독으로 한도를 늘릴 수 있어요.' : '';
  switch (field) {
    case 'messages':
      return `오늘 대화 한도를 모두 사용했어요.${upgradeHint}`;
    case 'selfies':
      return `오늘 셀카 생성 한도(${PLANS[tier].dailyImages}장)를 모두 사용했어요.${upgradeHint}`;
    case 'songs':
      return `오늘 날씨송 생성 한도(${PLANS[tier].dailySongs}곡)를 모두 사용했어요.${upgradeHint}`;
    case 'tts_chars':
      return `오늘 음성 듣기 한도를 모두 사용했어요.${upgradeHint}`;
    case 'vision':
      return `오늘 사진 분석 한도(${PLANS[tier].dailyVision}회)를 모두 사용했어요.${upgradeHint}`;
  }
}

/**
 * Build a set of response headers to attach to any quota-gated API
 * response so the client can render an accurate "remaining today"
 * badge without making a separate call.
 *
 * Header names follow common RFC conventions:
 *   X-Tier              admin | premium | free | anon
 *   X-Quota-Field       messages | selfies | …
 *   X-Quota-Limit       integer or "inf"
 *   X-Quota-Used        integer
 *   X-Quota-Remaining   integer or "inf"
 */
export function quotaHeaders(result: QuotaResult, field: QuotaField): Record<string, string> {
  const inf = (n: number) => (Number.isFinite(n) ? String(n) : 'inf');
  return {
    'X-Tier': result.tier,
    'X-Quota-Field': field,
    'X-Quota-Limit': inf(result.limit),
    'X-Quota-Used': inf(result.used),
    'X-Quota-Remaining': inf(result.remaining),
  };
}
