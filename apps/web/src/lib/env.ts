import { z } from 'zod';

/**
 * Public client-side configuration schema.
 * Strictly limited to non-sensitive identifiers and URLs.
 * Database connection strings, service-role keys, and symmetric JWT secrets
 * must NEVER be exposed here.
 */
export const PublicEnvSchema = z.object({
  supabaseUrl: z.string().url().optional(),
  supabaseAnonKey: z.string().min(1).optional(),
  apiUrl: z.string().url().default('http://localhost:3001/api/v1'),
  enableDevAuth: z.boolean().default(false),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export function getPublicEnv(): PublicEnv {
  // Direct variable references so Next.js build-time compiler inlines them into the client bundle
  const devAuthEnv = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;
  const isProduction = process.env.NODE_ENV === 'production';
  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let enableDevAuth = false;
  if (isProduction) {
    // In production, dev auth is FAIL-CLOSED:
    // If Supabase is configured, dev auth is always disabled unless explicitly forced via NEXT_PUBLIC_ENABLE_DEV_AUTH === 'true'.
    // If NEXT_PUBLIC_ENABLE_DEV_AUTH is missing, invalid, or 'false', it is strictly disabled (false).
    if (hasSupabaseConfig) {
      enableDevAuth = devAuthEnv === 'true';
    } else {
      // In offline/demo production builds without Supabase, allow dev auth unless explicitly set to 'false'
      enableDevAuth = devAuthEnv !== 'false';
    }
  } else {
    // In development and test environments, dev auth is enabled by default unless explicitly disabled
    enableDevAuth = devAuthEnv !== 'false';
  }

  return PublicEnvSchema.parse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
    enableDevAuth,
  });
}
