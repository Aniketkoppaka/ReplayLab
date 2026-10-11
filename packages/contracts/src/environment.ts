import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';

/**
 * Valid HTTP header map: record of string key -> string value.
 */
export const HttpHeadersSchema = z.record(
  z.string().min(1, 'Header name cannot be empty').max(100),
  z.string().max(4096, 'Header value exceeds limit')
);

export type HttpHeaders = z.infer<typeof HttpHeadersSchema>;

/**
 * Safe write-only environment variable input.
 * Supports defining plaintext or secret variables during create/update.
 */
export const EnvironmentVariableInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Key must be a valid identifier (e.g. API_KEY)')
    .max(100),
  value: z.string().max(8192, 'Variable value exceeds limit'),
  isSecret: z.boolean().default(false),
});

export type EnvironmentVariableInput = z.infer<typeof EnvironmentVariableInputSchema>;

/**
 * Safe environment variable response DTO.
 * Secret values are NEVER returned in plaintext.
 */
export const EnvironmentVariableResponseSchema = z.object({
  key: z.string(),
  isSecret: z.boolean(),
  // Value is returned ONLY if isSecret is false. If isSecret is true, null or masked representation is returned.
  value: z.string().nullable(),
});

export type EnvironmentVariableResponse = z.infer<typeof EnvironmentVariableResponseSchema>;

/**
 * Environment creation input schema.
 */
export const CreateEnvironmentInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Environment name is required')
    .max(50, 'Environment name cannot exceed 50 characters'),
  baseUrl: z
    .string()
    .trim()
    .url('Base URL must be a valid URL')
    .max(2048, 'Base URL cannot exceed 2048 characters'),
  headers: HttpHeadersSchema.optional().default({}),
  variables: z.array(EnvironmentVariableInputSchema).optional().default([]),
});

export type CreateEnvironmentInput = z.infer<typeof CreateEnvironmentInputSchema>;

/**
 * Environment update input schema.
 */
export const UpdateEnvironmentInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Environment name is required')
    .max(50, 'Environment name cannot exceed 50 characters')
    .optional(),
  baseUrl: z
    .string()
    .trim()
    .url('Base URL must be a valid URL')
    .max(2048, 'Base URL cannot exceed 2048 characters')
    .optional(),
  headers: HttpHeadersSchema.optional(),
  variables: z.array(EnvironmentVariableInputSchema).optional(),
});

export type UpdateEnvironmentInput = z.infer<typeof UpdateEnvironmentInputSchema>;

/**
 * Full Environment response DTO.
 * Secret variables are masked or omitted in response.
 */
export const EnvironmentResponseSchema = z.object({
  id: ResourceIdSchema,
  projectId: ResourceIdSchema,
  name: z.string().min(1).max(50),
  baseUrl: z.string().url(),
  headers: HttpHeadersSchema,
  variables: z.array(EnvironmentVariableResponseSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type EnvironmentResponse = z.infer<typeof EnvironmentResponseSchema>;

/**
 * Lightweight environment summary for dropdowns/navigation.
 */
export const EnvironmentSummarySchema = z.object({
  id: ResourceIdSchema,
  name: z.string().min(1).max(50),
  baseUrl: z.string().url(),
});

export type EnvironmentSummary = z.infer<typeof EnvironmentSummarySchema>;
