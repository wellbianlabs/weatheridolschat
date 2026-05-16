import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

export interface WeatherProvider {
  readonly id: 'kweather' | 'openweathermap' | 'openmeteo' | 'mock';
  fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot>;
}
