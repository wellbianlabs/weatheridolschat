import type { GeoPoint, WeatherCondition, WeatherSnapshot } from '@wi/core/weather';
import { kstHour, kstIsoString } from '@wi/core/time';

import type { WeatherProvider } from './types';

const CONDITIONS: WeatherCondition[] = ['clear', 'clouds', 'rain', 'thunder', 'snow', 'mist'];

/**
 * Deterministic-ish mock that rotates condition by hour-of-day so the demo
 * stays interesting without being random per request. Time-of-day uses
 * KST because the characters live in Korea — otherwise on Vercel (UTC)
 * the demo would show "midnight" weather at lunchtime KST.
 */
export const MockWeatherProvider: WeatherProvider = {
  id: 'mock',
  async fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot> {
    const hour = kstHour();
    const condition = CONDITIONS[hour % CONDITIONS.length] ?? 'clear';
    const baseTemp = 15 + ((hour - 6 + 24) % 24); // pseudo daily curve
    return {
      location: { ...point, label: point.label ?? 'Mock City' },
      observedAt: kstIsoString(),
      temperatureC: Math.round(baseTemp * 10) / 10,
      condition,
      humidity: 55,
      windKph: 7.5,
      precipitationMm: condition === 'rain' ? 2.4 : 0,
      aqi: 58,
      provider: 'mock',
    };
  },
};
