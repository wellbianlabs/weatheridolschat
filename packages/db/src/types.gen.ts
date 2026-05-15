/**
 * Placeholder for `supabase gen types typescript` output.
 * Replace with real generated types once the Supabase project is provisioned (M2).
 *
 * Command:
 *   pnpm supabase gen types typescript --project-id <ref> --schema public \
 *     > packages/db/src/types.gen.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow> };
      characters: { Row: CharacterRow; Insert: Partial<CharacterRow>; Update: Partial<CharacterRow> };
      sessions: { Row: SessionRow; Insert: Partial<SessionRow>; Update: Partial<SessionRow> };
      messages: { Row: MessageRow; Insert: Partial<MessageRow>; Update: Partial<MessageRow> };
      weather_snapshots: {
        Row: WeatherSnapshotRow;
        Insert: Partial<WeatherSnapshotRow>;
        Update: Partial<WeatherSnapshotRow>;
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: Partial<SubscriptionRow>;
        Update: Partial<SubscriptionRow>;
      };
      quests: { Row: QuestRow; Insert: Partial<QuestRow>; Update: Partial<QuestRow> };
      quest_progress: {
        Row: QuestProgressRow;
        Insert: Partial<QuestProgressRow>;
        Update: Partial<QuestProgressRow>;
      };
      token_ledger: {
        Row: TokenLedgerRow;
        Insert: Partial<TokenLedgerRow>;
        Update: Partial<TokenLedgerRow>;
      };
      recommendation_events: {
        Row: RecommendationEventRow;
        Insert: Partial<RecommendationEventRow>;
        Update: Partial<RecommendationEventRow>;
      };
      moderation_logs: {
        Row: ModerationLogRow;
        Insert: Partial<ModerationLogRow>;
        Update: Partial<ModerationLogRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface ProfileRow {
  id: string;
  nickname: string;
  birth_date: string | null;
  gender: 'female' | 'male' | 'nonbinary' | 'prefer_not' | null;
  locale: string;
  timezone: string;
  tier: 'free' | 'premium';
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterRow {
  id: string;
  display_name: string;
  display_name_en: string;
  motif: string;
  origin_region: string;
  accent_color: string;
  short_bio: string;
  system_prompt: string;
  image_base_prompt: string;
  reference_image_url: string | null;
  seed: number;
  recommendation_domains: string[];
  sort_order: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  character_id: string;
  title: string | null;
  pinned: boolean;
  last_message_at: string | null;
  memory_summary: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  modality: 'text' | 'image' | 'product' | 'song' | 'video';
  content: string | null;
  metadata: Json | null;
  weather_snapshot_id: string | null;
  model: string | null;
  token_usage: Json | null;
  created_at: string;
}

export interface WeatherSnapshotRow {
  id: string;
  location_label: string | null;
  temperature_c: number;
  condition: string;
  humidity: number;
  wind_kph: number;
  precipitation_mm: number;
  aqi: number;
  provider: string;
  observed_at: string;
  cached_until: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  provider: string;
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  external_id: string | null;
  raw: Json | null;
}

export interface QuestRow {
  id: string;
  title: string;
  description: string;
  reward_tokens: number;
  kind: string;
  active: boolean;
}

export interface QuestProgressRow {
  user_id: string;
  quest_id: string;
  state: 'pending' | 'done' | 'claimed';
  completed_at: string | null;
}

export interface TokenLedgerRow {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export interface RecommendationEventRow {
  id: string;
  user_id: string;
  message_id: string | null;
  campaign_id: string;
  product_id: string;
  event: 'impression' | 'click' | 'conversion';
  revenue_amount: number | null;
  currency: string;
  created_at: string;
}

export interface ModerationLogRow {
  id: string;
  user_id: string | null;
  input_text: string | null;
  stage: 'blocklist' | 'openai_mod' | 'persona_refusal';
  matched_pattern: string | null;
  action: 'block' | 'refuse' | 'warn';
  created_at: string;
}
