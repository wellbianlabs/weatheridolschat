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
  console.info(
    `[image-api] start character=${character.id} adapter=${adapter.id} mockMode=${mockMode} hasOpenAI=${!!openaiApiKey} weather=${weather.condition}`,
  );

  const t0 = Date.now();
  try {
    const result = await adapter.generate({
      characterId: character.id,
      weather,
      userPrompt: body.userPrompt ?? '',
      intent: body.intent ?? 'selfie',
      referenceImageUrl: character.referenceImageUrl,
    });
    console.info(
      `[image-api] OK model=${result.model} ms=${Date.now() - t0} adapter=${adapter.id}`,
    );

    return NextResponse.json(
      {
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        seed: result.seed,
        model: result.model,
        width: result.width,
        height: result.height,
        weatherCondition: weather.condition,
      },
      { headers: { 'X-Adapter': adapter.id, 'X-Image-Model': result.model } },
    );
  } catch (err) {
    const msg = (err as Error).message ?? 'unknown';
    console.error(`[image-api] FAIL adapter=${adapter.id} ms=${Date.now() - t0} msg="${msg}"`);
    return NextResponse.json(
      { error: { code: 'provider_error', message: msg } },
      { status: 502, headers: { 'X-Adapter': adapter.id } },
    );
  }
}
