import type { CharacterId, Character } from '@wi/core/characters';
import type { ChatStreamEvent, Message } from '@wi/core/chat';
import type { WeatherSnapshot } from '@wi/core/weather';

export type AdapterTier = 'free' | 'premium';

export interface ChatAdapterInput {
  character: Character;
  characterSystemPrompt: string;
  weather: WeatherSnapshot;
  history: Message[];
  user: { nickname: string; locale: 'ko' | 'en' | 'ja'; localTime: string; tier: AdapterTier };
  userMessage: string;
  ids: { userMessageId: string; assistantMessageId: string };
  memorySummary?: string;
}

export interface ChatAdapter {
  readonly id: 'mock' | 'gemini' | 'claude';
  stream(input: ChatAdapterInput): AsyncIterable<ChatStreamEvent>;
}

export interface ImageAdapterInput {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt: string;
  intent: 'selfie' | 'scene' | 'outfit';
  /** Absolute URL of the character's face reference image. When provided to
   * a real adapter (OpenAI), the adapter fetches the image and passes it as
   * the reference for visual consistency. */
  referenceImageUrl?: string;
}

export interface ImageAdapterResult {
  imageUrl: string;
  prompt: string;
  seed: number;
  model: string;
  width: number;
  height: number;
}

export interface ImageAdapter {
  readonly id: 'mock' | 'openai';
  generate(input: ImageAdapterInput): Promise<ImageAdapterResult>;
}
