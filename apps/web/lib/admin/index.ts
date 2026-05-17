import { getServiceSupabase } from '../supabase/service';

/**
 * Server-side admin-dashboard queries.
 *
 * Each function returns a safe default (zero / empty array) when the
 * service-role client isn't configured — so the dashboard renders
 * gracefully even before Supabase is wired up. All reads go through
 * the service-role client and therefore bypass RLS.
 *
 * Why this lives in a separate module:
 *
 *   - The dashboard page fires every query in parallel via Promise.all
 *     to keep TTFB low. Centralising the queries here lets us tweak
 *     them (add indexes, switch to materialised views) without
 *     touching the React component.
 *   - The dashboard is admin-only, but the helpers themselves are
 *     route-agnostic. A future analytics export endpoint can reuse
 *     the same `getDailyUsageTrend` etc.
 */

/** Start-of-today in Asia/Seoul as an ISO string. Used as the lower
 *  bound for "today" buckets. KST has no DST so this is stable. */
export function startOfTodayKstIso(now: Date = new Date()): string {
  // YYYY-MM-DD in KST, then convert to a UTC instant at 00:00 KST
  // (= 15:00 UTC of the previous day). We rebuild the timestamp
  // explicitly rather than rely on Date parsing of "YYYY-MM-DDT00:00+09:00"
  // because Vercel runtimes occasionally trip on offset notation.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // Z = UTC. KST midnight = previous day 15:00 UTC.
  const [y, m, d] = ymd.split('-').map((s) => Number.parseInt(s, 10));
  const utcMs = Date.UTC(y!, (m ?? 1) - 1, d!, -9, 0, 0); // -9 hours for KST→UTC
  return new Date(utcMs).toISOString();
}

/** N days ago, KST midnight, as an ISO string. */
export function daysAgoKstIso(n: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return startOfTodayKstIso(past);
}

// ── KPI tiles ───────────────────────────────────────────────────────────────

export interface UserKpis {
  totalUsers: number;
  newUsersToday: number;
  newUsersLast7Days: number;
}

export async function getUserKpis(): Promise<UserKpis> {
  const svc = getServiceSupabase();
  if (!svc) return { totalUsers: 0, newUsersToday: 0, newUsersLast7Days: 0 };

  const todayStart = startOfTodayKstIso();
  const weekAgo = daysAgoKstIso(7);

  const [total, today, week] = await Promise.all([
    svc.from('profiles').select('id', { count: 'exact', head: true }),
    svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart),
    svc
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo),
  ]);

  return {
    totalUsers: total.count ?? 0,
    newUsersToday: today.count ?? 0,
    newUsersLast7Days: week.count ?? 0,
  };
}

export interface SubscriptionKpis {
  /** active + canceled-within-period (still entitled). */
  activeSubscribers: number;
  /** Subscriptions whose paid period ends within the next 7 days. */
  endingSoon: number;
}

export async function getSubscriptionKpis(): Promise<SubscriptionKpis> {
  const svc = getServiceSupabase();
  if (!svc) return { activeSubscribers: 0, endingSoon: 0 };
  const nowIso = new Date().toISOString();
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [active, ending] = await Promise.all([
    svc
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'canceled'])
      .gte('current_period_end', nowIso),
    svc
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('current_period_end', nowIso)
      .lte('current_period_end', in7Days),
  ]);

  return {
    activeSubscribers: active.count ?? 0,
    endingSoon: ending.count ?? 0,
  };
}

export interface RevenueKpis {
  revenueTodayKrw: number;
  revenueLast30DaysKrw: number;
  paidCountToday: number;
}

export async function getRevenueKpis(): Promise<RevenueKpis> {
  const svc = getServiceSupabase();
  if (!svc)
    return { revenueTodayKrw: 0, revenueLast30DaysKrw: 0, paidCountToday: 0 };

  const todayStart = startOfTodayKstIso();
  const monthAgo = daysAgoKstIso(30);

  const [today, month] = await Promise.all([
    svc
      .from('payments')
      .select('amount_krw')
      .eq('status', 'paid')
      .gte('created_at', todayStart),
    svc
      .from('payments')
      .select('amount_krw')
      .eq('status', 'paid')
      .gte('created_at', monthAgo),
  ]);

  const sum = (rows: Array<{ amount_krw?: number | null }> | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.amount_krw ?? 0), 0);

  const todayRows = (today.data as Array<{ amount_krw: number }>) ?? [];
  return {
    revenueTodayKrw: sum(todayRows),
    revenueLast30DaysKrw: sum(
      (month.data as Array<{ amount_krw: number }>) ?? [],
    ),
    paidCountToday: todayRows.length,
  };
}

// ── Recent activity tables ──────────────────────────────────────────────────

export interface RecentSignup {
  id: string;
  nickname: string;
  tier: string;
  createdAt: string;
}

