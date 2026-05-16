import type { GeoPoint } from '@wi/core/weather';

import { createKWeatherProvider } from './providers/kweather';
import { MockWeatherProvider } from './providers/mock';
import { OpenMeteoProvider } from './providers/openmeteo';
import { createOpenWeatherMapProvider } from './providers/openweathermap';
import type { WeatherProvider } from './providers/types';

const KR_LAT_RANGE = [33.0, 38.6] as const;
const KR_LNG_RANGE = [124.5, 132.0] as const;

function isInKorea(point: GeoPoint): boolean {
  return (
    point.lat >= KR_LAT_RANGE[0] &&
    point.lat <= KR_LAT_RANGE[1] &&
    point.lng >= KR_LNG_RANGE[0] &&
    point.lng <= KR_LNG_RANGE[1]
  );
}

export interface WeatherRouterOptions {
  mockMode?: boolean;
  /** New env var. Accepts the value of either `KW_API_KEY` or the legacy
   *  `KWEATHER_API_KEY` — callers normalize before passing in. */
  kweatherApiKey?: string;
  openWeatherMapApiKey?: string;
}

/**
 * Build the provider cascade for a given coordinate.
 *
 * Order:
 *   1. Mock — short-circuit when `mockMode` is on (CI, demos, preview).
 *   2. KWeather B2B — only for KR coords + key present. Dong-level accuracy.
 *   3. OpenWeatherMap — worldwide, requires key.
 *   4. Open-Meteo — worldwide, no key, last resort so demos always work.
 *
 * The first provider that returns a snapshot wins. The wrapper in `index.ts`
 * walks this list and only falls through on actual errors, so we never burn
 * API quota on the lower-priority providers when the higher one succeeds.
 */
export function buildProviderChain(
  point: GeoPoint,
  opts: WeatherRouterOptions,
): WeatherProvider[] {
  if (opts.mockMode) return [MockWeatherProvider];

  const chain: WeatherProvider[] = [];
  if (isInKorea(point) && opts.kweatherApiKey) {
    chain.push(createKWeatherProvider(opts.kweatherApiKey));
  }
  if (opts.openWeatherMapApiKey) {
    chain.push(createOpenWeatherMapProvider(opts.openWeatherMapApiKey));
  }
  // Open-Meteo is always available — no key, worldwide. Critical for the
  // common case where the user has no keys configured yet.
  chain.push(OpenMeteoProvider);
  return chain;
}

/** Back-compat: returns the *first* provider in the chain. */
export function pickProvider(point: GeoPoint, opts: WeatherRouterOptions): WeatherProvider {
  return buildProviderChain(point, opts)[0] ?? MockWeatherProvider;
}
