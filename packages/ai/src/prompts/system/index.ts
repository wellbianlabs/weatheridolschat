import type { CharacterId } from '@wi/core/characters';

import { CLOUDY_SYSTEM_PROMPT } from './cloudy';
import { RAIN_SYSTEM_PROMPT } from './rain';
import { SUNNY_SYSTEM_PROMPT } from './sunny';
import { THUNDER_SYSTEM_PROMPT } from './thunder';

export const SYSTEM_PROMPTS: Record<CharacterId, string> = {
  sunny: SUNNY_SYSTEM_PROMPT,
  rain: RAIN_SYSTEM_PROMPT,
  cloudy: CLOUDY_SYSTEM_PROMPT,
  thunder: THUNDER_SYSTEM_PROMPT,
};

export { SUNNY_SYSTEM_PROMPT, RAIN_SYSTEM_PROMPT, CLOUDY_SYSTEM_PROMPT, THUNDER_SYSTEM_PROMPT };