export async function listRecentSignups(limit = 10): Promise<RecentSignup[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];
  const { data } = await svc
    .from('profiles')
    .select('id, nickname, tier, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (
    (data as Array<{
      id: string;
      nickname: string;
      tier: string;
      created_at: string;
    }>) ?? []
  ).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    tier: r.tier,
    createdAt: r.created_at,
  }));
}

export interface RecentPayment {
  id: string;
  userId: string;
  kind: 'subscription' | 'credit_pack' | 'refund';
  amountKrw: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  creditPack: string | null;
  createdAt: string;
}

export async function listRecentPayments(limit = 10): Promise<RecentPayment[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];
  const { data } = await svc
    .from('payments')
    .select('id, user_id, kind, amount_krw, status, credit_pack, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (
    (data as Array<{
      id: string;
      user_id: string;
      kind: RecentPayment['kind'];
      amount_krw: number;
      status: RecentPayment['status'];
      credit_pack: string | null;
      created_at: string;
    }>) ?? []
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    amountKrw: r.amount_krw,
    status: r.status,
    creditPack: r.credit_pack,
    createdAt: r.created_at,
  }));
}

// ── Usage trend ─────────────────────────────────────────────────────────────

export interface UsageDay {
  day: string; // YYYY-MM-DD (KST)
  messages: number;
  selfies: number;
  songs: number;
  vision: number;
  ttsChars: number;
}

/**
 * Daily aggregate across ALL users for the last `nDays` days.
 *
 * `usage_daily` is per-user-per-day, so we sum each metric across
 * all rows for each day. Returned newest-first so the dashboard
 * can render today at the top.
 */
export async function getDailyUsageTrend(nDays = 7): Promise<UsageDay[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];

  const from = daysAgoKstIso(nDays);
  const { data } = await svc
    .from('usage_daily')
    .select('day, messages, selfies, songs, vision, tts_chars')
    .gte('day', from.slice(0, 10)); // day is a DATE column → string YYYY-MM-DD
  const rows =
    (data as Array<{
      day: string;
      messages: number | null;
      selfies: number | null;
      songs: number | null;
      vision: number | null;
      tts_chars: number | null;
    }>) ?? [];

  // Bucket by day.
  const buckets = new Map<string, UsageDay>();
  for (const r of rows) {
    const existing = buckets.get(r.day) ?? {
      day: r.day,
      messages: 0,
      selfies: 0,
      songs: 0,
      vision: 0,
      ttsChars: 0,
    };
    existing.messages += r.messages ?? 0;
    existing.selfies += r.selfies ?? 0;
    existing.songs += r.songs ?? 0;
    existing.vision += r.vision ?? 0;
    existing.ttsChars += r.tts_chars ?? 0;
    buckets.set(r.day, existing);
  }
  // Sort newest first.
  return Array.from(buckets.values()).sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : 0,
  );
}

// ── Scheduled greetings stats ───────────────────────────────────────────────

export interface ScheduledSlotStats {
  slot: 'morning_7' | 'lunch_12' | 'evening_18' | 'night_22';
  inserted: number;
  delivered: number;
  pending: number;
}

/**
 * Counts per slot for the last 24 hours. `delivered` means the chat
 * client picked up the row and acked it; `pending` means it exists
 * but the user hasn't opened the chat yet.
 */
export async function getScheduledSlotStats(): Promise<ScheduledSlotStats[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await svc
    .from('scheduled_messages')
    .select('slot, delivered_at')
    .gte('created_at', dayAgo);

  const rows =
    (data as Array<{ slot: ScheduledSlotStats['slot']; delivered_at: string | null }>) ??
    [];
  const slots: ScheduledSlotStats['slot'][] = [
    'morning_7',
    'lunch_12',
    'evening_18',
    'night_22',
  ];
  return slots.map((slot) => {
    const subset = rows.filter((r) => r.slot === slot);
    const delivered = subset.filter((r) => r.delivered_at !== null).length;
    return {
      slot,
      inserted: subset.length,
      delivered,
      pending: subset.length - delivered,
    };
  });
}

// ── Top characters ──────────────────────────────────────────────────────────

export interface CharacterPopularity {
  characterId: string;
  sessionCount: number;
  recentChatters: number; // users who chatted in the last 7 days
}

export async function getCharacterPopularity(): Promise<CharacterPopularity[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];

  const weekAgo = daysAgoKstIso(7);
  const { data } = await svc
    .from('sessions')
    .select('character_id, last_message_at');

  const rows =
    (data as Array<{ character_id: string; last_message_at: string | null }>) ??
    [];
  const map = new Map<string, CharacterPopularity>();
  for (const r of rows) {
    const ex = map.get(r.character_id) ?? {
      characterId: r.character_id,
      sessionCount: 0,
      recentChatters: 0,
    };
    ex.sessionCount += 1;
    if (r.last_message_at && r.last_message_at >= weekAgo) ex.recentChatters += 1;
    map.set(r.character_id, ex);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.sessionCount - a.sessionCount,
  );
}
