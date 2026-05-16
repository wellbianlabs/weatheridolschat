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
 * Upgraded from Neural2 to **Chirp3-HD** — Google's newest generative
 * TTS family. The difference is night-and-day for "mechanical" feel:
 * Neural2 reads each sentence with consistent prosody, while Chirp3-HD
 * uses a generative model that actually *acts* the text — natural
 * breath, emphasis on the right syllables, mood-matched timbre.
 *
 * Available Korean Chirp3-HD voices (all female-presenting timbres
 * we use; Charon/Puck/Fenrir are masculine and unused here):
 *   ko-KR-Chirp3-HD-Aoede   — warm, slightly melancholic
 *   ko-KR-Chirp3-HD-Kore    — calm, dreamy, soft pace
 *   ko-KR-Chirp3-HD-Leda    — bright, friendly, upbeat
 *   ko-KR-Chirp3-HD-Zephyr  — energetic, sharp, confident
 *
 * Note: Chirp3-HD voices IGNORE the `pitch` audioConfig parameter
 * (the model bakes pitch in based on the voice + content). We keep
 * pitch in the type for back-compat with manual overrides but the
 * route below only forwards it when the voice is a Neural2/Wavenet
 * one that actually supports it.
 */
const VOICE_PRESETS: Record<CharacterId, VoiceConfig> = {
  // Bright honey-blonde idol → bright/friendly Leda
  sunny: { voice: 'ko-KR-Chirp3-HD-Leda', rate: 1.0, pitch: 0 },
  // Introspective lo-fi mood → warm/melancholic Aoede, slower
  rain: { voice: 'ko-KR-Chirp3-HD-Aoede', rate: 0.94, pitch: 0 },
  // Dreamy daydream artist → calm/soft Kore
  cloudy: { voice: 'ko-KR-Chirp3-HD-Kore', rate: 0.97, pitch: 0 },
  // Confident rebellious rapper → energetic/sharp Zephyr, faster
  thunder: { voice: 'ko-KR-Chirp3-HD-Zephyr', rate: 1.06, pitch: 0 },
};

const DEFAULT_VOICE: VoiceConfig = {
  voice: 'ko-KR-Chirp3-HD-Aoede',
  rate: 1.0,
  pitch: 0.0,
};

/** True for voices that accept the legacy `pitch` audioConfig field.
 *  Chirp3-HD ignores it; Neural2/Wavenet/Standard do not. */
function supportsPitch(voiceName: string): boolean {
  return !/^ko-KR-Chirp/i.test(voiceName);
}

/** Map a Chirp3-HD voice name to the closest Neural2 fallback so the
 *  retry sounds similar in timbre. The mapping is rough — we just
 *  bucket by "brighter" (Leda/Zephyr → Neural2-A) vs "warmer"
 *  (Aoede/Kore → Neural2-B). */
function chirpToNeural2(chirpName: string): string {
  if (/Leda|Zephyr/i.test(chirpName)) return 'ko-KR-Neural2-A';
  return 'ko-KR-Neural2-B';
}

/** Convert raw text into mild SSML with natural breath pauses at
 *  sentence ends and Korean clause boundaries. Keeps the markup
 *  conservative so Chirp3-HD doesn't override its own prosody. */
function textToSsml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const withBreaks = escaped
    // Strong pause at sentence terminators
    .replace(/([.!?…])\s+/g, '$1<break time="350ms"/> ')
    // Soft pause at Korean commas/semis
    .replace(/([,;])\s+/g, '$1<break time="180ms"/> ')
    // Tiny pause around Korean conjunction openers ("그래서", "근데", "음")
    .replace(/(^|[.!?]\s*)(음|아|어|그래서|근데|그런데|있잖아)([\s,])/g, '$1$2<break time="120ms"/>$3');
  return `<speak>${withBreaks}</speak>`;
}

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

  // Chirp3-HD gives the most natural delivery when the input is SSML
  // with light pause hints — the model treats the markup as a
  // performance cue. For Neural2 / Wavenet we still feed plain text
  // (they handle their own punctuation prosody).
  const isChirp3 = /^ko-KR-Chirp/i.test(voice);
  const ssml = isChirp3 ? textToSsml(text) : null;

  // Build the audioConfig dynamically: only include `pitch` for
  // voice families that accept it. Chirp3-HD returns 400 on
  // unsupported fields when strict mode is enabled.
  const audioConfig: Record<string, unknown> = {
    audioEncoding: 'MP3',
    speakingRate: rate,
    volumeGainDb: 1.5,
    // Mastering profile tuned for the most common playback target.
    // 'headphone-class-device' produces the warmest mids, which
    // suits idol-character TTS better than the default flat output.
    effectsProfileId: ['headphone-class-device'],
  };
  if (supportsPitch(voice)) audioConfig.pitch = pitch;

  console.info(
    `[tts] start character=${body.characterId ?? '-'} voice=${voice} rate=${rate} pitch=${supportsPitch(voice) ? pitch : 'n/a'} ssml=${!!ssml} chars=${text.length}`,
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
          input: ssml ? { ssml } : { text },
          voice: { languageCode: 'ko-KR', name: voice },
          audioConfig,
        }),
      },
    );
  } catch (err) {
    console.error(`[tts] fetch fail: ${(err as Error).message}`);
    return jsonError('upstream_error', (err as Error).message, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[tts] HTTP ${res.status} voice=${voice} ${body.slice(0, 300)}`);

    // Chirp3-HD voices haven't rolled out to every region yet. If the
    // primary call 400/404s on a Chirp3 voice, retry once with the
    // closest Neural2 equivalent so the user still gets audio — just
    // a touch more synthetic. We swallow the second failure into the
    // user-facing error so they see "TTS failed" not two stack traces.
    if (isChirp3 && (res.status === 400 || res.status === 404)) {
      const fallback = chirpToNeural2(voice);
      console.warn(`[tts] Chirp3-HD unavailable, retrying with ${fallback}`);
      try {
        const retryAudio: Record<string, unknown> = {
          audioEncoding: 'MP3',
          speakingRate: rate,
          volumeGainDb: 1.5,
          effectsProfileId: ['headphone-class-device'],
          pitch, // Neural2 accepts pitch
        };
        const retryRes = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode: 'ko-KR', name: fallback },
              audioConfig: retryAudio,
            }),
          },
        );
        if (retryRes.ok) {
          const j = (await retryRes.json()) as { audioContent?: string };
          if (j.audioContent) {
            const mp3 = Buffer.from(j.audioContent, 'base64');
            console.info(`[tts] OK (fallback Neural2) bytes=${mp3.length}`);
            return new Response(mp3, {
              status: 200,
              headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': String(mp3.length),
                'X-TTS-Voice': fallback,
                'X-TTS-Provider': 'google-cloud-fallback',
                'Cache-Control': 'private, max-age=3600',
              },
            });
          }
        }
      } catch (err) {
        console.error(`[tts] fallback also failed: ${(err as Error).message}`);
      }
    }

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
