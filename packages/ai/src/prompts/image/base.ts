import type { CharacterId } from '@wi/core/characters';
import type { WeatherCondition, WeatherSnapshot } from '@wi/core/weather';

export const IMAGE_BASE: Record<CharacterId, string> = {
  sunny:
    'A 20-year-old female K-pop idol. Height 167cm, slim and athletic toned body. Warm honey-blonde long voluminous wavy hair, slight dark roots. Fair glowing skin with warm undertones. Slender V-line face, large bright eyes with prominent aegyo-sal, wide radiant smile. Coral-toned K-pop idol makeup. Cheerful vibrant approachable expression.',
  rain:
    'A 19-year-old female K-pop idol. Height 164cm, slim delicate frame. Long sleek midnight-blue (almost black) straight hair, middle parted with a small accent braid. Pale porcelain skin with cool undertones. Slender oval face, large deep serene eyes, calm melancholic expression with very faint gentle smile. Muted rose-tinted MLBB lips.',
  cloudy:
    'An 18-year-old female K-pop idol. Height 160cm, petite and cute frame. Short messy choppy textured pixie-bob hair in dusty ash-blue. Pale soft skin with light faux freckles on the cheeks and nose. Noticeably flushed rosy blush. Large round dreamy slightly sleepy eyes. Glossy soft pink lips. Whimsical artsy slightly spaced-out expression.',
  thunder:
    'A 21-year-old female K-pop idol. Height 170cm, slim athletic toned body. Short choppy multi-layered wolf-cut hair starting cool ash-gray at roots transitioning to vibrant electric purple at tips. Pale porcelain skin with cool undertones. Slender confident V-line face, intense charismatic eyes with strong defined eyebrows. Fierce rebellious highly confident expression.',
};

const WEATHER_TO_VISUAL: Record<WeatherCondition, string> = {
  clear: 'clear blue sky, warm golden sunlight, lens flare, vibrant atmosphere',
  clouds: 'soft overcast lighting, diffused gray-white sky, gentle mood',
  rain: 'rainy day, wet asphalt, raindrops on glass, cinematic moody lighting',
  drizzle: 'light drizzle, soft haze, pastel sky, gentle reflections',
  thunder: 'stormy sky, dramatic lightning flash, deep purple-blue tones, cinematic',
  snow: 'soft snowfall, crisp cool light, light snow on hair and shoulders',
  mist: 'thick morning mist, soft fog, low contrast atmosphere',
};

export function buildImagePrompt(input: {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt: string;
}): string {
  const L1 = IMAGE_BASE[input.characterId];
  const L2 = WEATHER_TO_VISUAL[input.weather.condition];
  const L3 = sanitizeUserPrompt(input.userPrompt);
  return [L1, L2, L3, 'high detail, 8k, K-pop idol photoshoot lighting'].filter(Boolean).join(', ');
}

function sanitizeUserPrompt(text: string): string {
  // Strip extremely long or obviously unsafe substrings. Real NSFW filtering is upstream.
  return text.replace(/[<>{}[\]\\]/g, '').slice(0, 200);
}
