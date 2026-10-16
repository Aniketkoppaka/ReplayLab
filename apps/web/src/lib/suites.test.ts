import { describe, it, expect } from 'vitest';
import {
  CreateSuiteInputSchema,
  TriggerSuiteExecutionInputSchema,
  SuiteExecutionSummaryResponseSchema,
  DifferentialMaskRuleSchema,
} from '@replaylab/contracts';

describe('Phase 5.4 Regression Suite Contracts & Client Form Validation', () => {
  describe('DifferentialMaskRuleSchema', () => {
    it('accepts valid IGNORE and TYPE_MATCH mask rules', () => {
      const ignoreRule = {
        path: '$.data.timestamp',
        action: 'IGNORE',
      };
      expect(DifferentialMaskRuleSchema.safeParse(ignoreRule).success).toBe(true);

      const typeMatchRule = {
        path: '$.data.id',
        action: 'TYPE_MATCH',
      };
      expect(DifferentialMaskRuleSchema.safeParse(typeMatchRule).success).toBe(true);
    });

    it('rejects invalid action types', () => {
      const invalid = {
        path: '$.data.id',
        action: 'INVALID_ACTION',
      };
      expect(DifferentialMaskRuleSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects empty paths', () => {
      const invalid = {
        path: '',
        action: 'IGNORE',
      };
      expect(DifferentialMaskRuleSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('CreateSuiteInputSchema & Ordering Validation', () => {
    it('validates a complete suite with ordered fixtures and mask rules', () => {
      const suiteInput = {
        name: 'Checkout Flow Regression Suite',
        description: 'Verifies cart creation, item addition, and checkout responses',
        items: [
          {
            fixtureId: 'fix_123456789012345678901234',
            order: 0,
            assertions: [
              { type: 'STATUS_CODE', expected: 200 },
              { type: 'RESPONSE_TIME_MAX', maxDurationMs: 1500 },
            ],
            maskRules: [
              { path: '$.cart.updatedAt', action: 'IGNORE' },
            ],
          },
          {
            fixtureId: 'fix_234567890123456789012345',
            order: 1,
            assertions: [],
            maskRules: [],
          },
        ],
      };

      const result = CreateSuiteInputSchema.safeParse(suiteInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.items[0]?.order).toBe(0);
        expect(result.data.items[1]?.order).toBe(1);
      }
    });

    it('rejects suite with empty name', () => {
      const invalid = {
        name: '',
        items: [],
      };
      expect(CreateSuiteInputSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('TriggerSuiteExecutionInputSchema', () => {
    it('validates suite trigger input with environment ID and opt-in capture', () => {
      const triggerInput = {
        suiteId: 'ste_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        captureResponseBody: true,
      };

      const result = TriggerSuiteExecutionInputSchema.safeParse(triggerInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.captureResponseBody).toBe(true);
      }
    });

    it('defaults captureResponseBody to false when omitted', () => {
      const triggerInput = {
        environmentId: 'env_123456789012345678901234',
      };

      const result = TriggerSuiteExecutionInputSchema.safeParse(triggerInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.captureResponseBody).toBe(false);
      }
    });
  });

  describe('SuiteExecutionSummaryResponseSchema', () => {
    it('validates a complete suite execution summary with child results', () => {
      const summaryPayload = {
        id: 'sr_123456789012345678901234',
        suiteId: 'ste_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        status: 'SUCCESS',
        totalItems: 2,
        passedItems: 2,
        failedItems: 0,
        durationMs: 142,
        results: [
          {
            id: 'run_123456789012345678901234',
            fixtureId: 'fix_123456789012345678901234',
            environmentId: 'env_123456789012345678901234',
            baselineId: 'bsl_123456789012345678901234',
            status: 'SUCCESS',
            httpStatusCode: 200,
            headers: {},
            bodyType: 'NONE',
            durationMs: 70,
            diffFound: false,
            diffDetails: null,
            executedAt: new Date().toISOString(),
          },
          {
            id: 'run_234567890123456789012345',
            fixtureId: 'fix_234567890123456789012345',
            environmentId: 'env_123456789012345678901234',
            baselineId: null,
            status: 'SUCCESS',
            httpStatusCode: 201,
            headers: {},
            bodyType: 'NONE',
            durationMs: 72,
            diffFound: false,
            diffDetails: null,
            executedAt: new Date().toISOString(),
          },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const result = SuiteExecutionSummaryResponseSchema.safeParse(summaryPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('SUCCESS');
        expect(result.data.passedItems).toBe(2);
        expect(result.data.results).toHaveLength(2);
      }
    });

    it('accurately parses partial failure status and counts', () => {
      const failedSummary = {
        id: 'sr_123456789012345678901234',
        suiteId: 'ste_123456789012345678901234',
        environmentId: 'env_123456789012345678901234',
        status: 'ASSERTION_FAILURE',
        totalItems: 2,
        passedItems: 1,
        failedItems: 1,
        durationMs: 250,
        results: [
          {
            id: 'run_123456789012345678901234',
            fixtureId: 'fix_123456789012345678901234',
            environmentId: 'env_123456789012345678901234',
            baselineId: 'bsl_123456789012345678901234',
            status: 'SUCCESS',
            httpStatusCode: 200,
            headers: {},
            bodyType: 'NONE',
            durationMs: 50,
            diffFound: false,
            executedAt: new Date().toISOString(),
          },
          {
            id: 'run_234567890123456789012345',
            fixtureId: 'fix_234567890123456789012345',
            environmentId: 'env_123456789012345678901234',
            baselineId: 'bsl_123456789012345678901234',
            status: 'ASSERTION_FAILURE',
            httpStatusCode: 500,
            headers: {},
            bodyType: 'NONE',
            durationMs: 200,
            diffFound: true,
            diffDetails: { match: false, differences: [] },
            executedAt: new Date().toISOString(),
          },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const result = SuiteExecutionSummaryResponseSchema.safeParse(failedSummary);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('ASSERTION_FAILURE');
        expect(result.data.failedItems).toBe(1);
      }
    });
  });
});
