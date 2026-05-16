import { readFile } from 'node:fs/promises';
import path from 'node:path';

import OpenAI, { toFile } from 'openai';

import { buildImagePrompt } from '../prompts/image/base';
import type { ImageAdapter, ImageAdapterInput, ImageAdapterResult } from '../types';

/**
 * OpenAI Image adapter.
 *
 * Tries `gpt-image-1` first because it accepts a reference image via
 * `images.edit`, which is how we keep each character's face consistent
 * across selfies. If the account hasn't completed OpenAI's *Organization
 * Verification* (a manual ID-upload step) gpt-image-1 returns a 403 with
 *   "Your organization must be verified to use the model `gpt-image-1`"
 * — by far the most common failure for fresh API keys. In that case we
 * automatically retry on `dall-e-3` (which is enabled by default but
 * doesn't support `images.edit`, so the reference photo is dropped and
 * we lean on the text prompt for character likeness).
 *
 * Every code path logs to stderr with `[oai-image]` so the cause is
 * visible in Vercel's runtime logs without leaking the API key.
 */
export function createOpenAIImageAdapter(apiKey: string): ImageAdapter {
  const client = new OpenAI({ apiKey });
  // Sanity log: surface key length + edges so we can confirm the env var
  // reached the lambda. Never log the full key.
  console.info(
    `[oai-image] init len=${apiKey.length} head=${apiKey.slice(0, 7)}… tail=…${apiKey.slice(-4)}`,
  );

  return {
    id: 'openai',
    async generate(input: ImageAdapterInput): Promise<ImageAdapterResult> {
      const prompt = buildImagePrompt({
        characterId: input.characterId,
        weather: input.weather,
        userPrompt: input.userPrompt,
      });
      console.info(
        `[oai-image] generate character=${input.characterId} hasRef=${!!input.referenceImageUrl} promptLen=${prompt.length}`,
      );

      // ── Attempt 1: gpt-image-1 with reference (if available) ─────────
      try {
        let imageUrl = '';
        const t0 = Date.now();

        if (input.referenceImageUrl) {
          const referenceBuffer = await fetchImageBuffer(input.referenceImageUrl);
          console.info(
            `[oai-image] ref loaded src=${input.referenceImageUrl} bytes=${referenceBuffer.length}`,
          );
          const referenceFile = await toFile(referenceBuffer, 'reference.png', {
            type: 'image/png',
          });
          console.info('[oai-image] calling images.edit gpt-image-1');
          const result = await client.images.edit({
            model: 'gpt-image-1',
            image: referenceFile,
            prompt,
            size: '1024x1024',
            n: 1,
          });
          imageUrl = extractImageUrl(result);
        } else {
          console.info('[oai-image] calling images.generate gpt-image-1');
          const result = await client.images.generate({
            model: 'gpt-image-1',
            prompt,
            size: '1024x1024',
            n: 1,
          });
          imageUrl = extractImageUrl(result);
        }

        if (!imageUrl) throw new Error('No image returned by OpenAI');
        console.info(
          `[oai-image] OK model=gpt-image-1 ms=${Date.now() - t0} urlKind=${
            imageUrl.startsWith('data:') ? 'b64' : 'url'
          }`,
        );
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

        // Only fall back for known recoverable failures. Network blips
        // would just hit the same error on dall-e-3.
        if (!isRecoverable(reason)) {
          throw new Error(`OpenAI image generation failed: ${reason}`);
        }
      }

      // ── Attempt 2: dall-e-3 (no reference, no org-verification needed) ─
      try {
        const t1 = Date.now();
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
        console.info(`[oai-image] OK model=dall-e-3 (fallback) ms=${Date.now() - t1}`);
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
 * For relative URLs ("/reference/sunny.png") we read directly from the
 * filesystem — Vercel copies the `public/` dir into the lambda's working
 * directory, so this is faster AND removes the dependency on
 * `NEXT_PUBLIC_APP_URL` being reachable from the serverless function (a
 * mis-set or missing app URL was producing the cryptic "fetch failed"
 * with no HTTP status, because Node's fetch can't even open a TCP
 * connection to the wrong host).
 *
 * Absolute URLs still go through HTTP — useful if someone wires a
 * CDN-hosted reference later.
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

  // Relative path → read from disk. process.cwd() on Vercel = /var/task,
  // which contains the bundled `public/` dir. On local dev it's the
  // app root. Strip the leading slash so `path.join` doesn't reset to /.
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
    // OpenAI SDK errors expose `.status` and a structured `.error`
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
 * True when the gpt-image-1 failure is one that dall-e-3 might fix:
 *   - org verification required (the #1 cause for new keys)
 *   - model not found / not available on this account
 *   - 400 invalid model (older SDKs sometimes report this way)
 *   - 403 access denied
 *
 * Network errors, 429 rate limits, and 5xx server errors are NOT
 * recoverable by switching models — propagate them up so the user
 * sees the real reason.
 */
function isRecoverable(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    r.includes('must be verified') ||
    r.includes('organization must be verified') ||
    r.includes('not_found') ||
    r.includes('model_not_found') ||
    r.includes('does not have access') ||
    r.includes('not allowed') ||
    r.includes('status=403') ||
    r.includes('status=404') ||
    (r.includes('status=400') && r.includes('model')) ||
    // Reference-image load failures: dall-e-3 doesn't take a reference,
    // so retrying without it on the text prompt alone will succeed.
    r.includes('failed to fetch reference image') ||
    r.includes('failed to read reference image') ||
    r.includes('fetch failed')
  );
}
