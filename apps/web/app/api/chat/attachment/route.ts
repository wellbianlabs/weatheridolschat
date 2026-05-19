import { NextResponse } from 'next/server';

import {
  getOrCreateSession,
  saveAttachment,
  type AttachmentMetadata,
} from '@/lib/messages';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/attachment
 *
 * Single confirmation endpoint the chat client calls after any non-
 * text attachment finalises locally — selfie image rendered, weather
 * song audioUrl populated, product card landed. Server upserts the
 * session if needed, then writes one `messages` row with modality
 * set per `metadata.kind` and the renderer data in the `metadata`
 * jsonb column.
 *
 * Why one endpoint instead of inline persistence in /api/image and
 * /api/music:
 *   - /api/music returns a queued taskId immediately; the audioUrl
 *     only appears later via client polling. The completion moment
 *     is observable client-side, not server-side. The client is the
 *     right caller.
 *   - Same uniform pattern for image keeps the persistence story
 *     simple: one endpoint, one shape.
 *   - Product cards from the chat stream are persisted server-side
 *     inline in /api/chat (the chat route owns that emission).
 *
 * Idempotency: not strictly enforced. The client should only call
 * once per attachment lifecycle (when the renderer state flips to
 * "final"). A duplicate POST would create a duplicate row — caller
 * responsibility for now.
 *
 * Body:
 *   {
 *     characterId: 'sunny'|'rain'|'cloudy'|'thunder',
 *     metadata: AttachmentMetadata,
 *     content?: string,
 *     createdAt?: number,  // epoch ms; defaults to now
 *   }
 */
interface Body {
  characterId?: string;
  metadata?: AttachmentMetadata;
  content?: string;
  createdAt?: number;
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

  if (!body.characterId || !body.metadata?.kind) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_error',
          message: 'Missing characterId or metadata.kind',
        },
      },
      { status: 400 },
    );
  }

  // Shallow validate the metadata payload per kind. Reject anything
  // we don't recognise rather than blindly writing garbage to the
  // jsonb column.
  const md = body.metadata;
  const validKind =
    (md.kind === 'image' && typeof md.imageUrl === 'string') ||
    (md.kind === 'song' && typeof md.audioUrl === 'string') ||
    (md.kind === 'product' &&
      typeof md.productId === 'string' &&
      typeof md.imageUrl === 'string' &&
      typeof md.title === 'string');
  if (!validKind) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_error',
          message: 'Invalid metadata payload for declared kind',
        },
      },
      { status: 400 },
    );
  }

  const sessionId = await getOrCreateSession(caller.id, body.characterId);
  if (!sessionId) {
    return NextResponse.json(
      { error: { code: 'no_session', message: 'Could not resolve session' } },
      { status: 500 },
    );
  }

  const ok = await saveAttachment({
    sessionId,
    // All current attachments are assistant-emitted (the character
    // sends a selfie / song / product). If we ever add user-uploaded
    // images as discrete rows, this becomes a field on the body.
    role: 'assistant',
    metadata: md,
    content: typeof body.content === 'string' ? body.content.slice(0, 2000) : undefined,
    createdAt:
      typeof body.createdAt === 'number' && Number.isFinite(body.createdAt)
        ? body.createdAt
        : Date.now(),
  });
  if (!ok) {
    return NextResponse.json(
      { error: { code: 'save_failed', message: 'Database write failed' } },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
