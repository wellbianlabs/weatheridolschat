import { NextResponse } from 'next/server';

import { markDelivered } from '@/lib/scheduled';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scheduled/ack
 * Body: { ids: string[] }
 *
 * Mark a batch of scheduled-message ids as delivered so the next
 * poll loop doesn't re-show them. The helper double-filters by
 * `user_id = caller` inside the UPDATE so a hostile client can't ack
 * someone else's rows even if it guessed their ids.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  // Validate `ids` is an array of plain strings — we don't want to
  // hand arbitrary shapes to the SQL `IN (…)` clause.
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: '`ids` must be string[]' } },
      { status: 400 },
    );
  }
  const ids = body.ids as string[];

  const caller = await resolveUser();
  if (!caller) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Login required' } },
      { status: 401 },
    );
  }

  const acked = await markDelivered(caller.id, ids);
  return NextResponse.json({ acked });
}
