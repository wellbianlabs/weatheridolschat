export * from './providers/types';
export * from './providers/mock';
export * from './providers/kweather';
export * from './providers/openweathermap';
export * from './router';
export * from './cache';

import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

import { getCached, setCached } from './cache';
import { MockWeatherProvider } from './providers/mock';
import { pickProvider, type WeatherRouterOptions } from './router';

/**
 * High-level helper that handles cache + provider routing.
 *
 * Fail-soft: weather is a *context* signal for chat and image generation,
 * never a hard dependency. If the chosen provider rejects the request
 * (bad key, rate limit, network blip), we transparently fall back to the
 * mock snapshot so downstream features keep working.
 */
export async function getCurrentWeather(
  point: GeoPoint,
  opts: WeatherRouterOptions,
): Promise<WeatherSnapshot> {
  const cached = getCached(point);
  if (cached) return cached;

  const provider = pickProvider(point, opts);
  try {
    const snapshot = await provider.fetchCurrent(point);
    setCached(point, snapshot);
    return snapshot;
  } catch (err) {
    // Log once for observability — don't bubble up.
    console.warn(
      `[weather] ${provider.id} failed (${(err as Error).message}); falling back to mock`,
    );
    if (provider.id === 'mock') throw err; // mock should never fail; if it does, surface it
    const fallback = await MockWeatherProvider.fetchCurrent(point);
    setCached(point, fallback);
    return fallback;
  }
}
