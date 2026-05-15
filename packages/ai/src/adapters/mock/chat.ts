import { classifyIntent, type ChatIntent, type ChatStreamEvent } from '@wi/core/chat';

import type { ChatAdapter, ChatAdapterInput } from '../../types';

import { MOCK_RESPONSES } from './responses';

const TOKEN_INTERVAL_MS = 80;

function interpolate(template: string, input: ChatAdapterInput): string {
  return template
    .replaceAll('{{user.nickname}}', input.user.nickname)
    .replaceAll('{{weather.condition}}', input.weather.condition)
    .replaceAll(
      '{{weather.locationLabel}}',
      input.weather.location.label ?? `${input.weather.location.lat.toFixed(2)},${input.weather.location.lng.toFixed(2)}`,
    )
    .replaceAll('{{weather.temperatureC}}', input.weather.temperatureC.toString());
}

function pickResponse(input: ChatAdapterInput, intent: ChatIntent): string {
  const dict = MOCK_RESPONSES[input.character.id];
  const candidates = dict[intent] ?? dict.smalltalk ?? ['…'];
  const idx = Math.floor(Math.random() * candidates.length);
  const template = candidates[idx] ?? candidates[0]!;
  return interpolate(template, input);
}

function tokenize(text: string): string[] {
  // naive split that preserves spaces — good enough for mock streaming UX
  const chunks: string[] = [];
  const matches = text.match(/[^\s]+\s?|\s+/g);
  if (matches) chunks.push(...matches);
  return chunks;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const MockChatAdapter: ChatAdapter = {
  id: 'mock',
  async *stream(input: ChatAdapterInput): AsyncIterable<ChatStreamEvent> {
    const intent = classifyIntent(input.userMessage);
    const responseText = pickResponse(input, intent);

    yield {
      type: 'meta',
      userMessageId: input.ids.userMessageId,
      assistantMessageId: input.ids.assistantMessageId,
      model: 'mock',
    };

    for (const chunk of tokenize(responseText)) {
      await delay(TOKEN_INTERVAL_MS);
      yield { type: 'token', delta: chunk };
    }

    if (intent === 'image_request') {
      yield { type: 'tool', name: 'request_image', output: { intent: 'selfie' } };
    }

    yield {
      type: 'done',
      finishReason: 'stop',
      usage: { input: input.userMessage.length, output: responseText.length },
    };
  },
};
