import { GoogleGenerativeAI } from '@google/generative-ai';

import type { ChatAdapter, ChatAdapterInput } from '../types';
import { buildPrompt } from '@wi/core/chat';

/**
 * Google Gemini adapter (free tier). Streams via generateContentStream.
 */
export function createGeminiAdapter(apiKey: string): ChatAdapter {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-1.5-flash-latest',
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
      // Gemini doesn't use a separate system field for chat, so prepend it as a user msg
      // with explicit framing.
      const contents = [
        { role: 'user', parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${systemMsg}` }] },
        { role: 'model', parts: [{ text: '알겠습니다. 페르소나를 유지하며 응답하겠습니다.' }] },
        ...llmMessages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        { role: 'user', parts: [{ text: input.userMessage }] },
      ];

      yield {
        type: 'meta',
        userMessageId: input.ids.userMessageId,
        assistantMessageId: input.ids.assistantMessageId,
        model: 'gemini-1.5-flash',
      };

      try {
        const result = await model.generateContentStream({ contents });
        let outputText = '';
        for await (const chunk of result.stream) {
          const delta = chunk.text();
          if (delta) {
            outputText += delta;
            yield { type: 'token', delta };
          }
        }
        const final = await result.response;
        const usage = final.usageMetadata;
        yield {
          type: 'done',
          finishReason: 'stop',
          usage: {
            input: usage?.promptTokenCount ?? 0,
            output: usage?.candidatesTokenCount ?? outputText.length,
          },
        };
      } catch (err) {
        yield {
          type: 'error',
          code: 'provider_error',
          message: (err as Error).message,
        };
        yield { type: 'done', finishReason: 'error' };
      }
    },
  };
}
