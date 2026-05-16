import { PLANS, type Tier } from './plans';

export type Feature =
  | 'unlimited_chat'
  | 'image_premium'
  | 'long_memory'
  | 'video_call'
  | 'music_gen'
  | 'no_ads';

export interface GateInput {
  tier: Tier;
  messagesToday: number;
  imagesToday: number;
}

export interface GateResult {
  allowed: boolean;
  reason?: 'rate_limit' | 'tier_required' | 'phase_not_ready';
  paywallTrigger?: Feature | 'message_limit' | 'image_limit';
}

export function canSendMessage(input: GateInput): GateResult {
  const limit = PLANS[input.tier].dailyMessages;
  if (input.messagesToday >= limit) {
    return { allowed: false, reason: 'rate_limit', paywallTrigger: 'message_limit' };
  }
  return { allowed: true };
}

export function canGenerateImage(input: GateInput): GateResult {
  const limit = PLANS[input.tier].dailyImages;
  if (input.imagesToday >= limit) {
    return { allowed: false, reason: 'rate_limit', paywallTrigger: 'image_limit' };
  }
  return { allowed: true };
}

export function canUseFeature(tier: Tier, feature: Feature): GateResult {
  const plan = PLANS[tier];
  const paid = tier === 'premium' || tier === 'admin';
  switch (feature) {
    case 'unlimited_chat':
      return paid ? { allowed: true } : { allowed: false, reason: 'tier_required', paywallTrigger: feature };
    case 'image_premium':
      return paid ? { allowed: true } : { allowed: false, reason: 'tier_required', paywallTrigger: feature };
    case 'long_memory':
      return plan.longMemory ? { allowed: true } : { allowed: false, reason: 'tier_required', paywallTrigger: feature };
    case 'no_ads':
      return plan.adsRemovable ? { allowed: true } : { allowed: false, reason: 'tier_required', paywallTrigger: feature };
    case 'video_call':
      return { allowed: false, reason: 'phase_not_ready', paywallTrigger: feature };
    case 'music_gen':
      return plan.musicGen ? { allowed: true } : { allowed: false, reason: 'tier_required', paywallTrigger: feature };
  }
}
