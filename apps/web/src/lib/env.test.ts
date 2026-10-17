import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PublicEnvSchema, getPublicEnv } from './env';

describe('Public Environment Schema & Secrets Protection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses valid public environment configuration', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ey-anon-token';
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001/api/v1';

    const env = getPublicEnv();
    expect(env.supabaseUrl).toBe('https://abcdefghijkl.supabase.co');
    expect(env.supabaseAnonKey).toBe('ey-anon-token');
    expect(env.apiUrl).toBe('http://localhost:3001/api/v1');
  });

  it('defaults apiUrl to http://localhost:3001/api/v1 when omitted', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const env = getPublicEnv();
    expect(env.apiUrl).toBe('http://localhost:3001/api/v1');
  });

  it('strictly excludes server secrets from public schema properties', () => {
    // Assert that the public schema only has the permitted public keys
    const shapeKeys = Object.keys(PublicEnvSchema.shape);
    expect(shapeKeys).toEqual(['supabaseUrl', 'supabaseAnonKey', 'apiUrl', 'enableDevAuth']);

    // Critical security assertions: ensure dangerous variables are NOT in PublicEnvSchema
    expect(shapeKeys).not.toContain('DATABASE_URL');
    expect(shapeKeys).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(shapeKeys).not.toContain('APP_ENCRYPTION_KEY');
    expect(shapeKeys).not.toContain('SUPABASE_JWT_SECRET');
  });
});
