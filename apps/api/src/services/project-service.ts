import type {
  ProjectRole,
  ProjectResponse,
  ProjectMemberResponse,
  EnvironmentResponse,
  FixtureResponse,
  SuiteResponse,
  CreateProjectInput,
  UpdateProjectInput,
  AssignProjectMemberInput,
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  CreateFixtureInput,
  UpdateFixtureInput,
  UpdateBaselineInput,
  CreateSuiteInput,
  UpdateSuiteInput,
} from '@replaylab/contracts';
import { hasPermission, type ProjectPermission } from '../auth/permission-matrix.js';

export interface ProjectStore {
  // User profile
  syncUser(user: { id: string; email: string; name?: string; avatarUrl?: string }): Promise<void>;

  // Project membership
  getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null>;
  listProjectsForUser(userId: string): Promise<ProjectResponse[]>;
  getProject(projectId: string): Promise<ProjectResponse | null>;
  createProject(userId: string, input: CreateProjectInput): Promise<ProjectResponse>;
  updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectResponse>;
  deleteProject(projectId: string): Promise<void>;

  // Members
  listProjectMembers(projectId: string): Promise<ProjectMemberResponse[]>;
  assignProjectMember(projectId: string, input: AssignProjectMemberInput): Promise<ProjectMemberResponse>;
  removeProjectMember(projectId: string, memberId: string): Promise<void>;

  // Environments
  listEnvironments(projectId: string): Promise<EnvironmentResponse[]>;
  getEnvironment(projectId: string, environmentId: string): Promise<EnvironmentResponse | null>;
  getEnvironmentSecrets(projectId: string, environmentId: string): Promise<{
    id: string;
    projectId: string;
    baseUrl: string;
    headers: Record<string, string>;
    variables: Array<{
      key: string;
      value: string;
      isSecret: boolean;
      secretIv?: string | null;
      secretAuthTag?: string | null;
    }>;
  } | null>;
  createEnvironment(projectId: string, input: CreateEnvironmentInput): Promise<EnvironmentResponse>;
  updateEnvironment(projectId: string, environmentId: string, input: UpdateEnvironmentInput): Promise<EnvironmentResponse>;
  deleteEnvironment(projectId: string, environmentId: string): Promise<void>;

  // Fixtures
  listFixtures(projectId: string): Promise<FixtureResponse[]>;
  getFixture(projectId: string, fixtureId: string): Promise<FixtureResponse | null>;
  getCurrentBaselineId(projectId: string, fixtureId: string): Promise<string | null>;
  createFixture(projectId: string, input: CreateFixtureInput): Promise<FixtureResponse>;
  updateFixture(projectId: string, fixtureId: string, input: UpdateFixtureInput): Promise<FixtureResponse>;
  updateBaseline(projectId: string, fixtureId: string, input: UpdateBaselineInput): Promise<FixtureResponse>;
  deleteFixture(projectId: string, fixtureId: string): Promise<void>;

  // Suites
  listSuites(projectId: string): Promise<SuiteResponse[]>;
  getSuite(projectId: string, suiteId: string): Promise<SuiteResponse | null>;
  createSuite(projectId: string, input: CreateSuiteInput): Promise<SuiteResponse>;
  updateSuite(projectId: string, suiteId: string, input: UpdateSuiteInput): Promise<SuiteResponse>;
  deleteSuite(projectId: string, suiteId: string): Promise<void>;

  // Replay Runs
  createReplayRun(data: {
    id?: string;
    projectId: string;
    fixtureId: string;
    environmentId: string;
    suiteRunId?: string | null;
    baselineId?: string | null;
    triggeredById?: string | null;
    status: string;
    httpStatusCode?: number | null;
    headers?: Record<string, string>;
    bodyType?: string | null;
    body?: unknown;
    durationMs: number;
    errorMessage?: string | null;
    diffFound: boolean;
    diffDetails?: unknown;
  }): Promise<{ id: string; status: string; executedAt: string }>;

  listReplayRuns(
    projectId: string,
    options?: { limit?: number; offset?: number; fixtureId?: string }
  ): Promise<Array<{
    id: string;
    fixtureId: string;
    environmentId: string;
    status: string;
    httpStatusCode?: number | null;
    durationMs: number;
    diffFound: boolean;
    executedAt: string;
  }>>;

