import { z } from 'zod';

/**
 * Standard resource ID representation (non-empty string up to 64 chars, e.g. cuid, nanoid, uuid).
 */
export const ResourceIdSchema = z
  .string()
  .trim()
  .min(1, 'Resource ID cannot be empty')
  .max(64, 'Resource ID cannot exceed 64 characters');

export type ResourceId = z.infer<typeof ResourceIdSchema>;

/**
 * ISO-8601 UTC timestamp representation.
 */
export const IsoTimestampSchema = z
  .string()
  .datetime({ message: 'Must be a valid ISO-8601 datetime string' });

export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

/**
 * Standard pagination query input.
 */
export const PaginationInputSchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be >= 1').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Page size must be >= 1')
    .max(100, 'Page size cannot exceed 100')
    .default(20),
});

export type PaginationInput = z.infer<typeof PaginationInputSchema>;

/**
 * Standard sort order enum.
 */
export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

/**
 * Standard pagination metadata output.
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * Helper to create paginated collection schemas.
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationMetaSchema,
  });
}
