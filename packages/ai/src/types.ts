import type { CharacterId, Character } from '@wi/core/characters';
import type { ChatStreamEvent, Message } from '@wi/core/chat';
import type { WeatherSnapshot } from '@wi/core/weather';

export type AdapterTier = 'free' | 'premium';

export interface ChatAdapterInput {
  character: Character;
  characterSystemPrompt: string;
  weather: WeatherSnapshot;
  history: Message[];
  user: { nickname: string; locale: 'ko' | 'en' | 'ja'; localTime: string; tier: AdapterTier };
  userMessage: string;
  ids: { userMessageId: string; assistantMessageId: string };
  memorySummary?: string;
}

export interface ChatAdapter {
  readonly id: 'mock' | 'gemini' | 'claude';
  stream(input: ChatAdapterInput): AsyncIterable<ChatStreamEvent>;
}

export interface ImageAdapterInput {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  userPrompt: string;
  intent: 'selfie' | 'scene' | 'outfit';
  /** Absolute URL or relative path of the character's face reference image.
   * Relative paths (e.g. '/reference/sunny.png') are resolved against the
   * app's filesystem first, falling back to HTTP via `requestOrigin`. */
  referenceImageUrl?: string;
  /** The origin of the inbound request (e.g. `https://<deploy>.vercel.app`).
   * Used as a guaranteed-reachable HTTP fallback when the bundled
   * reference file isn't available — passing the host the client just
   * connected to is more reliable than env-var-based `NEXT_PUBLIC_APP_URL`,
   * which is frequently mis-set on Vercel previews. */
  requestOrigin?: string;
}

export interface ImageAdapterResult {
  imageUrl: string;
  prompt: string;
  seed: number;
  model: string;
  width: number;
  height: number;
}

export interface ImageAdapter {
  readonly id: 'mock' | 'openai';
  generate(input: ImageAdapterInput): Promise<ImageAdapterResult>;
}

// ── Music ─────────────────────────────────────────────────────────────────

export interface MusicAdapterInput {
  characterId: CharacterId;
  weather: WeatherSnapshot;
  /** Free-form user prompt; will be merged with style/persona hints by the adapter. */
  userPrompt: string;
  /** Optional tone/genre seed — e.g. "lo-fi piano", "k-pop summer pop". */
  styleHint?: string;
  /** Whether to also generate lyrics ("custom mode"). */
  instrumental?: boolean;
  /** Track title shown to the user. */
  title?: string;
}

export interface MusicAdapterResult {
  /** Identifier returned by the provider — used for client-side polling. */
  taskId: string;
  /** Track status. `done` means audioUrl is ready. */
  status: 'queued' | 'streaming' | 'done' | 'failed';
  audioUrl?: string;
  durationMs?: number;
  title?: string;
  lyrics?: string;
  model: string;
  prompt: string;
}

export interface MusicAdapter {
  readonly id: 'mock' | 'suno';
  /** Kick off generation. May resolve before the track finishes (status='queued') —
   *  client polls `status` via the same adapter or via the API route. */
  generate(input: MusicAdapterInput): Promise<MusicAdapterResult>;
  /** Poll the status of a previously-started task. */
  status(taskId: string): Promise<MusicAdapterResult>;
}
