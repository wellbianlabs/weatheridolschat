import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { classifyIntent } from '@wi/core/chat';
import { pickProductForCharacter } from '@wi/core/monetization';
import { runInputSafeguard } from '@wi/core/safeguards';
import { buildKstContext, formatKstLocalTime } from '@wi/core/time';

import {
  getOrCreateSession,
  getSessionMemory,
  saveAttachment,
  saveTurns,
  type PersistedTurn,
} from '@/lib/messages';
import { getProfileLocation } from '@/lib/profile';
import { consumeQuota, quotaHeaders, type QuotaResult } from '@/lib/quota';
import { resolveUser } from '@/lib/supabase/identity';
import { pickChatAdapter, pickFallbackAdapter, SYSTEM_PROMPTS } from '@wi/ai';
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
  /**
   * Recent conversation turns the client wants the model to see for
   * context. Client trims to a sliding window (last ~20 messages,
   * text-only) so the prompt size stays bounded. Without this, the
   * server used to pass `history: []` to the adapter and every turn
   * looked like a brand-new conversation to the LLM — the
   * "맥락이 계속 끊기는" bug. We accept the simplified shape (just
   * role + content + modality) and inflate to the full Message[]
   * the adapter expects.
   */
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    modality?: 'text' | 'image' | 'product' | 'song' | 'video';
  }>;
  /**
   * Rolling summary of conversation turns that fell off the sliding
   * window — written by /api/chat/summarize and cached client-side
   * per character. Slots into the [Memory] block in the system
   * prompt so the character "remembers" facts from 30+ turns ago
   * without us shipping all those tokens every request.
   */
  memorySummary?: string;
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

  // Location resolution cascade — first hit wins:
  //   1. `body.locationHint` — explicit per-request override (the
  //      client can pass this in from a "send my current location"
  //      flow once that's wired).
  //   2. The user's saved profile primary location, set during
  //      /onboarding. Means a signed-in user from 부산 sees their
  //      own weather without typing anything.
  //   3. Default 서울 강남구 fallback so anon visitors / users who
  //      skipped the location step still get a sensible reading.
  let point = body.locationHint as { lat: number; lng: number; label?: string } | undefined;
  if (!point && caller) {
    const saved = await getProfileLocation(caller.id);
    if (saved) point = saved;
  }
  if (!point) point = { lat: 37.498, lng: 127.028, label: '서울 강남구' };
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

  // Upsert the sessions row and capture its id NOW — we need it
  // after the stream ends to persist the two turns. `await` adds
  // one round-trip (~50ms) at the start of every chat call but the
  // alternative (deferred lookup at stream end) doubles the
  // round-trips since we'd still need to upsert + select. Anon
  // callers skip this entirely; their conversation stays in
  // localStorage as before.
  const sessionId = caller
    ? await getOrCreateSession(caller.id, character.id)
    : null;

  // Memory summary cascade: client-supplied (warm cache) wins,
  // then server-stored (sessions.memory_summary) — so a user
  // opening the app on a new device with no localStorage still
  // gets long-term memory injected into their first prompt.
  let memorySummary: string | undefined;
  if (
    typeof body.memorySummary === 'string' &&
    body.memorySummary.trim().length > 0
  ) {
    memorySummary = body.memorySummary.slice(0, 4000);
  } else if (caller) {
    const fromDb = await getSessionMemory(caller.id, character.id);
    if (fromDb && fromDb.trim().length > 0) {
      memorySummary = fromDb.slice(0, 4000);
    }
  }

  const userMessageId = cryptoRandom();
  const assistantMessageId = cryptoRandom();

  // Track the assistant's accumulated text during the stream so we
  // can persist it after the loop ends. Stays empty for anon callers
  // (we never write a Message row for them since there's no session
  // to attach it to).
  const userTurnCreatedAt = Date.now();
  let assistantText = '';
  let modelUsed = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(payload: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
      try {
        // Inflate the lightweight client-side history shape to the
        // full Message[] the adapter expects. Stub the id /
        // sessionId / timestamps — buildPrompt() doesn't read them,
        // it only touches role + content + modality. Caps at the
        // client-provided length (which is already bounded to ~20),
        // and double-trims server-side as a safety net so a hostile
        // client can't blow up the prompt by submitting a giant
        // history array.
        const HISTORY_HARD_CAP = 30;
        const adapterHistory = (body.history ?? [])
          .slice(-HISTORY_HARD_CAP)
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
          .map((m, i) => ({
            id: `client-${i}`,
            sessionId: '',
            role: m.role,
            modality: (m.modality ?? 'text') as
              | 'text'
              | 'image'
              | 'product'
              | 'song'
              | 'video',
            content: typeof m.content === 'string' ? m.content : '',
            metadata: null,
            createdAt: '',
          }));

        // ── Adapter stream + transparent fallback ─────────────────
        //
        // Try the primary adapter (Claude for Premium, Gemini for
        // Free — see pickChatAdapter). If it fails BEFORE forwarding
        // any real tokens, switch to the alternate provider and
        // retry from scratch. The user sees Gemini's reply with no
        // intermediate error — the most common "Anthropic 막혔어"
        // failures (rate limit, billing, transient 5xx) recover
        // invisibly.
        //
        // Mid-stream failures (some tokens already streamed to client,
        // then connection dies) don't fall back — the partial output
        // is already on screen and dropping a Gemini response after
        // it would be more disorienting than a brief error message.
        // In that case we forward the adapter's `error` event and the
        // chat-client renders "응답을 받지 못했어요. (…)".
        const adapterInput = {
          character,
          characterSystemPrompt: SYSTEM_PROMPTS[character.id],
          weather,
          history: adapterHistory,
          memorySummary,
          // localTime is for the LLM's [Now Context] block. Always KST —
          // server runs in UTC on Vercel, but our characters live in 한국.
          user: {
            nickname,
            locale: 'ko' as const,
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
        };

        const fallbackAdapter = pickFallbackAdapter({
          primaryId: adapter.id,
          mockMode,
          anthropicApiKey,
          // Vision turns deliberately exclude Gemini fallback —
          // multimodal handoff between Claude (which got the image
          // attached) and Gemini (which wouldn't) would confuse the
          // model. Stick to Claude only when there's a photo.
          geminiApiKey: userImage ? undefined : geminiApiKey,
        });

        // Run primary adapter. Buffer tokens before forwarding only
        // enough to know "did the primary actually start producing
        // output". `forwardedTokens` flips to true the moment we send
        // the first real token through. Until then, an `error` event
        // means "primary failed early" → try fallback.
        let forwardedTokens = false;
        let primaryFailed = false;
        let primaryFailedMessage: string | undefined;

        for await (const evt of adapter.stream(adapterInput)) {
          if (evt.type === 'token') {
            forwardedTokens = true;
            // Accumulate for post-stream DB persistence. `delta` is
            // typed as string on the token event variant.
            if (typeof (evt as { delta?: string }).delta === 'string') {
              assistantText += (evt as { delta: string }).delta;
            }
            send(evt);
          } else if (evt.type === 'meta') {
            // Capture model id for the assistant row's `model`
            // column — useful for future analytics ("which model
            // wrote which line"). Doesn't affect rendering.
            const m = (evt as { model?: string }).model;
            if (typeof m === 'string') modelUsed = m;
            send(evt);
          } else if (
            evt.type === 'error' &&
            !forwardedTokens &&
            fallbackAdapter
          ) {
            // Primary died before producing real output AND a
            // fallback is available — eat the error event and
            // restart with the fallback below. We deliberately do
            // NOT forward the primary's `done` event (which the
            // adapter yields after `error`) since the conversation
            // isn't actually done from the client's perspective.
            primaryFailed = true;
            primaryFailedMessage = evt.message;
            console.warn(
              `[chat] primary=${adapter.id} failed early — falling back to ${fallbackAdapter.id}. cause="${(evt.message ?? '').slice(0, 120)}"`,
            );
            break;
          } else if (evt.type === 'done' && primaryFailed) {
            // Suppressed — fallback will emit its own done.
            continue;
          } else {
            send(evt);
          }
        }

        if (primaryFailed && fallbackAdapter) {
          // Same input, different adapter. The new adapter yields
          // its own `meta` event with its own model name — the chat
          // client just ignores that field, so this is invisible UX.
          // Reset accumulators because the primary's partial output
          // (if any) wasn't actually forwarded and shouldn't be
          // persisted as part of the assistant turn.
          assistantText = '';
          modelUsed = '';
          for await (const evt of fallbackAdapter.stream(adapterInput)) {
            if (evt.type === 'token') {
              forwardedTokens = true;
              if (typeof (evt as { delta?: string }).delta === 'string') {
                assistantText += (evt as { delta: string }).delta;
              }
            } else if (evt.type === 'meta') {
              const m = (evt as { model?: string }).model;
              if (typeof m === 'string') modelUsed = m;
            }
            send(evt);
          }
          console.info(
            `[chat] fallback=${fallbackAdapter.id} OK after primary=${adapter.id} failed (msg="${(primaryFailedMessage ?? '').slice(0, 80)}")`,
          );
        } else if (primaryFailed) {
          // No fallback available — replay the primary's error event
          // to the client so it can render the friendly Korean
          // message. The chat-client renders the message inside
          // "응답을 받지 못했어요. (…)".
          send({
            type: 'error',
            code: 'provider_error',
            message: primaryFailedMessage ?? '응답을 받지 못했어요.',
          });
          send({ type: 'done', finishReason: 'error' });
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
            // Persist the product card as its own messages row so it
            // syncs across devices. Fire-and-forget — the visual card
            // is already on the client; a DB failure here just means
            // the card disappears on next mount (acceptable).
            if (sessionId) {
              void saveAttachment({
                sessionId,
                role: 'assistant',
                metadata: { kind: 'product', ...product },
                createdAt: Date.now(),
              });
            }
          }
        }

        // ── Persist the turn to the messages table ────────────────
        // Only when we have a session id (caller signed in) AND the
        // assistant actually produced output. Failures here are
        // logged but don't fail the stream — the client already has
        // the bubbles rendered.
        if (sessionId && assistantText.trim().length > 0) {
          const turns: PersistedTurn[] = [
            {
              role: 'user',
              content: text,
              createdAt: userTurnCreatedAt,
            },
            {
              role: 'assistant',
              content: assistantText,
              // +1ms so the assistant lands AFTER the user turn when
              // sorted by created_at on the next history fetch.
              createdAt: userTurnCreatedAt + 1,
              model: modelUsed || undefined,
            },
          ];
          // Don't await — adds latency to controller.close() which
          // delays the client's "done" event. Fire-and-forget is fine
          // because the stream is already complete by this point.
          void saveTurns(sessionId, turns).then((ok) => {
            if (!ok) {
              console.warn(
                `[chat] saveTurns failed session=${sessionId.slice(0, 8)}… user=${caller?.id.slice(0, 8) ?? '-'}`,
              );
            }
          });
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

// recordSessionTouch removed — getOrCreateSession() in @/lib/messages
// does the same upsert AND returns the row id we need for downstream
// `messages` inserts, in one round-trip. Single source of truth for
// session creation.

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
