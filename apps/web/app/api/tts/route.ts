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
/**
 * Per-character voice presets.
 *
 * Target: 19-22yo female K-pop idol — bright, perky, hi-tone.
 *
 * Key correction over the previous tuning:
 *   - "Bright" comes from voice timbre + pitch + crisp articulation,
 *     NOT from speed. Pushing rate above ~1.05 introduces audible
 *     pitch-shift artifacts that the user described as "변형된 느낌"
 *     (chipmunked, not natural-bright).
 *   - So we keep rate near 1.0 and lift pitch instead. Brightness now
 *     lives in: bright voice pick (Leda), strong positive pitch
 *     (+3 to +4.5 semitones), and the audioConfig effects profile.
 *
 * Voice picks rationalised — only Leda + Zephyr remain. Kore and
 * Aoede both have inherently mature/calm timbres that no amount of
 * pitch shift fully escapes, so we drop them.
 *
 * audioConfig.pitch values are for the Neural2 fallback path (which
 * respects pitch strictly). The Chirp3-HD primary path applies pitch
 * through the SSML envelope.
 */
const VOICE_PRESETS: Record<CharacterId, VoiceConfig> = {
  // 햇살 밝음, 20yo — Leda는 ko-KR Chirp3-HD 중 가장 어린/밝은 톤
  sunny: { voice: 'ko-KR-Chirp3-HD-Leda', rate: 1.04, pitch: 4.0 },
  // 부드러운 19yo — 같은 Leda지만 살짝 천천히 + 살짝 낮은 pitch.
  // 여전히 +2.5라서 young register 안에 머무름.
  rain: { voice: 'ko-KR-Chirp3-HD-Leda', rate: 1.0, pitch: 2.5 },
  // 18yo 가장 어린 — 가장 높은 pitch로 dreamy young. Kore에서
  // Leda로 교체 (Kore는 차분/성숙해서 pitch만으론 부족).
  cloudy: { voice: 'ko-KR-Chirp3-HD-Leda', rate: 1.02, pitch: 4.5 },
  // 21yo 단단한 카리스마 — Zephyr 자체 텍스처가 sharp/energetic
  thunder: { voice: 'ko-KR-Chirp3-HD-Zephyr', rate: 1.06, pitch: 3.5 },
};

const DEFAULT_VOICE: VoiceConfig = {
  voice: 'ko-KR-Chirp3-HD-Leda',
  rate: 1.02,
  pitch: 3.5,
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
/**
 * Per-character SSML envelope. The whole utterance is wrapped in this
 * <prosody>, then sentence-level overrides stack on top inside it.
 *
 * Anchor for all four: **young female K-pop idol (19~22yo)**. That
 * means pitch never drops below the speaker's natural register — we
 * shift everyone UP by +2 to +4 semitones to get out of the "smooth
 * narrator / mature woman" zone Chirp3-HD lands in by default.
 *
 * Rate is also pushed up across the board (102%–115%) for the "빠르고
 * 경쾌" feel. Volume stays at medium-loud so nobody mumbles.
 *
 * Differentiation is by *degree*, not direction — Sunny is the most
 * lifted, Rain is the gentlest of the bright voices (still high, just
 * less pushed), Cloudy is dreamy young, Thunder is sharpest.
 */
/**
 * The envelope intentionally has NO `rate` field — rate is driven
 * entirely by audioConfig.speakingRate (one source of truth, otherwise
 * we double-multiply with SSML and end up at 1.3x+ which sounds
 * chipmunked). The envelope only controls pitch (so the voice sits in
 * the young-female register) and volume (so nobody mumbles).
 *
 * Sentence-level overrides below DO use rate as a small relative
 * bonus — but only for emphasis spans, not the whole utterance.
 */
const CHARACTER_PROSODY: Record<CharacterId, { pitch: string; volume: string }> = {
  sunny: { pitch: '+4st', volume: 'medium' }, // 햇살 밝음, 20yo
  rain: { pitch: '+2.5st', volume: 'medium' }, // 부드러운 19yo
  cloudy: { pitch: '+4.5st', volume: 'medium' }, // 가장 어린 18yo
  thunder: { pitch: '+3.5st', volume: 'loud' }, // 단단한 21yo
};

const DEFAULT_PROSODY = { pitch: '+3.5st', volume: 'medium' } as const;

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

  // Sentence-level emotional overrides stack INSIDE the character
  // envelope. All deltas keep the voice in the bright/young register:
  // excitement adds even more pitch+rate, playfulness adds a tiny
  // pitch lift, questions left alone. We deliberately do NOT drop
  // pitch or slow rate anymore — user feedback was that the previous
  // sad/wistful override pulled the voice toward "쳐진" mature tone.
  const SENTENCE = /([^.!?…]+[.!?…]+|[^.!?…]+$)/g;
  const wrapped = escaped.replace(SENTENCE, (chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return chunk;
    // Excited — multiple !s or "와/우와/진짜/대박/짱..!"
    // Pitch lift only, no rate boost — the audioConfig already has
    // the character's baseline pace and we don't want to compound it
    // into chipmunk territory.
    if (/!{2,}/.test(trimmed) || /\b(와|우와|진짜|대박|짱|헐|좋아)\b.*!/.test(trimmed)) {
      return `<prosody pitch="+2.5st">${chunk}</prosody>`;
    }
    // Mild excitement — single !
    if (/!\s*$/.test(trimmed)) {
      return `<prosody pitch="+1.5st">${chunk}</prosody>`;
    }
    // Playful / drawn-out — trailing ~ or ~~
    if (/~+\s*$/.test(trimmed)) {
      return `<prosody pitch="+1.5st">${chunk}</prosody>`;
    }
    // Question — small pitch lift on the closing syllable
    if (/\?\s*$/.test(trimmed)) {
      return `<prosody pitch="+1st">${chunk}</prosody>`;
    }
    // Note: removed the sad/wistful slowdown — it was making the
    // voice read as a mature narrator instead of a 19~21yo idol.
    // Sadness now comes through naturally via Chirp3-HD's content-
    // aware prosody, without the SSML pulling the whole sentence
    // into a low/slow register.
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

  // Wrap everything in the character's emotional baseline. Rate is
  // intentionally NOT set here — see CHARACTER_PROSODY's doc comment.
  const p = (characterId && CHARACTER_PROSODY[characterId]) ?? DEFAULT_PROSODY;
  return `<speak><prosody pitch="${p.pitch}" volume="${p.volume}">${withBreaks}</prosody></speak>`;
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
    // Slight loudness boost for K-pop "alive" presence.
    volumeGainDb: 2.0,
    // 'handset-class-device' applies a treble lift / mid-presence
    // tuning that makes voices read as brighter and more present —
    // the opposite of 'headphone-class-device' which added warmth
    // and contributed to the "쳐진" mature feel. This profile is
    // tuned for phone speakers but the brightness translates well
    // to laptop/headphones too.
    effectsProfileId: ['handset-class-device'],
    // Higher sample rate = crisper highs, more articulation detail.
    sampleRateHertz: 24000,
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
          volumeGainDb: 2.0,
          effectsProfileId: ['handset-class-device'],
          sampleRateHertz: 24000,
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
