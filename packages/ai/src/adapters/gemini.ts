import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerativeModel,
} from '@google/generative-ai';

import type { ChatAdapter, ChatAdapterInput } from '../types';
import { buildPrompt } from '@wi/core/chat';

/**
 * Google Gemini adapter (free tier).
 *
 * Hardened for production:
 *  - Model name fallback chain — different AI Studio keys have different
 *    sets of available models, so we walk a list of stable aliases and
 *    pick the first one the key has access to.
 *  - Permissive safety thresholds — we still run our own moderation
 *    pipeline upstream; we want Gemini to actually answer instead of
 *    silent-blocking ambiguous Korean prompts.
 *  - Verbose error logging split across multiple console calls so the
 *    Vercel log viewer (which truncates) still shows the useful part.
 *  - Empty-output / safety / quota fallback emits friendly tokens so the
 *    UI never sticks on the loading dots.
 */
// Walked in order until one returns non-404. Includes both Gemini 2.x
// (newer keys, 2025+) and 1.5 names (legacy AI Studio keys).
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export function createGeminiAdapter(apiKey: string): ChatAdapter {
  const genai = new GoogleGenerativeAI(apiKey);

  // Lazily-resolved model. We try the first name in the chain; if it 404s
  // ("model not found for this key"), we walk down the list once and cache
  // the working name in module scope.
  let cachedWorkingModelId: string | null = null;
  function buildModel(modelId: string): GenerativeModel {
    return genai.getGenerativeModel({
      model: modelId,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: SAFETY_SETTINGS,
    });
  }

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

      // Decide model order this call: cached first if we have one.
      const order = cachedWorkingModelId
        ? [cachedWorkingModelId, ...MODEL_FALLBACK_CHAIN.filter((m) => m !== cachedWorkingModelId)]
        : [...MODEL_FALLBACK_CHAIN];

      let lastError: Error | null = null;
      let modelUsed = order[0]!;

      for (const modelId of order) {
        try {
          modelUsed = modelId;
          const model = buildModel(modelId);

          yield {
            type: 'meta',
            userMessageId: input.ids.userMessageId,
            assistantMessageId: input.ids.assistantMessageId,
            model: modelId,
          };

          const result = await model.generateContentStream({
            contents,
            systemInstruction: systemMsg,
          });

          let outputText = '';
          for await (const chunk of result.stream) {
            let delta = '';
            try {
              delta = chunk.text();
            } catch {
              /* chunk had no text (safety / function call) */
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

          if (!outputText) {
            console.warn(
              `[gemini] empty output model=${modelId} finishReason=${finishReason ?? '?'} blockReason=${blockReason ?? '-'}`,
            );
            const fallback =
              blockReason || finishReason === 'SAFETY'
                ? '음… 그 이야기는 잠시 미뤄도 될까? 다른 얘기 들려줘.'
                : finishReason === 'RECITATION'
                  ? '아, 그건 다른 말로 풀어볼게. 다시 물어봐줘.'
                  : '잠시 생각이 안 떠오르네. 한 번 더 말해줄래?';
            for (const c of fallback) yield { type: 'token', delta: c };
          }

          // Success — cache the working model name.
          cachedWorkingModelId = modelId;

          yield {
            type: 'done',
            finishReason: outputText ? 'stop' : 'safety',
            usage: {
              input: usage?.promptTokenCount ?? 0,
              output: usage?.candidatesTokenCount ?? outputText.length,
            },
          };
          return; // exit generator on first success
        } catch (err) {
          lastError = err as Error;
          const msg = lastError.message ?? '';
          // Split logs so Vercel's truncation doesn't hide the useful bits.
          console.error(`[gemini] FAIL model=${modelId}`);
          console.error(`[gemini] err.name=${lastError.name}`);
          console.error(`[gemini] err.msg=${msg.slice(0, 200)}`);
          if (msg.length > 200) console.error(`[gemini] err.msg.cont=${msg.slice(200, 400)}`);

          const is404 =
            msg.includes('404') ||
            msg.toLowerCase().includes('not found') ||
            msg.toLowerCase().includes('was not found');
          if (is404) continue; // try next model in chain

          // Non-404 → bail out immediately (auth, quota, etc.)
          break;
        }
      }

      // All models failed (or non-404 bail).
      const msg = lastError?.message ?? 'unknown';
      console.error(`[gemini] ALL_MODELS_FAILED lastModel=${modelUsed} lastErr=${msg.slice(0, 120)}`);
      const userMsg = msg.toLowerCase().includes('quota') || msg.includes('429')
        ? '잠시 사람이 많이 몰린 것 같아. 1~2초 뒤에 다시 보내줄래?'
        : msg.toLowerCase().includes('not found') || msg.includes('404')
          ? '어… 모델 연결이 잠깐 끊겼어. 운영자에게 알려줄래?'
          : '미안, 잠깐 신호가 약했어. 다시 한 번 보내줄래?';
      for (const c of userMsg) yield { type: 'token', delta: c };
      yield { type: 'error', code: 'provider_error', message: msg };
      yield { type: 'done', finishReason: 'error' };
    },
  };
}
