import { describe, it, expect } from 'vitest';
import {
  CreateEnvironmentInputSchema,
  CreateFixtureInputSchema,
  UpdateBaselineInputSchema,
} from '@replaylab/contracts';

describe('Phase 5.2 UI Schemas & Client-side Validation', () => {
  describe('Environment Input Validation', () => {
    it('accepts valid environment input with plaintext and secret variables', () => {
      const valid = {
        name: 'Production Mirror',
        baseUrl: 'https://api.replaylab.internal:8443',
        headers: {
          'X-Api-Key': 'pk_live_12345',
          'Accept': 'application/json',
        },
        variables: [
          { key: 'API_HOST', value: 'api.replaylab.internal', isSecret: false },
          { key: 'SIGNING_SECRET', value: 'super-secret-key-12345678', isSecret: true },
        ],
      };

      const result = CreateEnvironmentInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Production Mirror');
        expect(result.data.variables).toHaveLength(2);
        expect(result.data.variables[1]?.isSecret).toBe(true);
      }
    });

    it('rejects invalid URL for baseUrl', () => {
      const invalid = {
        name: 'Bad URL Env',
        baseUrl: 'not-a-valid-url',
        variables: [],
      };

      const result = CreateEnvironmentInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toContain('baseUrl');
      }
    });

    it('rejects non-identifier variable keys', () => {
      const invalid = {
        name: 'Invalid Var Key',
        baseUrl: 'https://example.com',
        variables: [
          { key: 'invalid-key-with-dashes', value: 'test', isSecret: false },
        ],
      };

      const result = CreateEnvironmentInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('Key must be a valid identifier');
      }
    });
  });

  describe('Fixture Input Validation & JSON Body Parsing', () => {
    it('validates fixture creation with relative path, method, and structured JSON body', () => {
      const valid = {
        name: 'Get User By ID',
        description: 'Smoke test for user endpoint',
        tags: ['users', 'smoke'],
        request: {
          method: 'GET',
          path: '/v1/users/usr_123',
          headers: {
            'X-Request-Source': 'regression-runner',
          },
          bodyType: 'NONE',
        },
      };

      const result = CreateFixtureInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.request.method).toBe('GET');
        expect(result.data.tags).toEqual(['users', 'smoke']);
      }
    });

    it('validates fixture with POST JSON payload', () => {
      const valid = {
        name: 'Create User',
        request: {
          method: 'POST',
          path: '/v1/users',
          headers: {
            'Content-Type': 'application/json',
          },
          bodyType: 'JSON',
          body: {
            email: 'test@example.com',
            role: 'MEMBER',
          },
        },
      };

      const result = CreateFixtureInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.request.body).toEqual({
          email: 'test@example.com',
          role: 'MEMBER',
        });
      }
    });

    it('rejects fixture missing path', () => {
      const invalid = {
        name: 'Missing Path',
        request: {
          method: 'GET',
          path: '',
        },
      };

      const result = CreateFixtureInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Baseline Update Input Validation', () => {
    it('validates explicit baseline update schema with status code and body', () => {
      const baselinePayload = {
        baseline: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          bodyType: 'JSON',
          body: {
            id: 'usr_123',
            status: 'active',
          },
        },
      };

      const result = UpdateBaselineInputSchema.safeParse(baselinePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseline.statusCode).toBe(200);
      }
    });

    it('rejects invalid HTTP status code in baseline', () => {
      const invalid = {
        baseline: {
          statusCode: 999, // Invalid HTTP status code
          bodyType: 'NONE',
        },
      };

      const result = UpdateBaselineInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
