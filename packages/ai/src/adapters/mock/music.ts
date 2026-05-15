import type { MusicAdapter, MusicAdapterInput, MusicAdapterResult } from '../../types';

/**
 * Mock music adapter.
 * Returns a placeholder track URL (silent demo MP3 on a public CDN) keyed by
 * character + weather. Real adapter calls Suno API.
 */
const MOCK_TRACKS: Record<string, { title: string; lyrics: string; durationMs: number }> = {
  sunny: {
    title: '오늘의 햇살',
    lyrics:
      "[Verse 1]\n오늘은 햇살이 좋아\n바람도 살랑살랑\n\n[Chorus]\n우리 같이 걸을까\n해운대의 노란 오후로",
    durationMs: 120000,
  },
  rain: {
    title: '비 오는 오후',
    lyrics:
      "[Verse 1]\n빗소리가 가만히\n창문을 두드려와\n\n[Chorus]\n조용히 흐르는 시간\n너에게만 보내는 한 곡",
    durationMs: 135000,
  },
  cloudy: {
    title: '안개의 새벽',
    lyrics:
      "[Verse 1]\n안개 사이로 너의 손\n구름을 닮은 미소\n\n[Chorus]\n오늘은 구름처럼\n자유롭게 흘러가",
    durationMs: 125000,
  },
  thunder: {
    title: 'Thunder Down',
    lyrics:
      "[Verse 1]\n번개처럼 빠르게\n비트가 심장을 친다\n\n[Drop]\n쿵쿵쿵 쿵쿵쿵\n오늘 밤은 우리 거",
    durationMs: 110000,
  },
};

const taskRegistry = new Map<string, MusicAdapterResult>();

function genTaskId(): string {
  return `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const MockMusicAdapter: MusicAdapter = {
  id: 'mock',
  async generate(input: MusicAdapterInput): Promise<MusicAdapterResult> {
    const meta = MOCK_TRACKS[input.characterId] ?? MOCK_TRACKS.sunny!;
    const taskId = genTaskId();
    const prompt = composePrompt(input, meta.title);

    // Public sample MP3 — small file from learningcontainer.com (Apache 2.0 sample).
    // Replace with real Suno output once SUNO_API_KEY is set.
    const audioUrl = `https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3`;

    const result: MusicAdapterResult = {
      taskId,
      status: 'done',
      audioUrl,
      durationMs: meta.durationMs,
      title: input.title ?? meta.title,
      lyrics: input.instrumental ? undefined : meta.lyrics,
      model: 'mock',
      prompt,
    };
    taskRegistry.set(taskId, result);
    return result;
  },

  async status(taskId: string): Promise<MusicAdapterResult> {
    const existing = taskRegistry.get(taskId);
    if (existing) return existing;
    return {
      taskId,
      status: 'failed',
      model: 'mock',
      prompt: '',
    };
  },
};

function composePrompt(input: MusicAdapterInput, title: string): string {
  const style =
    input.styleHint ??
    {
      sunny: 'bright, warm k-pop summer pop, female vocal, 120 bpm',
      rain: 'lo-fi piano, soft female vocal, 70 bpm, rainy ambience',
      cloudy: 'dreamy bedroom pop, airy female vocal, 90 bpm',
      thunder: 'edm trap, female rap, heavy 808s, 145 bpm',
    }[input.characterId] ??
    'k-pop';
  return `[${title}] ${style}. Weather: ${input.weather.condition}, ${input.weather.temperatureC}°C. ${input.userPrompt}`;
}
