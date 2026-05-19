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

/**
 * Per-modality attachment metadata. Mirrors the discriminated union
 * in @wi/core/chat MessageMetadata so the wire shape between
 * `/api/chat/history` and the chat client is identical to what the
 * client already renders today.
 */
export type AttachmentMetadata =
  | {
      kind: 'image';
      imageUrl: string;
      width?: number;
      height?: number;
    }
  | {
      kind: 'song';
      audioUrl: string;
      title?: string;
      lyrics?: string;
      durationMs?: number;
      taskId?: string;
    }
  | {
      kind: 'product';
      campaignId: string;
      productId: string;
      title: string;
      price: number;
      currency: string;
      imageUrl: string;
      ctaUrl: string;
    };

export interface ChatHistoryRecord {
  id: string;
  role: 'user' | 'assistant';
  /** Discriminator the chat client uses to pick which UI to render. */
  kind: 'text' | 'image' | 'song' | 'product';
  /** Plain text (for kind='text') or a short caption / lyric snippet
   *  (other kinds). May be empty for purely visual rows like image. */
  content: string;
  /** Metadata object — typed against AttachmentMetadata when
   *  kind !== 'text'. null for plain text rows. */
  metadata: AttachmentMetadata | null;
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
 * Most recent turns of ANY modality (text + image + song + product)
 * for one user × one character. Oldest-first (display order).
 *
 * Phase B-2 expanded this from text-only to all kinds so attachments
 * (selfies, weather songs, product cards) sync across devices the
 * same way text turns do. Non-text rows carry their renderer data
 * in the `metadata` jsonb column.
 *
 * Returns [] when:
 *   - service-role client isn't configured
 *   - the user has no session with this character yet
 *   - the session exists but has no messages
 */
export async function listRecentMessages(
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
    .select('id, role, content, modality, metadata, created_at')
    .eq('session_id', sessionData.id as string)
    .in('modality', ['text', 'image', 'song', 'product'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return data
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .reverse()
    .map((r): ChatHistoryRecord => {
      const modality = r.modality as 'text' | 'image' | 'song' | 'product';
      const metadata = r.metadata as AttachmentMetadata | null;
      // Backwards-compat name kept: 'text' rows still flow through
      // this list. The chat client switches on `kind` to render.
      return {
        id: r.id as string,
        role: r.role as 'user' | 'assistant',
        kind: modality,
        content: typeof r.content === 'string' ? (r.content as string) : '',
        metadata: modality === 'text' ? null : (metadata ?? null),
        createdAt: new Date(r.created_at as string).getTime(),
      };
    });
}

/**
 * Backwards-compatibility alias for callers that imported the old
 * text-only function name. New code should use `listRecentMessages`.
 */
export const listRecentTextMessages = listRecentMessages;

/**
 * Persist a single non-text turn — selfie, weather song, or
 * product card. Used by the attachment confirmation endpoint
 * after the client-side generator pipeline produces a final URL.
 *
 * Why separate from saveTurns: attachments need their renderer
 * data (image URL, audio URL, product fields) stashed in the
 * `metadata` jsonb. text turns don't have metadata at all.
 *
 * Returns true on success; logs + returns false on DB error.
 */
export async function saveAttachment(args: {
  sessionId: string;
  role: 'user' | 'assistant';
  metadata: AttachmentMetadata;
  /** Optional short text — caption, lyrics snippet, etc. Not the
   *  primary content for these kinds; the renderer reads metadata. */
  content?: string;
  createdAt: number;
  model?: string;
}): Promise<boolean> {
  const svc = getServiceSupabase();
  if (!svc) return false;
  const { error } = await svc.from('messages').insert({
    session_id: args.sessionId,
    role: args.role,
    modality: args.metadata.kind,
    content: args.content ?? null,
    metadata: args.metadata,
    model: args.model ?? null,
    created_at: new Date(args.createdAt).toISOString(),
  });
  if (error) {
    console.error(`[messages] saveAttachment fail: ${error.message}`);
    return false;
  }
  return true;
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
