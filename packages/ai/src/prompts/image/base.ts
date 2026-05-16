import type { CharacterId } from '@wi/core/characters';
import type { WeatherCondition, WeatherSnapshot } from '@wi/core/weather';

/**
 * Full character descriptions. Used when generating WITHOUT a reference
 * image (rare — currently only the dall-e-3 fallback for scene/outfit
 * intents). For the standard selfie flow, we use `CHARACTER_HAIR_HINT`
 * instead so the prompt doesn't fight the reference image.
 */
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

/**
 * Compact hair/styling reminder, repeated *in addition to* the reference
 * image so gpt-image-1 anchors the most identity-critical details when
 * doing weather-adapted edits. Kept short on purpose — the reference
 * photo is the ground truth, this is just a guardrail against drift.
 */
const CHARACTER_HAIR_HINT: Record<CharacterId, string> = {
  sunny: 'honey-blonde long wavy hair, warm coral makeup, bright wide smile',
  rain: 'midnight-blue long sleek straight hair with a small accent braid, muted rose lips, calm expression',
  cloudy: 'short dusty ash-blue pixie-bob, light freckles, rosy blush, dreamy sleepy eyes',
  thunder: 'short ash-gray to electric-purple wolf-cut, sharp brows, confident expression',
};

/**
 * Weather → outfit/scene cues that the model can render around the
 * character. Separates *atmosphere* (lighting, environment) from
 * *wardrobe* (what the idol would plausibly wear in that weather) so the
 * final image reads as a real selfie taken in that moment, not a stock
 * weather illustration.
 */
const WEATHER_OUTFIT: Record<WeatherCondition, string> = {
  clear: 'breezy summer outfit (light cropped top or sundress), no jacket',
  clouds: 'soft cardigan or light long-sleeve top, casual layered look',
  rain: 'transparent vinyl raincoat or oversized hoodie, holding a clear umbrella',
  drizzle: 'light trench or thin windbreaker, hair slightly damp',
  thunder: 'dark fitted jacket, edgy styling, dramatic vibe',
  snow: 'cozy oversized knit sweater with fluffy scarf, cheeks slightly flushed from cold',
  mist: 'soft turtleneck or wool coat, hazy morning vibe',
};

const WEATHER_BACKDROP: Record<WeatherCondition, string> = {
  clear: 'bright blue sky behind, warm golden hour sunlight, lens flare',
  clouds: 'overcast soft white sky behind, diffused gentle lighting',
  rain: 'rainy street behind with bokeh raindrops, neon reflections on wet pavement, moody cinematic light',
  drizzle: 'light drizzle, soft pastel sky, faint water droplets in foreground',
  thunder: 'dark stormy sky with faint lightning, dramatic cool tones',
  snow: 'gentle snowfall, snowflakes on hair and shoulders, crisp cool daylight',
  mist: 'thick morning fog, soft low contrast, muted tones',
};

const TIME_OF_DAY_FOR_CONDITION: Record<WeatherCondition, string> = {
  clear: 'late afternoon golden hour',
  clouds: 'midday overcast',
  rain: 'early evening',
  drizzle: 'late afternoon',
  thunder: 'late evening',
  snow: 'late afternoon winter daylight',
  mist: 'early morning',
};

/**
 * Build the prompt used by `images.edit` (gpt-image-1) when we have a
 * face reference. This is the primary selfie path.
 *
 * Strategy: the reference image carries the face — we don't repeat the
 * full description (that would fight the photo). The prompt instead
 * tells the model:
 *   - what kind of shot this is (close-up phone selfie)
 *   - where the character is (weather-appropriate backdrop)
 *   - what they're wearing (weather-appropriate outfit)
 *   - what to preserve (identity, hair color/style)
 *   - what aesthetic (K-pop idol photoshoot)
 */
export function buildSelfiePromptWithReference(input: {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt: string;
}): string {
  const cond = input.weather.condition;
  const tempC = Math.round(input.weather.temperatureC);
  const locLabel = input.weather.location.label ?? '';
  const hair = CHARACTER_HAIR_HINT[input.characterId];
  const outfit = WEATHER_OUTFIT[cond];
  const backdrop = WEATHER_BACKDROP[cond];
  const tod = TIME_OF_DAY_FOR_CONDITION[cond];
  const user = sanitizeUserPrompt(input.userPrompt);

  const userLine = user ? `Subtle mood cue from the user: "${user}". ` : '';

  return [
    'Close-up phone selfie of the EXACT SAME PERSON as in the reference image.',
    'Critical: preserve the reference subject\'s face, eye shape, nose, lip shape, skin tone, and overall facial proportions identically — do NOT change identity.',
    `Hair must remain: ${hair}.`,
    `Setting: ${locLabel ? `${locLabel}, ` : ''}${tod}, ${backdrop}.`,
    `Outfit: ${outfit}, appropriate for about ${tempC}°C.`,
    userLine + 'Authentic phone selfie angle (slight upward tilt, arm out of frame), natural expression appropriate to the weather mood, K-pop idol photoshoot aesthetic, soft cinematic lighting, shallow depth of field, 1024x1024 portrait, ultra high detail.',
  ].join(' ');
}

/**
 * Plain text-only prompt for the rare path where we have NO reference
 * (mock fallback, future scene/outfit intents, or a brand-new character
 * whose reference hasn't been uploaded yet). Includes the full character
 * description because the model can't see a reference photo.
 */
export function buildImagePrompt(input: {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt: string;
}): string {
  const L1 = IMAGE_BASE[input.characterId];
  const cond = input.weather.condition;
  const L2 = `Setting: ${WEATHER_BACKDROP[cond]}, ${TIME_OF_DAY_FOR_CONDITION[cond]}. Outfit: ${WEATHER_OUTFIT[cond]}.`;
  const L3 = sanitizeUserPrompt(input.userPrompt);
  return [
    L1,
    L2,
    L3,
    'Phone selfie pose, K-pop idol photoshoot lighting, ultra high detail, 1024x1024 portrait.',
  ]
    .filter(Boolean)
    .join(' ');
}

function sanitizeUserPrompt(text: string): string {
  // Strip extremely long or obviously unsafe substrings. Real NSFW filtering is upstream.
  return text.replace(/[<>{}[\]\\]/g, '').slice(0, 200);
}
