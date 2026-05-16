import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { pickMusicAdapter } from '@wi/ai';
import { getCurrentWeather } from '@wi/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MusicBody {
  characterId?: string;
  userPrompt?: string;
  styleHint?: string;
  instrumental?: boolean;
  title?: string;
  locationHint?: { lat: number; lng: number; label?: string };
}

/**
 * POST /api/music
 *
 * Kicks off a music generation task. Returns the taskId immediately so the
 * client can poll /api/music?taskId=... for the final audio.
 *
 * When MOCK_MODE=true or SUNO_API_KEY is unset, the mock adapter returns a
 * "done" result on the first response (synchronous).
 */
export async function POST(req: Request): Promise<Response> {
  let body: MusicBody;
  try {
    body = (await req.json()) as MusicBody;
  } catch {
    return jsonError('validation_error', 'Invalid JSON body', 400);
  }

  const character = body.characterId ? CHARACTERS[body.characterId] : undefined;
  if (!character) return jsonError('not_found', 'Unknown character', 404);

  const mockMode = process.env.MOCK_MODE !== 'false';
  const sunoApiKey = process.env.SUNO_API_KEY || undefined;
  const sunoBaseUrl = process.env.SUNO_API_BASE || undefined;
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  const kweatherApiKey = process.env.KW_API_KEY || process.env.KWEATHER_API_KEY || undefined;

  const point = body.locationHint ?? { lat: 37.498, lng: 127.028, label: '서울 강남구' };
  const weather = await getCurrentWeather(point, {
    mockMode,
    kweatherApiKey,
    openWeatherMapApiKey,
  });

  const adapter = pickMusicAdapter({ mockMode, sunoApiKey, sunoBaseUrl });

  try {
    const result = await adapter.generate({
      characterId: character.id,
      weather,
      userPrompt: body.userPrompt ?? '',
      styleHint: body.styleHint,
      instrumental: body.instrumental,
      title: body.title,
    });
    return NextResponse.json(result, {
      headers: {
        'X-Provider': adapter.id,
        'X-Provider-Mode': mockMode ? 'mock' : 'live',
      },
    });
  } catch (err) {
    return jsonError('provider_error', (err as Error).message, 502);
  }
}

/**
 * GET /api/music?taskId=... — polls a previously-started task.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  if (!taskId) return jsonError('validation_error', 'Missing taskId', 400);

  const mockMode = process.env.MOCK_MODE !== 'false';
  const sunoApiKey = process.env.SUNO_API_KEY || undefined;
  const sunoBaseUrl = process.env.SUNO_API_BASE || undefined;
  const adapter = pickMusicAdapter({ mockMode, sunoApiKey, sunoBaseUrl });

  try {
    const status = await adapter.status(taskId);
    return NextResponse.json(status, {
      headers: { 'X-Provider': adapter.id },
    });
  } catch (err) {
    return jsonError('provider_error', (err as Error).message, 502);
  }
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
