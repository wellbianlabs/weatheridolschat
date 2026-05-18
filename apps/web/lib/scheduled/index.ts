import type { ScheduledSlot } from '@wi/ai';

import { getServiceSupabase } from '../supabase/service';

/**
 * Server-side helpers around the `scheduled_messages` table.
 *
 * Everything in this file uses the service-role Supabase client and
 * therefore bypasses RLS — that's deliberate, because the table has
 * RLS enabled with zero policies and only the server should ever
 * touch it.
 */

export interface ActivePremiumUser {
  userId: string;
  nickname: string;
  primaryLat: number | null;
  primaryLng: number | null;
  primaryLabel: string | null;
}

/**
 * Comma-separated admin allowlist from env. Matches the convention
 * used by lib/supabase/identity.ts so the two sources of truth stay
 * aligned. Lower-cased once so the comparison can stay case-
 * insensitive without re-normalising per user.
 */
function getAdminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS;
  const list = fromEnv
    ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (!list.length) list.push('admin@wellbianlabs.io');
  return list.map((s) => s.toLowerCase());
}

/**
 * Enumerate every user currently entitled to scheduled greetings.
 *
 * Two sources merged (de-duped by user_id):
 *
 *   1. Active subscribers — has a `subscriptions` row whose `status`
 *      is 'active' or 'canceled' (canceled but still within the
 *      paid period — same rule as `getActiveSubscription`), AND
 *      `current_period_end` in the future.
 *
 *   2. Admin accounts — every auth.users row whose email matches
 *      the ADMIN_EMAILS env allowlist (default
 *      `admin@wellbianlabs.io`). This is what makes the feature
 *      testable in production without the operator having to fake-
 *      purchase a subscription on their own account. Admins get
 *      the same scheduled-greeting experience as a paying user.
 *
 * Joined with `profiles` so callers have nickname + default
 * location in hand for the weather lookup.
 */
