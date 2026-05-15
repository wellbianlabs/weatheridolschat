import { createClaudeAdapter } from './adapters/claude';
import { createGeminiAdapter } from './adapters/gemini';
import { MockChatAdapter, MockImageAdapter } from './adapters/mock';
import { createOpenAIImageAdapter } from './adapters/openai-image';
import type { AdapterTier, ChatAdapter, ImageAdapter } from './types';

export interface RouterOptions {
  tier: AdapterTier;
  mockMode?: boolean;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Pick a chat adapter based on tier + key availability.
 * Falls back to Mock if MOCK_MODE=true or required key is missing.
 *
 * Routing:
 *   premium + Anthropic key  → Claude
 *   free    + Gemini key     → Gemini
 *   premium + only Gemini    → Gemini
 *   free    + only Claude    → Claude
 *   no keys                   → Mock
 */
export function pickChatAdapter(opts: RouterOptions): ChatAdapter {
  if (opts.mockMode) return MockChatAdapter;

  const hasClaude = !!opts.anthropicApiKey;
  const hasGemini = !!opts.geminiApiKey;

  if (opts.tier === 'premium') {
    if (hasClaude) return createClaudeAdapter(opts.anthropicApiKey!);
    if (hasGemini) return createGeminiAdapter(opts.geminiApiKey!);
  } else {
    if (hasGemini) return createGeminiAdapter(opts.geminiApiKey!);
    if (hasClaude) return createClaudeAdapter(opts.anthropicApiKey!);
  }

  return MockChatAdapter;
}

export function pickImageAdapter(opts: {
  mockMode?: boolean;
  openaiApiKey?: string;
}): ImageAdapter {
  if (opts.mockMode) return MockImageAdapter;
  if (opts.openaiApiKey) return createOpenAIImageAdapter(opts.openaiApiKey);
  return MockImageAdapter;
}
