import { NextResponse } from 'next/server';

import { backfillSessionMessages } from '@/lib/messages';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/history/migrate
 *
 * One-shot migration of a signed-in user's per-device localStorage
 * conversation into the Supabase `messages` table. The chat client
 * calls this on mount when:
 *
 *   - caller is signed in
 *   - GET /api/chat/history returned [] (no server-side history)
 *   - the local device has cached messages in localStorage
 *
 * The server-side `backfillSessionMessages` is the idempotency
 * gate: it refuses to insert if the session already has any rows,
 * so a second device firing the same migration race wins exactly
 * once. The losing device's local cache stays around but its push
 * is silently ignored (returns reason='already_populated').
 *
 * Body:
 *   {
 *     characterId: 'sunny'|'rain'|'cloudy'|'thunder',
 *     turns: [
 *       { role: 'user'|'assistant', content: string, createdAt: number }
 *     ]
 *   }
 *
 * Returns: { inserted: number, reason?: string }
 */
interface Body {
  characterId?: string;
  turns?: Array<{ role?: string; content?: string; createdAt?: number }>;
}

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveUser();
  if (!caller) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Login required' } },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  if (!body.characterId || !Array.isArray(body.turns)) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Missing characterId or turns' } },
      { status: 400 },
    );
  }

  // Validate + clamp the turns array. We accept up to 100 turns
  // per migration call — anything older than that the user has
  // forgotten about anyway, and the prompt budget can't fit them.
  const turns = body.turns
    .filter(
      (t) =>
        t &&
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string' &&
        t.content.trim().length > 0 &&
        typeof t.createdAt === 'number' &&
        Number.isFinite(t.createdAt),
    )
    .slice(-100)
    .map((t) => ({
      role: t.role as 'user' | 'assistant',
      content: (t.content as string).slice(0, 8000),
      createdAt: t.createdAt as number,
    }));

  const result = await backfillSessionMessages(caller.id, body.characterId, turns);
  return NextResponse.json(result);
}