  getReplayRun(
    projectId: string,
    runId: string
  ): Promise<{
    id: string;
    projectId: string;
    fixtureId: string;
    environmentId: string;
    suiteRunId?: string | null;
    baselineId?: string | null;
    status: string;
    httpStatusCode?: number | null;
    headers: Record<string, string>;
    bodyType?: string | null;
    body?: unknown;
    durationMs: number;
    errorMessage?: string | null;
    diffFound: boolean;
    diffDetails?: unknown;
    executedAt: string;
  } | null>;

  // Suite Runs
  createSuiteRun(data: {
    id?: string;
    projectId: string;
    suiteId: string;
    environmentId: string;
    triggeredById?: string | null;
    status: string;
    totalItems: number;
    suiteSnapshot: unknown;
  }): Promise<{ id: string; status: string; startedAt: string }>;

  updateSuiteRun(
    suiteRunId: string,
    data: {
      status: string;
      passedItems: number;
      failedItems: number;
      durationMs: number;
      completedAt: string;
    }
  ): Promise<void>;

  listSuiteRuns(
    projectId: string,
    suiteId?: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    id: string;
    suiteId: string;
    environmentId: string;
    status: string;
    totalItems: number;
    passedItems: number;
    failedItems: number;
    durationMs: number;
    startedAt: string;
    completedAt?: string | null;
  }>>;

  // Audit Logs
  createAuditLog(data: {
    projectId?: string | null;
    userId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  listAuditLogs(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>>;
}

export class ProjectAuthorizationError extends Error {
  public readonly code: 'NOT_FOUND' | 'FORBIDDEN';

  constructor(code: 'NOT_FOUND' | 'FORBIDDEN', message: string) {
    super(message);
    this.name = 'ProjectAuthorizationError';
    this.code = code;
  }
}

/**
 * Service orchestrating project authorization and repository access.
 */
export class ProjectService {
  constructor(public readonly store: ProjectStore) {}

  /**
   * Asserts user membership and permission on a project.
   * Fails closed: if user is not a member, returns NOT_FOUND to prevent enumeration.
   */
  public async assertPermission(
    projectId: string,
    userId: string,
    permission: ProjectPermission
  ): Promise<ProjectRole> {
    const role = await this.store.getMemberRole(projectId, userId);
    if (!role) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Project not found or access denied');
    }

    if (!hasPermission(role, permission)) {
      throw new ProjectAuthorizationError('FORBIDDEN', `Insufficient permissions for action: ${permission}`);
    }

    return role;
  }

  // --- Project Management ---
  public async listUserProjects(userId: string): Promise<ProjectResponse[]> {
    return this.store.listProjectsForUser(userId);
  }

  public async getProject(projectId: string, userId: string): Promise<ProjectResponse> {
    await this.assertPermission(projectId, userId, 'project:read');
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Project not found');
    }
    return project;
  }

  public async createProject(userId: string, input: CreateProjectInput): Promise<ProjectResponse> {
    return this.store.createProject(userId, input);
  }

  public async updateProject(projectId: string, userId: string, input: UpdateProjectInput): Promise<ProjectResponse> {
    await this.assertPermission(projectId, userId, 'project:update');
    return this.store.updateProject(projectId, input);
  }

  public async deleteProject(projectId: string, userId: string): Promise<void> {
    await this.assertPermission(projectId, userId, 'project:delete');
    return this.store.deleteProject(projectId);
  }

  // --- Member Management ---
  public async listMembers(projectId: string, userId: string): Promise<ProjectMemberResponse[]> {
    await this.assertPermission(projectId, userId, 'member:read');
    return this.store.listProjectMembers(projectId);
  }

  public async assignMember(
    projectId: string,
    userId: string,
    input: AssignProjectMemberInput
  ): Promise<ProjectMemberResponse> {
    await this.assertPermission(projectId, userId, 'member:manage');
    return this.store.assignProjectMember(projectId, input);
  }

  public async removeMember(projectId: string, userId: string, memberId: string): Promise<void> {
    await this.assertPermission(projectId, userId, 'member:manage');

    // Enforce Last-Owner Protection
    const members = await this.store.listProjectMembers(projectId);
    const targetMember = members.find((m) => m.id === memberId);
    if (!targetMember) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Project member not found');
    }

    if (targetMember.role === 'OWNER') {
      const ownerCount = members.filter((m) => m.role === 'OWNER').length;
      if (ownerCount <= 1) {
        throw new Error('LAST_OWNER_PROTECTION: Cannot remove the last project owner');
      }
    }

    return this.store.removeProjectMember(projectId, memberId);
  }

