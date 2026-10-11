import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';

/**
 * Supported assertion types.
 */
export const AssertionTypeSchema = z.enum([
  'STATUS_CODE',
  'JSON_PATH_VALUE',
  'JSON_PATH_EXISTS',
  'RESPONSE_TIME_MAX',
]);

export type AssertionType = z.infer<typeof AssertionTypeSchema>;

/**
 * Status Code assertion: e.g. status == 200.
 */
export const StatusCodeAssertionSchema = z.object({
  type: z.literal('STATUS_CODE'),
  expected: z.number().int().min(100).max(599),
});

export type StatusCodeAssertion = z.infer<typeof StatusCodeAssertionSchema>;

/**
 * JSON Path equality assertion: e.g. path '$.data.status' == 'active'.
 */
export const JsonPathValueAssertionSchema = z.object({
  type: z.literal('JSON_PATH_VALUE'),
  path: z
    .string()
    .trim()
    .min(1, 'JSON path is required')
    .max(256, 'JSON path cannot exceed 256 characters'),
  expected: z.unknown(),
});

export type JsonPathValueAssertion = z.infer<typeof JsonPathValueAssertionSchema>;

/**
 * Required-property / path existence assertion: e.g. path '$.data.id' exists.
 */
export const JsonPathExistsAssertionSchema = z.object({
  type: z.literal('JSON_PATH_EXISTS'),
  path: z
    .string()
    .trim()
    .min(1, 'JSON path is required')
    .max(256, 'JSON path cannot exceed 256 characters'),
});

export type JsonPathExistsAssertion = z.infer<typeof JsonPathExistsAssertionSchema>;

/**
 * Response time threshold assertion: e.g. responseTimeMs <= 500ms.
 */
export const ResponseTimeMaxAssertionSchema = z.object({
  type: z.literal('RESPONSE_TIME_MAX'),
  maxDurationMs: z.number().int().min(1, 'Duration must be >= 1ms').max(60000),
});

export type ResponseTimeMaxAssertion = z.infer<typeof ResponseTimeMaxAssertionSchema>;

/**
 * Discriminated union of all regression assertions.
 */
export const SuiteAssertionSchema = z.discriminatedUnion('type', [
  StatusCodeAssertionSchema,
  JsonPathValueAssertionSchema,
  JsonPathExistsAssertionSchema,
  ResponseTimeMaxAssertionSchema,
]);

export type SuiteAssertion = z.infer<typeof SuiteAssertionSchema>;

/**
 * Mask rule definition for differential response comparisons.
 * Allows ignoring dynamic fields like timestamps or tokens.
 */
export const DifferentialMaskRuleSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, 'Path is required')
    .max(256, 'Path cannot exceed 256 characters'),
  action: z.enum(['IGNORE', 'TYPE_MATCH']),
});

export type DifferentialMaskRule = z.infer<typeof DifferentialMaskRuleSchema>;

/**
 * Suite item definition referencing an ordered fixture.
 */
export const SuiteItemSchema = z.object({
  fixtureId: ResourceIdSchema,
  order: z.number().int().min(0),
  assertions: z.array(SuiteAssertionSchema).optional().default([]),
  maskRules: z.array(DifferentialMaskRuleSchema).optional().default([]),
});

export type SuiteItem = z.infer<typeof SuiteItemSchema>;

/**
 * Suite creation input schema.
 */
export const CreateSuiteInputSchema = z.object({
  projectId: ResourceIdSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Suite name is required')
    .max(100, 'Suite name cannot exceed 100 characters'),
  description: z.string().trim().max(500).optional(),
  items: z.array(SuiteItemSchema).optional().default([]),
});

export type CreateSuiteInput = z.infer<typeof CreateSuiteInputSchema>;

/**
 * Suite update input schema.
 */
export const UpdateSuiteInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Suite name is required')
    .max(100, 'Suite name cannot exceed 100 characters')
    .optional(),
  description: z.string().trim().max(500).nullable().optional(),
  items: z.array(SuiteItemSchema).optional(),
});

export type UpdateSuiteInput = z.infer<typeof UpdateSuiteInputSchema>;

/**
 * Suite response DTO.
 */
export const SuiteResponseSchema = z.object({
  id: ResourceIdSchema,
  projectId: ResourceIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  items: z.array(SuiteItemSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type SuiteResponse = z.infer<typeof SuiteResponseSchema>;