export async function listActivePremiumUsers(): Promise<ActivePremiumUser[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];

  // ── 1. Premium subscribers ─────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { data: subsData, error: subsErr } = await svc
    .from('subscriptions')
    .select('user_id, profiles!inner(nickname, primary_lat, primary_lng, primary_label)')
    .in('status', ['active', 'canceled'])
    .gte('current_period_end', nowIso);

  if (subsErr) {
    console.error(`[scheduled] listActivePremiumUsers subs fail: ${subsErr.message}`);
  }

  type ProfileShape = {
    nickname: string;
    primary_lat: number | null;
    primary_lng: number | null;
    primary_label: string | null;
  };
  type SubRow = {
    user_id: string;
    profiles: ProfileShape | ProfileShape[];
  };

  const out = new Map<string, ActivePremiumUser>();
  for (const r of (subsData as SubRow[]) ?? []) {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    if (!p) continue;
    out.set(r.user_id, {
      userId: r.user_id,
      nickname: p.nickname,
      primaryLat: p.primary_lat,
      primaryLng: p.primary_lng,
      primaryLabel: p.primary_label,
    });
  }

  // ── 2. Admin accounts (auto-include) ───────────────────────────
  // Pulls every admin from auth.users (service-role can read it),
  // then joins to profiles for the nickname/location bundle.
  // listUsers() is admin-paginated; the first 100 covers our
  // small ADMIN_EMAILS list comfortably.
  const adminEmails = getAdminEmails();
  if (adminEmails.length > 0) {
    try {
      const { data: authPage, error: authErr } = await svc.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });
      if (authErr) {
        console.warn(`[scheduled] admin lookup auth fail: ${authErr.message}`);
      } else {
        const adminUserIds = (authPage?.users ?? [])
          .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
          .map((u) => u.id);

        if (adminUserIds.length > 0) {
          const { data: profRows, error: profErr } = await svc
            .from('profiles')
            .select('id, nickname, primary_lat, primary_lng, primary_label')
            .in('id', adminUserIds);
          if (profErr) {
            console.warn(`[scheduled] admin profile lookup fail: ${profErr.message}`);
          } else {
            for (const p of (profRows as ({ id: string } & ProfileShape)[]) ?? []) {
              // Subscriber entry wins if already present — admin
              // who's also a paying customer doesn't get inserted
              // twice. The de-dup happens naturally via the Map key.
              if (!out.has(p.id)) {
                out.set(p.id, {
                  userId: p.id,
                  nickname: p.nickname,
                  primaryLat: p.primary_lat,
                  primaryLng: p.primary_lng,
                  primaryLabel: p.primary_label,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[scheduled] admin lookup threw: ${(err as Error).message}`);
    }
  }

  return Array.from(out.values());
}

/**
 * Find the character the user spoke to most recently. Returns null
 * when they have no `sessions` row at all (haven't chatted yet) — the
 * caller skips them, because we don't want to spring a stranger's
 * voice on a brand-new user.
 */
export async function getLastChattedCharacter(
  userId: string,
): Promise<string | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const { data, error } = await svc
    .from('sessions')
    .select('character_id, last_message_at')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[scheduled] getLastChattedCharacter fail: ${error.message}`);
    return null;
  }
  return (data?.character_id as string) ?? null;
}

/**
 * Today's calendar date in KST (YYYY-MM-DD). Used as the idempotency
 * key — the unique constraint on `(user_id, slot, slot_date)` prevents
 * a cron retry from inserting twice for the same Korean day.
 *
 * We deliberately compute this from `Intl.DateTimeFormat` rather than
 * a hand-rolled UTC+9 offset. DST isn't a factor in Korea, but the
 * Intl path is the same idiom used by `formatKstLocalTime` elsewhere,
 * which keeps timezone conventions consistent across the codebase.
 */
export function kstDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // en-CA yields YYYY-MM-DD already.
  return parts;
}

export interface InsertScheduledMessageInput {
  userId: string;
  characterId: string;
  slot: ScheduledSlot;
  slotDate: string;
  content: string;
  weatherSnapshot: unknown;
}

/**
 * Insert a generated greeting. Returns 'inserted' on success,
 * 'duplicate' when the unique constraint catches a retry, and
 * 'error' for everything else (also logged).
 */
export async function insertScheduledMessage(
  input: InsertScheduledMessageInput,
): Promise<'inserted' | 'duplicate' | 'error'> {
  const svc = getServiceSupabase();
  if (!svc) return 'error';
  const { error } = await svc.from('scheduled_messages').insert({
    user_id: input.userId,
    character_id: input.characterId,
    slot: input.slot,
    slot_date: input.slotDate,
    content: input.content,
    weather_snapshot: input.weatherSnapshot ?? null,
  });
  if (!error) return 'inserted';
  // Postgres unique-violation = code 23505. Supabase surfaces this as
  // `code: '23505'` on the PostgrestError.
  if ((error as { code?: string }).code === '23505') return 'duplicate';
  console.error(`[scheduled] insertScheduledMessage fail: ${error.message}`);
  return 'error';
}

export interface PendingScheduledMessage {
  id: string;
  characterId: string;
  slot: ScheduledSlot;
  content: string;
  scheduledFor: string;
  createdAt: string;
}

/**
 * Pending (undelivered) messages for one user × one character — the
 * primary read path used by the chat client's poll loop.
 *
 * Order is OLDEST FIRST so the client can append them in chronological
 * order to the conversation (otherwise a 10pm message would show
 * above the 7am one).
 */
export async function listPendingForUserCharacter(
  userId: string,
  characterId: string,
): Promise<PendingScheduledMessage[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];
  const { data, error } = await svc
    .from('scheduled_messages')
    .select('id, character_id, slot, content, scheduled_for, created_at')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .is('delivered_at', null)
    .order('scheduled_for', { ascending: true })
    .limit(20);
  if (error) {
    console.error(`[scheduled] listPendingForUserCharacter fail: ${error.message}`);
    return [];
  }
  return ((data as Array<{
    id: string;
    character_id: string;
    slot: ScheduledSlot;
    content: string;
    scheduled_for: string;
    created_at: string;
  }>) ?? []).map((r) => ({
    id: r.id,
    characterId: r.character_id,
    slot: r.slot,
    content: r.content,
    scheduledFor: r.scheduled_for,
    createdAt: r.created_at,
  }));
}

/**
 * Mark a set of scheduled-message ids as delivered. Idempotent — if
 * the row was already delivered we just leave it alone. Returns the
 * number of rows actually flipped this call.
 *
 * We accept an array because the client typically picks up multiple
 * pending rows at once (e.g. the user was offline for a day and now
 * sees both the lunch + evening greetings on the same poll tick).
 */
export async function markDelivered(
  userId: string,
  ids: string[],
): Promise<number> {
  const svc = getServiceSupabase();
  if (!svc || ids.length === 0) return 0;
  const { data, error } = await svc
    .from('scheduled_messages')
    .update({ delivered_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId) // defence-in-depth — never ack someone else's rows
    .is('delivered_at', null)
    .select('id');
  if (error) {
    console.error(`[scheduled] markDelivered fail: ${error.message}`);
    return 0;
  }
  return (data ?? []).length;
}
