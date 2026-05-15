/**
 * Stage 1 of the 3-tier safeguard pipeline.
 * Cheap regex/keyword pre-filter that runs before any LLM call.
 *
 * Levels:
 *   L1 — warn (allow but log)
 *   L2 — block (return graceful refusal, do not call LLM)
 *   L3 — crisis (trigger hotline message)
 */

export type BlockLevel = 'L1' | 'L2' | 'L3';

export interface BlockRule {
  id: string;
  level: BlockLevel;
  pattern: RegExp;
  reason: string;
}

export const BLOCKLIST: BlockRule[] = [
  // L3 — Self-harm / suicide signals (handled with hotline response).
  { id: 'crisis_self_harm_ko', level: 'L3', pattern: /(자살|자해|죽고\s*싶|뛰어내리|목매|끝내고\s*싶)/i, reason: 'self_harm_signal' },
  { id: 'crisis_self_harm_en', level: 'L3', pattern: /(suicide|kill myself|end it all|self harm)/i, reason: 'self_harm_signal' },

  // L2 — Sexual / NSFW.
  { id: 'sexual_nsfw_ko', level: 'L2', pattern: /(섹스|음란|야한\s*사진|노출|벗어줘)/i, reason: 'sexual_content' },
  { id: 'sexual_nsfw_en', level: 'L2', pattern: /(nude|nsfw|sex|porn|undress)/i, reason: 'sexual_content' },

  // L2 — Hate / violence.
  { id: 'hate_violence', level: 'L2', pattern: /(죽여|폭행|혐오|차별)/i, reason: 'hate_violence' },

  // L2 — Prompt injection telltales.
  { id: 'prompt_inject', level: 'L2', pattern: /(이전\s*지시\s*무시|ignore\s+previous|system\s+prompt|you\s+are\s+now)/i, reason: 'prompt_injection' },
];

export interface BlocklistHit {
  ruleId: string;
  level: BlockLevel;
  reason: string;
}

export function scanBlocklist(text: string): BlocklistHit | null {
  for (const rule of BLOCKLIST) {
    if (rule.pattern.test(text)) {
      return { ruleId: rule.id, level: rule.level, reason: rule.reason };
    }
  }
  return null;
}
