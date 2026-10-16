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
import {
  type PrismaClient,
  Prisma,
  ProjectRole as DbProjectRole,
  HttpMethod as DbHttpMethod,
  BodyType as DbBodyType,
  AssertionType as DbAssertionType,
  MaskAction as DbMaskAction,
  ReplayOutcomeStatus as DbReplayOutcomeStatus,
} from '@replaylab/db';
import type { ProjectStore } from './project-service.js';
import { encryptSecret } from '../crypto.js';

/**
 * Durable PostgreSQL persistence layer utilizing Prisma ORM.
 * Implements strict project-scoped queries, transactional multi-step operations,
 * ADR-0005 authenticated AES-256-GCM secret encryption, and historical baseline preservation.
 */
export class PrismaProjectStore implements ProjectStore {
  constructor(private readonly prisma: PrismaClient) {}

  // --- User Profile Sync ---
  public async syncUser(user: {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const fallbackName = user.name || user.email.split('@')[0] || 'User';
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        name: fallbackName,
        avatarUrl: user.avatarUrl ?? null,
      },
      update: {
        email: user.email,
        name: fallbackName,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  }

  // --- Project Membership & RBAC ---
  public async getMemberRole(
    projectId: string,
    userId: string
  ): Promise<ProjectRole | null> {
    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: { role: true },
    });

