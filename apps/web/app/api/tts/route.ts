import { NextResponse } from 'next/server';

import { CHARACTERS, type CharacterId } from '@wi/core/characters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/tts
 *
 * Synthesise speech for an assistant reply using Google Cloud
 * Text-to-Speech and return the audio bytes. The chat client calls
 * this when the user taps 🔊 on an assistant bubble — it plays the
 * audio inline, and the same URL can be hit again as a download
 * via /api/tts/download.
 *
 * Each character has a distinct voice (different Neural2/Wavenet
 * voice + pitch/rate tweak) so Sunny doesn't sound like Rain.
 *
 * Env var: GOOGLE_TTS_API_KEY — a Google Cloud API key restricted to
 * the Text-to-Speech API. Missing key → 503 with a helpful message.
 */
interface TtsBody {
  text?: string;
  characterId?: string;
  /** Optional override of the per-character voice (e.g. for previews). */
  voice?: string;
  /** 0.25 ≤ rate ≤ 4.0. Defaults to the character's preset. */
  rate?: number;
  /** -20.0 ≤ pitch ≤ +20.0 semitones. Defaults to the character's preset. */
  pitch?: number;
}

interface VoiceConfig {
  voice: string;
  rate: number;
  pitch: number;
}

/**
 * Per-character voice presets.
 *
 * Korea's Neural2 voices on Google Cloud TTS:
 *   ko-KR-Neural2-A  female, warm/bright (default voice)
 *   ko-KR-Neural2-B  female, cooler/softer
 *   ko-KR-Neural2-C  male, lower (we don't use it directly — all our
 *                                  characters are female — but it's
 *                                  available if we add a male role)
 *
 * Pitch/rate adjustments push each voice into a distinct emotional
 * register so the user can tell who's "speaking" even with eyes closed.
 */
const VOICE_PRESETS: Record<CharacterId, VoiceConfig> = {
  sunny: { voice: 'ko-KR-Neural2-A', rate: 1.05, pitch: 1.5 },
  rain: { voice: 'ko-KR-Neural2-B', rate: 0.92, pitch: -1.5 },
  cloudy: { voice: 'ko-KR-Neural2-B', rate: 0.98, pitch: 0.5 },
  thunder: { voice: 'ko-KR-Neural2-A', rate: 1.1, pitch: -2.5 },
};

const DEFAULT_VOICE: VoiceConfig = {
  voice: 'ko-KR-Neural2-A',
  rate: 1.0,
  pitch: 0.0,
};

const MAX_CHARS = 4500; // Google TTS rejects > 5000 chars; leave headroom.

export async function POST(req: Request): Promise<Response> {
  let body: TtsBody;
  try {
    body = (await req.json()) as TtsBody;
  } catch {
    return jsonError('validation_error', 'Invalid JSON body', 400);
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return jsonError(
      'no_provider',
      'GOOGLE_TTS_API_KEY 환경변수가 설정되지 않았어요. Vercel 환경변수에서 Google Cloud TTS API 키를 추가해주세요.',
      503,
    );
  }

  const rawText = (body.text ?? '').trim();
  if (!rawText) return jsonError('validation_error', 'Empty text', 400);
  const text = stripForSpeech(rawText).slice(0, MAX_CHARS);

  const preset =
    (body.characterId && VOICE_PRESETS[body.characterId as CharacterId]) || DEFAULT_VOICE;
  const voice = body.voice ?? preset.voice;
  const rate = clamp(body.rate ?? preset.rate, 0.25, 4.0);
  const pitch = clamp(body.pitch ?? preset.pitch, -20.0, 20.0);

  console.info(
    `[tts] start character=${body.characterId ?? '-'} voice=${voice} rate=${rate} pitch=${pitch} chars=${text.length}`,
  );

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'ko-KR', name: voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: rate,
            pitch,
            // Slight loudness boost so character voices match the
            // perceived volume of native iOS/Android TTS without
            // distorting.
            volumeGainDb: 1.5,
          },
        }),
      },
    );
  } catch (err) {
    console.error(`[tts] fetch fail: ${(err as Error).message}`);
    return jsonError('upstream_error', (err as Error).message, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[tts] HTTP ${res.status} ${body.slice(0, 300)}`);
    return jsonError(
      'upstream_error',
      `Google TTS HTTP ${res.status}: ${body.slice(0, 200)}`,
      502,
    );
  }

  let payload: { audioContent?: string };
  try {
    payload = (await res.json()) as { audioContent?: string };
  } catch {
    return jsonError('upstream_error', 'Google TTS returned non-JSON', 502);
  }
  if (!payload.audioContent) {
    return jsonError('upstream_error', 'Google TTS returned empty audioContent', 502);
  }
  const mp3 = Buffer.from(payload.audioContent, 'base64');
  console.info(`[tts] OK ms=${Date.now() - t0} bytes=${mp3.length}`);

  // Echo the character + voice in the headers for client cache keying.
  return new Response(mp3, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(mp3.length),
      'X-TTS-Voice': voice,
      'X-TTS-Provider': 'google-cloud',
      // Short cache so re-clicks within a session don't re-bill.
      // Different text → different URL (we hash params via the
      // browser's URL) so collisions are unlikely.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/**
 * Clean text before sending to TTS so we don't pay for or vocalise
 * markup tokens. Removes:
 *   - markdown bold/italic markers (**, __, *, _)
 *   - inline links — keep label, drop URL
 *   - code fences and inline backticks
 *   - emoji are kept (Google TTS handles them gracefully)
 */
function stripForSpeech(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
