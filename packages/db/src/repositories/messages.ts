import type { WiSupabaseClient } from '../client';
import type { MessageRow } from '../types.gen';

export interface CreateMessageInput {
  sessionId: string;
  role: MessageRow['role'];
  modality: MessageRow['modality'];
  content?: string | null;
  metadata?: MessageRow['metadata'];
  weatherSnapshotId?: string | null;
  model?: string | null;
  tokenUsage?: MessageRow['token_usage'];
}

export async function listMessages(
  client: WiSupabaseClient,
  sessionId: string,
  limit = 30,
  cursor?: string,
): Promise<MessageRow[]> {
  let q = client
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt('created_at', cursor);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reverse(); // oldest -> newest for UI
}

export async function insertMessage(
  client: WiSupabaseClient,
  input: CreateMessageInput,
): Promise<MessageRow> {
  const { data, error } = await client
    .from('messages')
    .insert({
      session_id: input.sessionId,
      role: input.role,
      modality: input.modality,
      content: input.content ?? null,
      metadata: input.metadata ?? null,
      weather_snapshot_id: input.weatherSnapshotId ?? null,
      model: input.model ?? null,
      token_usage: input.tokenUsage ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
