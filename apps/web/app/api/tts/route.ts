import { NextResponse } from 'next/server';

import { type CharacterId } from '@wi/core/characters';

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

/**
 * Per-character emotional baseline for SSML <prosody> wrapping.
 *
 * Chirp3-HD already picks up emotion from punctuation and sentence
 * shape, but wrapping the whole utterance in a character-specific
 * prosody nudges the *average* delivery toward that persona — Sunny
 * runs slightly brighter and quicker, Rain breathes more, Thunder
 * lands harder. The model still varies within those bounds based on
 * sentence content.
 *
 * Chirp3-HD enforces these only loosely (the model can override for
 * naturalness); Neural2 fallback respects them strictly.
 */
const CHARACTER_PROSODY: Record<CharacterId, { rate: string; pitch: string; volume: string }> = {
  sunny: { rate: '105%', pitch: '+1st', volume: 'medium' }, // bright, slightly higher
  rain: { rate: '92%', pitch: '-1st', volume: 'soft' }, // soft, slower, lower
  cloudy: { rate: '96%', pitch: '-0.5st', volume: 'medium' }, // dreamy, mid-low
  thunder: { rate: '108%', pitch: '-1.5st', volume: 'loud' }, // sharp, fast, grounded
};

const DEFAULT_PROSODY = { rate: '100%', pitch: '0st', volume: 'medium' } as const;

/**
 * Convert raw text into emotion-aware SSML for natural-sounding TTS.
 *
 * Steps:
 *   1. Strip noise the model would otherwise vocalise (emoji, ㅋㅋ,
 *      ㅎㅎ, ㅠㅠ, repeated `!`s, markdown leftovers).
 *   2. Detect emotional sentences and wrap them in <prosody> overrides
 *      (excitement at !!! → pitch up; questions left to the model;
 *      trailing `~~` → relaxed playful).
 *   3. Insert breath pauses at sentence terminators and Korean clause
 *      boundaries.
 *   4. Wrap the whole utterance in a character-specific <prosody> base
 *      so the average tone matches the persona.
 */
function textToSsml(text: string, characterId: CharacterId | undefined): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Split into sentences (Korean + English terminators), wrap each
  // emotional sentence in its own <prosody> so excitement/playful
  // tone is concentrated in the right place rather than averaged
  // across the whole reply.
  const SENTENCE = /([^.!?…]+[.!?…]+|[^.!?…]+$)/g;
  const wrapped = escaped.replace(SENTENCE, (chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return chunk;
    // Excited — multiple !s or "!!" → noticeably higher pitch + rate
    if (/!{2,}|❗❗+/.test(trimmed) || /\b(와|우와|진짜|대박|짱)\b.*!/.test(trimmed)) {
      return `<prosody pitch="+1.5st" rate="108%">${chunk}</prosody>`;
    }
    // Mild excitement — single !
    if (/!\s*$/.test(trimmed)) {
      return `<prosody pitch="+0.5st" rate="103%">${chunk}</prosody>`;
    }
    // Playful / drawn-out — trailing ~ or ~~
    if (/~+\s*$/.test(trimmed)) {
      return `<prosody rate="95%" pitch="+0.3st">${chunk}</prosody>`;
    }
    // Sad/wistful — Korean sadness cues
    if (/(슬프|쓸쓸|외로|아쉽|아련|그립)/.test(trimmed)) {
      return `<prosody rate="88%" volume="soft" pitch="-0.8st">${chunk}</prosody>`;
    }
    return chunk;
  });

  const withBreaks = wrapped
    // Strong pause at sentence terminators
    .replace(/([.!?…])\s+/g, '$1<break time="380ms"/> ')
    // Soft pause at Korean commas/semis
    .replace(/([,;])\s+/g, '$1<break time="200ms"/> ')
    // Tiny pause after Korean filler/openers
    .replace(
      /(^|[.!?]\s*)(음|아|어|그래서|근데|그런데|있잖아|봐봐)([\s,])/g,
      '$1$2<break time="140ms"/>$3',
    );

  // Wrap everything in the character's emotional baseline.
  const p = (characterId && CHARACTER_PROSODY[characterId]) ?? DEFAULT_PROSODY;
  return `<speak><prosody rate="${p.rate}" pitch="${p.pitch}" volume="${p.volume}">${withBreaks}</prosody></speak>`;
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

  // SSML emotion wrapping. Apply for BOTH Chirp3-HD and Neural2 now —
  // Neural2 respects <prosody> strictly so the character's emotional
  // baseline shines through, and Chirp3-HD treats it as a performance
  // cue. The character-specific prosody envelope is what makes
  // Sunny/Rain/Cloudy/Thunder actually sound different in mood, not
  // just in voice timbre.
  const ssml = textToSsml(text, body.characterId as CharacterId | undefined);

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

  const isChirp3 = /^ko-KR-Chirp/i.test(voice);
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
              // Reuse the same SSML so the fallback voice still gets
              // the character's emotional baseline + sentence-level
              // prosody overrides — Neural2 actually respects these
              // more strictly than Chirp3-HD does.
              input: { ssml },
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
 * non-speech tokens. The chat assistant frequently inserts emojis
 * (☀️🎵🌧️), Korean chat-only sequences (ㅋㅋ, ㅎㅎ, ㅠㅠ), and
 * markdown markup — all of which Google TTS would otherwise read
 * literally ("symbol", "kieuk kieuk", "asterisk").
 *
 * Conservative strip rules:
 *   1. Markdown: bold, italic, code, inline links (keep label).
 *   2. Emoji: every Unicode codepoint with the Extended_Pictographic
 *      property + the zero-width joiner + variation selectors.
 *   3. Standalone Hangul jamo runs (ㅋㅋㅋ / ㅎㅎ / ㅠㅠ / ㅜㅜ etc.) —
 *      these are chat decorations, not words.
 *   4. Triple-plus repeated punctuation (!!! → !) so TTS doesn't
 *      stutter on the marker.
 *   5. Collapse resulting whitespace.
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
    // Emoji and pictographs (handles 🎵 ☀️ 👀 etc.). Strip ZWJ and
    // variation selectors too so emoji + skin-tone modifier combos
    // don't leave orphan codepoints.
    .replace(/\p{Extended_Pictographic}/gu, '')
    // Standalone Korean jamo runs (no real syllable around them) —
    // typical chat-only decorations. ㄱ-ㅎ is consonants, ㅏ-ㅣ is
    // vowels. Strip clusters of 2+ jamo so "ㅋㅋㅋ" and "ㅠㅠ" vanish
    // but "한글" (proper Hangul syllables, codepoint ≥ AC00) survives.
    .replace(/[ㄱ-ㅎㅏ-ㅣ]{2,}/g, '')
    // Collapse repeated marks ("!!!" → "!", "???" → "?", "~~~~" → "~")
    .replace(/([!?~])\1{2,}/g, '$1$1') // keep at most 2 for inflection
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
