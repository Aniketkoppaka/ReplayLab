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
  SuiteAssertion,
  DifferentialMaskRule,
} from '@replaylab/contracts';
import type { ProjectStore } from './project-service.js';
import { encryptSecret } from '../crypto.js';

interface StoredUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

interface StoredMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
}

interface StoredProject {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredEnvironment {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  headers: Record<string, string>;
  variables: Array<{
    key: string;
    value: string;
    isSecret: boolean;
    secretIv?: string;
    secretAuthTag?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface StoredBaselineSnapshot {
  id: string;
  version: number;
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  bodyType: 'NONE' | 'JSON' | 'TEXT';
  createdAt: string;
}

interface StoredFixture {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  tags: string[];
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    queryParams: Record<string, string | string[]>;
    headers: Record<string, string>;
    bodyType: 'NONE' | 'JSON' | 'TEXT';
    body?: unknown;
  };
  currentBaseline?: StoredBaselineSnapshot | null;
  baselineHistory: StoredBaselineSnapshot[];
  createdAt: string;
  updatedAt: string;
}

interface StoredSuite {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  items: Array<{
    fixtureId: string;
    order: number;
    assertions?: SuiteAssertion[];
    maskRules?: DifferentialMaskRule[];
  }>;
  createdAt: string;
  updatedAt: string;
}

let idCounter = 1;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

export class InMemoryProjectStore implements ProjectStore {
  public users = new Map<string, StoredUser>();
  public projects = new Map<string, StoredProject>();
  public members = new Map<string, StoredMember>(); // memberId -> StoredMember
  public environments = new Map<string, StoredEnvironment>();
  public fixtures = new Map<string, StoredFixture>();
  public suites = new Map<string, StoredSuite>();

  public async syncUser(user: { id: string; email: string; name?: string; avatarUrl?: string }): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  public async getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    for (const member of this.members.values()) {
      if (member.projectId === projectId && member.userId === userId) {
        return member.role;
      }
    }
    return null;
  }

  public async listProjectsForUser(userId: string): Promise<ProjectResponse[]> {
    const projectIds: Array<{ projectId: string; role: ProjectRole }> = [];
    for (const member of this.members.values()) {
      if (member.userId === userId) {
        projectIds.push({ projectId: member.projectId, role: member.role });
      }
    }

    const result: ProjectResponse[] = [];
    for (const { projectId, role } of projectIds) {
      const proj = this.projects.get(projectId);
      if (proj) {
        result.push({
          ...proj,
          role,
        });
      }
    }
    return result;
  }

  public async getProject(projectId: string): Promise<ProjectResponse | null> {
    const proj = this.projects.get(projectId);
    return proj ? { ...proj } : null;
  }

