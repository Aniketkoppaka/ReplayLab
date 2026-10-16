import { describe, it, expect } from 'vitest';
import {
  TriggerReplayInputSchema,
  ReplayResultResponseSchema,
  ReplayOutcomeStatusSchema,
} from '@replaylab/contracts';

describe('Phase 5.3 Interactive Replay & Visual Diff Viewer Contracts', () => {
  describe('TriggerReplayInputSchema', () => {
    it('validates a valid replay request with fixtureId and environmentId', () => {
      const input = {
        fixtureId: 'fix_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        captureResponseBody: true,
      };

      const result = TriggerReplayInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.captureResponseBody).toBe(true);
      }
    });

    it('defaults captureResponseBody to false when omitted for secret safety', () => {
      const input = {
        fixtureId: 'fix_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
      };

      const result = TriggerReplayInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.captureResponseBody).toBe(false);
      }
    });

    it('rejects invalid resource IDs', () => {
      const inputEmpty = {
        fixtureId: '',
        environmentId: 'env_123456789012345678901234',
      };
      expect(TriggerReplayInputSchema.safeParse(inputEmpty).success).toBe(false);

      const inputTooLong = {
        fixtureId: 'a'.repeat(65),
        environmentId: 'env_123456789012345678901234',
      };
      expect(TriggerReplayInputSchema.safeParse(inputTooLong).success).toBe(false);
    });
  });

  describe('ReplayOutcomeStatusSchema', () => {
    it('accurately distinguishes true HTTP errors from transport and security blocks', () => {
      const statuses = [
        'SUCCESS',
        'HTTP_ERROR',
        'TRANSPORT_ERROR',
        'TIMEOUT',
        'SSRF_BLOCKED',
        'ASSERTION_FAILURE',
      ];

      for (const status of statuses) {
        const result = ReplayOutcomeStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('rejects non-standard status strings', () => {
      const invalidStatuses = ['PASSED', 'FAILED', 'PENDING', 'RUNNING'];
      for (const invalid of invalidStatuses) {
        const result = ReplayOutcomeStatusSchema.safeParse(invalid);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('ReplayResultResponseSchema', () => {
    it('validates a successful replay result with differential matching', () => {
      const resultData = {
        id: 'run_123456789012345678901234',
        fixtureId: 'fix_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        baselineId: 'bsl_123456789012345678901234',
        status: 'SUCCESS',
        httpStatusCode: 200,
        headers: { 'content-type': 'application/json' },
        bodyType: 'JSON',
        body: { status: 'healthy' },
        durationMs: 42,
        diffFound: false,
        diffDetails: { match: true, differences: [] },
        executedAt: new Date().toISOString(),
      };

      const result = ReplayResultResponseSchema.safeParse(resultData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('SUCCESS');
        expect(result.data.diffFound).toBe(false);
      }
    });

    it('validates an SSRF blocked execution without HTTP status code', () => {
      const ssrfData = {
        id: 'run_123456789012345678901234',
        fixtureId: 'fix_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        baselineId: null,
        status: 'SSRF_BLOCKED',
        httpStatusCode: null,
        headers: {},
        bodyType: 'NONE',
        durationMs: 4,
        errorMessage: 'Destination resolved to private IP 10.0.0.1 (SSRF blocked)',
        diffFound: false,
        diffDetails: null,
        executedAt: new Date().toISOString(),
      };

      const result = ReplayResultResponseSchema.safeParse(ssrfData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('SSRF_BLOCKED');
        expect(result.data.httpStatusCode).toBeNull();
      }
    });

    it('validates structured diff details for baseline assertion discrepancies', () => {
      const diffData = {
        id: 'run_123456789012345678901234',
        fixtureId: 'fix_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        baselineId: 'bsl_123456789012345678901234',
        status: 'ASSERTION_FAILURE',
        httpStatusCode: 200,
        headers: { 'content-type': 'application/json' },
        bodyType: 'JSON',
        body: null, // body omitted by default
        durationMs: 85,
        diffFound: true,
        diffDetails: {
          match: false,
          differences: [
            {
              path: '$.data.role',
              type: 'CHANGED',
              expected: 'ADMIN',
              actual: 'MEMBER',
            },
            {
              path: '$.data.permissions',
              type: 'ADDED',
              actual: ['read', 'write'],
            },
          ],
        },
        executedAt: new Date().toISOString(),
      };

      const result = ReplayResultResponseSchema.safeParse(diffData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('ASSERTION_FAILURE');
        expect(result.data.diffFound).toBe(true);
      }
    });
  });
});
