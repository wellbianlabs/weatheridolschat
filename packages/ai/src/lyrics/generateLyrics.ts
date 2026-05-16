import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';

import type { CharacterId } from '@wi/core/characters';
import type { WeatherSnapshot } from '@wi/core/weather';

/**
 * Gemini-powered lyrics writer for the 날씨송 feature.
 *
 * Flow:
 *   client → /api/music → THIS HELPER (3-5s) → Suno customMode=true
 *
 * Why pre-generate lyrics instead of letting Suno's inspiration mode
 * write them?
 *
 *   1. Speed of feedback. Gemini returns in ~3s; Suno takes 30-60s for
 *      audio. By having lyrics ready first, the user can read along
 *      while the music renders — the whole wait stops feeling empty.
 *   2. Control. We can enforce structure, line counts, Korean-base
 *      with-English-mix style, weather grounding, and persona voice —
 *      all of which Suno's auto-lyrics handle inconsistently across
 *      runs.
 *   3. Determinism. Same weather + same character = consistent
 *      tone/quality. The product feels designed, not random.
 *
 * Falls back gracefully: if every model in the chain 404s or the key
 * is missing, the caller can still hand Suno an inspiration brief
 * (Suno will write its own lyrics) — the song still works, just with
 * less polish and a longer wait before lyrics appear.
 */

const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

const SAFETY = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

const PERSONA: Record<CharacterId, string> = {
  sunny:
    'Sunny — 20세 K-pop 아이돌, 햇살 같은 밝음, 따뜻한 보이스, 작은 순간을 반짝이게 만드는 에너지',
  rain: 'Rain — 19세 K-pop 아이돌, 차분하고 내면적, 잔잔한 슬픔과 위로의 보이스',
  cloudy: 'Cloudy — 18세 K-pop 아이돌, 몽환적이고 예술적, 데이드림 같은 공기감',
  thunder: 'Thunder — 21세 K-pop 아이돌, 자신감 있고 반항적, 강렬한 카리스마',
};

const STYLE: Record<CharacterId, string> = {
  sunny: 'bright K-pop summer pop, upbeat, hooky chorus, ~120 BPM feel',
  rain: 'lo-fi piano ballad, intimate and slow, ~70 BPM feel',
  cloudy: 'dreamy bedroom pop, airy and floaty, ~90 BPM feel',
  thunder: 'EDM trap with rap sections, heavy 808 energy, ~145 BPM feel',
};

function describeWeather(condition: string, tempC: number): string {
  const t = Math.round(tempC);
  switch (condition) {
    case 'clear':
      return `맑은 하늘, 부드러운 햇살, 따뜻한 ${t}도의 공기`;
    case 'clouds':
      return `구름이 많고 빛이 부드러운 하늘, 차분한 ${t}도`;
    case 'rain':
      return `비가 내리는 거리, 젖은 아스팔트와 빗소리, 서늘한 ${t}도`;
    case 'drizzle':
      return `이슬비가 흩날리는 흐릿한 풍경, 부드러운 ${t}도`;
    case 'thunder':
      return `천둥과 번개, 어둑한 하늘, 강렬한 ${t}도`;
    case 'snow':
      return `눈이 내리는 거리, 차가운 ${t}도, 하얗게 덮인 풍경`;
    case 'mist':
      return `안개가 자욱한 새벽, 흐릿한 ${t}도, 가까운 것만 또렷한 공간`;
    default:
      return `오늘의 ${t}도`;
  }
}

export interface GeneratedLyrics {
  title: string;
  lyrics: string;
  model: string;
}

