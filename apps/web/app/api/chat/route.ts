import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { classifyIntent } from '@wi/core/chat';
import { pickProductForCharacter } from '@wi/core/monetization';
import { runInputSafeguard } from '@wi/core/safeguards';
import { formatKstLocalTime } from '@wi/core/time';
import { pickChatAdapter, SYSTEM_PROMPTS } from '@wi/ai';
import { getCurrentWeather } from '@wi/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatBody {
  characterId?: string;
  text?: string;
  nickname?: string;
  locationHint?: { lat: number; lng: number };
  tier?: 'free' | 'premium';
  /**
   * Optional image attached to the user's turn — sent through the
   * "📷 카메라" composer button. The client encodes the file as a
   * data URL (`data:image/jpeg;base64,...`) and ships it as-is.
   * Size capped client-side; rejected here above 6MB to stay under
   * the Anthropic / Gemini payload limits.
   */
  imageDataUrl?: string;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Pull mediaType + raw base64 out of a `data:image/...;base64,...` URL.
 *  Returns null for malformed inputs or unsupported mime types. */
function parseImageDataUrl(
  url: string | undefined,
): { mediaType: string; base64: string } | null {
  if (!url) return null;
  const m = /^data:(image\/(?:jpe?g|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  if (!m) return null;
  const mediaType = m[1]!.toLowerCase().replace('jpg', 'jpeg');
  const base64 = m[2]!;
  // base64 → bytes: roughly len * 3/4
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) return null;
  return { mediaType, base64 };
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return jsonError('validation_error', 'Invalid JSON body', 400);
  }

  let text = (body.text ?? '').trim();
  const characterId = body.characterId ?? '';
  const character = CHARACTERS[characterId];
  if (!character) return jsonError('not_found', 'Unknown character', 404);
  // Empty text is OK *only* when an image is attached — that's the
  // "just look at this photo" flow. Otherwise we reject so we don't
  // burn an LLM call on a blank message.
  if (!text && !body.imageDataUrl)
    return jsonError('validation_error', 'Empty message', 400);
  // Give the vision model a sensible default prompt when the user
  // sends a photo without typing anything.
  if (!text && body.imageDataUrl) text = '이 사진 어때?';

  const nickname = (body.nickname ?? '').trim() || '친구';
  const tier = body.tier ?? 'free';

  // Env-driven configuration. Real keys → live; missing → mock fallback.
  const mockMode = process.env.MOCK_MODE !== 'false';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  // Accept the new env var name (`KW_API_KEY`) first and fall through to the
  // legacy `KWEATHER_API_KEY` name so existing deployments keep working.
  const kweatherApiKey = process.env.KW_API_KEY || process.env.KWEATHER_API_KEY || undefined;

  const safeguard = runInputSafeguard({ text, characterId: character.id, userNickname: nickname });
  if (safeguard.kind !== 'allow') {
    return streamSingleText(safeguard.replyText);
  }

  const point = body.locationHint ?? { lat: 37.498, lng: 127.028, label: '서울 강남구' };
  const weather = await getCurrentWeather(point, {
    mockMode,
    kweatherApiKey,
    openWeatherMapApiKey,
  });

  // Image: validated + decoded once here so the safeguard / weather
  // calls above don't need to know about it. Both Claude and Gemini
  // support vision via the same `userImage` field.
  const userImage = parseImageDataUrl(body.imageDataUrl) ?? undefined;
  if (body.imageDataUrl && !userImage) {
    return jsonError(
      'validation_error',
      'Invalid or oversized image (max 6MB, jpeg/png/webp/gif).',
      400,
    );
  }

  // When an image is attached we strongly prefer Claude — its vision
  // grounding is more reliable than Gemini's for our use cases, and
  // it produces longer, more descriptive responses. Override the tier
  // routing for this single turn so a free-tier user still gets a
  // proper vision reply when they send a photo.
  const visionTier = userImage && anthropicApiKey ? 'premium' : tier;
  const adapter = pickChatAdapter({
    tier: visionTier,
    mockMode,
    anthropicApiKey,
    geminiApiKey,
  });

  const userMessageId = cryptoRandom();
  const assistantMessageId = cryptoRandom();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(payload: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
      try {
        for await (const evt of adapter.stream({
          character,
          characterSystemPrompt: SYSTEM_PROMPTS[character.id],
          weather,
          history: [],
          // localTime is for the LLM's [Now Context] block. Always KST —
          // server runs in UTC on Vercel, but our characters live in 한국.
          user: { nickname, locale: 'ko', localTime: formatKstLocalTime(), tier },
          userMessage: text,
          userImage,
          ids: { userMessageId, assistantMessageId },
        })) {
          send(evt);
        }

        // Post-stream side-effects based on the user's intent. Works
        // regardless of which chat adapter (Mock / Gemini / Claude) ran —
        // we always classify the message server-side so live models also
        // get the right follow-up: selfie image, song, or product card.
        const intent = classifyIntent(text);
        if (intent === 'image_request') {
          send({ type: 'tool', name: 'request_image', output: { intent: 'selfie' } });
        } else if (intent === 'song_request') {
          send({ type: 'tool', name: 'request_song', output: {} });
        } else if (intent === 'recommend') {
          const product = pickProductForCharacter(character.id);
          if (product) {
            send({ type: 'attachment', payload: { kind: 'product', ...product } });
          }
        }
      } catch (err) {
        send({ type: 'error', code: 'internal_error', message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Adapter': adapter.id,
      'X-Provider-Mode': mockMode ? 'mock' : 'live',
    },
  });
}

function cryptoRandom(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function streamSingleText(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const events = [
        { type: 'meta', userMessageId: cryptoRandom(), assistantMessageId: cryptoRandom(), model: 'safeguard' },
        { type: 'token', delta: text },
        { type: 'done', finishReason: 'safety' as const },
      ];
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
