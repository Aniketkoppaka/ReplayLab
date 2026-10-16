import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from './env';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a singleton browser Supabase client.
 * Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Returns null if Supabase is not configured (e.g. mock/test environments).
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  const env = getPublicEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return null;
  }

  supabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}
