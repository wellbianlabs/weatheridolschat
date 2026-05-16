import type { MusicAdapter, MusicAdapterInput, MusicAdapterResult } from '../types';

/**
 * Suno music generation adapter (sunoapi.org REST surface).
 *
 * Flow:
 *   1. POST /api/v1/generate           → returns { code, data: { taskId } }
 *   2. GET  /api/v1/generate/record-info?taskId → status + audio URL once ready
 *
 * Real generation takes 20–60s; we resolve `generate` as soon as the task
 * is accepted ("queued") so the chat UI can render a placeholder card and
 * poll for the final audio.
 *
 * Things that have bitten us before and are worth keeping in mind:
 *   - `callBackUrl` is REQUIRED by sunoapi.org's validator. We pass a
 *     placeholder URL because we use polling instead of webhooks —
 *     they'll POST to it and we'll just ignore the body. Without this
 *     the API returns 400 "callBackUrl is required" and the song never
 *     starts.
 *   - The model name is case-sensitive. `V4_5`, not `v4.5`.
 *   - `style` + `title` are required when `customMode: true`.
 */
export function createSunoAdapter(opts: {
  apiKey: string;
  baseUrl?: string;
  /** Optional: where Suno should POST when a task finishes. We poll, so
   *  this only needs to be reachable enough that Suno's validator
   *  accepts it. */
  callbackUrl?: string;
}): MusicAdapter {
  const base = (opts.baseUrl ?? 'https://api.sunoapi.org').replace(/\/$/, '');
  const callBackUrl =
    opts.callbackUrl ??
    process.env.SUNO_CALLBACK_URL ??
    // Public bin.unique that just 200s. Suno's validator only checks
    // that it's a syntactically valid HTTPS URL — it doesn't fail the
    // task if the webhook itself errors. We rely on polling anyway.
    'https://webhook.site/00000000-0000-4000-8000-000000000000';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiKey}`,
  } as const;
  console.info(
    `[suno] init base=${base} keyLen=${opts.apiKey.length} keyHead=${opts.apiKey.slice(0, 4)}…`,
  );

  return {
    id: 'suno',

    async generate(input: MusicAdapterInput): Promise<MusicAdapterResult> {
      const styleHint = input.styleHint ?? defaultStyleFor(input.characterId);
      const title = input.title ?? defaultTitleFor(input.characterId);

      // Inspiration mode (customMode=false) — Suno generates the full
      // lyrics, melody, structure, and even the title from a single
      // description. The previous customMode=true setup treated our
      // short server-side `prompt` as the LYRICS to be sung, which is
      // why the response `prompt` field came back as a 12-word echo
      // instead of a full song's worth of verses + chorus + bridge.
      //
      // We compose a rich brief that combines:
      //   1. The user's free-form request ("오늘 날씨에 어울리는 노래…")
      //   2. The character's musical identity (bright k-pop / lo-fi /
      //      bedroom pop / edm trap — per defaultStyleFor)
      //   3. Concrete weather grounding (condition + temperature) so the
      //      lyrics feel about *today*, not generic
      //   4. Hard-coded "Korean female vocal" so we never get an English
      //      cover.
      const brief = buildInspirationBrief({
        characterId: input.characterId,
        weather: input.weather,
        userPrompt: input.userPrompt,
        styleHint,
      });

      const body = {
        customMode: false,
        instrumental: input.instrumental ?? false,
        prompt: brief,
        model: 'V4_5',
        callBackUrl,
      };
      console.info(
        `[suno] generate character=${input.characterId} mode=inspiration model=V4_5 briefLen=${brief.length}`,
      );

      const t0 = Date.now();
      const res = await fetch(`${base}/api/v1/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`[suno] HTTP ${res.status} body=${text.slice(0, 300)}`);
        throw new Error(
          `Suno generate failed: HTTP ${res.status} ${truncate(text, 200)}`,
        );
      }

      let json: { code?: number; data?: { taskId?: string }; msg?: string };
      try {
        json = JSON.parse(text);
      } catch {
        console.error(`[suno] non-JSON body: ${text.slice(0, 200)}`);
        throw new Error(`Suno generate: response was not JSON: ${truncate(text, 150)}`);
      }

      // sunoapi.org returns code !== 200 in the envelope on validation
      // failures (insufficient credits, invalid params, etc.) even with
      // HTTP 200. Surface those clearly.
      if (json.code != null && json.code !== 200) {
        console.error(`[suno] envelope error code=${json.code} msg=${json.msg ?? ''}`);
        throw new Error(`Suno generate failed: ${json.msg ?? `code=${json.code}`}`);
      }

      const taskId = json.data?.taskId;
      if (!taskId) {
        console.error(`[suno] missing taskId envelope=${truncate(text, 200)}`);
        throw new Error(`Suno generate: missing taskId (${json.msg ?? 'unknown'})`);
      }
      console.info(`[suno] OK taskId=${taskId} ms=${Date.now() - t0}`);

      return {
        taskId,
        status: 'queued',
        model: 'suno-v4.5',
        prompt: brief,
        title,
      };
    },

    async status(taskId: string): Promise<MusicAdapterResult> {
      const url = new URL(`${base}/api/v1/generate/record-info`);
      url.searchParams.set('taskId', taskId);
      const res = await fetch(url.toString(), { headers });
      const text = await res.text();
      if (!res.ok) {
        console.error(`[suno] status HTTP ${res.status} body=${text.slice(0, 200)}`);
        throw new Error(`Suno status failed: HTTP ${res.status} ${truncate(text, 150)}`);
      }
      let json: { code?: number; data?: SunoRecord; msg?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Suno status: non-JSON ${truncate(text, 150)}`);
      }
      if (json.code != null && json.code !== 200) {
        throw new Error(`Suno status: ${json.msg ?? `code=${json.code}`}`);
      }
      const r = json.data;

      // Locate the first generated clip. sunoapi.org has shipped at
      // least two response shapes over the past year:
      //
      //   v1: { data: { sunoData: [...], status, param } }
      //   v2: { data: { response: { sunoData: [...] }, status, param } }
      //
      // (Some forks also use `data.tracks` or `data.clips`.) Walk every
      // plausible location so a backend tweak doesn't silently produce
      // a "완성!" card with no audio URL — which is exactly what was
      // happening: the previous code only looked at `data.sunoData`
      // and returned undefined when the server moved the array under
      // `response.sunoData`. Status SUCCESS still parsed correctly
      // (data.status), so the card flipped to 'done' but the player
      // had nothing to play.
      const clip = findFirstClip(r);

      // sunoapi.org status flow:
      //   PENDING → TEXT_SUCCESS (lyrics ready, audio generating)
      //          → FIRST_SUCCESS (streaming audio URL available)
      //          → SUCCESS       (final MP3 ready)
      //
      // Critically, `FIRST_SUCCESS` and `TEXT_SUCCESS` both *contain* the
      // substring 'SUCCESS'. The previous mapping matched on substring
      // and short-circuited FIRST_SUCCESS to 'done' — making the UI claim
      // completion before the MP3 was actually produced. Match by exact
      // token (or the SUNO_SUCCESS variant some forks use), and let the
      // intermediate states fall to 'streaming'.
      const status: MusicAdapterResult['status'] = (() => {
        const s = (r?.status ?? '').toUpperCase();
        if (s.includes('FAIL') || s.includes('ERROR') || s === 'TIMEOUT') return 'failed';
        if (s === 'SUCCESS' || s === 'SUNO_SUCCESS' || s === 'COMPLETE') return 'done';
        if (s === 'FIRST_SUCCESS' || s === 'TEXT_SUCCESS' || s.includes('STREAMING'))
          return 'streaming';
        return 'queued';
      })();
      const audioUrl =
        clip?.audioUrl ?? clip?.streamAudioUrl ?? clip?.audio_url ?? undefined;
      // sunoapi.org puts the actual sung lyrics under `prompt` in custom
      // mode, but other Suno-compatible providers may use lyric/lyrics/text.
      const lyrics =
        clip?.lyric ?? clip?.lyrics ?? clip?.text ?? clip?.prompt ?? undefined;

      // If the upstream claims SUCCESS but we still didn't locate an
      // audio URL, the response shape probably shifted again. Log a
      // sample so we can teach findFirstClip about it — but DON'T let
      // the UI claim completion: downgrade to 'streaming' so the
      // polling loop tries again instead of freezing on a card that
      // says "완성!" with no player.
      let finalStatus = status;
      if (finalStatus === 'done' && !audioUrl) {
        console.warn(
          `[suno] status=done but no audioUrl. dataKeys=${Object.keys(r ?? {}).join(',')} ` +
            `responseKeys=${
              r && typeof r === 'object' && 'response' in r
                ? Object.keys((r as { response?: object }).response ?? {}).join(',')
                : '-'
            } clipKeys=${clip ? Object.keys(clip).join(',') : 'none'} ` +
            `bodyHead=${text.slice(0, 500)}`,
        );
        finalStatus = 'streaming';
      }

      console.info(
        `[suno] status taskId=${taskId} suno=${r?.status ?? '?'} normalized=${finalStatus} hasAudio=${!!audioUrl}`,
      );

      return {
        taskId,
        status: finalStatus,
        audioUrl,
        durationMs:
          typeof clip?.duration === 'number' ? Math.round(clip.duration * 1000) : undefined,
        title: clip?.title,
        lyrics,
        model: 'suno-v4.5',
        prompt: r?.param ?? '',
      };
    },
  };
}

interface SunoClip {
  audioUrl?: string;
  streamAudioUrl?: string;
  audio_url?: string;
  duration?: number;
  title?: string;
  prompt?: string;
  /** Alternate lyric field names seen across Suno-compatible providers. */
  lyric?: string;
  lyrics?: string;
  text?: string;
}
interface SunoRecord {
  status?: string;
  param?: string;
  /** v1 shape: clips directly on `data`. */
  sunoData?: SunoClip[];
  /** v2 shape (current sunoapi.org): clips nested one level deeper. */
  response?: {
    sunoData?: SunoClip[];
    tracks?: SunoClip[];
    clips?: SunoClip[];
  };
  /** Snake-case forks. */
  tracks?: SunoClip[];
  clips?: SunoClip[];
}

/** Walk every plausible field where a Suno-compatible provider has been
 *  observed to put the first generated clip. Returns the first non-empty
 *  array's first element, or undefined if none of the locations holds one. */
function findFirstClip(r: SunoRecord | undefined): SunoClip | undefined {
  if (!r) return undefined;
  const candidates: Array<SunoClip[] | undefined> = [
    r.sunoData,
    r.response?.sunoData,
    r.response?.tracks,
    r.response?.clips,
    r.tracks,
    r.clips,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length > 0) return arr[0];
  }
  return undefined;
}

/**
 * Build a single-paragraph description for Suno's inspiration mode.
 *
 * Inspiration mode reads `prompt` as a creative brief and writes the
 * lyrics, melody, and structure from scratch — so the brief needs to
 * carry every angle we care about (character mood, weather grounding,
 * musical style, vocal language) in one tight paragraph. Anything
 * Suno can't see here will be guessed.
 */
function buildInspirationBrief(input: {
  characterId: string;
  weather: import('@wi/core/weather').WeatherSnapshot;
  userPrompt: string;
  styleHint: string;
}): string {
  const personality = PERSONA_FOR_LYRICS[input.characterId] ?? 'a young K-pop idol';
  const wx = describeWeatherKR(input.weather.condition);
  const tempPhrase = `${Math.round(input.weather.temperatureC)}°C`;
  const user = input.userPrompt?.trim() ?? '';
  const userLine = user
    ? `The listener said: "${user.slice(0, 160)}".`
    : '';

  return [
    `Write a Korean-language song performed by ${personality}.`,
    `Today's weather is ${wx} at ${tempPhrase}; the lyrics should be grounded in that specific scene (sky, light, air, sounds, what the listener might be doing).`,
    `Musical direction: ${input.styleHint}. Female Korean vocal, native pronunciation, idiomatic phrasing.`,
    `Structure: [Verse 1] → [Chorus] → [Verse 2] → [Chorus] → [Bridge] → [Outro], at least 16 distinct lines total, no English filler.`,
    userLine,
    'Make it feel personal and intimate — like a message from the idol to a single listener.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Compact persona blurb per character, only used inside the lyric brief. */
const PERSONA_FOR_LYRICS: Record<string, string> = {
  sunny:
    'Sunny, a cheerful 20-year-old K-pop idol with a warm radiant energy who turns small moments into bright memories',
  rain: 'Rain, a 19-year-old K-pop idol with a quiet introspective voice who finds beauty in stillness and lingering feelings',
  cloudy:
    'Cloudy, an 18-year-old artsy K-pop idol with a dreamy whimsical voice, like daydreams on a slow afternoon',
  thunder:
    'Thunder, a 21-year-old confident K-pop idol with a bold rebellious edge, sharp and electric',
};

/** Map weather condition → vivid Korean-friendly English description for Suno. */
function describeWeatherKR(c: string): string {
  switch (c) {
    case 'clear':
      return 'a clear sunny day with golden afternoon light and a soft breeze';
    case 'clouds':
      return 'an overcast day with soft diffused light and a quiet sky';
    case 'rain':
      return 'a rainy day with raindrops on windows, wet asphalt, and city lights bleeding into puddles';
    case 'drizzle':
      return 'a light drizzle, soft and barely there, with damp pastel skies';
    case 'thunder':
      return 'a stormy night with distant thunder and dramatic dark blue tones';
    case 'snow':
      return 'a soft snowy day with snowflakes drifting down, crisp cold air';
    case 'mist':
      return 'a foggy morning with thick mist and muted hazy tones';
    default:
      return 'today';
  }
}

function defaultStyleFor(characterId: string): string {
  switch (characterId) {
    case 'sunny':
      return 'bright k-pop summer pop, female vocal, 120 bpm';
    case 'rain':
      return 'lo-fi piano ballad, soft female vocal, 70 bpm, rainy ambience';
    case 'cloudy':
      return 'dreamy bedroom pop, airy female vocal, 90 bpm';
    case 'thunder':
      return 'edm trap, female rap, heavy 808s, 145 bpm';
    default:
      return 'k-pop, female vocal';
  }
}

function defaultTitleFor(characterId: string): string {
  return (
    {
      sunny: "Today's Sunshine",
      rain: 'Rainy Letter',
      cloudy: 'Cloud Drift',
      thunder: 'Thunder Down',
    }[characterId] ?? 'Weather Track'
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
