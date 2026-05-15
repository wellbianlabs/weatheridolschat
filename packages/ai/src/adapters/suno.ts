import type { MusicAdapter, MusicAdapterInput, MusicAdapterResult } from '../types';

/**
 * Suno music generation adapter.
 *
 * Targets the sunoapi.org REST surface (the most widely-used third-party
 * Suno wrapper). Switch the base URL via SUNO_API_BASE env if you use a
 * different provider with the same shape.
 *
 * Flow:
 *   1. POST /api/v1/generate            → returns { code, data: { taskId } }
 *   2. GET  /api/v1/generate/record-info?taskId → status + audio URL once ready
 *
 * Real generation takes 20–60s; we resolve `generate` as soon as the task is
 * accepted ("queued") so the chat UI can render a placeholder card and poll
 * for the final audio.
 */
export function createSunoAdapter(opts: { apiKey: string; baseUrl?: string }): MusicAdapter {
  const base = (opts.baseUrl ?? 'https://api.sunoapi.org').replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiKey}`,
  } as const;

  return {
    id: 'suno',

    async generate(input: MusicAdapterInput): Promise<MusicAdapterResult> {
      const styleHint = input.styleHint ?? defaultStyleFor(input.characterId);
      const title = input.title ?? defaultTitleFor(input.characterId);
      const prompt = `${input.userPrompt} — weather: ${input.weather.condition}, ${input.weather.temperatureC}°C`;

      const body = {
        // sunoapi.org "custom" mode lets us pass style + title separately.
        customMode: true,
        instrumental: input.instrumental ?? false,
        prompt,
        style: styleHint,
        title,
        model: 'V4_5',
      };

      const res = await fetch(`${base}/api/v1/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Suno generate failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        code?: number;
        data?: { taskId?: string };
        msg?: string;
      };
      const taskId = json.data?.taskId;
      if (!taskId) throw new Error(`Suno generate: missing taskId (${json.msg ?? 'unknown'})`);

      return {
        taskId,
        status: 'queued',
        model: 'suno-v4.5',
        prompt,
        title,
      };
    },

    async status(taskId: string): Promise<MusicAdapterResult> {
      const url = new URL(`${base}/api/v1/generate/record-info`);
      url.searchParams.set('taskId', taskId);
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Suno status failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        code?: number;
        data?: SunoRecord;
      };
      const r = json.data;
      const clip = r?.sunoData?.[0];

      const status: MusicAdapterResult['status'] = (() => {
        const s = (r?.status ?? '').toUpperCase();
        if (s.includes('SUCCESS')) return 'done';
        if (s.includes('FAILED') || s.includes('ERROR')) return 'failed';
        if (s.includes('STREAMING') || s.includes('FIRST_SUCCESS')) return 'streaming';
        return 'queued';
      })();

      return {
        taskId,
        status,
        audioUrl: clip?.audioUrl ?? clip?.streamAudioUrl,
        durationMs:
          typeof clip?.duration === 'number' ? Math.round(clip.duration * 1000) : undefined,
        title: clip?.title,
        lyrics: clip?.prompt,
        model: 'suno-v4.5',
        prompt: r?.param ?? '',
      };
    },
  };
}

interface SunoRecord {
  status?: string;
  param?: string;
  sunoData?: Array<{
    audioUrl?: string;
    streamAudioUrl?: string;
    duration?: number;
    title?: string;
    prompt?: string;
  }>;
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
