import { readFile } from 'node:fs/promises';
import path from 'node:path';

import OpenAI, { toFile } from 'openai';

import { buildImagePrompt, buildSelfiePromptWithReference } from '../prompts/image/base';
import type { ImageAdapter, ImageAdapterInput, ImageAdapterResult } from '../types';

/**
 * OpenAI Image adapter — the selfie generator.
 *
 * The selfie feature is "this character's face × current weather". Faithful
 * to that:
 *
 *   - When a reference image exists (every shipping character has one),
 *     we use `images.edit` with `gpt-image-1` so the character's face,
 *     hair, and identity are *anchored to the reference*. Weather drives
 *     the outfit, lighting, and backdrop — not the person.
 *
 *   - We do NOT silently fall back to a non-reference model (dall-e-3
 *     etc.) for character selfies. That would generate a different
 *     person and break the feature. Instead we fail loudly with an
 *     actionable error so the user/operator can fix the root cause
 *     (most often: completing OpenAI Organization Verification).
 *
 *   - dall-e-3 is only used for the no-reference path (future scene
 *     intents or characters added without a reference photo).
 *
 * Every code path logs `[oai-image]` so cause is visible in Vercel logs.
 */
export function createOpenAIImageAdapter(apiKey: string): ImageAdapter {
  const client = new OpenAI({ apiKey });
  console.info(
    `[oai-image] init len=${apiKey.length} head=${apiKey.slice(0, 7)}… tail=…${apiKey.slice(-4)}`,
  );

  return {
    id: 'openai',
    async generate(input: ImageAdapterInput): Promise<ImageAdapterResult> {
      const hasRef = !!input.referenceImageUrl;
      console.info(
        `[oai-image] generate character=${input.characterId} intent=${input.intent} hasRef=${hasRef} weather=${input.weather.condition}`,
      );

      // ── Path A: reference-anchored selfie (gpt-image-1 / images.edit) ─
      // This is the standard selfie flow. We do NOT fall through to a
      // different model on failure because losing the reference means
      // losing the character's face — the feature stops being a selfie.
      if (hasRef && input.referenceImageUrl) {
        const prompt = buildSelfiePromptWithReference({
          characterId: input.characterId,
          weather: input.weather,
          userPrompt: input.userPrompt,
        });

        const t0 = Date.now();
        let referenceBuffer: Buffer;
        try {
          referenceBuffer = await fetchImageBuffer(input.referenceImageUrl);
        } catch (err) {
          const reason = (err as Error).message;
          console.error(`[oai-image] ref load FAIL ${reason}`);
          throw new Error(
            `레퍼런스 이미지를 불러오지 못했어요. (${reason}) public/reference/${input.characterId}.png 파일과 빌드 출력 확인 필요.`,
          );
        }
        console.info(
          `[oai-image] ref loaded src=${input.referenceImageUrl} bytes=${referenceBuffer.length}`,
        );

        const referenceFile = await toFile(referenceBuffer, 'reference.png', {
          type: 'image/png',
        });

        try {
          console.info('[oai-image] calling images.edit gpt-image-1');
          const result = await client.images.edit({
            model: 'gpt-image-1',
            image: referenceFile,
            prompt,
            size: '1024x1024',
            n: 1,
          });
          const imageUrl = extractImageUrl(result);
          if (!imageUrl) throw new Error('No image returned by OpenAI');
          console.info(`[oai-image] OK model=gpt-image-1 ms=${Date.now() - t0}`);
          return {
            imageUrl,
            prompt,
            seed: 0,
            model: 'gpt-image-1',
            width: 1024,
            height: 1024,
          };
        } catch (err) {
          const reason = describeOpenAIError(err);
          console.error(`[oai-image] gpt-image-1 FAIL ${reason}`);
          throw new Error(buildUserFacingError(reason, input.characterId));
        }
      }

      // ── Path B: no reference → text-only prompt with dall-e-3 ────────
      // Used only when a character has no reference (mock dev, future
      // scene/outfit intents). dall-e-3 doesn't take a reference but
      // doesn't need org verification either, so it's a safer default
      // for this fallback path.
      const prompt = buildImagePrompt({
        characterId: input.characterId,
        weather: input.weather,
        userPrompt: input.userPrompt,
      });
      try {
        const t1 = Date.now();
        console.info('[oai-image] calling images.generate dall-e-3 (no reference)');
        const result = await client.images.generate({
          model: 'dall-e-3',
          prompt,
          size: '1024x1024',
          quality: 'standard',
          n: 1,
          response_format: 'url',
        });
        const imageUrl = extractImageUrl(result);
        if (!imageUrl) throw new Error('No image returned by OpenAI (dall-e-3)');
        console.info(`[oai-image] OK model=dall-e-3 ms=${Date.now() - t1}`);
        return {
          imageUrl,
          prompt,
          seed: 0,
          model: 'dall-e-3',
          width: 1024,
          height: 1024,
        };
      } catch (err) {
        const reason = describeOpenAIError(err);
        console.error(`[oai-image] dall-e-3 FAIL ${reason}`);
        throw new Error(`OpenAI image generation failed: ${reason}`);
      }
    },
  };
}

