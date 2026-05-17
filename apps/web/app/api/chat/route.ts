import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { classifyIntent } from '@wi/core/chat';
import { pickProductForCharacter } from '@wi/core/monetization';
import { runInputSafeguard } from '@wi/core/safeguards';
import { buildKstContext, formatKstLocalTime } from '@wi/core/time';

import { consumeQuota, quotaHeaders, type QuotaResult } from '@/lib/quota';
import { resolveUser } from '@/lib/supabase/identity';
import { getServiceSupabase } from '@/lib/supabase/service';
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

  // ── Identity + tier resolution ────────────────────────────────
  const caller = await resolveUser();
  const tier: 'free' | 'premium' = caller?.isAdmin
    ? 'premium' // admin gets the premium-quality adapter
    : (body.tier ?? 'free');
  if (caller) {
    console.info(
      `[chat] caller id=${caller.id.slice(0, 8)}… email=${caller.email ?? '-'} tier=${caller.tier}`,
    );
  }

  // ── Quota check (Phase 2) ─────────────────────────────────────
  // Charge a message + (if photo attached) a vision turn. Admin is
  // bypassed inside consumeQuota; anon callers get through without
  // server-side persistence (client-side soft limit handles that).
  const msgQuota = await consumeQuota({ field: 'messages', caller });
  if (!msgQuota.allowed) {
    return new Response(
      JSON.stringify({ error: { code: msgQuota.code, message: msgQuota.message } }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...quotaHeaders(msgQuota, 'messages'),
        },
      },
    );
  }
  let visionQuota: QuotaResult | null = null;
  if (body.imageDataUrl) {
    visionQuota = await consumeQuota({ field: 'vision', caller });
    if (!visionQuota.allowed) {
      return new Response(
        JSON.stringify({ error: { code: visionQuota.code, message: visionQuota.message } }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...quotaHeaders(visionQuota, 'vision'),
          },
        },
      );
    }
  }

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
  // calls above don't need to know about it.
  const userImage = parseImageDataUrl(body.imageDataUrl) ?? undefined;
  if (body.imageDataUrl && !userImage) {
    return jsonError(
      'validation_error',
      'Invalid or oversized image (max 6MB, jpeg/png/webp/gif).',
      400,
    );
  }

  // ── Vision routing: Claude-only by design ───────────────────────
  //
  // Camera input is conceptually "look at this picture and let's talk
  // about it" — a multimodal CONVERSATIONAL flow, not image
  // generation. We pin that flow to Claude on purpose:
  //
  //   - Gemini vision works but produces noticeably shorter and
  //     less character-voiced replies in Korean; silently falling
  //     back would give users an inconsistent experience and they
  //     wouldn't know which model answered.
  //   - OpenAI is NOT in the vision path at all — we only call
  //     OpenAI for image GENERATION (the selfie feature). Camera
  //     input and selfie output are two completely separate
  //     pipelines, even though both involve "an image".
  //
  // So when a photo is attached:
  //   • mockMode → mock adapter (development only; image dropped)
  //   • else, ANTHROPIC_API_KEY required → Claude
  //   • else → hard fail with an actionable error (better than a
  //            silent Gemini fallback that would surprise the user
  //            with a different writing style).
  if (userImage && !mockMode && !anthropicApiKey) {
    return jsonError(
      'no_vision_provider',
      'ANTHROPIC_API_KEY가 설정되지 않아 사진 분석을 할 수 없어요. Vercel 환경변수에 Claude API 키를 추가해주세요.',
      503,
    );
  }

  // Force-route vision turns through Claude (premium tier path).
  // Non-vision turns keep the user's tier preference.
  const visionTier = userImage ? 'premium' : tier;
  const adapter = pickChatAdapter({
    tier: visionTier,
    mockMode,
    // When a photo is attached, deliberately NOT pass the Gemini key
    // so pickChatAdapter can't silently fall through to it. The
    // ANTHROPIC_API_KEY presence check above already guarantees this
    // path only runs when Claude is reachable.
    anthropicApiKey,
    geminiApiKey: userImage ? undefined : geminiApiKey,
  });
  if (userImage) {
    console.info(
      `[chat] vision adapter=${adapter.id} character=${character.id} bytes=${Math.round(userImage.base64.length * 0.75)}`,
    );
  }

  // Record this turn in the `sessions` table so we can answer
  // "which character did this user chat with most recently" — used
  // by the 4×/day scheduled-greeting cron in
  // apps/web/app/api/cron/weather-greeting to pick a sender. Anon
  // callers skip silently (no `caller.id` to attribute the row to).
  // Fire-and-forget — the chat stream MUST NOT block on this.
  if (caller) void recordSessionTouch(caller.id, character.id);

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
          user: {
            nickname,
            locale: 'ko',
            localTime: formatKstLocalTime(),
            // Rich context (time-of-day bucket, weekend flag, season)
            // — drives the [Now Context] block in the system prompt
            // so the model can pick a tone/detail that fits this
            // exact moment instead of having to infer from the
            // formatted timestamp.
            localTimeContext: buildKstContext(),
            tier,
          },
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
        //
        // IMPORTANT: when the user attached a photo, suppress the
        // "request_image" (selfie generation) intent. The classifier
        // sees keywords like "사진" or "보여줘" in the user's text and
        // would otherwise mistake the photo-analysis flow for a
        // selfie-generation request — leading to Claude correctly
        // analysing the picture AND THEN OpenAI generating an
        // unrelated selfie that takes over the conversation. When the
        // user sends a picture they're SHOWING us one, not asking for
        // one. Song / product intents still apply because they're
        // orthogonal to the image direction.
        const intent = classifyIntent(text);
        if (intent === 'image_request' && !userImage) {
          send({ type: 'tool', name: 'request_image', output: { intent: 'selfie' } });
        } else if (intent === 'song_request') {
          send({ type: 'tool', name: 'request_song', output: {} });
        } else if (intent === 'recommend' && shouldAttachProductCard(text)) {
          // Stricter gate than the previous "fire on every recommend
          // intent" — see shouldAttachProductCard() below for the
          // why. The text-side discipline lives in
          // packages/ai/src/prompts/system/index.ts (the global
          // PRODUCT_DISCIPLINE block); this is the visual-card half
          // of the same rule.
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
      // Tier resolved server-side. Client uses this to show
      // appropriate UI badges (admin / free / premium).
      'X-User-Tier': caller?.tier ?? 'anon',
      // Live quota state — client renders the remaining badge
      // straight from these headers, no extra round-trip.
      ...quotaHeaders(visionQuota ?? msgQuota, visionQuota ? 'vision' : 'messages'),
    },
  });
}

