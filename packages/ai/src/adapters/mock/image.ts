import { buildImagePrompt } from '../../prompts/image/base';
import type { ImageAdapter, ImageAdapterInput, ImageAdapterResult } from '../../types';

/**
 * Mock image adapter.
 *
 * Behavior:
 * - If `referenceImageUrl` is provided (character has saved face reference),
 *   return it directly. This makes the chat demo show the *real* character
 *   face every time — perfect for verifying the consistency story before
 *   wiring up live OpenAI generation.
 * - Otherwise, fall back to a deterministic picsum.photos seed.
 */
const SEED_BY_CHARACTER: Record<string, number> = {
  sunny: 11000,
  rain: 22000,
  cloudy: 33000,
  thunder: 44000,
};

export const MockImageAdapter: ImageAdapter = {
  id: 'mock',
  async generate(input: ImageAdapterInput): Promise<ImageAdapterResult> {
    const prompt = buildImagePrompt({
      characterId: input.characterId,
      weather: input.weather,
      userPrompt: input.userPrompt,
    });

    let imageUrl: string;
    if (input.referenceImageUrl) {
      imageUrl = input.referenceImageUrl;
    } else {
      const seedSlug = `${input.characterId}-${input.weather.condition}-${input.intent}`;
      imageUrl = `https://picsum.photos/seed/${encodeURIComponent(seedSlug)}/1024/1024`;
    }

    return {
      imageUrl,
      prompt,
      seed: SEED_BY_CHARACTER[input.characterId] ?? 12345,
      model: 'mock',
      width: 1024,
      height: 1024,
    };
  },
};
