import type { CharacterId, Character } from '@wi/core/characters';
import type { ChatStreamEvent, Message } from '@wi/core/chat';
import type { KstContext } from '@wi/core/time';
import type { WeatherSnapshot } from '@wi/core/weather';

export type AdapterTier = 'free' | 'premium';

export interface ChatAdapterInput {
  character: Character;
  characterSystemPrompt: string;
  weather: WeatherSnapshot;
  history: Message[];
  user: {
    nickname: string;
    locale: 'ko' | 'en' | 'ja';
    /** Human-readable KST display, e.g. "2026-05-16 (토) 13:25 KST". */
    localTime: string;
    /**
     * Optional rich KST bundle — time-of-day bucket, weekend flag,
     * season. Passed by the chat + scheduled-greeting routes so the
     * [Now Context] prompt block can render categorical anchors the
     * LLM uses to fit tone + detail to this exact moment. Adapters
     * that don't have it (older callers / mock fixtures) still work
     * via the plain `localTime` string.
     */
    localTimeContext?: KstContext;
    tier: AdapterTier;
  };
  userMessage: string;
  ids: { userMessageId: string; assistantMessageId: string };
  memorySummary?: string;
  /**
   * Optional image attached to the user's turn. Used for the
   * "send a photo" flow — the chat client captures via camera or
   * file input, base64-encodes the bytes, and ships them through
   * /api/chat. Real adapters (Claude, Gemini) pass it as a vision
   * content block; the Mock adapter just acknowledges that an
   * image was attached.
   */
  userImage?: {
    /** "image/jpeg" | "image/png" | "image/webp" */
    mediaType: string;
    /** Raw base64 (no `data:` prefix). */
    base64: string;
  };
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
  /** True = instrumental track, no vocal lyrics. */
  instrumental?: boolean;
  /** Track title shown to the user. */
  title?: string;
  /**
   * Pre-generated lyrics. When provided, the adapter uses Suno's custom
   * mode (singing the supplied text). When omitted, the adapter falls
   * back to inspiration mode (Suno writes its own lyrics from a brief).
   *
   * For the 날씨송 flow we generate these via Gemini first so the
   * client can render the lyrics card during the 30–60s music wait.
   */
  lyrics?: string;
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
