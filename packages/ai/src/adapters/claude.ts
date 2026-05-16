import Anthropic from '@anthropic-ai/sdk';

import type { ChatAdapter, ChatAdapterInput } from '../types';
import { buildPrompt } from '@wi/core/chat';

/**
 * Anthropic Claude adapter. Streams via the Messages API.
 * Activated by router when MOCK_MODE=false and tier=premium and ANTHROPIC_API_KEY is set.
 */
export function createClaudeAdapter(apiKey: string): ChatAdapter {
  const client = new Anthropic({ apiKey });
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
          tier: input.user.tier,
        },
        weather: input.weather,
        history: input.history,
        memorySummary: input.memorySummary,
      });

      const systemMsg = llmMessages.find((m) => m.role === 'system')?.content ?? '';
      const conversation = llmMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: m.content,
        }));

      // Append the current user turn if not already in history.
      const lastTurn = conversation[conversation.length - 1];
      if (!lastTurn || lastTurn.role !== 'user' || lastTurn.content !== input.userMessage) {
        conversation.push({ role: 'user', content: input.userMessage });
      }

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
        const msg = (err as Error).message ?? 'unknown';
        console.error(`[claude] stream failed: ${msg}`);
        const userMsg = msg.includes('429') || msg.toLowerCase().includes('rate')
          ? '잠시 사람이 많이 몰린 것 같아. 1~2초 뒤에 다시 보내줄래?'
          : '미안, 잠깐 신호가 약했어. 다시 한 번 보내줄래?';
        for (const c of userMsg) yield { type: 'token', delta: c };
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
