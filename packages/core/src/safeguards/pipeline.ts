import type { CharacterId } from '../characters/types';

import { scanBlocklist, type BlocklistHit } from './blocklist';
import { CRISIS_COPY, pickRefusal } from './refusal';

export type SafeguardOutcome =
  | { kind: 'allow' }
  | { kind: 'refuse'; replyText: string; reason: string }
  | { kind: 'crisis'; replyText: string; reason: string };

export interface SafeguardInput {
  text: string;
  characterId: CharacterId;
  userNickname?: string;
}

/**
 * Stage 1 of the safeguard pipeline. Synchronous regex-only check, no network.
 * Stages 2 (Moderation API) and 3 (post-generation regex) live in packages/ai.
 */
export function runInputSafeguard(input: SafeguardInput): SafeguardOutcome {
  const hit: BlocklistHit | null = scanBlocklist(input.text);
  if (!hit) return { kind: 'allow' };

  if (hit.level === 'L3') {
    return {
      kind: 'crisis',
      replyText: CRISIS_COPY(input.userNickname),
      reason: hit.reason,
    };
  }
  if (hit.level === 'L2') {
    return {
      kind: 'refuse',
      replyText: pickRefusal(input.characterId),
      reason: hit.reason,
    };
  }
  // L1 — allow but caller may log
  return { kind: 'allow' };
}

const META_LEAK_PATTERN =
  /(system\s*prompt|당신은\s*.*AI|시스템\s*메시지|모델은\s*.*입니다|ignore\s+previous)/i;

/**
 * Stage 3 — scrub assistant outputs that leak system/meta information.
 */
export function scrubAssistantOutput(text: string, characterId: CharacterId): string {
  if (META_LEAK_PATTERN.test(text)) {
    return pickRefusal(characterId);
  }
  return text;
}
