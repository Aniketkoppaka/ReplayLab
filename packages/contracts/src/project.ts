import { z } from 'zod';
import { ResourceIdSchema, IsoTimestampSchema } from './common.js';
import { UserResponseSchema } from './user.js';

/**
 * Project membership roles.
 */
export const ProjectRoleSchema = z.enum(['OWNER', 'EDITOR', 'VIEWER']);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

/**
 * Project member representation.
 */
export const ProjectMemberResponseSchema = z.object({
  id: ResourceIdSchema,
  projectId: ResourceIdSchema,
  userId: ResourceIdSchema,
  role: ProjectRoleSchema,
  user: UserResponseSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type ProjectMemberResponse = z.infer<typeof ProjectMemberResponseSchema>;

/**
 * Project creation input schema.
 */
export const CreateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required')
    .max(100, 'Project name cannot exceed 100 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/**
 * Project update input schema.
 */
export const UpdateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required')
    .max(100, 'Project name cannot exceed 100 characters')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description cannot exceed 500 characters')
    .nullable()
    .optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

/**
 * Project response DTO.
 */
export const ProjectResponseSchema = z.object({
  id: ResourceIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  role: ProjectRoleSchema.optional(),
});

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

/**
 * Member invitation / assignment input schema.
 */
export const AssignProjectMemberInputSchema = z.object({
  email: z.string().email('Valid email address required'),
  role: ProjectRoleSchema,
});

export type AssignProjectMemberInput = z.infer<typeof AssignProjectMemberInputSchema>;
