import { NextResponse } from 'next/server';

import { getCurrentWeather } from '@wi/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat') ?? 37.498);
  const lng = Number(url.searchParams.get('lng') ?? 127.028);
  const label = url.searchParams.get('label') ?? undefined;

  const mockMode = process.env.MOCK_MODE !== 'false';
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  // Accept the new env var name (`KW_API_KEY`) first and fall through to the
  // legacy `KWEATHER_API_KEY` name so existing deployments keep working.
  const kweatherApiKey = process.env.KW_API_KEY || process.env.KWEATHER_API_KEY || undefined;

  try {
    const snapshot = await getCurrentWeather(
      { lat, lng, label },
      { mockMode, openWeatherMapApiKey, kweatherApiKey },
    );
    return NextResponse.json(snapshot, {
      headers: {
        'X-Provider-Mode': mockMode ? 'mock' : 'live',
        'X-Provider': snapshot.provider,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'provider_error', message: (err as Error).message } },
      { status: 502 },
    );
  }
}