export async function generateWeatherSongLyrics(opts: {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt?: string;
  apiKey: string;
}): Promise<GeneratedLyrics> {
  const prompt = buildPrompt(opts);
  console.info(
    `[lyrics] start character=${opts.characterId} weather=${opts.weather.condition} ${Math.round(opts.weather.temperatureC)}°C`,
  );

  const genai = new GoogleGenerativeAI(opts.apiKey);
  let lastErr: Error | null = null;

  for (const modelId of MODEL_CHAIN) {
    const t0 = Date.now();
    try {
      const model = genai.getGenerativeModel({
        model: modelId,
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          // 8192 is the per-call max for the Gemini 2.x family. We need
          // plenty of headroom because the previous 2048 cap was being
          // hit mid-Chorus on full song lyrics (~22-28 lines × Korean
          // tokens-per-char ratio + section markers + occasional English
          // words). Truncated output came back like "[Chorus]\n이"
          // with finishReason=MAX_TOKENS — the caller couldn't tell that
          // wasn't a complete song.
          maxOutputTokens: 8192,
        },
        safetySettings: SAFETY,
      });
      const result = await model.generateContent(prompt);
      const candidate = result.response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const text = result.response.text() ?? '';
      if (!text.trim()) {
        console.warn(`[lyrics] empty response model=${modelId} finish=${finishReason ?? '?'}`);
        lastErr = new Error(`Gemini ${modelId} returned empty text (finish=${finishReason})`);
        continue;
      }
      const parsed = parseLyricsResponse(text);
      const validation = validateLyrics(parsed.lyrics);
      console.info(
        `[lyrics] candidate model=${modelId} ms=${Date.now() - t0} finish=${finishReason ?? '?'} chars=${parsed.lyrics.length} lines=${validation.lineCount} sections=${validation.sectionCount} title="${parsed.title}"`,
      );

      // Reject anything that looks like it got cut off (MAX_TOKENS) or
      // came back unreasonably short for a full song. Treat as "model
      // failure" so the loop tries the next entry in the fallback chain
      // instead of returning a truncated stub the UI would render as a
      // half-song.
      if (finishReason === 'MAX_TOKENS' || !validation.ok) {
        const why =
          finishReason === 'MAX_TOKENS'
            ? `finishReason=MAX_TOKENS — output cut off at ${parsed.lyrics.length} chars`
            : `too short (${validation.lineCount} lines, ${validation.sectionCount} sections; need ≥${MIN_LINES} lines and ≥${MIN_SECTIONS} sections)`;
        console.warn(`[lyrics] reject model=${modelId} reason=${why}`);
        lastErr = new Error(`Gemini ${modelId} ${why}`);
        continue;
      }

      console.info(`[lyrics] OK model=${modelId} accepted`);
      return { ...parsed, model: modelId };
    } catch (err) {
      lastErr = err as Error;
      const msg = ((err as Error).message || '').toLowerCase();
      console.warn(`[lyrics] FAIL model=${modelId} msg=${msg.slice(0, 160)}`);
      if (msg.includes('404') || msg.includes('not found')) continue;
      // Non-404 (auth, quota, safety) — bail out, no point cycling models.
      break;
    }
  }

  throw new Error(
    `Lyrics generation failed: ${lastErr?.message ?? 'all Gemini models exhausted'}`,
  );
}

// Minimum acceptable shape for a generated song. Tuned against the
// prompt's "22~28줄 / 6 sections" requirement with some slack so the
// occasional well-formed song that's slightly shorter still passes.
const MIN_LINES = 12;
const MIN_SECTIONS = 3;

function validateLyrics(lyrics: string): {
  ok: boolean;
  lineCount: number;
  sectionCount: number;
} {
  // Count substantive (non-empty, non-section-header) lines so we don't
  // count the [Verse 1] markers themselves as content.
  const lines = lyrics.split(/\r?\n/);
  let lineCount = 0;
  let sectionCount = 0;
  const SECTION = /^\s*\[(.+?)\]\s*$/;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (SECTION.test(t)) sectionCount += 1;
    else lineCount += 1;
  }
  return {
    ok: lineCount >= MIN_LINES && sectionCount >= MIN_SECTIONS,
    lineCount,
    sectionCount,
  };
}

