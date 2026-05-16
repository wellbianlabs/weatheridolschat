export const WEATHER_CONDITIONS = [
  'clear',
  'clouds',
  'rain',
  'drizzle',
  'thunder',
  'snow',
  'mist',
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface WeatherSnapshot {
  id?: string;
  location: GeoPoint;
  observedAt: string;
  temperatureC: number;
  condition: WeatherCondition;
  humidity: number;
  windKph: number;
  precipitationMm: number;
  aqi: number;
  provider: 'kweather' | 'openweathermap' | 'openmeteo' | 'mock';
}
