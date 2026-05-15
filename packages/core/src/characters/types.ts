export const CHARACTER_IDS = ['sunny', 'rain', 'cloudy', 'thunder'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export type CharacterMotif = 'sunny' | 'rain' | 'cloud' | 'thunder';

export type RecommendationDomain =
  | 'outdoor'
  | 'fitness'
  | 'beauty'
  | 'cafe'
  | 'healing'
  | 'music'
  | 'book'
  | 'art'
  | 'photo_spot'
  | 'stationery'
  | 'delivery'
  | 'game'
  | 'streetwear'
  | 'workout'
  | 'food';

export interface Character {
  id: CharacterId;
  displayName: string;
  displayNameEn: string;
  motif: CharacterMotif;
  originRegion: string;
  accentColor: string;
  shortBio: string;
  recommendationDomains: RecommendationDomain[];
  sortOrder: number;
  /** Public path to the wide roster image (16:9). Used on cards & chat header. */
  rosterImageUrl?: string;
  /** Public path to the canonical close-up face reference (1:1). Fed to OpenAI
   * Image as the reference for visual consistency across generations. */
  referenceImageUrl?: string;
}
