export * from './providers/types';
export * from './providers/mock';
export * from './providers/kweather';
export * from './providers/openweathermap';
export * from './router';
export * from './cache';

import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

import { getCached, setCached } from './cache';
import { pickProvider, type WeatherRouterOptions } from './router';

/** High-level helper that handles cache + provider routing. */
export async function getCurrentWeather(
  point: GeoPoint,
  opts: WeatherRouterOptions,
): Promise<WeatherSnapshot> {
  const cached = getCached(point);
  if (cached) return cached;
  const provider = pickProvider(point, opts);
  const snapshot = await provider.fetchCurrent(point);
  setCached(point, snapshot);
  return snapshot;
}
