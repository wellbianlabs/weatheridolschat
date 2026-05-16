import { z } from 'zod';

/**
 * Shared environment schema for all apps and packages.
 * Each app should call `parseServerEnv()` (server) and `parsePublicEnv()` (client).
 */

const stringOrEmpty = z
  .string()
  .optional()
  .transform((v) => v ?? '');

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MOCK_MODE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: stringOrEmpty,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: stringOrEmpty,
  SUPABASE_SERVICE_ROLE_KEY: stringOrEmpty,

  // AI
  ANTHROPIC_API_KEY: stringOrEmpty,
  GEMINI_API_KEY: stringOrEmpty,
  OPENAI_API_KEY: stringOrEmpty,

  // Weather. KW_API_KEY is the new name (KWeather B2B gateway); we keep
  // KWEATHER_API_KEY in the schema for back-compat — route handlers read
  // KW_API_KEY first and fall through to the legacy name automatically.
  KW_API_KEY: stringOrEmpty,
  KWEATHER_API_KEY: stringOrEmpty,
  OPENWEATHERMAP_API_KEY: stringOrEmpty,

  // Affiliate
  NASMEDIA_API_KEY: stringOrEmpty,

  // App
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: stringOrEmpty,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: stringOrEmpty,
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export const MobilePublicEnvSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: z.string().default('http://localhost:3000'),
  EXPO_PUBLIC_SUPABASE_URL: stringOrEmpty,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: stringOrEmpty,
});

export type MobilePublicEnv = z.infer<typeof MobilePublicEnvSchema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return ServerEnvSchema.parse(source);
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return PublicEnvSchema.parse(source);
}

export function parseMobileEnv(source: Record<string, string | undefined>): MobilePublicEnv {
  return MobilePublicEnvSchema.parse(source);
}
