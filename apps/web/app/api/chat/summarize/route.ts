import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';

import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/summarize
 *
 * Compresses an older slice of conversation history into a short
 * "memory note" — the third-person snapshot the LLM can reference
 * in the [Memory] block of its system prompt. The client invokes
 * this after every chat turn that pushes the message count past
 * a threshold (see chat-client.tsx). The result is cached client-
 * side per character in localStorage.
 *
 * Why a separate endpoint:
 *   - We want the main /api/chat to stay fast — adding inline
 *     summarization would block the chat stream.
 *   - The summary call uses a cheaper/faster model (Gemini Flash)
 *     than the conversation itself (Claude Sonnet for Premium).
 *   - Failures are non-fatal: if summarization breaks, the chat
 *     still works, the user just loses long-term memory beyond
 *     the sliding window. So we return errors as 200 with a flag
 *     rather than 5xx — keeps the client's fire-and-forget call
 *     simple.
 *
 * Body:
 *   {
 *     characterId: 'sunny' | 'rain' | 'cloudy' | 'thunder',
 *     messages: Array<{ role: 'user'|'assistant', content: string }>,
 *     existingSummary?: string,  // previously cached, for accumulation
 *     nickname?: string,
 *   }
 *
 * Returns: { summary: string } or { summary: null, error: '...' }
 */
interface Body {
  characterId?: string;
  messages?: Array<{ role?: string; content?: string }>;
  existingSummary?: string;
  nickname?: string;
}

export async function POST(req: Request): Promise<Response> {
  // Auth-gated. Anonymous users don't have any reason to summarise —
  // their history is localStorage-only and ephemeral.
  const caller = await resolveUser();
  if (!caller) {
    return NextResponse.json({ summary: null, error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ summary: null, error: 'bad_json' });
  }

  const character = body.characterId ? CHARACTERS[body.characterId] : undefined;
  if (!character) {
    return NextResponse.json({ summary: null, error: 'bad_character' });
  }

  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        m &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0 &&
        (m.role === 'user' || m.role === 'assistant'),
    )
    .slice(-100); // hard cap on input size
  if (messages.length < 4) {
    // Nothing meaningful to compress yet.
    return NextResponse.json({ summary: body.existingSummary ?? '' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json({ summary: null, error: 'no_gemini_key' });
  }

  const nickname = (body.nickname ?? '사용자').slice(0, 40);
  const transcript = messages
    .map(
      (m) =>
        `${m.role === 'user' ? nickname : character.displayName}: ${m.content!.slice(0, 400)}`,
    )
    .join('\n');

  // The summarisation prompt itself is in Korean and asks for a
  // compact third-person memory note. Two important constraints:
  //   - Output ≤ 4 short sentences (target ~150 chars). Anything
  //     longer eats the prompt budget on every subsequent turn.
  //   - When `existingSummary` is provided, the model should MERGE
  //     it with the new transcript rather than overwrite — that's
  //     how the rolling memory grows over many sessions instead of
  //     forgetting whatever happened before the most recent flush.
  const instruction = [
    `당신은 ${character.displayName}이라는 캐릭터와 사용자 ${nickname}의 대화를 압축해 메모리 노트를 만드는 도우미입니다.`,
    '',
    '아래 대화를 읽고, 캐릭터가 다음 대화에서 기억하고 있어야 할 핵심 사실만 3~4문장 한국어 메모로 정리하세요.',
    '',
    '지켜야 할 규칙:',
    '- 사용자에 대한 사실 (지역, 직업, 관심사, 반려동물 이름, 최근 고민 등) 중심',
    '- 인사·잡담 같은 흐름은 제외, 다음 대화에 영향을 줄 정보만',
    '- 3인칭으로 작성. "사용자는 ~를 좋아한다", "~에 산다고 했다" 처럼.',
    '- 절대 4문장을 넘기지 말 것',
    '- 기존 메모가 있으면 그것과 합쳐서 최신 버전 한 묶음으로 작성',
    '',
    body.existingSummary && body.existingSummary.trim().length > 0
      ? `[기존 메모]\n${body.existingSummary.trim()}\n`
      : '',
    '[새 대화 발췌]',
    transcript,
    '',
    '메모 출력 (3~4문장만, 다른 설명 없이):',
  ]
    .filter(Boolean)
    .join('\n');

  // Direct Gemini Flash call — cheap and fast for short
  // summarisations. We don't go through the chat adapter because
  // (a) we don't want streaming for this, (b) we don't want
  // Claude's system-prompt + persona overhead bleeding into the
  // memory note.
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.3, // low — we want stable, factual summaries
          maxOutputTokens: 280,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[summarize] gemini ${res.status} ${text.slice(0, 160)}`);
      return NextResponse.json({ summary: null, error: 'provider_error' });
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!text) {
      return NextResponse.json({ summary: null, error: 'empty' });
    }
    // Trim defensively in case Gemini ignored the length instruction.
    const summary = text.slice(0, 800);
    console.info(
      `[summarize] OK user=${caller.id.slice(0, 8)}… char=${character.id} in=${messages.length}msgs out=${summary.length}chars`,
    );
    return NextResponse.json({ summary });
  } catch (err) {
    console.error(`[summarize] threw: ${(err as Error).message}`);
    return NextResponse.json({ summary: null, error: 'network_error' });
  }
}
