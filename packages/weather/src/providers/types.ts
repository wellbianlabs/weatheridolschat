import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

export interface WeatherProvider {
  readonly id: 'kweather' | 'openweathermap' | 'mock';
  fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot>;
}
