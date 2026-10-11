import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';

/**
 * Public User response DTO.
 * Excludes sensitive fields like password hashes, session tokens, or auth secrets.
 */
export const UserResponseSchema = z.object({
  id: ResourceIdSchema,
  email: z.string().email('Invalid email address'),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
