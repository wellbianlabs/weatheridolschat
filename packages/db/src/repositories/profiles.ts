import type { WiSupabaseClient } from '../client';
import type { ProfileRow } from '../types.gen';

export async function getProfile(client: WiSupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  client: WiSupabaseClient,
  userId: string,
  patch: Partial<ProfileRow>,
): Promise<ProfileRow> {
  const { data, error } = await client
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