  public async createProject(userId: string, input: CreateProjectInput): Promise<ProjectResponse> {
    const projectId = genId('prj');
    const now = new Date().toISOString();
    const proj: StoredProject = {
      id: projectId,
      name: input.name,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(projectId, proj);

    // Creator becomes OWNER
    const memberId = genId('pm');
    this.members.set(memberId, {
      id: memberId,
      projectId,
      userId,
      role: 'OWNER',
      createdAt: now,
      updatedAt: now,
    });

    return { ...proj, role: 'OWNER' };
  }

  public async updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectResponse> {
    const proj = this.projects.get(projectId);
    if (!proj) throw new Error('Project not found');

    if (input.name) proj.name = input.name;
    if (input.description !== undefined) proj.description = input.description;
    proj.updatedAt = new Date().toISOString();

    return { ...proj };
  }

  public async deleteProject(projectId: string, actorUserId?: string): Promise<void> {
    this.projects.delete(projectId);
    if (actorUserId) {
      await this.createAuditLog({
        projectId: null,
        userId: actorUserId,
        action: 'PROJECT_DELETED',
        targetType: 'Project',
        targetId: projectId,
        metadata: { projectId },
      });
    }
    // Cascade delete in memory
    for (const [id, m] of this.members.entries()) {
      if (m.projectId === projectId) this.members.delete(id);
    }
    for (const [id, e] of this.environments.entries()) {
      if (e.projectId === projectId) this.environments.delete(id);
    }
    for (const [id, f] of this.fixtures.entries()) {
      if (f.projectId === projectId) this.fixtures.delete(id);
    }
    for (const [id, s] of this.suites.entries()) {
      if (s.projectId === projectId) this.suites.delete(id);
    }
  }

  // --- Members ---
  public async listProjectMembers(projectId: string): Promise<ProjectMemberResponse[]> {
    const res: ProjectMemberResponse[] = [];
    for (const m of this.members.values()) {
      if (m.projectId === projectId) {
        const user = this.users.get(m.userId);
        res.push({
          id: m.id,
          projectId: m.projectId,
          userId: m.userId,
          role: m.role,
          user: user
            ? {
                id: user.id,
                email: user.email,
                name: user.name || user.email.split('@')[0] || 'User',
                avatarUrl: user.avatarUrl,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
              }
            : undefined,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        });
      }
    }
    return res;
  }

  public async assignProjectMember(
    projectId: string,
    input: AssignProjectMemberInput,
    actorUserId?: string
  ): Promise<ProjectMemberResponse> {
    const result = await this.assignProjectMemberInner(projectId, input);
    if (actorUserId) {
      await this.createAuditLog({
        projectId,
        userId: actorUserId,
        action: 'MEMBER_ASSIGNED',
        targetType: 'ProjectMember',
        targetId: result.id,
        metadata: { assignedUserId: result.userId, role: result.role },
      });
    }
    return result;
  }

  private async assignProjectMemberInner(
    projectId: string,
    input: AssignProjectMemberInput
  ): Promise<ProjectMemberResponse> {
    // Find or create user by userId or email
    let targetUser: StoredUser | undefined;
    if (input.userId) {
      targetUser = this.users.get(input.userId);
      if (!targetUser) {
        targetUser = {
          id: input.userId,
          email: `${input.userId}@replaylab.dev`,
          name: input.userId,
        };
        this.users.set(targetUser.id, targetUser);
      }
    } else if (input.email) {
      for (const u of this.users.values()) {
        if (u.email === input.email) {
          targetUser = u;
          break;
        }
      }
      if (!targetUser) {
        targetUser = {
          id: genId('usr'),
          email: input.email,
          name: input.email.split('@')[0],
        };
        this.users.set(targetUser.id, targetUser);
      }
    }

    if (!targetUser) {
      throw new Error('USER_NOT_FOUND: Unable to resolve user for project membership');
    }

    const now = new Date().toISOString();
    // Check if already a member
    for (const m of this.members.values()) {
      if (m.projectId === projectId && m.userId === targetUser.id) {
        if (m.role === 'OWNER' && input.role !== 'OWNER') {
          const ownerCount = Array.from(this.members.values()).filter(
            (mem) => mem.projectId === projectId && mem.role === 'OWNER'
          ).length;
          if (ownerCount <= 1) {
            throw new Error('LAST_OWNER_PROTECTION: Cannot demote the last project owner');
          }
        }
        m.role = input.role;
        m.updatedAt = now;
        return {
          id: m.id,
          projectId: m.projectId,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        };
      }
    }

    const memberId = genId('pm');
    const newMember: StoredMember = {
      id: memberId,
      projectId,
      userId: targetUser.id,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    this.members.set(memberId, newMember);

    return {
      id: newMember.id,
      projectId: newMember.projectId,
      userId: newMember.userId,
      role: newMember.role,
      createdAt: newMember.createdAt,
      updatedAt: newMember.updatedAt,
    };
  }

  public async removeProjectMember(projectId: string, memberId: string, actorUserId?: string): Promise<void> {
    const member = this.members.get(memberId);
    if (!member || member.projectId !== projectId) {
      throw new Error('MEMBER_NOT_FOUND: Project member not found');
    }

    if (member.role === 'OWNER') {
      const ownerCount = Array.from(this.members.values()).filter(
        (mem) => mem.projectId === projectId && mem.role === 'OWNER'
      ).length;
      if (ownerCount <= 1) {
        throw new Error('LAST_OWNER_PROTECTION: Cannot remove the last project owner');
      }
    }

    this.members.delete(memberId);
    if (actorUserId) {
      await this.createAuditLog({
        projectId,
        userId: actorUserId,
        action: 'MEMBER_REMOVED',
        targetType: 'ProjectMember',
        targetId: memberId,
        metadata: { memberId, removedUserId: member.userId },
      });
    }
  }

  // --- Environments ---
  public async listEnvironments(projectId: string): Promise<EnvironmentResponse[]> {
    const res: EnvironmentResponse[] = [];
    for (const env of this.environments.values()) {
      if (env.projectId === projectId) {
        res.push(this.formatEnvironment(env));
      }
    }
    return res;
  }

  public async getEnvironment(projectId: string, environmentId: string): Promise<EnvironmentResponse | null> {
    const env = this.environments.get(environmentId);
    if (!env || env.projectId !== projectId) return null;
    return this.formatEnvironment(env);
  }

  public async getEnvironmentSecrets(projectId: string, environmentId: string) {
    const env = this.environments.get(environmentId);
    if (!env || env.projectId !== projectId) return null;
    return {
      id: env.id,
      projectId: env.projectId,
      baseUrl: env.baseUrl,
      headers: { ...env.headers },
      variables: env.variables.map((v) => ({ ...v })),
    };
  }

  public async createEnvironment(
    projectId: string,
    input: CreateEnvironmentInput
  ): Promise<EnvironmentResponse> {
    const id = genId('env');
    const now = new Date().toISOString();

    const variables = (input.variables ?? []).map((v) => {
      if (v.isSecret) {
        // ADR-0005: Encrypt secrets with AAD
        const encrypted = encryptSecret(v.value, undefined, `env:${id}:key:${v.key}`);
        return {
          key: v.key,
          value: encrypted.ciphertext,
          isSecret: true,
          secretIv: encrypted.iv,
          secretAuthTag: encrypted.authTag,
        };
      }
      return {
        key: v.key,
        value: v.value,
        isSecret: false,
      };
    });

    const env: StoredEnvironment = {
      id,
      projectId,
      name: input.name,
      baseUrl: input.baseUrl,
      headers: input.headers ?? {},
      variables,
      createdAt: now,
      updatedAt: now,
    };
    this.environments.set(id, env);
    return this.formatEnvironment(env);
  }

  public async updateEnvironment(
    projectId: string,
    environmentId: string,
    input: UpdateEnvironmentInput
  ): Promise<EnvironmentResponse> {
    const env = this.environments.get(environmentId);
    if (!env || env.projectId !== projectId) throw new Error('Environment not found');

    if (input.name) env.name = input.name;
    if (input.baseUrl) env.baseUrl = input.baseUrl;
    if (input.headers) env.headers = input.headers;
    if (input.variables) {
      env.variables = input.variables.map((v) => {
        if (v.isSecret) {
          const encrypted = encryptSecret(v.value, undefined, `env:${environmentId}:key:${v.key}`);
          return {
            key: v.key,
            value: encrypted.ciphertext,
            isSecret: true,
            secretIv: encrypted.iv,
            secretAuthTag: encrypted.authTag,
          };
        }
        return {
          key: v.key,
          value: v.value,
          isSecret: false,
        };
      });
    }
    env.updatedAt = new Date().toISOString();
    return this.formatEnvironment(env);
  }

  public async deleteEnvironment(projectId: string, environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId);
    if (env && env.projectId === projectId) {
      this.environments.delete(environmentId);
    }
  }

  private formatEnvironment(env: StoredEnvironment): EnvironmentResponse {
    return {
      id: env.id,
      projectId: env.projectId,
      name: env.name,
      baseUrl: env.baseUrl,
      headers: env.headers,
      variables: env.variables.map((v) => ({
        key: v.key,
        isSecret: v.isSecret,
        value: v.isSecret ? null : v.value, // Never leak secrets in response DTO
      })),
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    };
  }

  // --- Fixtures ---
  public async listFixtures(projectId: string): Promise<FixtureResponse[]> {
    const res: FixtureResponse[] = [];
    for (const f of this.fixtures.values()) {
      if (f.projectId === projectId) {
        res.push(this.formatFixture(f));
      }
    }
    return res;
  }

  public async getFixture(projectId: string, fixtureId: string): Promise<FixtureResponse | null> {
    const f = this.fixtures.get(fixtureId);
    if (!f || f.projectId !== projectId) return null;
    return this.formatFixture(f);
  }

  public async getBaselineSnapshot(projectId: string, fixtureId: string) {
    const f = this.fixtures.get(fixtureId);
    if (!f || f.projectId !== projectId || !f.currentBaseline) return null;
    const b = f.currentBaseline;
    return {
      id: b.id,
      statusCode: b.statusCode,
      headers: { ...b.headers },
      bodyType: b.bodyType as 'NONE' | 'JSON' | 'TEXT',
      body: b.body,
    };
  }

  public async getCurrentBaselineId(projectId: string, fixtureId: string): Promise<string | null> {
    const f = this.fixtures.get(fixtureId);
    if (!f || f.projectId !== projectId) return null;
    return f.currentBaseline ? f.currentBaseline.id : null;
  }

  public async createFixture(projectId: string, input: CreateFixtureInput): Promise<FixtureResponse> {
    const id = genId('fix');
    const now = new Date().toISOString();

    let initialBaseline: StoredBaselineSnapshot | null = null;
    const history: StoredBaselineSnapshot[] = [];

    if (input.baseline) {
      initialBaseline = {
        id: genId('base'),
        version: 1,
        statusCode: input.baseline.statusCode,
        headers: input.baseline.headers ?? {},
        body: input.baseline.body,
        bodyType: input.baseline.bodyType ?? 'NONE',
        createdAt: now,
      };
      history.push(initialBaseline);
    }

    const fixture: StoredFixture = {
      id,
      projectId,
      name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
      request: {
        method: input.request.method,
        path: input.request.path,
        queryParams: input.request.queryParams ?? {},
        headers: input.request.headers ?? {},
        bodyType: input.request.bodyType ?? 'NONE',
        body: input.request.body,
      },
      currentBaseline: initialBaseline,
      baselineHistory: history,
      createdAt: now,
      updatedAt: now,
    };

    this.fixtures.set(id, fixture);
    return this.formatFixture(fixture);
  }

  public async updateFixture(
    projectId: string,
    fixtureId: string,
    input: UpdateFixtureInput
  ): Promise<FixtureResponse> {
    const f = this.fixtures.get(fixtureId);
    if (!f || f.projectId !== projectId) throw new Error('Fixture not found');

    if (input.name) f.name = input.name;
    if (input.description !== undefined) f.description = input.description;
    if (input.tags) f.tags = input.tags;
    if (input.request) {
      f.request = {
        method: input.request.method,
        path: input.request.path,
        queryParams: input.request.queryParams ?? {},
        headers: input.request.headers ?? {},
        bodyType: input.request.bodyType ?? 'NONE',
        body: input.request.body,
      };
    }
    f.updatedAt = new Date().toISOString();
    return this.formatFixture(f);
  }

  public async updateBaseline(
    projectId: string,
    fixtureId: string,
    input: UpdateBaselineInput,
    actorUserId?: string
  ): Promise<FixtureResponse> {
    const f = this.fixtures.get(fixtureId);
    if (!f || f.projectId !== projectId) throw new Error('Fixture not found');

    const nextVersion = f.baselineHistory.length + 1;
    const now = new Date().toISOString();
    const newBaseline: StoredBaselineSnapshot = {
      id: genId('base'),
      version: nextVersion,
      statusCode: input.baseline.statusCode,
      headers: input.baseline.headers ?? {},
      body: input.baseline.body,
      bodyType: input.baseline.bodyType ?? 'NONE',
      createdAt: now,
    };

    f.currentBaseline = newBaseline;
    f.baselineHistory.push(newBaseline);
    f.updatedAt = now;
    if (actorUserId) {
      await this.createAuditLog({
        projectId,
        userId: actorUserId,
        action: 'BASELINE_UPDATED',
        targetType: 'Fixture',
        targetId: fixtureId,
        metadata: {
          baselineId: newBaseline.id,
          statusCode: input.baseline.statusCode,
          bodyType: input.baseline.bodyType ?? 'NONE',
        },
      });
    }

    return this.formatFixture(f);
  }

  public async deleteFixture(projectId: string, fixtureId: string): Promise<void> {
    const f = this.fixtures.get(fixtureId);
    if (f && f.projectId === projectId) {
      this.fixtures.delete(fixtureId);
    }
  }

  private formatFixture(f: StoredFixture): FixtureResponse {
    return {
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      description: f.description,
      request: f.request,
      baseline: f.currentBaseline
        ? {
            statusCode: f.currentBaseline.statusCode,
            headers: f.currentBaseline.headers,
            bodyType: f.currentBaseline.bodyType,
            body: f.currentBaseline.body,
          }
        : null,
      tags: f.tags,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  }

  // --- Suites ---
  public async listSuites(projectId: string): Promise<SuiteResponse[]> {
    const res: SuiteResponse[] = [];
    for (const s of this.suites.values()) {
      if (s.projectId === projectId) {
        res.push(this.formatSuite(s));
      }
    }
    return res;
  }

  public async getSuite(projectId: string, suiteId: string): Promise<SuiteResponse | null> {
    const s = this.suites.get(suiteId);
    if (!s || s.projectId !== projectId) return null;
    return this.formatSuite(s);
  }

  public async createSuite(projectId: string, input: CreateSuiteInput): Promise<SuiteResponse> {
    const id = genId('ste');
    const now = new Date().toISOString();
    const suite: StoredSuite = {
      id,
      projectId,
      name: input.name,
      description: input.description ?? null,
      items: (input.items ?? []).map((it, idx) => ({
        fixtureId: it.fixtureId,
        order: it.order ?? idx,
        assertions: it.assertions,
        maskRules: it.maskRules,
      })),
      createdAt: now,
      updatedAt: now,
    };
    this.suites.set(id, suite);
    return this.formatSuite(suite);
  }

  public async updateSuite(
    projectId: string,
    suiteId: string,
    input: UpdateSuiteInput
  ): Promise<SuiteResponse> {
    const s = this.suites.get(suiteId);
    if (!s || s.projectId !== projectId) throw new Error('Suite not found');

    if (input.name) s.name = input.name;
    if (input.description !== undefined) s.description = input.description;
    if (input.items) {
      s.items = input.items.map((it, idx) => ({
        fixtureId: it.fixtureId,
        order: it.order ?? idx,
        assertions: it.assertions,
        maskRules: it.maskRules,
      }));
    }
    s.updatedAt = new Date().toISOString();
    return this.formatSuite(s);
  }

  public async deleteSuite(projectId: string, suiteId: string): Promise<void> {
    const s = this.suites.get(suiteId);
    if (s && s.projectId === projectId) {
      this.suites.delete(suiteId);
    }
  }

  // --- Runs & Audit Storage ---
  public replayRuns = new Map<string, {
    id: string;
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
    executedAt: string;
  }>();

  public suiteRuns = new Map<string, {
    id: string;
    projectId: string;
    suiteId: string;
    environmentId: string;
    triggeredById?: string | null;
    status: string;
    totalItems: number;
    passedItems: number;
    failedItems: number;
    durationMs: number;
    suiteSnapshot: unknown;
    startedAt: string;
    completedAt?: string | null;
  }>();

  public auditLogs = new Array<{
    id: string;
    projectId?: string | null;
    userId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }>();

  public async createReplayRun(data: {
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
  }) {
    const id = data.id || genId('run');
    const record = {
      ...data,
      id,
      executedAt: new Date().toISOString(),
    };
    this.replayRuns.set(id, record);
    return { id, status: record.status, executedAt: record.executedAt };
  }

  public async listReplayRuns(
    projectId: string,
    options?: { limit?: number; offset?: number; fixtureId?: string }
  ) {
    const runs = Array.from(this.replayRuns.values())
      .filter((r) => r.projectId === projectId && (!options?.fixtureId || r.fixtureId === options.fixtureId))
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 50));

    return runs.map((r) => ({
      id: r.id,
      fixtureId: r.fixtureId,
      environmentId: r.environmentId,
      status: r.status,
      httpStatusCode: r.httpStatusCode,
      durationMs: r.durationMs,
      diffFound: r.diffFound,
      executedAt: r.executedAt,
    }));
  }

