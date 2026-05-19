import { getServiceSupabase } from '../supabase/service';

/**
 * Server-side `messages` + `sessions` helpers.
 *
 * Two-tier persistence model:
 *   - `sessions` row per (user, character) — one row, upserted, holds
 *     last_message_at + memory_summary
 *   - `messages` rows per turn — append-only, linked to session
 *
 * All helpers use the service-role Supabase client so they work from
 * server-side API routes regardless of RLS. They are the single
 * write path for chat persistence — the client never talks to the
 * `messages` table directly.
 */

export interface PersistedTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Epoch ms — usually `Date.now()` from the route at send time. */
  createdAt: number;
  /** Optional model identifier (e.g. 'claude-sonnet-4-6'). */
  model?: string;
}

export interface ChatHistoryRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Epoch ms — converted from the DB's timestamptz column. */
  createdAt: number;
}

/**
 * Upsert a session row and return its id in a single round-trip.
 *
 * The `sessions` table has a `unique (user_id, character_id)`
 * constraint, so the upsert reuses any existing row and just bumps
 * last_message_at. Returning the id lets the caller use it to
 * insert into `messages` without a follow-up SELECT.
 */
export async function getOrCreateSession(
  userId: string,
  characterId: string,
): Promise<string | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const { data, error } = await svc
    .from('sessions')
    .upsert(
      {
        user_id: userId,
        character_id: characterId,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,character_id' },
    )
    .select('id')
    .single();
  if (error) {
    console.error(`[messages] getOrCreateSession fail: ${error.message}`);
    return null;
  }
  return (data?.id as string) ?? null;
}

/**
 * Insert one or more text turns at the end of a session.
 *
 * Caller passes pre-computed createdAt timestamps (epoch ms). We
 * use those rather than `now()` on the server so the user's bubble
 * timestamp + the assistant's bubble timestamp on the client match
 * the DB exactly — no clock drift between the client tick and the
 * Postgres NOW() when the row hits the table milliseconds later.
 */
export async function saveTurns(
  sessionId: string,
  turns: PersistedTurn[],
): Promise<boolean> {
  const svc = getServiceSupabase();
  if (!svc) return false;
  if (turns.length === 0) return true;
  const rows = turns.map((t) => ({
    session_id: sessionId,
    role: t.role,
    modality: 'text',
    content: t.content,
    model: t.model ?? null,
    created_at: new Date(t.createdAt).toISOString(),
  }));
  const { error } = await svc.from('messages').insert(rows);
  if (error) {
    console.error(`[messages] saveTurns fail: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Most recent text turns for one user × one character — oldest first
 * (display order). Caps at `limit` rows from the DB (queries
 * newest-first to get the last N, then reverses for UI).
 *
 * Returns [] when:
 *   - service-role client isn't configured
 *   - the user has no session with this character yet
 *   - the session exists but has no messages
 *
 * Non-text modalities (image/song/product) are skipped here; those
 * still live in client-side localStorage. Phase B-2 will persist
 * them with their metadata as well.
 */
export async function listRecentTextMessages(
  userId: string,
  characterId: string,
  limit = 50,
): Promise<ChatHistoryRecord[]> {
  const svc = getServiceSupabase();
  if (!svc) return [];

  const { data: sessionData } = await svc
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  if (!sessionData) return [];

  const { data, error } = await svc
    .from('messages')
    .select('id, role, content, created_at, modality')
    .eq('session_id', sessionData.id as string)
    .eq('modality', 'text')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return data
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .filter((r) => typeof r.content === 'string' && (r.content as string).length > 0)
    .reverse()
    .map((r) => ({
      id: r.id as string,
      role: r.role as 'user' | 'assistant',
      content: (r.content as string) ?? '',
      createdAt: new Date(r.created_at as string).getTime(),
    }));
}

/**
 * Read the rolling memory summary stamped on the session row by
 * /api/chat/summarize. Used both by /api/chat/history (returned to
 * client on mount) and by /api/chat (injected into the prompt when
 * the client didn't ship its own copy in the body).
 */
export async function getSessionMemory(
  userId: string,
  characterId: string,
): Promise<string | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;
  const { data } = await svc
    .from('sessions')
    .select('memory_summary')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  return (data?.memory_summary as string | null) ?? null;
}

export async function updateSessionMemory(
  userId: string,
  characterId: string,
  summary: string,
): Promise<boolean> {
  const svc = getServiceSupabase();
  if (!svc) return false;
  const { error } = await svc
    .from('sessions')
    .update({ memory_summary: summary })
    .eq('user_id', userId)
    .eq('character_id', characterId);
  if (error) {
    console.error(`[messages] updateSessionMemory fail: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Migrate a localStorage-only conversation into the DB. Used by
 * /api/chat/history/migrate on the user's first signed-in chat
 * page load — when their device has prior localStorage history
 * but the DB session has no messages yet.
 *
 * Refuses to insert if the session already has any messages
 * server-side — that would create duplicates from a second device
 * trying to "migrate" its own localStorage on top of authoritative
 * server data.
 */
export async function backfillSessionMessages(
  userId: string,
  characterId: string,
  turns: PersistedTurn[],
): Promise<{ inserted: number; reason?: string }> {
  if (turns.length === 0) return { inserted: 0, reason: 'empty' };

  const svc = getServiceSupabase();
  if (!svc) return { inserted: 0, reason: 'no_supabase' };

  const sessionId = await getOrCreateSession(userId, characterId);
  if (!sessionId) return { inserted: 0, reason: 'no_session' };

  const { count } = await svc
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (count && count > 0) {
    return { inserted: 0, reason: 'already_populated' };
  }

  const ok = await saveTurns(sessionId, turns);
  return { inserted: ok ? turns.length : 0, reason: ok ? undefined : 'insert_failed' };
}
