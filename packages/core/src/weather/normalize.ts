import type { WeatherCondition } from './types';

/**
 * Maps free-form provider condition strings to our normalized enum.
 */
export function normalizeCondition(raw: string): WeatherCondition {
  const v = raw.toLowerCase();
  if (v.includes('thunder')) return 'thunder';
  if (v.includes('drizzle')) return 'drizzle';
  if (v.includes('rain') || v.includes('shower')) return 'rain';
  if (v.includes('snow') || v.includes('sleet')) return 'snow';
  if (v.includes('mist') || v.includes('fog') || v.includes('haze')) return 'mist';
  if (v.includes('cloud') || v.includes('overcast')) return 'clouds';
  return 'clear';
}
