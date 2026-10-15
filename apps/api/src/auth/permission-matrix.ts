import type { ProjectRole } from '@replaylab/contracts';

/**
 * Exact Role-Based Permission Matrix for ReplayLab.
 *
 * Roles:
 * - OWNER: Full administrative control, project management, member assignments, deletion.
 * - EDITOR: Read & write operations on fixtures, environments, suites, and replays. Cannot delete project or manage members.
 * - VIEWER: Read-only access to all project assets. Cannot trigger replays or modify resources.
 */

export type ProjectPermission =
  // Project operations
  | 'project:read'
  | 'project:update'
  | 'project:delete'
  // Member operations
  | 'member:read'
  | 'member:manage'
  // Environment operations
  | 'environment:read'
  | 'environment:create'
  | 'environment:update'
  | 'environment:delete'
  // Fixture operations
  | 'fixture:read'
  | 'fixture:create'
  | 'fixture:update'
  | 'fixture:delete'
  | 'baseline:update'
  // Suite operations
  | 'suite:read'
  | 'suite:create'
  | 'suite:update'
  | 'suite:delete'
  // Replay execution & history
  | 'replay:execute'
  | 'replay:read';

const ROLE_PERMISSIONS: Record<ProjectRole, Set<ProjectPermission>> = {
  OWNER: new Set<ProjectPermission>([
    'project:read',
    'project:update',
    'project:delete',
    'member:read',
    'member:manage',
    'environment:read',
    'environment:create',
    'environment:update',
    'environment:delete',
    'fixture:read',
    'fixture:create',
    'fixture:update',
    'fixture:delete',
    'baseline:update',
    'suite:read',
    'suite:create',
    'suite:update',
    'suite:delete',
    'replay:execute',
    'replay:read',
  ]),

  EDITOR: new Set<ProjectPermission>([
    'project:read',
    'member:read',
    'environment:read',
    'environment:create',
    'environment:update',
    'environment:delete',
    'fixture:read',
    'fixture:create',
    'fixture:update',
    'fixture:delete',
    'baseline:update',
    'suite:read',
    'suite:create',
    'suite:update',
    'suite:delete',
    'replay:execute',
    'replay:read',
  ]),

  VIEWER: new Set<ProjectPermission>([
    'project:read',
    'member:read',
    'environment:read',
    'fixture:read',
    'suite:read',
    'replay:read',
  ]),
};

/**
 * Checks whether a given project role grants a specific permission.
 */
export function hasPermission(role: ProjectRole, permission: ProjectPermission): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.has(permission) : false;
}
