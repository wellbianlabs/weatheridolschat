export type Tier = 'free' | 'premium';

export interface PlanLimits {
  dailyMessages: number;
  dailyImages: number;
  longMemory: boolean;
  adsRemovable: boolean;
  videoCall: boolean;
  musicGen: boolean;
}

export const PLANS: Record<Tier, PlanLimits> = {
  free: {
    dailyMessages: 30,
    dailyImages: 3,
    longMemory: false,
    adsRemovable: false,
    videoCall: false,
    musicGen: false,
  },
  premium: {
    dailyMessages: 1000,
    dailyImages: 50,
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
