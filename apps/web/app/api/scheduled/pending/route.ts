import { NextResponse } from 'next/server';

import { listPendingForUserCharacter } from '@/lib/scheduled';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scheduled/pending?characterId=<id>
 *
 * Returns scheduled greetings that have NOT yet been delivered to
 * this user × character. The chat client polls this every minute
 * while the tab is visible; on a fresh tab open it picks up anything
 * that arrived while the user was away.
 *
 * Auth model: read-your-own only. The query is keyed off `resolveUser()`
 * so an unauthenticated caller gets an empty list (no 401 — the chat
 * client is fine with "no pending" for anon visitors, and the noise
 * of 401s in dev tools would just confuse).
 */
export async function GET(req: Request): Promise<Response> {
  const characterId = new URL(req.url).searchParams.get('characterId');
  if (!characterId) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Missing characterId' } },
      { status: 400 },
    );
  }

  const caller = await resolveUser();
  if (!caller) {
    // Quiet no-op for anon visitors. The chat client's poll loop runs
    // even before login (just sits there harmlessly), so spamming 401s
    // would be misleading noise.
    return NextResponse.json({ items: [] });
  }

  const items = await listPendingForUserCharacter(caller.id, characterId);
  return NextResponse.json({ items });
}
