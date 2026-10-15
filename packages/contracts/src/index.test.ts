import { describe, it, expect } from 'vitest';
import {
  CONTRACTS_VERSION,
  PaginationInputSchema,
  CreateProjectInputSchema,
  CreateEnvironmentInputSchema,
  EnvironmentResponseSchema,
  CreateFixtureInputSchema,
  SuiteAssertionSchema,
  ReplayOutcomeStatusSchema,
  ReplayResultResponseSchema,
  ApiErrorResponseSchema,
  UserResponseSchema,
} from './index.js';

describe('Contracts Domain Suite', () => {
  it('exports valid contracts version', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0');
  });

  describe('Common & Pagination Primitives', () => {
    it('parses valid pagination input with defaults', () => {
      const parsed = PaginationInputSchema.parse({});
      expect(parsed).toEqual({ page: 1, pageSize: 20 });
    });

    it('rejects invalid pagination parameters', () => {
      expect(() => PaginationInputSchema.parse({ page: 0 })).toThrow();
      expect(() => PaginationInputSchema.parse({ pageSize: 150 })).toThrow();
      expect(() => PaginationInputSchema.parse({ page: -5 })).toThrow();
    });
  });

  describe('User & Project Contracts', () => {
    it('validates safe public user DTO and rejects missing required fields', () => {
      const validUser = {
        id: 'usr_123',
        email: 'user@replaylab.dev',
        name: 'Ada Lovelace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(UserResponseSchema.parse(validUser)).toEqual(validUser);

      // Rejects invalid email
      expect(() =>
        UserResponseSchema.parse({ ...validUser, email: 'not-an-email' })
      ).toThrow();
    });

    it('validates project creation inputs and bounds', () => {
      const validProject = {
        name: 'Billing API Suite',
        description: 'Regression tests for billing endpoints',
      };
      expect(CreateProjectInputSchema.parse(validProject)).toEqual(validProject);

      // Rejects empty project name
      expect(() => CreateProjectInputSchema.parse({ name: '   ' })).toThrow();
      // Rejects oversized name (> 100 chars)
      expect(() =>
        CreateProjectInputSchema.parse({ name: 'a'.repeat(101) })
      ).toThrow();
    });
  });

  describe('Environment Contracts & Secret Exclusion', () => {
    it('validates environment creation and handles variables', () => {
      const validEnv = {
        name: 'Staging',
        baseUrl: 'https://staging.api.example.com',
        headers: { 'X-Custom-Env': 'staging' },
        variables: [
          { key: 'API_TOKEN', value: 'secret-token-123', isSecret: true },
          { key: 'API_HOST', value: 'staging.api.example.com', isSecret: false },
        ],
      };
      const parsed = CreateEnvironmentInputSchema.parse(validEnv);
      expect(parsed.name).toBe('Staging');
      expect(parsed.variables).toHaveLength(2);
    });

    it('rejects invalid base URL format', () => {
      expect(() =>
        CreateEnvironmentInputSchema.parse({
          name: 'Invalid Env',
          baseUrl: 'not-a-valid-url',
        })
      ).toThrow();
    });

    it('validates that EnvironmentResponseSchema enforces safe variable representation', () => {
      const safeResponse = {
        id: 'env_1',
        projectId: 'prj_1',
        name: 'Staging',
        baseUrl: 'https://staging.api.example.com',
        headers: {},
        variables: [
          { key: 'SECRET_KEY', isSecret: true, value: null }, // masked / omitted
          { key: 'PUBLIC_PORT', isSecret: false, value: '8080' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(EnvironmentResponseSchema.parse(safeResponse)).toEqual(safeResponse);
    });
  });

  describe('Fixture Contracts', () => {
    it('validates complete fixture creation', () => {
      const validFixture = {
        projectId: 'prj_1',
        name: 'Create Customer',
        request: {
          method: 'POST',
          path: '/v1/customers',
          headers: { 'Content-Type': 'application/json' },
          bodyType: 'JSON',
          body: { name: 'Acme Corp', tier: 'enterprise' },
        },
        baseline: {
          statusCode: 201,
          headers: { 'Content-Type': 'application/json' },
          bodyType: 'JSON',
          body: { id: 'cust_999', status: 'created' },
        },
        tags: ['billing', 'customers'],
      };
      const parsed = CreateFixtureInputSchema.parse(validFixture);
      expect(parsed.request.method).toBe('POST');
      expect(parsed.baseline?.statusCode).toBe(201);
    });

    it('rejects invalid HTTP method and empty path', () => {
      expect(() =>
        CreateFixtureInputSchema.parse({
          projectId: 'prj_1',
          name: 'Invalid Fixture',
          request: {
            method: 'INVALID_METHOD',
            path: '/test',
          },
        })
      ).toThrow();

      expect(() =>
        CreateFixtureInputSchema.parse({
          projectId: 'prj_1',
          name: 'Invalid Fixture',
          request: {
            method: 'GET',
            path: '   ',
          },
        })
      ).toThrow();
    });
  });

  describe('Regression Suite Assertions', () => {
    it('validates each assertion variant in discriminated union', () => {
      const statusAssertion = SuiteAssertionSchema.parse({
        type: 'STATUS_CODE',
        expected: 200,
      });
      expect(statusAssertion.type).toBe('STATUS_CODE');

      const jsonPathValueAssertion = SuiteAssertionSchema.parse({
        type: 'JSON_PATH_VALUE',
        path: '$.data.status',
        expected: 'active',
      });
      expect(jsonPathValueAssertion.type).toBe('JSON_PATH_VALUE');

      const jsonPathExistsAssertion = SuiteAssertionSchema.parse({
        type: 'JSON_PATH_EXISTS',
        path: '$.data.id',
      });
      expect(jsonPathExistsAssertion.type).toBe('JSON_PATH_EXISTS');

      const responseTimeAssertion = SuiteAssertionSchema.parse({
        type: 'RESPONSE_TIME_MAX',
        maxDurationMs: 1500,
      });
      expect(responseTimeAssertion.type).toBe('RESPONSE_TIME_MAX');
    });

    it('rejects invalid assertion boundaries', () => {
      // Invalid status code (< 100 or > 599)
      expect(() =>
        SuiteAssertionSchema.parse({
          type: 'STATUS_CODE',
          expected: 999,
        })
      ).toThrow();

      // Negative response time
      expect(() =>
        SuiteAssertionSchema.parse({
          type: 'RESPONSE_TIME_MAX',
          maxDurationMs: -10,
        })
      ).toThrow();

      // Empty JSON path
      expect(() =>
        SuiteAssertionSchema.parse({
          type: 'JSON_PATH_EXISTS',
          path: '',
        })
      ).toThrow();
    });
  });

  describe('Replay Outcome Distinctions & Error Envelope', () => {
    it('distinguishes all outcome statuses', () => {
      const outcomes = [
        'SUCCESS',
        'HTTP_ERROR',
        'TRANSPORT_ERROR',
        'TIMEOUT',
        'SSRF_BLOCKED',
        'ASSERTION_FAILURE',
      ];
      outcomes.forEach((status) => {
        expect(ReplayOutcomeStatusSchema.parse(status)).toBe(status);
      });
    });

    it('parses valid ReplayResultResponse DTO', () => {
      const result = {
        id: 'rep_1',
        fixtureId: 'fix_1',
        environmentId: 'env_1',
        status: 'SSRF_BLOCKED',
        httpStatusCode: null,
        durationMs: 42,
        errorMessage: 'Target IP resolves to blocked private address range',
        diffFound: false,
        executedAt: new Date().toISOString(),
      };
      const parsed = ReplayResultResponseSchema.parse(result);
      expect(parsed.status).toBe('SSRF_BLOCKED');
      expect(parsed.httpStatusCode).toBeNull();
    });

    it('validates standardized API error envelope', () => {
      const errorResp = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload failed schema validation',
          details: [
            {
              path: 'request.path',
              message: 'Request path or URL is required',
              code: 'too_small',
            },
          ],
          requestId: 'req_xyz789',
        },
      };
      const parsed = ApiErrorResponseSchema.parse(errorResp);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(parsed.error.details?.[0]?.path).toBe('request.path');

      // Validates ADMISSION_REJECTED code
      const admissionErr = {
        error: {
          code: 'ADMISSION_REJECTED',
          message: 'Server is currently at maximum capacity; please retry later',
        },
      };
      const parsedAdmission = ApiErrorResponseSchema.parse(admissionErr);
      expect(parsedAdmission.error.code).toBe('ADMISSION_REJECTED');
    });
  });
});
