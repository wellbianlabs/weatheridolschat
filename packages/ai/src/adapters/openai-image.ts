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
          referenceBuffer = await fetchImageBuffer(input.referenceImageUrl, input.requestOrigin);
        } catch (err) {
          const reason = (err as Error).message;
          console.error(`[oai-image] ref load FAIL ${reason}`);
          throw new Error(
            `레퍼런스 이미지를 불러오지 못했어요. (${reason}) public/reference/${input.characterId}.jpg 파일과 빌드 출력 확인 필요.`,
          );
        }
        console.info(
          `[oai-image] ref loaded src=${input.referenceImageUrl} bytes=${referenceBuffer.length}`,
        );

        // Sniff the actual format from the buffer header instead of
        // hard-coding PNG — after compression we ship JPEGs for
        // reference images, but the OpenAI SDK validates the
        // filename/MIME against the bytes. Magic-byte detection
        // covers both formats and any future change.
        const detected = detectImageType(referenceBuffer);
        const referenceFile = await toFile(referenceBuffer, `reference.${detected.ext}`, {
          type: detected.mime,
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
 * Tries three strategies in order so we work across local dev, Vercel
 * preview deployments, and Vercel production — each of which presents
 * static files differently:
 *
 *   1. Absolute http(s) URL → fetch directly.
 *   2. Relative path → read from `process.cwd()/public/<path>`. This
 *      works on Vercel ONLY if `outputFileTracingIncludes` (see
 *      next.config.mjs) bundles the file into the lambda; otherwise
 *      ENOENT.
 *   3. Relative path + `requestOrigin` → HTTP fetch against the host
 *      the user just connected to. This is the safety net for cases
 *      where the file isn't traced into the bundle — using the request
 *      origin avoids any dependency on `NEXT_PUBLIC_APP_URL` (which is
 *      easy to mis-set across preview/prod URLs).
 *
 * Each failure is logged so Vercel runtime logs distinguish which layer
 * fell through and why.
 */
/** Tiny magic-byte detector for the formats OpenAI image-edit
 *  accepts. Sniffs from the first 12 bytes. */
function detectImageType(buf: Buffer): { ext: 'png' | 'jpg' | 'webp' | 'gif'; mime: string } {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (
    buf.length >= 6 &&
    buf.toString('ascii', 0, 3) === 'GIF' &&
    (buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39))
  ) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  // Default to PNG — OpenAI's image-edit endpoint historically defaults to PNG.
  return { ext: 'png', mime: 'image/png' };
}

async function fetchImageBuffer(url: string, requestOrigin?: string): Promise<Buffer> {
  // Strategy 1: explicit absolute URL.
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

  // Strategy 2: filesystem read from the lambda working dir.
  const filePath = path.join(process.cwd(), 'public', rel);
  try {
    const buf = await readFile(filePath);
    console.info(`[oai-image] ref via disk path=${filePath} bytes=${buf.length}`);
    return buf;
  } catch (err) {
    console.warn(
      `[oai-image] disk read failed cwd=${process.cwd()} path=${filePath} err=${(err as Error).message}`,
    );
    // fall through to HTTP fallback if we have an origin
  }

  // Strategy 3: HTTP fetch against the request's own host.
  if (requestOrigin) {
    const httpUrl = `${requestOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
    try {
      const res = await fetch(httpUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      console.info(`[oai-image] ref via http url=${httpUrl} bytes=${buf.length}`);
      return buf;
    } catch (err) {
      throw new Error(
        `Reference image unavailable. Tried disk(${filePath}) and http(${httpUrl}): ${(err as Error).message}`,
      );
    }
  }

  throw new Error(
    `Reference image unavailable. Disk read failed at ${filePath} and no requestOrigin provided for HTTP fallback.`,
  );
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
 * Translate raw OpenAI error reasons into ENDUSER-friendly Korean
 * messages.
 *
 * Design choice: the user-facing message NEVER leaks the underlying
 * provider name, billing state, account configuration, or technical
 * status codes. From the visitor's perspective the cause is always
 * "서비스가 잠깐 바빠요 / 점검 중이에요" — that's the right level of
 * detail for a consumer product. Admins / operators still see the
 * full raw reason via the [oai-image] error log line in Vercel
 * runtime logs (and via `technicalImageErrorDetail()` if a future
 * admin-only response header is wired).
 *
 * Keeping the failure modes distinguishable internally is important
 * for debugging, but exposing "OpenAI 결제 한도 도달" to a regular
 * user is both confusing (they didn't sign up with OpenAI) and bad
 * positioning (looks like our service is broken because we can't
 * pay our bills). Generic "잠시 후 다시" is the safer copy.
 */
function buildUserFacingError(reason: string, _characterId: string): string {
  const r = reason.toLowerCase();
  // Content policy is the one case where the visible message *should*
  // tell the user to change THEIR input — anything else they tried
  // to do here is fine and they should just retry.
  if (r.includes('status=400') && r.includes('content_policy')) {
    return '오늘은 그 사진을 만들기 어려워. 다른 분위기로 다시 부탁해줄래?';
  }
  // Rate-limit hint — tells the user retrying soon will work,
  // without exposing the per-account quota structure.
  if (r.includes('status=429') || r.includes('rate_limit') || r.includes('quota')) {
    return '지금 사람이 많이 몰렸어. 1~2분 뒤에 다시 부탁해줘.';
  }
  // Network / upstream timeout — same "try again" framing.
  if (r.includes('fetch failed') || r.includes('econn') || r.includes('etimedout')) {
    return '지금 잠깐 연결이 약해. 잠시 후 다시 시도해줄래?';
  }
  // Everything else (billing limit, org-verify pending, auth key
  // rejection, model not found, internal 5xx) all collapse to one
  // generic "scheduled maintenance" framing. Admins identify the
  // real cause via the [oai-image] log line.
  return '지금은 사진을 만들 수 없어. 잠깐 점검 중이라 곧 다시 가능해질 거야.';
}

/**
 * Companion for admin/staff debugging — returns the raw provider
 * error message. The /api/image route attaches this to a separate
 * response header that only the admin chat client surfaces.
 */
export function technicalImageErrorDetail(reason: string): string {
  return reason;
}
