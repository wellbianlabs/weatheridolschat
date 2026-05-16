import type { GeoPoint, WeatherCondition, WeatherSnapshot } from '@wi/core/weather';

import type { WeatherProvider } from './types';

/**
 * Open-Meteo — free, no-key, worldwide weather API.
 * https://open-meteo.com/en/docs
 *
 * Used as the *final* fallback in the cascade. KWeather covers KR with
 * dong-level granularity; OpenWeatherMap covers the world if the user
 * configured a key; Open-Meteo backs everything else (overseas trips, edge
 * coordinates the KMA grid can't resolve, demo/anon users without any key).
 *
 * Because it needs no key, it's also the safe default for previews and
 * local dev when the env vars haven't been wired up yet.
 */
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
}

export const OpenMeteoProvider: WeatherProvider = {
  id: 'openmeteo',
  async fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot> {
    const url = new URL(BASE_URL);
    url.searchParams.set('latitude', String(point.lat));
    url.searchParams.set('longitude', String(point.lng));
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
    );
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('wind_speed_unit', 'ms');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;
    const c = data.current;
    if (!c || c.temperature_2m == null) throw new Error('Open-Meteo: empty current block');

    return {
      location: { ...point, label: point.label },
      observedAt: c.time ? new Date(c.time).toISOString() : new Date().toISOString(),
      temperatureC: Math.round((c.temperature_2m ?? 0) * 10) / 10,
      condition: mapWmoCode(c.weather_code ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      windKph: Math.round((c.wind_speed_10m ?? 0) * 3.6 * 10) / 10,
      precipitationMm: Math.round((c.precipitation ?? 0) * 10) / 10,
      aqi: 0,
      provider: 'openmeteo',
    };
  },
};

/**
 * WMO weather code → our enum. See https://open-meteo.com/en/docs (Weather codes).
 *  0           Clear
 *  1-3         Mainly clear / Partly cloudy / Overcast
 *  45, 48      Fog
 *  51, 53, 55  Drizzle (light → dense)
 *  56, 57      Freezing drizzle
 *  61, 63, 65  Rain (slight → heavy)
 *  66, 67      Freezing rain
 *  71, 73, 75  Snow fall (slight → heavy)
 *  77          Snow grains
 *  80, 81, 82  Rain showers
 *  85, 86      Snow showers
 *  95          Thunderstorm
 *  96, 99      Thunderstorm with hail
 */
function mapWmoCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'clouds';
  if (code === 45 || code === 48) return 'mist';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'thunder';
  return 'clouds';
}