  // --- Environments ---
  public async listEnvironments(projectId: string, userId: string): Promise<EnvironmentResponse[]> {
    await this.assertPermission(projectId, userId, 'environment:read');
    return this.store.listEnvironments(projectId);
  }

  public async getEnvironment(projectId: string, environmentId: string, userId: string): Promise<EnvironmentResponse> {
    await this.assertPermission(projectId, userId, 'environment:read');
    const env = await this.store.getEnvironment(projectId, environmentId);
    if (!env) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Environment not found in project');
    }
    return env;
  }

  public async createEnvironment(projectId: string, userId: string, input: CreateEnvironmentInput): Promise<EnvironmentResponse> {
    await this.assertPermission(projectId, userId, 'environment:create');
    return this.store.createEnvironment(projectId, input);
  }

  public async updateEnvironment(
    projectId: string,
    environmentId: string,
    userId: string,
    input: UpdateEnvironmentInput
  ): Promise<EnvironmentResponse> {
    await this.assertPermission(projectId, userId, 'environment:update');
    return this.store.updateEnvironment(projectId, environmentId, input);
  }

  public async deleteEnvironment(projectId: string, environmentId: string, userId: string): Promise<void> {
    await this.assertPermission(projectId, userId, 'environment:delete');
    return this.store.deleteEnvironment(projectId, environmentId);
  }

  // --- Fixtures ---
  public async listFixtures(projectId: string, userId: string): Promise<FixtureResponse[]> {
    await this.assertPermission(projectId, userId, 'fixture:read');
    return this.store.listFixtures(projectId);
  }

  public async getFixture(projectId: string, fixtureId: string, userId: string): Promise<FixtureResponse> {
    await this.assertPermission(projectId, userId, 'fixture:read');
    const fix = await this.store.getFixture(projectId, fixtureId);
    if (!fix) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Fixture not found in project');
    }
    return fix;
  }

  public async createFixture(projectId: string, userId: string, input: CreateFixtureInput): Promise<FixtureResponse> {
    await this.assertPermission(projectId, userId, 'fixture:create');
    return this.store.createFixture(projectId, input);
  }

  public async updateFixture(
    projectId: string,
    fixtureId: string,
    userId: string,
    input: UpdateFixtureInput
  ): Promise<FixtureResponse> {
    await this.assertPermission(projectId, userId, 'fixture:update');
    return this.store.updateFixture(projectId, fixtureId, input);
  }

  public async updateBaseline(
    projectId: string,
    fixtureId: string,
    userId: string,
    input: UpdateBaselineInput
  ): Promise<FixtureResponse> {
    await this.assertPermission(projectId, userId, 'baseline:update');
    return this.store.updateBaseline(projectId, fixtureId, input);
  }

  public async deleteFixture(projectId: string, fixtureId: string, userId: string): Promise<void> {
    await this.assertPermission(projectId, userId, 'fixture:delete');
    return this.store.deleteFixture(projectId, fixtureId);
  }

  // --- Suites ---
  public async listSuites(projectId: string, userId: string): Promise<SuiteResponse[]> {
    await this.assertPermission(projectId, userId, 'suite:read');
    return this.store.listSuites(projectId);
  }

  public async getSuite(projectId: string, suiteId: string, userId: string): Promise<SuiteResponse> {
    await this.assertPermission(projectId, userId, 'suite:read');
    const suite = await this.store.getSuite(projectId, suiteId);
    if (!suite) {
      throw new ProjectAuthorizationError('NOT_FOUND', 'Suite not found in project');
    }
    return suite;
  }

  public async createSuite(projectId: string, userId: string, input: CreateSuiteInput): Promise<SuiteResponse> {
    await this.assertPermission(projectId, userId, 'suite:create');
    return this.store.createSuite(projectId, input);
  }

  public async updateSuite(
    projectId: string,
    suiteId: string,
    userId: string,
    input: UpdateSuiteInput
  ): Promise<SuiteResponse> {
    await this.assertPermission(projectId, userId, 'suite:update');
    return this.store.updateSuite(projectId, suiteId, input);
  }

  public async deleteSuite(projectId: string, suiteId: string, userId: string): Promise<void> {
    await this.assertPermission(projectId, userId, 'suite:delete');
    return this.store.deleteSuite(projectId, suiteId);
  }
}
