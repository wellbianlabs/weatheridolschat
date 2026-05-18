import { createClaudeAdapter } from './adapters/claude';
import { createGeminiAdapter } from './adapters/gemini';
import { MockChatAdapter, MockImageAdapter, MockMusicAdapter } from './adapters/mock';
import { createOpenAIImageAdapter } from './adapters/openai-image';
import { createSunoAdapter } from './adapters/suno';
import type { AdapterTier, ChatAdapter, ImageAdapter, MusicAdapter } from './types';

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

/**
 * Choose a fallback chat adapter for when the primary one fails
 * before producing any real model output. Used by /api/chat to do
 * silent provider switching — if Anthropic is rate-limited or
 * down, retry the same turn on Gemini and the user never sees the
 * outage.
 *
 * Returns null when:
 *   - mockMode is on (mock can't fail in a way fallback would help)
 *   - the primary IS already the mock adapter
 *   - the other provider's key is not configured (e.g. only Claude
 *     key set — no Gemini fallback to switch to)
 *
 * Asymmetry to note: Claude → Gemini fallback is a quality drop
 * (premium model → free-tier model), but it beats the user seeing a
 * raw "Claude server unstable" error. We accept the quality drop
 * because availability > quality for a single failed turn. Gemini →
 * Claude fallback (Free user hits Gemini outage → Claude rescues)
 * happens to be a quality UP, which is a nice side benefit.
 */
export function pickFallbackAdapter(opts: {
  primaryId: 'claude' | 'gemini' | 'mock';
  mockMode?: boolean;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}): ChatAdapter | null {
  if (opts.mockMode) return null;
  if (opts.primaryId === 'mock') return null;
  if (opts.primaryId === 'claude' && opts.geminiApiKey) {
    return createGeminiAdapter(opts.geminiApiKey);
  }
  if (opts.primaryId === 'gemini' && opts.anthropicApiKey) {
    return createClaudeAdapter(opts.anthropicApiKey);
  }
  return null;
}

export function pickImageAdapter(opts: {
  mockMode?: boolean;
  openaiApiKey?: string;
}): ImageAdapter {
  if (opts.mockMode) return MockImageAdapter;
  if (opts.openaiApiKey) return createOpenAIImageAdapter(opts.openaiApiKey);
  return MockImageAdapter;
}

export function pickMusicAdapter(opts: {
  mockMode?: boolean;
  sunoApiKey?: string;
  sunoBaseUrl?: string;
}): MusicAdapter {
  if (opts.mockMode) return MockMusicAdapter;
  if (opts.sunoApiKey) {
    return createSunoAdapter({ apiKey: opts.sunoApiKey, baseUrl: opts.sunoBaseUrl });
  }
  return MockMusicAdapter;
}
