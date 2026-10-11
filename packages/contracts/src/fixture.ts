import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';
import { HttpHeadersSchema } from './environment.js';

/**
 * Supported HTTP methods for ReplayLab fixtures.
 */
export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/**
 * Body type indicator.
 */
export const BodyTypeSchema = z.enum(['NONE', 'JSON', 'TEXT']);
export type BodyType = z.infer<typeof BodyTypeSchema>;

/**
 * Query parameter map.
 */
export const HttpQueryParamsSchema = z.record(
  z.string().min(1).max(100),
  z.union([z.string().max(2048), z.array(z.string().max(2048))])
);

export type HttpQueryParams = z.infer<typeof HttpQueryParamsSchema>;

/**
 * Fixture request definition.
 * Paths should typically be relative to the environment's baseUrl (e.g. "/v1/users").
 * Absolute URLs may be allowed for standalone fixtures, but relative paths are preferred.
 */
export const FixtureRequestDefinitionSchema = z.object({
  method: HttpMethodSchema,
  path: z
    .string()
    .trim()
    .min(1, 'Request path or URL is required')
    .max(2048, 'Path length exceeds 2048 characters'),
  queryParams: HttpQueryParamsSchema.optional().default({}),
  headers: HttpHeadersSchema.optional().default({}),
  bodyType: BodyTypeSchema.default('NONE'),
  // Structured JSON or string payload; bounded to 1MB in contract
  body: z.unknown().optional(),
});

export type FixtureRequestDefinition = z.infer<typeof FixtureRequestDefinitionSchema>;

/**
 * Baseline response snapshot definition.
 */
export const BaselineResponseDefinitionSchema = z.object({
  statusCode: z.number().int().min(100).max(599),
  headers: HttpHeadersSchema.optional().default({}),
  bodyType: BodyTypeSchema.default('NONE'),
  body: z.unknown().optional(),
});

export type BaselineResponseDefinition = z.infer<typeof BaselineResponseDefinitionSchema>;

/**
 * Fixture creation input.
 */
export const CreateFixtureInputSchema = z.object({
  projectId: ResourceIdSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Fixture name is required')
    .max(100, 'Fixture name cannot exceed 100 characters'),
  description: z.string().trim().max(500).optional(),
  request: FixtureRequestDefinitionSchema,
  baseline: BaselineResponseDefinitionSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional().default([]),
});

export type CreateFixtureInput = z.infer<typeof CreateFixtureInputSchema>;

/**
 * Fixture update input.
 */
export const UpdateFixtureInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Fixture name is required')
    .max(100, 'Fixture name cannot exceed 100 characters')
    .optional(),
  description: z.string().trim().max(500).nullable().optional(),
  request: FixtureRequestDefinitionSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});

export type UpdateFixtureInput = z.infer<typeof UpdateFixtureInputSchema>;

/**
 * Baseline update input (explicit action, not accidentally overwritten).
 */
export const UpdateBaselineInputSchema = z.object({
  baseline: BaselineResponseDefinitionSchema,
});

export type UpdateBaselineInput = z.infer<typeof UpdateBaselineInputSchema>;

/**
 * Fixture response DTO.
 */
export const FixtureResponseSchema = z.object({
  id: ResourceIdSchema,
  projectId: ResourceIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  request: FixtureRequestDefinitionSchema,
  baseline: BaselineResponseDefinitionSchema.nullable().optional(),
  tags: z.array(z.string()),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type FixtureResponse = z.infer<typeof FixtureResponseSchema>;