function cryptoRandom(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * Stricter gate for attaching a product card to the chat stream.
 *
 * Old behaviour: any 'recommend' intent (which fired on bare
 * "추천" / "어디 갈" / "뭐 먹" / "어딜 가") auto-attached a card. In
 * practice that meant a user mentioning "춘천에서 추천해줄 카페
 * 있어?" would see a selfie-line-themed lipstick card pop up because
 * the intent matched and the card was character-keyed, not
 * topic-keyed. That reads as a salesman, which is the opposite of
 * the friend-recommends-a-gift feel the product is trying to build.
 *
 * New rules — ALL of these must hold for a card to attach:
 *
 *   1. The user text contains an explicit purchase / gifting verb,
 *      not just generic "추천". The list below is intentionally
 *      narrow so accidental triggers are rare.
 *   2. A 30% probability gate. Even when the user is unambiguously
 *      shopping, we don't want every reply to end with a product
 *      card — friends suggest things sometimes, not always. The
 *      LLM still talks about the topic in prose; the card is a
 *      sometimes-bonus.
 *
 * If both pass we attach a single card. The text-side prompt (see
 * PRODUCT_DISCIPLINE in packages/ai/src/prompts/system/index.ts)
 * additionally tells the character not to over-sell *in* the prose,
 * regardless of whether the card is attached.
 *
 * Future: when the Nasmedia integration lands and product cards are
 * tied to the actual topic the user mentioned, we can lower the
 * probability gate and tighten the relevance match instead of
 * relying on the verb list.
 */
function shouldAttachProductCard(text: string): boolean {
  const t = text.toLowerCase();
  // Verbs that clearly signal "I want to buy / receive a thing".
  // "어디 갈" is intentionally NOT here — that's a destination
  // question, not a shopping one, and triggering on it was the
  // primary source of the "춘천 → 닭갈비 광고" complaint.
  const purchaseIntent =
    /(사고\s*싶|살\s*만한|살\s*거|살\s*수|살\s*까|구매|구입|쇼핑|선물|기프트|gift|어디서\s*사|어디서\s*살)/.test(t);
  if (!purchaseIntent) return false;
  // Probability gate — even when shopping intent is real, only ~30%
  // of replies attach a card. The user gets verbal suggestions
  // every time; the visual card is a sometimes-extra.
  return Math.random() < 0.3;
}

/**
 * Upsert a row into `sessions` keyed on (user_id, character_id) and
 * bump `last_message_at` to now. Used as a fire-and-forget side
 * effect of the chat route so the scheduled-greeting cron can find
 * each user's most recently-chatted character.
 *
 * No-op when the service-role key isn't configured. Errors are
 * swallowed (logged) because nothing about the chat response depends
 * on this succeeding — at worst the user just doesn't appear in the
 * cron's audience until their next message.
 */
async function recordSessionTouch(userId: string, characterId: string): Promise<void> {
  const svc = getServiceSupabase();
  if (!svc) return;
  try {
    const nowIso = new Date().toISOString();
    const { error } = await svc
      .from('sessions')
      .upsert(
        { user_id: userId, character_id: characterId, last_message_at: nowIso },
        { onConflict: 'user_id,character_id' },
      );
    if (error) {
      console.warn(
        `[chat] session touch fail user=${userId.slice(0, 8)}… char=${characterId}: ${error.message}`,
      );
    }
  } catch (err) {
    console.warn(`[chat] session touch threw: ${(err as Error).message}`);
  }
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
