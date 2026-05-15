import type { CharacterId } from '../characters/types';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageModality = 'text' | 'image' | 'product' | 'song' | 'video';

export interface ProductPayload {
  campaignId: string;
  productId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  ctaUrl: string;
}

export interface ImagePayload {
  imageUrl: string;
  width: number;
  height: number;
}

export type MessageMetadata =
  | { kind: 'text' }
  | ({ kind: 'image' } & ImagePayload)
  | ({ kind: 'product' } & ProductPayload)
  | { kind: 'song'; audioUrl: string; durationMs: number; title?: string }
  | { kind: 'video'; videoUrl: string; durationMs: number; posterUrl?: string };

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  modality: MessageModality;
  content: string | null;
  metadata: MessageMetadata | null;
  weatherSnapshotId?: string;
  model?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  characterId: CharacterId;
  title?: string;
  pinned: boolean;
  lastMessageAt?: string;
  memorySummary?: string;
  createdAt: string;
}

export type ChatIntent =
  | 'greeting'
  | 'weather_question'
  | 'recommend'
  | 'comfort'
  | 'image_request'
  | 'song_request'
  | 'smalltalk'
  | 'refuse';

export type ChatStreamEvent =
  | { type: 'meta'; userMessageId: string; assistantMessageId: string; model: string }
  | { type: 'token'; delta: string }
  | { type: 'tool'; name: string; output: unknown }
  | { type: 'attachment'; payload: MessageMetadata }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'safety' | 'error'; usage?: { input: number; output: number } }
  | { type: 'error'; code: string; message: string };
