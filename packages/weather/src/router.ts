import type { GeoPoint } from '@wi/core/weather';

import { KWeatherProvider } from './providers/kweather';
import { MockWeatherProvider } from './providers/mock';
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
  kweatherApiKey?: string;
  openWeatherMapApiKey?: string;
}

export function pickProvider(point: GeoPoint, opts: WeatherRouterOptions): WeatherProvider {
  if (opts.mockMode) return MockWeatherProvider;
  if (opts.openWeatherMapApiKey) {
    return createOpenWeatherMapProvider(opts.openWeatherMapApiKey);
  }
  if (isInKorea(point) && opts.kweatherApiKey) return KWeatherProvider;
  return MockWeatherProvider;
}
