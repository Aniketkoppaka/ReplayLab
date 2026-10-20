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

  it('disables dev token injection in production mode when Supabase is configured and devAuth is not forced', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-key';
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;

    const env = getPublicEnv();
    expect(env.enableDevAuth).toBe(false);
  });

  describe('Fail-closed production development authentication gates', () => {
    it('production + variable missing => disabled when Supabase is configured', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-key';
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(false);
    });

    it('production + variable explicitly false => disabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-key';
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH = 'false';

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(false);
    });

    it('production + invalid variable value => disabled when Supabase is configured', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-key';
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH = 'invalid_val';

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(false);
    });

    it('production + variable explicitly true => enabled (explicit opt-in override)', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-key';
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH = 'true';

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(true);
    });

    it('production build without Supabase configured => enabled for offline demo/E2E by default', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
      });
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(true);
    });

    it('local development with variable missing => enabled by default for offline dev', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        configurable: true,
        writable: true,
      });
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH;

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(true);
    });

    it('local development with intended opt-in => enabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH = 'true';

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(true);
    });

    it('local development with explicit opt-out => disabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        configurable: true,
        writable: true,
      });
      process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH = 'false';

      const env = getPublicEnv();
      expect(env.enableDevAuth).toBe(false);
    });
  });
});