/**
 * Read a reference image into a Buffer.
 *
 * For relative URLs ("/reference/sunny.png") we read from disk — Vercel
 * bundles `public/` into the lambda working dir, so this avoids any
 * dependency on `NEXT_PUBLIC_APP_URL` being reachable from the function.
 * Absolute URLs still use HTTP (for CDN-hosted references later).
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      throw new Error(
        `Failed to fetch reference image from URL (${url}): ${(err as Error).message}`,
      );
    }
  }
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.join(process.cwd(), 'public', rel);
  try {
    return await readFile(filePath);
  } catch (err) {
    throw new Error(
      `Failed to read reference image from disk (${filePath}): ${(err as Error).message}`,
    );
  }
}

function extractImageUrl(result: {
  data?: Array<{ url?: string | null; b64_json?: string | null }>;
}): string {
  const datum = result.data?.[0];
  if (!datum) return '';
  if (datum.url) return datum.url;
  if (datum.b64_json) return `data:image/png;base64,${datum.b64_json}`;
  return '';
}

/** Pull the most informative one-line summary out of an unknown OpenAI error. */
function describeOpenAIError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & {
      status?: number;
      error?: { message?: string; type?: string; code?: string };
    };
    const parts: string[] = [];
    if (e.status) parts.push(`status=${e.status}`);
    if (e.error?.code) parts.push(`code=${e.error.code}`);
    if (e.error?.type) parts.push(`type=${e.error.type}`);
    const msg = e.error?.message ?? e.message ?? '';
    if (msg) parts.push(`msg="${msg.slice(0, 240)}"`);
    return parts.join(' ');
  }
  return String(err).slice(0, 240);
}

/**
 * Translate raw OpenAI error reasons into actionable Korean messages.
 * Each branch tells the operator/user exactly what to fix — vague errors
 * are useless when the feature is broken in production.
 */
function buildUserFacingError(reason: string, characterId: string): string {
  const r = reason.toLowerCase();
  if (r.includes('must be verified') || r.includes('organization must be verified')) {
    return [
      `${characterId} 셀카 생성을 위해 OpenAI 조직 인증이 필요해요.`,
      'platform.openai.com/settings/organization/general → Verify Organization 에서',
      '신분증으로 인증을 완료하면 gpt-image-1 이미지 편집이 활성화됩니다.',
      `(원본: ${reason})`,
    ].join(' ');
  }
  if (r.includes('status=429') || r.includes('rate_limit') || r.includes('quota')) {
    return `OpenAI 호출 한도를 초과했어요. 1~2분 후 다시 시도해주세요. (${reason})`;
  }
  if (r.includes('status=401') || r.includes('invalid_api_key')) {
    return `OpenAI API 키가 거부됐어요. Vercel OPENAI_API_KEY 값을 확인해주세요. (${reason})`;
  }
  if (r.includes('status=400') && r.includes('content_policy')) {
    return `이미지 생성이 OpenAI 콘텐츠 정책에 막혔어요. 다른 표현으로 다시 부탁해줘. (${reason})`;
  }
  if (r.includes('fetch failed') || r.includes('econn') || r.includes('etimedout')) {
    return `OpenAI에 연결하지 못했어요. 잠시 후 다시 시도해주세요. (${reason})`;
  }
  return `셀카 생성에 실패했어요. (${reason})`;
}
