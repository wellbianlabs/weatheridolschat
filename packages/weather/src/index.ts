export * from './providers/types';
export * from './providers/mock';
export * from './providers/kweather';
export * from './providers/openweathermap';
export * from './providers/openmeteo';
export * from './router';
export * from './cache';

import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

import { getCached, setCached } from './cache';
import { MockWeatherProvider } from './providers/mock';
import { buildProviderChain, type WeatherRouterOptions } from './router';

/**
 * High-level helper that handles cache + provider cascade.
 *
 * Fail-soft: weather is a *context* signal for chat and image generation,
 * never a hard dependency. We walk the provider chain top to bottom and
 * the first one that returns a snapshot wins. If every provider in the
 * chain throws (network, quota, etc.), we synthesize a mock snapshot so
 * downstream features keep working — chat replies still flow.
 */
export async function getCurrentWeather(
  point: GeoPoint,
  opts: WeatherRouterOptions,
): Promise<WeatherSnapshot> {
  const cached = getCached(point);
  if (cached) return cached;

  const chain = buildProviderChain(point, opts);
  const errors: string[] = [];

  for (const provider of chain) {
    try {
      const snapshot = await provider.fetchCurrent(point);
      setCached(point, snapshot);
      return snapshot;
    } catch (err) {
      const msg = `${provider.id}: ${(err as Error).message}`;
      errors.push(msg);
      console.warn(`[weather] ${msg} — trying next provider`);
    }
  }

  // Every real provider failed. Synthesize a mock so chat never hangs.
  console.warn(`[weather] all providers failed → mock fallback. errors=[${errors.join(' | ')}]`);
  const fallback = await MockWeatherProvider.fetchCurrent(point);
  setCached(point, fallback);
  return fallback;
}
