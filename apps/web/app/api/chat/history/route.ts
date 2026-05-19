import { NextResponse } from 'next/server';

import { getSessionMemory, listRecentMessages } from '@/lib/messages';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/history?characterId=<id>
 *
 * Returns the authenticated caller's recent conversation with the
 * given character, plus the rolling memory summary, both from the
 * Supabase `sessions` + `messages` tables. Used by the chat client
 * on mount to hydrate React state from the server's truth instead
 * of the per-device localStorage cache.
 *
 * Anonymous callers get an empty response — they have no DB row to
 * read from, and the chat client falls back to localStorage for
 * them. Same for users who've never chatted with this character
 * (no `sessions` row yet); they get the welcome bubble path.
 *
 * Shape is deliberately compact and UIMessage-compatible so the
 * client can drop the array straight into setMessages with minimal
 * mapping:
 *
 *   {
 *     messages: [
 *       { id: uuid, role: 'user'|'assistant', content: string, createdAt: ms }
 *     ],
 *     memorySummary: string | null
 *   }
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const characterId = url.searchParams.get('characterId');
  if (!characterId) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Missing characterId' } },
      { status: 400 },
    );
  }

  const caller = await resolveUser();
  if (!caller) {
    // Quiet empty for anon — see file-header note.
    return NextResponse.json({ messages: [], memorySummary: null });
  }

  // Phase B-2 expansion: history now includes image/song/product
  // rows along with text. The chat client hydrates each by switching
  // on `kind` and rendering the appropriate bubble component.
  const [messages, memorySummary] = await Promise.all([
    listRecentMessages(caller.id, characterId, 50),
    getSessionMemory(caller.id, characterId),
  ]);

  return NextResponse.json({ messages, memorySummary });
}
