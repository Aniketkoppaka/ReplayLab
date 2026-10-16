import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';
import { HttpHeadersSchema } from './environment.js';
import { BodyTypeSchema } from './fixture.js';

/**
 * Granular Replay Outcome statuses.
 * Distinguishes true HTTP responses from network transport and security failures.
 */
export const ReplayOutcomeStatusSchema = z.enum([
  'SUCCESS',
  'HTTP_ERROR',
  'TRANSPORT_ERROR',
  'TIMEOUT',
  'SSRF_BLOCKED',
  'ASSERTION_FAILURE',
]);

export type ReplayOutcomeStatus = z.infer<typeof ReplayOutcomeStatusSchema>;

/**
 * Safe Replay request input.
 */
export const TriggerReplayInputSchema = z.object({
  fixtureId: ResourceIdSchema,
  environmentId: ResourceIdSchema,
  captureResponseBody: z.boolean().optional().default(false),
});

export type TriggerReplayInput = z.infer<typeof TriggerReplayInputSchema>;

/**
 * Safe Replay execution result response.
 * Redacts Authorization, cookies, and internal IP details.
 */
export const ReplayResultResponseSchema = z.object({
  id: ResourceIdSchema,
  fixtureId: ResourceIdSchema,
  environmentId: ResourceIdSchema,
  baselineId: ResourceIdSchema.nullable().optional(),
  status: ReplayOutcomeStatusSchema,
  // Present ONLY if an HTTP response was received (not on TRANSPORT_ERROR, TIMEOUT, or SSRF_BLOCKED)
  httpStatusCode: z.number().int().min(100).max(599).nullable().optional(),
  headers: HttpHeadersSchema.optional().default({}),
  bodyType: BodyTypeSchema.optional().default('NONE'),
  body: z.unknown().optional(),
  durationMs: z.number().int().min(0),
  // High-level safe error message if status is not SUCCESS
  errorMessage: z.string().nullable().optional(),
  // Semantic diff details if compared against baseline
  diffFound: z.boolean().default(false),
  diffDetails: z.unknown().nullable().optional(),
  executedAt: IsoTimestampSchema,
});

export type ReplayResultResponse = z.infer<typeof ReplayResultResponseSchema>;

/**
 * Suite execution trigger input.
 */
export const TriggerSuiteExecutionInputSchema = z.object({
  suiteId: ResourceIdSchema.optional(),
  environmentId: ResourceIdSchema,
  captureResponseBody: z.boolean().optional().default(false),
});

export type TriggerSuiteExecutionInput = z.infer<typeof TriggerSuiteExecutionInputSchema>;

/**
 * Suite execution summary response DTO.
 */
export const SuiteExecutionSummaryResponseSchema = z.object({
  id: ResourceIdSchema,
  suiteId: ResourceIdSchema,
  environmentId: ResourceIdSchema,
  status: ReplayOutcomeStatusSchema,
  totalItems: z.number().int().min(0),
  passedItems: z.number().int().min(0),
  failedItems: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  results: z.array(ReplayResultResponseSchema),
  startedAt: IsoTimestampSchema,
  completedAt: IsoTimestampSchema,
});

export type SuiteExecutionSummaryResponse = z.infer<typeof SuiteExecutionSummaryResponseSchema>;

/**
 * Execution history list item.
 */
export const ExecutionHistoryItemSchema = z.object({
  id: ResourceIdSchema,
  type: z.enum(['REPLAY', 'SUITE']),
  targetId: ResourceIdSchema, // fixtureId or suiteId
  environmentId: ResourceIdSchema,
  environmentName: z.string(),
  status: ReplayOutcomeStatusSchema,
  durationMs: z.number().int().min(0),
  executedAt: IsoTimestampSchema,
});

export type ExecutionHistoryItem = z.infer<typeof ExecutionHistoryItemSchema>;
