import OpenAI, { toFile } from 'openai';

import { buildImagePrompt } from '../prompts/image/base';
import type { ImageAdapter, ImageAdapterInput, ImageAdapterResult } from '../types';

/**
 * OpenAI Image adapter using gpt-image-1.
 *
 * - When `referenceImageUrl` is provided, calls `images.edit` so the model
 *   uses the character's face as a visual reference. This is how we keep
 *   each character's selfies consistent across generations.
 * - When no reference is provided, falls back to plain `images.generate`.
 */
export function createOpenAIImageAdapter(apiKey: string): ImageAdapter {
  const client = new OpenAI({ apiKey });
  return {
    id: 'openai',
    async generate(input: ImageAdapterInput): Promise<ImageAdapterResult> {
      const prompt = buildImagePrompt({
        characterId: input.characterId,
        weather: input.weather,
        userPrompt: input.userPrompt,
      });

      try {
        let imageUrl = '';

        if (input.referenceImageUrl) {
          const referenceBuffer = await fetchImageBuffer(input.referenceImageUrl);
          const referenceFile = await toFile(referenceBuffer, 'reference.png', {
            type: 'image/png',
          });

          const result = await client.images.edit({
            model: 'gpt-image-1',
            image: referenceFile,
            prompt,
            size: '1024x1024',
            n: 1,
          });
          imageUrl = extractImageUrl(result);
        } else {
          const result = await client.images.generate({
            model: 'gpt-image-1',
            prompt,
            size: '1024x1024',
            n: 1,
          });
          imageUrl = extractImageUrl(result);
        }

        if (!imageUrl) throw new Error('No image returned by OpenAI');

        return {
          imageUrl,
          prompt,
          seed: 0,
          model: 'gpt-image-1',
          width: 1024,
          height: 1024,
        };
      } catch (err) {
        throw new Error(`OpenAI image generation failed: ${(err as Error).message}`);
      }
    },
  };
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  // Relative URL → resolve against APP_URL (server-side fetch).
  const absolute = url.startsWith('http')
    ? url
    : `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}${url}`;
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractImageUrl(result: { data?: Array<{ url?: string | null; b64_json?: string | null }> }): string {
  const datum = result.data?.[0];
  if (!datum) return '';
  if (datum.url) return datum.url;
  if (datum.b64_json) return `data:image/png;base64,${datum.b64_json}`;
  return '';
}
