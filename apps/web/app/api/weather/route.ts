import { NextResponse } from 'next/server';

import { getCurrentWeather } from '@wi/weather';

import { getProfileLocation } from '@/lib/profile';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/weather?lat=…&lng=…&label=…
 *
 * Location resolution mirrors the chat / image / music routes:
 *
 *   1. Explicit query params (`lat` + `lng`). Used by tooling or
 *      a future per-room "look at this location" toggle.
 *   2. If the caller is signed in and didn't pass params, fall back
 *      to their saved profile location (set during /onboarding).
 *   3. Default 강남구 — for anon visitors / users who skipped the
 *      location step in onboarding.
 *
 * Previously: only step 1 + step 3 — anon-style default. That's why
 * the chat header showed 강남구 weather even after a user selected
 * 부산 해운대 in onboarding.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const latParam = url.searchParams.get('lat');
  const lngParam = url.searchParams.get('lng');
  const labelParam = url.searchParams.get('label') ?? undefined;

  let lat: number | null = latParam !== null ? Number(latParam) : null;
  let lng: number | null = lngParam !== null ? Number(lngParam) : null;
  let label = labelParam;

  // If the caller didn't supply coords, try their saved profile.
  // We only hit the DB when params are missing so the public /api/weather
  // path (used by the home-page hero, etc.) doesn't add a round-trip.
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    const caller = await resolveUser();
    if (caller) {
      const saved = await getProfileLocation(caller.id);
      if (saved) {
        lat = saved.lat;
        lng = saved.lng;
        label = label ?? saved.label;
      }
    }
  }

  // Final fallback so the endpoint always returns *some* snapshot.
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = 37.498;
    lng = 127.028;
    label = label ?? '서울 강남구';
  }

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
