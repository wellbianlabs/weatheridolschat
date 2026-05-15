import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';
import { normalizeCondition } from '@wi/core/weather';

import type { WeatherProvider } from './types';

interface OWMResponse {
  weather?: Array<{ main: string; description: string }>;
  main?: { temp: number; humidity: number };
  wind?: { speed: number };
  rain?: { '1h'?: number };
  name?: string;
  dt?: number;
}

/**
 * OpenWeatherMap "Current Weather Data" endpoint.
 * Free tier: 60 calls/min, 1M/month.
 */
export function createOpenWeatherMapProvider(apiKey: string): WeatherProvider {
  return {
    id: 'openweathermap',
    async fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot> {
      const url = new URL('https://api.openweathermap.org/data/2.5/weather');
      url.searchParams.set('lat', String(point.lat));
      url.searchParams.set('lon', String(point.lng));
      url.searchParams.set('appid', apiKey);
      url.searchParams.set('units', 'metric');
      url.searchParams.set('lang', 'kr');

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`OpenWeatherMap responded ${res.status}`);
      }
      const data = (await res.json()) as OWMResponse;
      const rawCondition = data.weather?.[0]?.main ?? 'clear';

      return {
        location: { ...point, label: point.label ?? data.name },
        observedAt: new Date((data.dt ?? Date.now() / 1000) * 1000).toISOString(),
        temperatureC: Math.round((data.main?.temp ?? 0) * 10) / 10,
        condition: normalizeCondition(rawCondition),
        humidity: data.main?.humidity ?? 50,
        windKph: Math.round((data.wind?.speed ?? 0) * 3.6 * 10) / 10,
        precipitationMm: data.rain?.['1h'] ?? 0,
        aqi: 0,
        provider: 'openweathermap',
      };
    },
  };
}

/** Default no-op; production code uses createOpenWeatherMapProvider(apiKey). */
export const OpenWeatherMapProvider: WeatherProvider = {
  id: 'openweathermap',
  async fetchCurrent(): Promise<WeatherSnapshot> {
    throw new Error('Use createOpenWeatherMapProvider(apiKey)');
  },
};
