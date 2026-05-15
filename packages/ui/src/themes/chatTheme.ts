import type { CharacterId } from '@wi/core/characters';
import type { WeatherCondition } from '@wi/core/weather';

import { colorTokens } from '../tokens/colors';

import { getWeatherTheme, type WeatherTheme } from './weatherTheme';

export interface ChatTheme {
  weather: WeatherTheme;
  accent: { primary: string; soft: string; ink: string };
}

export function getChatTheme(characterId: CharacterId, condition: WeatherCondition): ChatTheme {
  return {
    weather: getWeatherTheme(condition),
    accent: colorTokens.character[characterId],
  };
}
