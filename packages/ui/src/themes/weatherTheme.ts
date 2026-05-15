import type { WeatherCondition } from '@wi/core/weather';

import { colorTokens } from '../tokens/colors';

export type DayPeriod = 'day' | 'night';

export type ParticleKind = 'raindrop' | 'sunray' | 'fog' | 'lightning' | null;

export interface WeatherTheme {
  gradient: readonly string[];
  overlay: string;
  particle: ParticleKind;
}

const PARTICLE_BY_CONDITION: Record<WeatherCondition, ParticleKind> = {
  clear: 'sunray',
  clouds: null,
  rain: 'raindrop',
  drizzle: 'raindrop',
  thunder: 'lightning',
  snow: 'raindrop',
  mist: 'fog',
};

export function getWeatherTheme(
  condition: WeatherCondition,
  period: DayPeriod = 'day',
): WeatherTheme {
  const grad = colorTokens.weather[condition];
  return {
    gradient: grad,
    overlay: period === 'night' ? 'rgba(15,15,30,0.25)' : 'rgba(255,255,255,0)',
    particle: PARTICLE_BY_CONDITION[condition],
  };
}