    return member ? (member.role as ProjectRole) : null;
  }

  public async listProjectsForUser(userId: string): Promise<ProjectResponse[]> {
    const members = await this.prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return members.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      description: m.project.description,
      createdAt: m.project.createdAt.toISOString(),
      updatedAt: m.project.updatedAt.toISOString(),
      role: m.role as ProjectRole,
    }));
  }

  public async getProject(projectId: string): Promise<ProjectResponse | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) return null;

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  public async createProject(
    userId: string,
    input: CreateProjectInput
  ): Promise<ProjectResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Ensure user exists in database before membership assignment
      const existingUser = await tx.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        await tx.user.create({
          data: {
            id: userId,
            email: `${userId}@replaylab.local`,
            name: userId,
          },
        });
      }

      const project = await tx.project.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          members: {
            create: {
              userId,
              role: DbProjectRole.OWNER,
            },
          },
        },
      });

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        role: 'OWNER',
      };
    });
  }

  public async updateProject(
    projectId: string,
    input: UpdateProjectInput
  ): Promise<ProjectResponse> {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  public async deleteProject(projectId: string): Promise<void> {
    await this.prisma.project.delete({
      where: { id: projectId },
    });
  }

  // --- Member Management ---
  public async listProjectMembers(
    projectId: string
  ): Promise<ProjectMemberResponse[]> {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      role: m.role as ProjectRole,
      user: m.user
        ? {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            avatarUrl: m.user.avatarUrl,
            createdAt: m.user.createdAt.toISOString(),
            updatedAt: m.user.updatedAt.toISOString(),
          }
        : undefined,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  }

  public async assignProjectMember(
    projectId: string,
    input: AssignProjectMemberInput
  ): Promise<ProjectMemberResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Serialize membership modifications per project with a row lock on the project
      // to strictly prevent concurrent transactions from bypassing last-owner protection.
      await tx.$executeRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;

      let targetUser: { id: string; email: string; name: string } | null = null;

      if (input.userId) {
        targetUser = await tx.user.findUnique({
          where: { id: input.userId },
        });
        if (!targetUser) {
          targetUser = await tx.user.create({
            data: {
              id: input.userId,
              email: input.email ?? `${input.userId}@replaylab.dev`,
              name: input.userId,
            },
          });
        }
      } else if (input.email) {
        targetUser = await tx.user.findUnique({
          where: { email: input.email },
        });
        if (!targetUser) {
          const generatedId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          targetUser = await tx.user.create({
            data: {
              id: generatedId,
              email: input.email,
              name: input.email.split('@')[0] || 'User',
            },
          });
        }
      }

      if (!targetUser) {
        throw new Error('USER_NOT_FOUND: Unable to resolve user for project membership');
      }

      // Check current member role in tx to guard role demotion of last owner
      const existingMember = await tx.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: targetUser.id,
          },
        },
      });

      const roleEnum = input.role as DbProjectRole;

      if (existingMember && existingMember.role === 'OWNER' && roleEnum !== 'OWNER') {
        const ownerCount = await tx.projectMember.count({
          where: { projectId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          throw new Error('LAST_OWNER_PROTECTION: Cannot demote the last project owner');
        }
      }

      const member = await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId,
            userId: targetUser.id,
          },
        },
        create: {
          projectId,
          userId: targetUser.id,
          role: roleEnum,
        },
        update: {
          role: roleEnum,
        },
        include: { user: true },
      });

      return {
        id: member.id,
        projectId: member.projectId,
        userId: member.userId,
        role: member.role as ProjectRole,
        user: member.user
          ? {
              id: member.user.id,
              email: member.user.email,
              name: member.user.name,
              avatarUrl: member.user.avatarUrl,
              createdAt: member.user.createdAt.toISOString(),
              updatedAt: member.user.updatedAt.toISOString(),
            }
          : undefined,
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
      };
    });
  }

  public async removeProjectMember(
    projectId: string,
    memberId: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Serialize membership modifications per project with a row lock on the project
      // to strictly prevent concurrent transactions from bypassing last-owner protection.
      await tx.$executeRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;

      // Find the member to be removed
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId },
      });

      if (!member) {
        throw new Error('MEMBER_NOT_FOUND: Project member not found');
      }

      if (member.role === 'OWNER') {
        const ownerCount = await tx.projectMember.count({
          where: { projectId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          throw new Error('LAST_OWNER_PROTECTION: Cannot remove the last project owner');
        }
      }

      await tx.projectMember.delete({
        where: { id: memberId },
      });
    });
  }

  // --- Environments ---
  public async listEnvironments(
    projectId: string
  ): Promise<EnvironmentResponse[]> {
    const envs = await this.prisma.environment.findMany({
      where: { projectId },
      include: { variables: true },
      orderBy: { createdAt: 'asc' },
    });

    return envs.map((e) => this.mapEnvironment(e));
  }

  public async getEnvironment(
    projectId: string,
    environmentId: string
  ): Promise<EnvironmentResponse | null> {
    const env = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      include: { variables: true },
    });

    return env ? this.mapEnvironment(env) : null;
  }

  public async getEnvironmentSecrets(projectId: string, environmentId: string) {
    const env = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      include: { variables: true },
    });
    if (!env) return null;

    return {
      id: env.id,
      projectId: env.projectId,
      baseUrl: env.baseUrl,
      headers: (env.headers ?? {}) as Record<string, string>,
      variables: env.variables.map((v) => ({
        key: v.key,
        value: v.value,
        isSecret: v.isSecret,
        secretIv: v.secretIv,
        secretAuthTag: v.secretAuthTag,
      })),
    };
  }

  public async createEnvironment(
    projectId: string,
    input: CreateEnvironmentInput
  ): Promise<EnvironmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const createdEnv = await tx.environment.create({
        data: {
          projectId,
          name: input.name,
          baseUrl: input.baseUrl,
          headers: input.headers as unknown as Prisma.InputJsonValue,
        },
      });

      if (input.variables && input.variables.length > 0) {
        for (const v of input.variables) {
          if (v.isSecret) {
            const encrypted = encryptSecret(
              v.value,
              undefined,
              `env:${createdEnv.id}:key:${v.key}`
            );
            await tx.environmentVariable.create({
              data: {
                environmentId: createdEnv.id,
                key: v.key,
                value: encrypted.ciphertext,
                isSecret: true,
                secretIv: encrypted.iv,
                secretAuthTag: encrypted.authTag,
              },
            });
          } else {
            await tx.environmentVariable.create({
              data: {
                environmentId: createdEnv.id,
                key: v.key,
                value: v.value,
                isSecret: false,
              },
            });
          }
        }
      }

      const fullEnv = await tx.environment.findUniqueOrThrow({
        where: { id: createdEnv.id },
        include: { variables: true },
      });

      return this.mapEnvironment(fullEnv);
    });
  }

  public async updateEnvironment(
    projectId: string,
    environmentId: string,
    input: UpdateEnvironmentInput
  ): Promise<EnvironmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.environment.findFirst({
        where: { id: environmentId, projectId },
      });
      if (!existing) throw new Error('Environment not found');

      await tx.environment.update({
        where: { id: environmentId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
          ...(input.headers !== undefined
            ? { headers: input.headers as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      if (input.variables !== undefined) {
        await tx.environmentVariable.deleteMany({
          where: { environmentId },
        });

        for (const v of input.variables) {
          if (v.isSecret) {
            const encrypted = encryptSecret(
              v.value,
              undefined,
              `env:${environmentId}:key:${v.key}`
            );
            await tx.environmentVariable.create({
              data: {
                environmentId,
                key: v.key,
                value: encrypted.ciphertext,
                isSecret: true,
                secretIv: encrypted.iv,
                secretAuthTag: encrypted.authTag,
              },
            });
          } else {
            await tx.environmentVariable.create({
              data: {
                environmentId,
                key: v.key,
                value: v.value,
                isSecret: false,
              },
            });
          }
        }
      }

      const updated = await tx.environment.findUniqueOrThrow({
        where: { id: environmentId },
        include: { variables: true },
      });

      return this.mapEnvironment(updated);
    });
  }

  public async deleteEnvironment(
    projectId: string,
    environmentId: string
  ): Promise<void> {
    await this.prisma.environment.deleteMany({
      where: { id: environmentId, projectId },
    });
  }

  // --- Fixtures ---
  public async listFixtures(projectId: string): Promise<FixtureResponse[]> {
    const fixtures = await this.prisma.fixture.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return fixtures.map((f) => this.mapFixture(f));
  }

  public async getFixture(
    projectId: string,
    fixtureId: string
  ): Promise<FixtureResponse | null> {
    const fixture = await this.prisma.fixture.findFirst({
      where: { id: fixtureId, projectId },
    });

    return fixture ? this.mapFixture(fixture) : null;
  }

  public async getCurrentBaselineId(
    projectId: string,
    fixtureId: string
  ): Promise<string | null> {
    const history = await this.prisma.fixtureBaselineHistory.findFirst({
      where: { fixtureId, fixture: { projectId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return history ? history.id : null;
  }

  public async createFixture(
    projectId: string,
    input: CreateFixtureInput
  ): Promise<FixtureResponse> {
    return this.prisma.$transaction(async (tx) => {
      const fixture = await tx.fixture.create({
        data: {
          projectId,
          name: input.name,
          description: input.description ?? null,
          tags: input.tags ?? [],
          method: input.request.method as DbHttpMethod,
          path: input.request.path,
          queryParams: (input.request.queryParams ?? {}) as Prisma.InputJsonValue,
          headers: (input.request.headers ?? {}) as Prisma.InputJsonValue,
          bodyType: (input.request.bodyType ?? 'NONE') as DbBodyType,
          body: input.request.body as Prisma.InputJsonValue,
          baselineStatusCode: input.baseline?.statusCode ?? null,
          baselineHeaders: (input.baseline?.headers ?? {}) as Prisma.InputJsonValue,
          baselineBodyType: input.baseline
            ? (input.baseline.bodyType as DbBodyType)
            : null,
          baselineBody: (input.baseline?.body ?? null) as Prisma.InputJsonValue,
          baselineUpdatedAt: input.baseline ? new Date() : null,
        },
      });

      if (input.baseline) {
        await tx.fixtureBaselineHistory.create({
          data: {
            fixtureId: fixture.id,
            statusCode: input.baseline.statusCode,
            headers: (input.baseline.headers ?? {}) as Prisma.InputJsonValue,
            bodyType: (input.baseline.bodyType ?? 'NONE') as DbBodyType,
            body: input.baseline.body as Prisma.InputJsonValue,
            reason: 'Initial baseline creation',
          },
        });
      }

      return this.mapFixture(fixture);
    });
  }

  public async updateFixture(
    projectId: string,
    fixtureId: string,
    input: UpdateFixtureInput
  ): Promise<FixtureResponse> {
    const existing = await this.prisma.fixture.findFirst({
      where: { id: fixtureId, projectId },
    });
    if (!existing) throw new Error('Fixture not found');

    const updated = await this.prisma.fixture.update({
      where: { id: fixtureId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.request
          ? {
              method: input.request.method as DbHttpMethod,
              path: input.request.path,
              queryParams: (input.request.queryParams ?? {}) as Prisma.InputJsonValue,
              headers: (input.request.headers ?? {}) as Prisma.InputJsonValue,
              bodyType: (input.request.bodyType ?? 'NONE') as DbBodyType,
              body: input.request.body as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    return this.mapFixture(updated);
  }

  public async updateBaseline(
    projectId: string,
    fixtureId: string,
    input: UpdateBaselineInput
  ): Promise<FixtureResponse> {
    return this.prisma.$transaction(async (tx) => {
      const fixture = await tx.fixture.findFirst({
        where: { id: fixtureId, projectId },
      });
      if (!fixture) throw new Error('Fixture not found');

      // 1. Create immutable snapshot in baseline history
      await tx.fixtureBaselineHistory.create({
        data: {
          fixtureId,
          statusCode: input.baseline.statusCode,
          headers: (input.baseline.headers ?? {}) as Prisma.InputJsonValue,
          bodyType: (input.baseline.bodyType ?? 'NONE') as DbBodyType,
          body: input.baseline.body as Prisma.InputJsonValue,
          reason: 'Explicit baseline update',
        },
      });

      // 2. Update fixture current baseline pointer
      const updated = await tx.fixture.update({
        where: { id: fixtureId },
        data: {
          baselineStatusCode: input.baseline.statusCode,
          baselineHeaders: (input.baseline.headers ?? {}) as Prisma.InputJsonValue,
          baselineBodyType: (input.baseline.bodyType ?? 'NONE') as DbBodyType,
          baselineBody: input.baseline.body as Prisma.InputJsonValue,
          baselineUpdatedAt: new Date(),
        },
      });

      return this.mapFixture(updated);
    });
  }

  public async deleteFixture(
    projectId: string,
    fixtureId: string
  ): Promise<void> {
    await this.prisma.fixture.deleteMany({
      where: { id: fixtureId, projectId },
    });
  }

  // --- Suites ---
  public async listSuites(projectId: string): Promise<SuiteResponse[]> {
    const suites = await this.prisma.regressionSuite.findMany({
      where: { projectId },
      include: {
        items: {
          include: {
            assertions: true,
            maskRules: true,
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return suites.map((s) => this.mapSuite(s));
  }

  public async getSuite(
    projectId: string,
    suiteId: string
  ): Promise<SuiteResponse | null> {
    const suite = await this.prisma.regressionSuite.findFirst({
      where: { id: suiteId, projectId },
      include: {
        items: {
          include: {
            assertions: true,
            maskRules: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    return suite ? this.mapSuite(suite) : null;
  }

  public async createSuite(
    projectId: string,
    input: CreateSuiteInput
  ): Promise<SuiteResponse> {
    return this.prisma.$transaction(async (tx) => {
      const suite = await tx.regressionSuite.create({
        data: {
          projectId,
          name: input.name,
          description: input.description ?? null,
        },
      });

      if (input.items && input.items.length > 0) {
        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i]!;
          const suiteFixture = await tx.suiteFixture.create({
            data: {
              suiteId: suite.id,
              fixtureId: item.fixtureId,
              order: item.order ?? i,
            },
          });

          if (item.assertions && item.assertions.length > 0) {
            for (const assertion of item.assertions) {
              await tx.suiteAssertion.create({
                data: {
                  suiteFixtureId: suiteFixture.id,
                  type: assertion.type as DbAssertionType,
                  path: 'path' in assertion ? assertion.path : null,
                  expectedValue:
                    'expected' in assertion && assertion.expected !== undefined
                      ? (assertion.expected as Prisma.InputJsonValue)
                      : Prisma.JsonNull,
                  maxDurationMs:
                    'maxDurationMs' in assertion
                      ? assertion.maxDurationMs
                      : null,
                },
              });
            }
          }

          if (item.maskRules && item.maskRules.length > 0) {
            for (const mask of item.maskRules) {
              await tx.suiteMaskRule.create({
                data: {
                  suiteFixtureId: suiteFixture.id,
                  path: mask.path,
                  action: mask.action as DbMaskAction,
                },
              });
            }
          }
        }
      }

      const fullSuite = await tx.regressionSuite.findUniqueOrThrow({
        where: { id: suite.id },
        include: {
          items: {
            include: {
              assertions: true,
              maskRules: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      });

      return this.mapSuite(fullSuite);
    });
  }

  public async updateSuite(
    projectId: string,
    suiteId: string,
    input: UpdateSuiteInput
  ): Promise<SuiteResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.regressionSuite.findFirst({
        where: { id: suiteId, projectId },
      });
      if (!existing) throw new Error('Suite not found');

      await tx.regressionSuite.update({
        where: { id: suiteId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });

      if (input.items !== undefined) {
        await tx.suiteFixture.deleteMany({
          where: { suiteId },
        });

        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i]!;
          const suiteFixture = await tx.suiteFixture.create({
            data: {
              suiteId,
              fixtureId: item.fixtureId,
              order: item.order ?? i,
            },
          });

          if (item.assertions && item.assertions.length > 0) {
            for (const assertion of item.assertions) {
              await tx.suiteAssertion.create({
                data: {
                  suiteFixtureId: suiteFixture.id,
                  type: assertion.type as DbAssertionType,
                  path: 'path' in assertion ? assertion.path : null,
                  expectedValue:
                    'expected' in assertion && assertion.expected !== undefined
                      ? (assertion.expected as Prisma.InputJsonValue)
                      : Prisma.JsonNull,
                  maxDurationMs:
                    'maxDurationMs' in assertion
                      ? assertion.maxDurationMs
                      : null,
                },
              });
            }
          }

          if (item.maskRules && item.maskRules.length > 0) {
            for (const mask of item.maskRules) {
              await tx.suiteMaskRule.create({
                data: {
                  suiteFixtureId: suiteFixture.id,
                  path: mask.path,
                  action: mask.action as DbMaskAction,
                },
              });
            }
          }
        }
      }

      const updated = await tx.regressionSuite.findUniqueOrThrow({
        where: { id: suiteId },
        include: {
          items: {
            include: {
              assertions: true,
              maskRules: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      });

      return this.mapSuite(updated);
    });
  }

  public async deleteSuite(projectId: string, suiteId: string): Promise<void> {
    await this.prisma.regressionSuite.deleteMany({
      where: { id: suiteId, projectId },
    });
  }

  // --- Private Mapping Helpers ---
  private mapEnvironment(e: {
    id: string;
    projectId: string;
    name: string;
    baseUrl: string;
    headers: Prisma.JsonValue;
    variables: Array<{
      key: string;
      value: string;
      isSecret: boolean;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }): EnvironmentResponse {
    return {
      id: e.id,
      projectId: e.projectId,
      name: e.name,
      baseUrl: e.baseUrl,
      headers: (e.headers ?? {}) as Record<string, string>,
      variables: e.variables.map((v) => ({
        key: v.key,
        isSecret: v.isSecret,
        value: v.isSecret ? null : v.value, // Never return decrypted secrets in DTO
      })),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private mapFixture(f: {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    tags: string[];
    method: DbHttpMethod;
    path: string;
    queryParams: Prisma.JsonValue;
    headers: Prisma.JsonValue;
    bodyType: DbBodyType;
    body: Prisma.JsonValue | null;
    baselineStatusCode: number | null;
    baselineHeaders: Prisma.JsonValue | null;
    baselineBodyType: DbBodyType | null;
    baselineBody: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): FixtureResponse {
    return {
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      description: f.description,
      tags: f.tags,
      request: {
        method: f.method,
        path: f.path,
        queryParams: (f.queryParams ?? {}) as Record<string, string | string[]>,
        headers: (f.headers ?? {}) as Record<string, string>,
        bodyType: f.bodyType,
        body: f.body ?? undefined,
      },
      baseline: f.baselineStatusCode
        ? {
            statusCode: f.baselineStatusCode,
            headers: (f.baselineHeaders ?? {}) as Record<string, string>,
            bodyType: f.baselineBodyType ?? 'NONE',
            body: f.baselineBody ?? undefined,
          }
        : null,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }

  private mapSuite(s: {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    items: Array<{
      fixtureId: string;
      order: number;
      assertions: Array<{
        type: DbAssertionType;
        path: string | null;
        expectedValue: Prisma.JsonValue | null;
        maxDurationMs: number | null;
      }>;
      maskRules: Array<{
        path: string;
        action: DbMaskAction;
      }>;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }): SuiteResponse {
    return {
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      description: s.description,
      items: s.items.map((it) => ({
        fixtureId: it.fixtureId,
        order: it.order,
        assertions: it.assertions.map((a) => {
          switch (a.type) {
            case 'STATUS_CODE':
              return {
                type: 'STATUS_CODE',
                expected: Number(a.expectedValue),
              };
            case 'JSON_PATH_VALUE':
              return {
                type: 'JSON_PATH_VALUE',
                path: a.path ?? '',
                expected: a.expectedValue,
              };
            case 'JSON_PATH_EXISTS':
              return {
                type: 'JSON_PATH_EXISTS',
                path: a.path ?? '',
              };
            case 'RESPONSE_TIME_MAX':
              return {
                type: 'RESPONSE_TIME_MAX',
                maxDurationMs: a.maxDurationMs ?? 1000,
              };
            default:
              return {
                type: 'STATUS_CODE',
                expected: 200,
              };
          }
        }) as SuiteAssertion[],
        maskRules: it.maskRules.map((m) => ({
          path: m.path,
          action: m.action,
        })) as DifferentialMaskRule[],
      })),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  // --- Replay Runs ---
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
    const run = await this.prisma.replayRun.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        projectId: data.projectId,
        fixtureId: data.fixtureId,
        environmentId: data.environmentId,
        suiteRunId: data.suiteRunId ?? null,
        baselineId: data.baselineId ?? null,
        triggeredById: data.triggeredById ?? null,
        status: data.status as DbReplayOutcomeStatus,
        httpStatusCode: data.httpStatusCode ?? null,
        headers: (data.headers ?? {}) as Prisma.InputJsonValue,
        bodyType: (data.bodyType ?? 'NONE') as DbBodyType,
        body: (data.body ?? null) as Prisma.InputJsonValue,
        durationMs: data.durationMs,
        errorMessage: data.errorMessage ?? null,
        diffFound: data.diffFound,
        diffDetails: (data.diffDetails ?? null) as Prisma.InputJsonValue,
      },
    });

    return {
      id: run.id,
      status: run.status,
      executedAt: run.executedAt.toISOString(),
    };
  }

  public async listReplayRuns(
    projectId: string,
    options?: { limit?: number; offset?: number; fixtureId?: string }
  ) {
    const runs = await this.prisma.replayRun.findMany({
      where: {
        projectId,
        ...(options?.fixtureId ? { fixtureId: options.fixtureId } : {}),
      },
      orderBy: { executedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return runs.map((r) => ({
      id: r.id,
      fixtureId: r.fixtureId,
      environmentId: r.environmentId,
      status: r.status,
      httpStatusCode: r.httpStatusCode,
      durationMs: r.durationMs,
      diffFound: r.diffFound,
      executedAt: r.executedAt.toISOString(),
    }));
  }

  public async getReplayRun(projectId: string, runId: string) {
    const run = await this.prisma.replayRun.findFirst({
      where: { id: runId, projectId },
    });
    if (!run) return null;

    return {
      id: run.id,
      projectId: run.projectId,
      fixtureId: run.fixtureId,
      environmentId: run.environmentId,
      suiteRunId: run.suiteRunId,
      baselineId: run.baselineId,
      status: run.status,
      httpStatusCode: run.httpStatusCode,
      headers: (run.headers ?? {}) as Record<string, string>,
      bodyType: run.bodyType,
      body: run.body,
      durationMs: run.durationMs,
      errorMessage: run.errorMessage,
      diffFound: run.diffFound,
      diffDetails: run.diffDetails,
      executedAt: run.executedAt.toISOString(),
    };
  }

  // --- Suite Runs ---
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
    const run = await this.prisma.suiteRun.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        projectId: data.projectId,
        suiteId: data.suiteId,
        environmentId: data.environmentId,
        triggeredById: data.triggeredById ?? null,
        status: data.status as DbReplayOutcomeStatus,
        totalItems: data.totalItems,
        suiteSnapshot: data.suiteSnapshot as Prisma.InputJsonValue,
      },
    });

    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
    };
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
    await this.prisma.suiteRun.update({
      where: { id: suiteRunId },
      data: {
        status: data.status as DbReplayOutcomeStatus,
        passedItems: data.passedItems,
        failedItems: data.failedItems,
        durationMs: data.durationMs,
        completedAt: new Date(data.completedAt),
      },
    });
  }

  public async listSuiteRuns(
    projectId: string,
    suiteId?: string,
    options?: { limit?: number; offset?: number }
  ) {
    const runs = await this.prisma.suiteRun.findMany({
      where: {
        projectId,
        ...(suiteId ? { suiteId } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return runs.map((r) => ({
      id: r.id,
      suiteId: r.suiteId,
      environmentId: r.environmentId,
      status: r.status,
      totalItems: r.totalItems,
      passedItems: r.passedItems,
      failedItems: r.failedItems,
      durationMs: r.durationMs,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));
  }

  // --- Audit Logs ---
  public async createAuditLog(data: {
    projectId?: string | null;
    userId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        projectId: data.projectId ?? null,
        userId: data.userId ?? null,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  public async listAuditLogs(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ) {
    const logs = await this.prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      metadata: (l.metadata ?? {}) as Record<string, unknown>,
      createdAt: l.createdAt.toISOString(),
    }));
  }
}
