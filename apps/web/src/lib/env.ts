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
  enableDevAuth: z.boolean().default(true),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export function getPublicEnv(): PublicEnv {
  // Direct variable references so Next.js build-time compiler inlines them into the client bundle
  const devAuthEnv = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;
  const isDevOrTest = process.env.NODE_ENV !== 'production' || devAuthEnv === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL;

  return PublicEnvSchema.parse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
    enableDevAuth: devAuthEnv !== undefined ? devAuthEnv === 'true' : isDevOrTest,
  });
}
