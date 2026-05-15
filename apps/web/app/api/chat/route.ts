import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { classifyIntent } from '@wi/core/chat';
import { pickProductForCharacter } from '@wi/core/monetization';
import { runInputSafeguard } from '@wi/core/safeguards';
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
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return jsonError('validation_error', 'Invalid JSON body', 400);
  }

  const text = (body.text ?? '').trim();
  const characterId = body.characterId ?? '';
  const character = CHARACTERS[characterId];
  if (!character) return jsonError('not_found', 'Unknown character', 404);
  if (!text) return jsonError('validation_error', 'Empty message', 400);

  const nickname = (body.nickname ?? '').trim() || '친구';
  const tier = body.tier ?? 'free';

  // Env-driven configuration. Real keys → live; missing → mock fallback.
  const mockMode = process.env.MOCK_MODE !== 'false';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  const kweatherApiKey = process.env.KWEATHER_API_KEY || undefined;

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

  const adapter = pickChatAdapter({ tier, mockMode, anthropicApiKey, geminiApiKey });

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
          user: { nickname, locale: 'ko', localTime: new Date().toLocaleString('ko-KR'), tier },
          userMessage: text,
          ids: { userMessageId, assistantMessageId },
        })) {
          send(evt);
        }

        const intent = classifyIntent(text);
        if (intent === 'recommend') {
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
