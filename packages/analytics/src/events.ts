/** Canonical event names defined in docs/06_USER_FLOWS.md §9. */

export type AnalyticsEvent =
  | { name: 'onboarding_completed'; props: { character_id: string } }
  | { name: 'character_selected'; props: { character_id: string; position: number } }
  | { name: 'message_sent'; props: { character_id: string; length: number; has_intent: boolean } }
  | { name: 'image_generated'; props: { character_id: string; weather_condition: string; latency_ms: number } }
  | { name: 'paywall_viewed'; props: { trigger: 'rate_limit' | 'feature_lock' } }
  | { name: 'paywall_cta_clicked'; props: { plan: 'monthly' | 'yearly' | 'waitlist' } }
  | { name: 'product_card_impression'; props: { campaign_id: string; product_id: string } }
  | { name: 'product_card_clicked'; props: { campaign_id: string; product_id: string } }
  | { name: 'quest_claimed'; props: { quest_id: string; reward: number } }
  | { name: 'signout'; props: Record<string, never> }
  | { name: 'crash'; props: { platform: 'web' | 'ios' | 'android'; build: string } };

export interface AnalyticsClient {
  track<E extends AnalyticsEvent>(event: E): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
}
