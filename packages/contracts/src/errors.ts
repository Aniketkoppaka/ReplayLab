import { z } from 'zod';

/**
 * Standard API error code catalog.
 */
export const ApiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'AUTHENTICATION_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BAD_REQUEST',
  'SSRF_DESTINATION_BLOCKED',
  'EXECUTION_TIMEOUT',
  'TRANSPORT_ERROR',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/**
 * Field-level validation issue detail (sanitized, safe to expose).
 */
export const ValidationErrorDetailSchema = z.object({
  path: z.string().min(1, 'Path must not be empty'),
  message: z.string().min(1, 'Message must not be empty'),
  code: z.string().optional(),
});

export type ValidationErrorDetail = z.infer<typeof ValidationErrorDetailSchema>;

/**
 * Standard API error response envelope.
 */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1, 'Error message must not be empty'),
    details: z.array(ValidationErrorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
