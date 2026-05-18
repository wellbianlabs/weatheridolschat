import Anthropic from '@anthropic-ai/sdk';

import type { ChatAdapter, ChatAdapterInput } from '../types';
import { buildPrompt } from '@wi/core/chat';

/**
 * Anthropic Claude adapter. Streams via the Messages API.
 * Activated by router when MOCK_MODE=false and tier=premium and ANTHROPIC_API_KEY is set.
 */
export function createClaudeAdapter(apiKey: string): ChatAdapter {
  const client = new Anthropic({ apiKey });
  // Init-time fingerprint so Vercel runtime logs can quickly tell
  // "key never reached lambda" (no log line) from "key reached but
  // Anthropic rejected it" (line present + 401 from .stream()).
  // Never logs the full key. Real Anthropic keys start with
  // 'sk-ant-' — leading + trailing snippets surface paste errors
  // like trailing whitespace or accidental "Bearer " prefix.
  console.info(
    `[claude] init len=${apiKey.length} head=${apiKey.slice(0, 8)}… tail=…${apiKey.slice(-4)}`,
  );
  return {
    id: 'claude',
    async *stream(input: ChatAdapterInput) {
      const llmMessages = buildPrompt({
        character: input.character,
        characterSystemPrompt: input.characterSystemPrompt,
        user: {
          nickname: input.user.nickname,
          locale: input.user.locale,
          localTime: input.user.localTime,
          localTimeContext: input.user.localTimeContext,
          tier: input.user.tier,
        },
        weather: input.weather,
        history: input.history,
        memorySummary: input.memorySummary,
      });

      const systemMsg = llmMessages.find((m) => m.role === 'system')?.content ?? '';
      type AnthroMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      type AnthroBlock =
        | { type: 'text'; text: string }
        | {
            type: 'image';
            source: { type: 'base64'; media_type: AnthroMediaType; data: string };
          };
      type AnthroMessage = {
        role: 'assistant' | 'user';
        content: string | AnthroBlock[];
      };
      const conversation: AnthroMessage[] = llmMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: m.content,
        }));

      // Build the current user turn — image content block prepended
      // when a photo was attached, so Claude's vision pass runs *with*
      // the text question as context. Order matters: per Anthropic
      // docs the image must come BEFORE the question for best results.
      const userContent: AnthroBlock[] = [];
      if (input.userImage) {
        const mt = input.userImage.mediaType.toLowerCase();
        const allowed: ReadonlyArray<AnthroMediaType> = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        const safeMt = (allowed.find((a) => a === mt) ?? 'image/jpeg') as AnthroMediaType;
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: safeMt,
            data: input.userImage.base64,
          },
        });
      }
      userContent.push({ type: 'text', text: input.userMessage });

      // Replace any duplicate trailing user turn so we don't echo the
      // text twice when vision is attached.
      const lastTurn = conversation[conversation.length - 1];
      if (lastTurn && lastTurn.role === 'user') conversation.pop();
      conversation.push({
        role: 'user',
        content:
          userContent.length === 1 && userContent[0]!.type === 'text'
            ? input.userMessage
            : userContent,
      });

      yield {
        type: 'meta',
        userMessageId: input.ids.userMessageId,
        assistantMessageId: input.ids.assistantMessageId,
        model: 'claude-sonnet-4-6',
      };

      try {
        const stream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemMsg,
          messages: conversation,
        });

        let inputTokens = 0;
        let outputTokens = 0;
        let outputText = '';

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const delta = event.delta.text;
            outputText += delta;
            yield { type: 'token', delta };
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens ?? outputTokens;
          }
          if (event.type === 'message_start' && event.message.usage) {
            inputTokens = event.message.usage.input_tokens ?? inputTokens;
          }
        }

        if (!outputText) {
          console.warn(
            `[claude] empty response — userMessage="${input.userMessage.slice(0, 80)}"`,
          );
          const fallback = '잠시 생각이 안 떠오르네. 한 번 더 말해줄래?';
          for (const c of fallback) yield { type: 'token', delta: c };
        }

        yield {
          type: 'done',
          finishReason: outputText ? 'stop' : 'safety',
          usage: { input: inputTokens, output: outputTokens },
        };
      } catch (err) {
        // Pull the most informative fields out of an Anthropic SDK
        // error — they expose .status + a structured .error object.
        const e = err as Error & {
          status?: number;
          error?: { message?: string; type?: string };
        };
        const status = e.status;
        const apiType = e.error?.type;
        const apiMsg = e.error?.message ?? e.message ?? 'unknown';
        const fullMsg = `status=${status ?? '?'} type=${apiType ?? '-'} msg="${apiMsg.slice(0, 240)}"`;
        console.error(`[claude] stream failed ${fullMsg} hasImage=${!!input.userImage}`);

        // Map specific error shapes to actionable Korean copy. The
        // user no longer sees a generic "신호가 약했어" when in fact
        // the image was rejected, the key is wrong, or the model
        // name is invalid — they see exactly what to fix.
        const userMsg = (() => {
          const m = apiMsg.toLowerCase();
          if (input.userImage) {
            if (status === 400 && (m.includes('image') || m.includes('media'))) {
              return `사진 분석이 거부됐어요. (${apiMsg.slice(0, 160)}) 다른 사진으로 다시 시도해줄래?`;
            }
            if (status === 413 || m.includes('too large') || m.includes('size')) {
              return '사진이 너무 커서 보낼 수 없었어요. 더 작은 사진으로 다시 시도해주세요.';
            }
          }
          if (status === 401 || m.includes('authentication') || m.includes('invalid api')) {
            return 'Claude API 키가 거부됐어요. Vercel ANTHROPIC_API_KEY를 확인해주세요.';
          }
          if (status === 404 || m.includes('not_found') || m.includes('does not exist')) {
            return `Claude 모델을 못 찾았어요. (${apiMsg.slice(0, 140)}) 모델 이름을 확인해주세요.`;
          }
          if (status === 429 || m.includes('rate') || m.includes('quota')) {
            return '잠시 사람이 많이 몰린 것 같아. 1~2초 뒤에 다시 보내줄래?';
          }
          if (status === 529 || (status && status >= 500)) {
            return 'Claude 서버가 잠시 불안정해. 1~2분 후 다시 보내줄래?';
          }
          if (m.includes('fetch failed') || m.includes('econn') || m.includes('etimedout')) {
            return 'Claude에 연결하지 못했어요. 네트워크 또는 API 키 환경변수를 확인해주세요.';
          }
          return `${input.userImage ? '사진 처리에' : '응답 생성에'} 문제가 있었어요. (${apiMsg.slice(0, 160)})`;
        })();

        // CHANGED — previously the error message was streamed
        // character-by-character as `{type:'token'}` so the user saw
        // a Korean error string in the chat bubble. That blocked the
        // chat route from doing transparent provider fallback: by
        // the time the `error` event arrived, the error text was
        // already on the client. Now we yield ONLY the `error`
        // event (with the user-facing Korean copy in `message`).
        //
        // Upstream behaviour (in /api/chat/route.ts):
        //   - If NO tokens were forwarded yet and a fallback adapter
        //     is configured (e.g. Gemini), the route silently retries
        //     with the fallback. User sees Gemini's response with no
        //     intermediate error.
        //   - If tokens already streamed (mid-stream failure) or no
        //     fallback is configured, the route forwards the error
        //     event to the client; chat-client.tsx then renders it as
        //     "응답을 받지 못했어요. (<message>)" inside the bubble.
        yield {
          type: 'error',
          code: 'provider_error',
          // The friendly Korean copy travels in `message`. The raw
          // status/type/msg stays only in the [claude] log line above
          // for admin diagnosis.
          message: userMsg,
        };
        yield { type: 'done', finishReason: 'error' };
      }
    },
  };
}