function buildPrompt(opts: {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt?: string;
}): string {
  const persona = PERSONA[opts.characterId];
  const style = STYLE[opts.characterId];
  const wx = describeWeather(opts.weather.condition, opts.weather.temperatureC);
  const userLine = opts.userPrompt?.trim()
    ? `청자가 한 말: "${opts.userPrompt.trim().slice(0, 160)}"\n`
    : '';

  return `너는 K-pop 작사가다. 아래 정보를 바탕으로 한 곡의 가사를 한국어로 작성해라.

캐릭터: ${persona}
오늘의 날씨: ${wx}
음악 스타일: ${style}
${userLine}

요구사항:
- 한국어를 메인으로 쓰되, K-pop처럼 영어 단어/구절을 자연스럽게 섞는 건 OK ("oh my", "baby", "shine", "tonight" 같은 것). 한 줄을 통째로 영어로만 쓰지는 마라.
- **반드시** 아래 6개 섹션을 모두 작성하고, 각 섹션을 끝까지 완결해라. 중간에 멈추지 마라.
    [Verse 1] (4줄)
    [Chorus] (4~5줄, 후렴구는 임팩트 있게)
    [Verse 2] (4줄)
    [Chorus] (위와 동일하거나 살짝 변주, 줄 수 동일)
    [Bridge] (3~4줄)
    [Outro] (2~3줄)
- 전체 콘텐츠 라인 수: **최소 22줄, 최대 28줄** (섹션 헤더 제외, 실제 가사 줄만 카운트).
- 마지막 [Outro] 섹션의 마지막 줄까지 반드시 완성한 후에 응답을 끝내라.
- 오늘 날씨를 *구체적인 디테일*로 묘사해라 (하늘 색, 빛, 소리, 공기 온도, 사람이 그 안에서 뭘 할까). 추상적 비유로만 채우지 말 것.
- 1인칭 화자가 청자 한 명에게 보내는 사적인 노래처럼.
- 캐릭터의 페르소나 톤이 가사에 묻어나야 한다 (밝음 / 잔잔함 / 몽환 / 자신감 — 위 페르소나 설명 따라).

출력 형식:
첫 줄에 [Title: 곡 제목] 한 줄로 시작하고, 빈 줄 한 칸 후 가사를 [Verse 1]부터 [Outro]까지 적어라. 그게 전부. 마크다운, 설명, 번역, 코드블록 금지. 전체 6개 섹션 모두 완성된 상태로 끝낼 것.`;
}

/**
 * Parse `[Title: ...]` from the first line plus the rest as lyrics.
 * Tolerant of common drift: markdown code fences, extra whitespace,
 * `**bold**` markers, missing title line entirely.
 */
function parseLyricsResponse(raw: string): { title: string; lyrics: string } {
  const cleaned = raw
    .replace(/^```[a-z]*\n?/gm, '')
    .replace(/```$/gm, '')
    .replace(/\*\*/g, '')
    .trim();

  const titleMatch = /^\s*\[Title:\s*(.+?)\]\s*$/im.exec(cleaned.split('\n')[0] ?? '');
  if (titleMatch) {
    const title = titleMatch[1]!.trim();
    const lyrics = cleaned.replace(/^\s*\[Title:[^\]]+\]\s*\n+/i, '').trim();
    return { title, lyrics };
  }

  // No explicit title marker — use the first short line as title if it
  // doesn't look like a section header.
  const firstLine = cleaned.split('\n')[0]?.trim() ?? '';
  if (firstLine && firstLine.length < 80 && !/^\[/.test(firstLine)) {
    return {
      title: firstLine.replace(/^["#'\s]+|["#'\s]+$/g, '') || 'Weather Song',
      lyrics: cleaned.split('\n').slice(1).join('\n').trim(),
    };
  }
  return { title: 'Weather Song', lyrics: cleaned };
}
