import type { WiSupabaseClient } from '../client';
import type { SessionRow } from '../types.gen';

export async function listSessions(client: WiSupabaseClient): Promise<SessionRow[]> {
  const { data, error } = await client
    .from('sessions')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function findOrCreateSession(
  client: WiSupabaseClient,
  userId: string,
  characterId: string,
): Promise<SessionRow> {
  const { data: existing, error: findErr } = await client
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  const { data, error } = await client
    .from('sessions')
    .insert({ user_id: userId, character_id: characterId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function touchSession(
  client: WiSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await client
    .from('sessions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}
