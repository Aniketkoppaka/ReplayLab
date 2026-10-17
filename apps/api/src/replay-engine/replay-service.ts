import { executeSafeRequest, type DispatchResponse, type DispatchOptions } from './safe-dispatcher.js';
import { compareJsonPayloads, type MaskRule, type DiffResult } from './comparison-engine.js';
import type { DnsLookupFn } from './target-validator.js';
import { isSensitiveKey, sanitizeCapturedBody, sanitizeDiffResult } from './redaction.js';
import {
  globalReplayLimiter,
  ConcurrencyAdmissionController,
} from './admission-controller.js';

export interface FixtureExecutionInput {
  method: string;
  path: string;
  queryParams?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
  bodyType?: 'NONE' | 'JSON' | 'TEXT';
}

export interface BaselineSnapshotInput {
  id?: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  bodyType?: 'NONE' | 'JSON' | 'TEXT';
}

export interface ReplayExecutionParams {
  fixtureId: string;
  projectId: string;
  environmentId: string;
  environmentBaseUrl: string;
  environmentHeaders?: Record<string, string>;
  request: FixtureExecutionInput;
  baseline?: BaselineSnapshotInput;
  maskRules?: MaskRule[];
  dnsLookup?: DnsLookupFn;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  /** Concurrency limiter to use. Defaults to globalReplayLimiter */
  limiter?: ConcurrencyAdmissionController;
  /** Optional cancellation signal */
  signal?: AbortSignal;
  /** Optional custom dispatcher function for testing */
  dispatchFn?: (options: DispatchOptions) => Promise<DispatchResponse>;
  /**
   * Safe response capture policy:
   * Defaults to false (storing null body in result to prevent secret/data leaks).
   * When true, captures response body up to maxResponseBytes.
   */
  captureResponseBody?: boolean;
}

export type ReplayOutcome =
  | 'SUCCESS'
  | 'HTTP_ERROR'
  | 'TRANSPORT_ERROR'
  | 'TIMEOUT'
  | 'SSRF_BLOCKED'
  | 'ASSERTION_FAILURE';

export interface ReplayExecutionResult {
  fixtureId: string;
  projectId: string;
  environmentId: string;
  baselineId?: string;
  status: ReplayOutcome;
  httpStatusCode: number | null;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  errorMessage: string | null;
  diffFound: boolean;
  diffDetails: DiffResult | null;
}

const SENSITIVE_HEADER_KEYS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'api-key',
  'apikey',
  'token',
  'secret',
];

/**
 * Strips sensitive headers before returning result or writing to logs.
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.includes(key.toLowerCase()) || isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Primary service function to execute a stored fixture against an environment,
 * run differential baseline comparison, and produce a normalized ReplayResult.
 * Guaranteed bounded execution via ConcurrencyAdmissionController.
 */
export async function executeFixtureReplay(
  params: ReplayExecutionParams
): Promise<ReplayExecutionResult> {
  const limiter = params.limiter ?? globalReplayLimiter;

  return limiter.run(async () => {
    const startTime = Date.now();

    // Combine environment headers with fixture headers (fixture headers take precedence)
    const combinedHeaders: Record<string, string> = {
      ...(params.environmentHeaders ?? {}),
      ...(params.request.headers ?? {}),
    };

    const dispatchOptions: DispatchOptions = {
      method: params.request.method,
      baseUrl: params.environmentBaseUrl,
      path: params.request.path,
      queryParams: params.request.queryParams,
      headers: combinedHeaders,
      body: params.request.body,
      bodyType: params.request.bodyType,
      connectTimeoutMs: params.connectTimeoutMs ?? 3000,
      totalTimeoutMs: params.totalTimeoutMs ?? 15000,
      dnsLookup: params.dnsLookup,
      maxRedirects: 0, // Redirects disabled by default per security requirements
    };

    try {
      const dispatcher = params.dispatchFn ?? executeSafeRequest;
      const response: DispatchResponse = await dispatcher(dispatchOptions);

      const isHttpError = response.statusCode >= 400;
      let diffFound = false;
      let diffDetails: DiffResult | null = null;
      let status: ReplayOutcome = isHttpError ? 'HTTP_ERROR' : 'SUCCESS';

      // Baseline comparison if baseline is configured
      if (params.baseline) {
        const statusCodeMatches = response.statusCode === params.baseline.statusCode;

        if (!statusCodeMatches) {
          diffFound = true;
          status = 'ASSERTION_FAILURE';
          diffDetails = {
            match: false,
            differences: [
              {
                path: '$statusCode',
                type: 'CHANGED',
                expected: params.baseline.statusCode,
                actual: response.statusCode,
              },
            ],
          };
        } else {
          // Compare payload if present and bodyType is not 'NONE'
          if (
            params.baseline.bodyType !== 'NONE' &&
            params.baseline.body !== undefined &&
            response.body !== undefined
          ) {
            diffDetails = compareJsonPayloads(
              params.baseline.body,
              response.body,
              params.maskRules ?? []
            );
            if (!diffDetails.match) {
              diffFound = true;
              status = 'ASSERTION_FAILURE';
            }
          }
        }
      }

      // Conservative response capture policy:
      // By default (captureResponseBody = false), body is null in ReplayExecutionResult
      // to avoid persisting secret-bearing or raw external responses.
      const persistedBody =
        params.captureResponseBody === true ? sanitizeCapturedBody(response.body) : null;

      return {
        fixtureId: params.fixtureId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        baselineId: params.baseline?.id,
        status,
        httpStatusCode: response.statusCode,
        headers: sanitizeHeaders(response.headers),
        body: persistedBody,
        durationMs: response.durationMs,
        errorMessage: isHttpError ? `HTTP status ${response.statusCode} returned` : null,
        diffFound,
        // Diffs embed response values, so they are redacted/bounded independent of capture opt-in.
        diffDetails: sanitizeDiffResult(diffDetails),
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Unknown execution failure';

      let status: ReplayOutcome = 'TRANSPORT_ERROR';
      let safeMessage = 'A network transport error occurred while dispatching the request.';

      if (errorMsg.includes('SSRF_') || errorMsg.includes('restricted IP')) {
        status = 'SSRF_BLOCKED';
        safeMessage = 'Target destination was blocked by security policy (SSRF protection).';
      } else if (errorMsg.includes('TIMEOUT')) {
        status = 'TIMEOUT';
        safeMessage = 'Execution timed out waiting for target response.';
      } else if (errorMsg.includes('PAYLOAD_LIMIT_EXCEEDED')) {
        status = 'TRANSPORT_ERROR';
        safeMessage = 'Response body exceeded maximum payload limit.';
      }

      return {
        fixtureId: params.fixtureId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        baselineId: params.baseline?.id,
        status,
        httpStatusCode: null, // Null on transport/SSRF failure (never collapse into HTTP status)
        headers: {},
        body: null,
        durationMs,
        errorMessage: safeMessage,
        diffFound: false,
        diffDetails: null,
      };
    }
  }, params.signal);
}
