import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

import type { WeatherProvider } from './types';

/** K-weather adapter — implemented in M9. Returns mock-shaped data for now. */
export const KWeatherProvider: WeatherProvider = {
  id: 'kweather',
  async fetchCurrent(_point: GeoPoint): Promise<WeatherSnapshot> {
    throw new Error('KWeatherProvider not implemented — set MOCK_MODE=true for now');
  },
};
