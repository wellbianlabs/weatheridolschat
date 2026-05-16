/**
 * Phase 2 introduces two extra tiers on top of the existing free/premium:
 *
 *   anon    — never signed in. Soft limits enforced client-side only;
 *             server treats these requests as "best effort" without
 *             persisting a daily counter (we have no user_id to key
 *             a row to). UI prompts sign-up once these are hit.
 *   admin   — admin@wellbianlabs.io (env-configurable). Every numeric
 *             cap is Infinity; the quota helper short-circuits before
 *             ever touching the usage_daily table.
 */
export type Tier = 'anon' | 'free' | 'premium' | 'admin';

export interface PlanLimits {
  /** Chat turns per KST day. Infinity = no cap. */
  dailyMessages: number;
  /** Selfie generations per KST day (OpenAI gpt-image-1). */
  dailyImages: number;
  /** Weather-song generations per KST day (Suno). */
  dailySongs: number;
  /** Characters of TTS audio synthesised per KST day. */
  dailyTtsChars: number;
  /** Image-attached vision turns per KST day. */
  dailyVision: number;
  longMemory: boolean;
  adsRemovable: boolean;
  videoCall: boolean;
  musicGen: boolean;
}

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<Tier, PlanLimits> = {
  // Anonymous visitors get a small taste — enough to feel the product,
  // not enough to burn meaningful API cost without signing up.
  anon: {
    dailyMessages: 5,
    dailyImages: 0,
    dailySongs: 0,
    dailyTtsChars: 1500,
    dailyVision: 1,
    longMemory: false,
    adsRemovable: false,
    videoCall: false,
    musicGen: false,
  },
  // Signed-in free users — ad-supported daily allowance.
  free: {
    dailyMessages: 30,
    dailyImages: 1,
    dailySongs: 0,
    dailyTtsChars: 20_000,
    dailyVision: 3,
    longMemory: false,
    adsRemovable: false,
    videoCall: false,
    musicGen: false,
  },
  // ₩9,900/월 구독 — heavy daily use without thinking about it.
  premium: {
    dailyMessages: 200,
    dailyImages: 20,
    dailySongs: 3,
    dailyTtsChars: INF,
    dailyVision: 50,
    longMemory: true,
    adsRemovable: true,
    videoCall: true,
    musicGen: true,
  },
  // Internal / QA / founder account — never blocked by anything.
  admin: {
    dailyMessages: INF,
    dailyImages: INF,
    dailySongs: INF,
    dailyTtsChars: INF,
    dailyVision: INF,
    longMemory: true,
    adsRemovable: true,
    videoCall: true,
    musicGen: true,
  },
};

export const PRICING = {
  KR: { monthly: 9900, yearly: 99000, currency: 'KRW' as const },
  GLOBAL: { monthly: 7.99, yearly: 79.9, currency: 'USD' as const },
};