  public async getReplayRun(projectId: string, runId: string) {
    const r = this.replayRuns.get(runId);
    if (!r || r.projectId !== projectId) return null;
    return {
      ...r,
      headers: r.headers ?? {},
    };
  }

  public async createSuiteRun(data: {
    id?: string;
    projectId: string;
    suiteId: string;
    environmentId: string;
    triggeredById?: string | null;
    status: string;
    totalItems: number;
    suiteSnapshot: unknown;
  }) {
    const id = data.id || genId('srun');
    const record = {
      ...data,
      id,
      startedAt: new Date().toISOString(),
      passedItems: 0,
      failedItems: 0,
      durationMs: 0,
      completedAt: null,
    };
    this.suiteRuns.set(id, record);
    return { id, status: record.status, startedAt: record.startedAt };
  }

  public async updateSuiteRun(
    suiteRunId: string,
    data: {
      status: string;
      passedItems: number;
      failedItems: number;
      durationMs: number;
      completedAt: string;
    }
  ) {
    const r = this.suiteRuns.get(suiteRunId);
    if (r) {
      Object.assign(r, data);
    }
  }

  public async listSuiteRuns(
    projectId: string,
    suiteId?: string,
    options?: { limit?: number; offset?: number }
  ) {
    const runs = Array.from(this.suiteRuns.values())
      .filter((r) => r.projectId === projectId && (!suiteId || r.suiteId === suiteId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 50));

    return runs.map((r) => ({ ...r }));
  }

  public async createAuditLog(data: {
    projectId?: string | null;
    userId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) {
    const record = {
      ...data,
      metadata: data.metadata ?? {},
      id: genId('aud'),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(record);
  }

  public async listAuditLogs(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ) {
    return this.auditLogs
      .filter((l) => l.projectId === projectId)
      .slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 50))
      .map((l) => ({
        ...l,
        metadata: l.metadata ?? {},
      }));
  }

  private formatSuite(s: StoredSuite): SuiteResponse {
    return {
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      description: s.description,
      items: s.items.map((it) => ({
        fixtureId: it.fixtureId,
        order: it.order,
        assertions: it.assertions ?? [],
        maskRules: it.maskRules ?? [],
      })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
