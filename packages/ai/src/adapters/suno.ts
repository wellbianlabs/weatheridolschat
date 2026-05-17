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

      // Two modes, decided by whether the caller pre-generated lyrics:
      //
      //   • customMode = true  (lyrics provided): Suno sings the exact
      //     text we pass. Used by the 날씨송 flow after Gemini writes
      //     the lyrics — gives us the dual benefit of "Korean-first,
      //     English mix OK" enforcement AND instant lyrics in the
      //     client card while audio renders for the next 30-60s.
      //
      //   • customMode = false (inspiration mode): Suno generates the
      //     lyrics itself from a brief. Fallback for when Gemini is
      //     unavailable (no key, all models 404, safety block). The
      //     song still works, just without the read-along during wait.
      const hasLyrics = !!input.lyrics && input.lyrics.trim().length > 0;
      const body = hasLyrics
        ? {
            customMode: true,
            instrumental: input.instrumental ?? false,
            prompt: input.lyrics,
            style: styleHint,
            title,
            model: 'V4_5',
            callBackUrl,
          }
        : {
            customMode: false,
            instrumental: input.instrumental ?? false,
            prompt: buildInspirationBrief({
              characterId: input.characterId,
              weather: input.weather,
              userPrompt: input.userPrompt,
              styleHint,
            }),
            model: 'V4_5',
            callBackUrl,
          };
      console.info(
        `[suno] generate character=${input.characterId} mode=${hasLyrics ? 'custom-with-lyrics' : 'inspiration'} model=V4_5 ${hasLyrics ? `lyricsLen=${input.lyrics!.length}` : `briefLen=${(body as { prompt: string }).prompt.length}`}`,
      );

      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch(`${base}/api/v1/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Network failure before we even got an HTTP envelope.
        const reason = `fetch failed: ${(err as Error).message}`;
        console.error(`[suno] generate ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }
      const text = await res.text();
      if (!res.ok) {
        const reason = `HTTP ${res.status} body=${truncate(text, 200)}`;
        console.error(`[suno] generate ${reason}`);
        throw new Error(buildUserFacingMusicError(`status=${res.status} ${reason}`));
      }

      let json: { code?: number; data?: { taskId?: string }; msg?: string };
      try {
        json = JSON.parse(text);
      } catch {
        const reason = `non-JSON body: ${truncate(text, 150)}`;
        console.error(`[suno] generate ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }

      // sunoapi.org returns code !== 200 in the envelope on validation
      // failures (insufficient credits, invalid params, etc.) even with
      // HTTP 200. We classify each common failure for admin logging,
      // but the *user* sees the same neutral "잠깐 점검 중" copy in
      // every case — exposing "Suno 크레딧 부족 / dashboard URL" to a
      // chatting user is confusing (they didn't sign up with Suno) and
      // bad positioning (looks like the product is broken because we
      // can't pay our bills).
      if (json.code != null && json.code !== 200) {
        const reason = `envelope code=${json.code} msg=${json.msg ?? ''}`;
        console.error(`[suno] generate ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }

      const taskId = json.data?.taskId;
      if (!taskId) {
        const reason = `missing taskId envelope=${truncate(text, 200)}`;
        console.error(`[suno] generate ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }
      console.info(`[suno] OK taskId=${taskId} ms=${Date.now() - t0}`);

      return {
        taskId,
        status: 'queued',
        model: 'suno-v4.5',
        // Echo back the lyrics we sent so the client can render them
        // immediately (the polling response won't include them again
        // until Suno actually finishes audio rendering).
        lyrics: hasLyrics ? input.lyrics : undefined,
        prompt: hasLyrics ? input.lyrics! : (body as { prompt: string }).prompt,
        title,
      };
    },

    async status(taskId: string): Promise<MusicAdapterResult> {
      const url = new URL(`${base}/api/v1/generate/record-info`);
      url.searchParams.set('taskId', taskId);
      let res: Response;
      try {
        res = await fetch(url.toString(), { headers });
      } catch (err) {
        const reason = `fetch failed: ${(err as Error).message}`;
        console.error(`[suno] status ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }
      const text = await res.text();
      if (!res.ok) {
        const reason = `HTTP ${res.status} body=${truncate(text, 150)}`;
        console.error(`[suno] status ${reason}`);
        throw new Error(buildUserFacingMusicError(`status=${res.status} ${reason}`));
      }
      let json: { code?: number; data?: SunoRecord; msg?: string };
      try {
        json = JSON.parse(text);
      } catch {
        const reason = `non-JSON ${truncate(text, 150)}`;
        console.error(`[suno] status ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
      }
      if (json.code != null && json.code !== 200) {
        const reason = `envelope code=${json.code} msg=${json.msg ?? ''}`;
        console.error(`[suno] status ${reason}`);
        throw new Error(buildUserFacingMusicError(reason));
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

/**
 * Translate any raw Suno failure reason into an ENDUSER-friendly
 * Korean message.
 *
 * Design choice (mirrors openai-image.ts/buildUserFacingError):
 * the visible message NEVER leaks the underlying provider name,
 * billing state, account configuration, or technical status codes.
 * From the visitor's perspective the cause is always
 * "서비스가 잠깐 바빠요 / 점검 중이에요" — that's the right level
 * of detail for a consumer product.
 *
 * Three branches keep specific (still non-technical) copy because
 * the user CAN do something about them:
 *
 *   • content policy / moderation → ask user to rephrase
 *   • rate limit / 429            → "사람이 몰렸어, 곧 다시"
 *   • network / fetch failed      → "연결이 약해, 곧 다시"
 *
 * Everything else (Suno credits exhausted, API key rejected,
 * callBackUrl invalid, missing taskId, malformed JSON, internal 5xx)
 * collapses to one neutral "점검 중" message. Admins still diagnose
 * the real cause via the [suno] error log lines in Vercel runtime
 * logs.
 */
function buildUserFacingMusicError(reason: string): string {
  const r = reason.toLowerCase();
  // Content moderation / policy — the user can fix their prompt.
  if (
    r.includes('content policy') ||
    r.includes('moderation') ||
    r.includes('content_policy')
  ) {
    return '오늘은 그 가사를 만들기 어려워. 다른 분위기로 다시 부탁해줄래?';
  }
  // Rate-limit / too many concurrent requests — retry-soon framing.
  if (
    r.includes('status=429') ||
    r.includes('rate limit') ||
    r.includes('rate_limit') ||
    r.includes('too many requests')
  ) {
    return '지금 사람이 많이 몰렸어. 1~2분 뒤에 다시 부탁해줘.';
  }
  // Network / upstream timeout — same "try again" framing.
  if (
    r.includes('fetch failed') ||
    r.includes('econn') ||
    r.includes('etimedout') ||
    r.includes('socket hang up')
  ) {
    return '지금 잠깐 연결이 약해. 잠시 후 다시 시도해줄래?';
  }
  // Everything else (insufficient credits, invalid API key, callBackUrl
  // validation failure, missing taskId, malformed response, 5xx) all
  // collapse to one generic "scheduled maintenance" framing. Admins
  // identify the real cause via the [suno] log line.
  return '지금은 노래를 만들 수 없어. 잠깐 점검 중이라 곧 다시 가능해질 거야.';
}

/**
 * Companion for admin/staff debugging — returns the raw provider
 * error reason. Kept as a pass-through so a future admin-only
 * response header can surface it without re-deriving the string.
 */
export function technicalMusicErrorDetail(reason: string): string {
  return reason;
}
