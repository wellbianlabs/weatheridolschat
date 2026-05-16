import { NextResponse } from 'next/server';

import { CHARACTERS } from '@wi/core/characters';
import { pickImageAdapter } from '@wi/ai';
import { getCurrentWeather } from '@wi/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImageBody {
  characterId?: string;
  userPrompt?: string;
  intent?: 'selfie' | 'scene' | 'outfit';
  locationHint?: { lat: number; lng: number; label?: string };
}

export async function POST(req: Request): Promise<Response> {
  let body: ImageBody;
  try {
    body = (await req.json()) as ImageBody;
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const character = body.characterId ? CHARACTERS[body.characterId] : undefined;
  if (!character) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Unknown character' } },
      { status: 404 },
    );
  }

  const mockMode = process.env.MOCK_MODE !== 'false';
  const openaiApiKey = process.env.OPENAI_API_KEY || undefined;
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  const kweatherApiKey = process.env.KW_API_KEY || process.env.KWEATHER_API_KEY || undefined;

  const point = body.locationHint ?? { lat: 37.498, lng: 127.028, label: '서울 강남구' };
  const weather = await getCurrentWeather(point, {
    mockMode,
    kweatherApiKey,
    openWeatherMapApiKey,
  });
  const adapter = pickImageAdapter({ mockMode, openaiApiKey });

  try {
    const result = await adapter.generate({
      characterId: character.id,
      weather,
      userPrompt: body.userPrompt ?? '',
      intent: body.intent ?? 'selfie',
      referenceImageUrl: character.referenceImageUrl,
    });

    return NextResponse.json({
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      seed: result.seed,
      model: result.model,
      width: result.width,
      height: result.height,
      weatherCondition: weather.condition,
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'provider_error', message: (err as Error).message } },
      { status: 502 },
    );
  }
}
