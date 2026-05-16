import { GoogleGenerativeAI } from '@google/generative-ai';

import type { ChatAdapter, ChatAdapterInput } from '../types';
import { buildPrompt } from '@wi/core/chat';

/**
 * Google Gemini adapter (free tier). Streams via generateContentStream.
 *
 * Hardened against the most common "silent empty response" failure modes:
 *  - safety filter triggered → emits a graceful refusal as text
 *  - empty model output     → emits a fallback so the UI never hangs
 *  - quota / 429            → surfaces a friendly retry message
 */
export function createGeminiAdapter(apiKey: string): ChatAdapter {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { maxOutputTokens: 1024, temperature: 0.85 },
  });

  return {
    id: 'gemini',
    async *stream(input: ChatAdapterInput) {
      const llmMessages = buildPrompt({
        character: input.character,
        characterSystemPrompt: input.characterSystemPrompt,
        user: {
          nickname: input.user.nickname,
          locale: input.user.locale,
          localTime: input.user.localTime,
          tier: input.user.tier,
        },
        weather: input.weather,
        history: input.history,
        memorySummary: input.memorySummary,
      });

      const systemMsg = llmMessages.find((m) => m.role === 'system')?.content ?? '';

      // Gemini requires strict user/model alternation. Use systemInstruction
      // (added in v1beta) so we don't need to fake it as a turn-0 user message.
      const history = llmMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const contents = [
        ...history,
        { role: 'user', parts: [{ text: input.userMessage }] },
      ];

      yield {
        type: 'meta',
        userMessageId: input.ids.userMessageId,
        assistantMessageId: input.ids.assistantMessageId,
        model: 'gemini-2.0-flash',
      };

      try {
        const result = await model.generateContentStream({
          contents,
          systemInstruction: { role: 'system', parts: [{ text: systemMsg }] },
        });

        let outputText = '';
        for await (const chunk of result.stream) {
          let delta = '';
          try {
            delta = chunk.text();
          } catch (e) {
            // chunk.text() throws when the chunk has no text (e.g., function call,
            // safety-blocked). Ignore — we'll inspect the final response below.
          }
          if (delta) {
            outputText += delta;
            yield { type: 'token', delta };
          }
        }

        const final = await result.response;
        const candidate = final.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const blockReason = final.promptFeedback?.blockReason;
        const usage = final.usageMetadata;

        // Log to Vercel runtime so we can diagnose empty/blocked responses.
        if (!outputText) {
          console.warn(
            `[gemini] empty response — finishReason=${finishReason ?? '?'} ` +
              `blockReason=${blockReason ?? '-'} ` +
              `safetyRatings=${JSON.stringify(candidate?.safetyRatings ?? [])} ` +
              `userMessage="${input.userMessage.slice(0, 80)}"`,
          );

          // Emit a user-visible fallback so the bubble never hangs on "···".
          const fallback = blockReason
            ? '음… 그 이야기는 잠시 미뤄도 될까? 다른 얘기 들려줘.'
            : finishReason === 'SAFETY'
              ? '음… 그 이야기는 잠시 미뤄도 될까? 다른 얘기 들려줘.'
              : finishReason === 'RECITATION'
                ? '아, 그건 다른 말로 풀어볼게. 다시 물어봐줘.'
                : '잠시 생각이 안 떠오르네. 한 번 더 말해줄래?';
          for (const c of fallback) {
            yield { type: 'token', delta: c };
          }
        }

        yield {
          type: 'done',
          finishReason: outputText ? 'stop' : 'safety',
          usage: {
            input: usage?.promptTokenCount ?? 0,
            output: usage?.candidatesTokenCount ?? outputText.length,
          },
        };
      } catch (err) {
        const msg = (err as Error).message ?? 'unknown';
        console.error(`[gemini] stream failed: ${msg}`);

        // Friendly fallback text so the user doesn't see a blank bubble.
        const userMsg = msg.includes('429') || msg.toLowerCase().includes('quota')
          ? '잠시 사람이 많이 몰린 것 같아. 1~2초 뒤에 다시 보내줄래?'
          : '미안, 잠깐 신호가 약했어. 다시 한 번 보내줄래?';
        for (const c of userMsg) {
          yield { type: 'token', delta: c };
        }
        yield {
          type: 'error',
          code: 'provider_error',
          message: msg,
        };
        yield { type: 'done', finishReason: 'error' };
      }
    },
  };
}
