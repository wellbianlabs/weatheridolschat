import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// NOTE: Strongly-typed Database generic is wired in M2 after running
// `supabase gen types typescript`. Until then we use the default
// SupabaseClient shape so repositories compile without a generated schema.
export type WiSupabaseClient = SupabaseClient;

export interface ClientConfig {
  url: string;
  anonKey: string;
}

export interface ServerClientConfig extends ClientConfig {
  serviceRoleKey?: string;
}

export function createBrowserSupabase(config: ClientConfig): WiSupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export function createServerSupabase(config: ClientConfig): WiSupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceRoleSupabase(config: ServerClientConfig): WiSupabaseClient {
  if (!config.serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service-role client');
  }
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
