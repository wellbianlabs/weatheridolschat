/**
 * Credit packages + subscription SKUs.
 *
 * These constants are the single source of truth for the storefront,
 * the checkout API, and the webhook handler — keeping them in core
 * means /pricing, /account, /api/payments/checkout and the Toss
 * webhook can never disagree on prices or credit amounts.
 *
 * Credit economics (see DB_PAYMENTS.md for cost analysis):
 *   - 1 selfie consumes 5 credits   (OpenAI cost ~₩50)
 *   - 1 weather song consumes 30 credits (Suno cost ~₩650)
 *   - Chat/TTS/vision are NOT credit-priced — they stay quota-only
 *
 * Pricing tuned so heavy users naturally subscribe, light users top
 * up packs occasionally. Bonus credits on larger packs encourage
 * fewer-larger purchases (cheaper for us, less friction for them).
 */

export type CreditPackSku = 'pack_100' | 'pack_250' | 'pack_600';

export interface CreditPackage {
  sku: CreditPackSku;
  /** UI title shown on /pricing cards. */
  label: string;
  /** Base credits granted by the purchase. */
  baseCredits: number;
  /** Extra credits thrown in as a "bonus" (purely marketing — the
   *  amount added to the user's balance is `baseCredits + bonus`). */
  bonus: number;
  /** Gross price the user pays. KRW only for now. */
  priceKrw: number;
}

export const CREDIT_PACKAGES: Record<CreditPackSku, CreditPackage> = {
  pack_100: { sku: 'pack_100', label: '체험 팩', baseCredits: 100, bonus: 0, priceKrw: 4900 },
  pack_250: { sku: 'pack_250', label: '인기 팩', baseCredits: 250, bonus: 50, priceKrw: 9900 },
  pack_600: { sku: 'pack_600', label: '베스트 팩', baseCredits: 600, bonus: 200, priceKrw: 19_900 },
};

/** Convenience: order in which to render packs on the pricing page. */
export const CREDIT_PACKAGE_ORDER: CreditPackSku[] = ['pack_100', 'pack_250', 'pack_600'];

/** Total credits a pack actually grants (base + bonus). */
export function packageTotal(sku: CreditPackSku): number {
  const p = CREDIT_PACKAGES[sku];
  return p.baseCredits + p.bonus;
}

// ── Subscription plans ──────────────────────────────────────────────────

export type SubscriptionPlanId = 'monthly' | 'yearly';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  label: string;
  priceKrw: number;
  /** Days the plan grants per charge. */
  periodDays: number;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  monthly: { id: 'monthly', label: '월 구독', priceKrw: 9_900, periodDays: 30 },
  yearly: { id: 'yearly', label: '연 구독', priceKrw: 99_000, periodDays: 365 },
};

// ── Credit cost per metered feature ─────────────────────────────────────

/** Cost of each premium action in credits. Free + Premium users pay
 *  from their daily quota *first*; when that's exhausted, the quota
 *  helper transparently falls back to deducting from credit balance
 *  using these prices. */
export const CREDIT_COSTS = {
  selfie: 5,
  song: 30,
} as const;
