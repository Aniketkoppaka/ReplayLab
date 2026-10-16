import express, { type Router, type Response } from 'express';
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  AssignProjectMemberInputSchema,
  CreateEnvironmentInputSchema,
  UpdateEnvironmentInputSchema,
  CreateFixtureInputSchema,
  UpdateFixtureInputSchema,
  UpdateBaselineInputSchema,
  CreateSuiteInputSchema,
  UpdateSuiteInputSchema,
  TriggerReplayInputSchema,
  TriggerSuiteExecutionInputSchema,
} from '@replaylab/contracts';
import { authenticate, type AuthenticatedRequest } from '../auth/auth-middleware.js';
import { ProjectService, ProjectAuthorizationError } from '../services/project-service.js';
import { AuthorizedReplayService } from '../services/authorized-replay-service.js';
import { ConcurrencyAdmissionError } from '../replay-engine/index.js';
import { ZodError } from 'zod';

export function createApiRouter(
  projectService: ProjectService,
  replayService: AuthorizedReplayService
): Router {
  const router = express.Router();

  // Protect all API routes with JWT Authentication
  router.use(authenticate());

  const p = (val: string | string[] | undefined): string => {
    return Array.isArray(val) ? val[0]! : val ?? '';
  };

  // Helper for safe error responses
  const handleError = (res: Response, err: unknown) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        },
      });
      return;
    }

    if (err instanceof ProjectAuthorizationError) {
      res.status(err.code === 'NOT_FOUND' ? 404 : 403).json({
        error: {
          code: err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN',
          message: err.message,
        },
      });
      return;
    }

    if (err instanceof Error && err.message.startsWith('LAST_OWNER_PROTECTION')) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: err.message,
        },
      });
      return;
    }

    if (err instanceof ConcurrencyAdmissionError) {
      // Map admission saturation to HTTP 503 without fabricating a run
      res.status(503).json({
        error: {
          code: 'ADMISSION_REJECTED',
          message: 'Server is currently at maximum capacity; please retry later',
        },
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    if (
      message.startsWith('FIXTURE_NOT_FOUND') ||
      message.startsWith('ENVIRONMENT_NOT_FOUND') ||
      message.startsWith('SUITE_NOT_FOUND') ||
      message.startsWith('MEMBER_NOT_FOUND') ||
      message.startsWith('RESOURCE_NOT_FOUND')
    ) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Requested resource not found in project',
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    });
  };

  // --- Projects ---
  router.get('/projects', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projects = await projectService.listUserProjects(user.id);
      res.json(projects);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = CreateProjectInputSchema.parse(req.body);
      const project = await projectService.createProject(user.id, input);
      res.status(201).json(project);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const project = await projectService.getProject(p(req.params.projectId), user.id);
      res.json(project);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/projects/:projectId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = UpdateProjectInputSchema.parse(req.body);
      const project = await projectService.updateProject(p(req.params.projectId), user.id, input);
      res.json(project);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/projects/:projectId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      await projectService.deleteProject(projectId, user.id);
      try {
        await projectService.store.createAuditLog({
          projectId: null,
          userId: user.id,
          action: 'PROJECT_DELETED',
          targetType: 'Project',
          targetId: projectId,
          metadata: { projectId },
        });
      } catch {
        // Audit persistence failure should not roll back completed deletion
      }
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Members ---
  router.get('/projects/:projectId/members', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const members = await projectService.listMembers(p(req.params.projectId), user.id);
      res.json(members);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects/:projectId/members', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      const input = AssignProjectMemberInputSchema.parse(req.body);
      const member = await projectService.assignMember(projectId, user.id, input);
      try {
        await projectService.store.createAuditLog({
          projectId,
          userId: user.id,
          action: 'MEMBER_ASSIGNED',
          targetType: 'ProjectMember',
          targetId: member.id,
          metadata: { assignedUserId: member.userId, role: member.role },
        });
      } catch {
        // Non-fatal
      }
      res.status(201).json(member);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/projects/:projectId/members/:memberId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      const memberId = p(req.params.memberId);
      await projectService.removeMember(projectId, user.id, memberId);
      try {
        await projectService.store.createAuditLog({
          projectId,
          userId: user.id,
          action: 'MEMBER_REMOVED',
          targetType: 'ProjectMember',
          targetId: memberId,
          metadata: { memberId },
        });
      } catch {
        // Non-fatal
      }
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Environments ---
  router.get('/projects/:projectId/environments', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const envs = await projectService.listEnvironments(p(req.params.projectId), user.id);
      res.json(envs);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects/:projectId/environments', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = CreateEnvironmentInputSchema.parse(req.body);
      const env = await projectService.createEnvironment(p(req.params.projectId), user.id, input);
      res.status(201).json(env);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId/environments/:envId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const env = await projectService.getEnvironment(p(req.params.projectId), p(req.params.envId), user.id);
      res.json(env);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/projects/:projectId/environments/:envId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = UpdateEnvironmentInputSchema.parse(req.body);
      const env = await projectService.updateEnvironment(
        p(req.params.projectId),
        p(req.params.envId),
        user.id,
        input
      );
      res.json(env);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/projects/:projectId/environments/:envId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      await projectService.deleteEnvironment(p(req.params.projectId), p(req.params.envId), user.id);
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Fixtures ---
  router.get('/projects/:projectId/fixtures', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const fixtures = await projectService.listFixtures(p(req.params.projectId), user.id);
      res.json(fixtures);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects/:projectId/fixtures', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = CreateFixtureInputSchema.parse(req.body);
      const fixture = await projectService.createFixture(p(req.params.projectId), user.id, input);
      res.status(201).json(fixture);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId/fixtures/:fixtureId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const fixture = await projectService.getFixture(p(req.params.projectId), p(req.params.fixtureId), user.id);
      res.json(fixture);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/projects/:projectId/fixtures/:fixtureId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = UpdateFixtureInputSchema.parse(req.body);
      const fixture = await projectService.updateFixture(
        p(req.params.projectId),
        p(req.params.fixtureId),
        user.id,
        input
      );
      res.json(fixture);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects/:projectId/fixtures/:fixtureId/baseline', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      const fixtureId = p(req.params.fixtureId);
      const input = UpdateBaselineInputSchema.parse(req.body);
      const fixture = await projectService.updateBaseline(
        projectId,
        fixtureId,
        user.id,
        input
      );
      try {
        await projectService.store.createAuditLog({
          projectId,
          userId: user.id,
          action: 'BASELINE_UPDATED',
          targetType: 'Fixture',
          targetId: fixtureId,
          metadata: { statusCode: input.baseline.statusCode, bodyType: input.baseline.bodyType },
        });
      } catch {
        // Non-fatal
      }
      res.json(fixture);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/projects/:projectId/fixtures/:fixtureId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      await projectService.deleteFixture(p(req.params.projectId), p(req.params.fixtureId), user.id);
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Suites ---
  router.get('/projects/:projectId/suites', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const suites = await projectService.listSuites(p(req.params.projectId), user.id);
      res.json(suites);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/projects/:projectId/suites', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = CreateSuiteInputSchema.parse(req.body);
      const suite = await projectService.createSuite(p(req.params.projectId), user.id, input);
      res.status(201).json(suite);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId/suites/:suiteId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const suite = await projectService.getSuite(p(req.params.projectId), p(req.params.suiteId), user.id);
      res.json(suite);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.patch('/projects/:projectId/suites/:suiteId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = UpdateSuiteInputSchema.parse(req.body);
      const suite = await projectService.updateSuite(
        p(req.params.projectId),
        p(req.params.suiteId),
        user.id,
        input
      );
      res.json(suite);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.delete('/projects/:projectId/suites/:suiteId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      await projectService.deleteSuite(p(req.params.projectId), p(req.params.suiteId), user.id);
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Replay Trigger ---
  router.post('/projects/:projectId/replay', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const input = TriggerReplayInputSchema.parse(req.body);

      const result = await replayService.triggerReplay({
        projectId: p(req.params.projectId),
        fixtureId: input.fixtureId,
        environmentId: input.environmentId,
        userId: user.id,
        captureResponseBody: input.captureResponseBody === true,
      });

      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Runs History & Inspection ---
  router.get('/projects/:projectId/runs', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      await projectService.assertPermission(projectId, user.id, 'replay:read');

      const fixtureId = req.query.fixtureId ? String(req.query.fixtureId) : undefined;
      if (fixtureId) {
        // Enforce 404 non-disclosure: fixture must exist within this project
        const fixture = await projectService.store.getFixture(projectId, fixtureId);
        if (!fixture) {
          res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: 'Fixture not found in project',
            },
          });
          return;
        }
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const runs = await projectService.store.listReplayRuns(projectId, { limit, offset, fixtureId });
      res.json(runs);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId/runs/:runId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      await projectService.assertPermission(projectId, user.id, 'replay:read');

      const run = await projectService.store.getReplayRun(projectId, p(req.params.runId));
      if (!run) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Replay run not found in project',
          },
        });
        return;
      }

      res.json(run);
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Suite Execution & History ---
  router.post('/projects/:projectId/suites/:suiteId/run', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      const suiteId = p(req.params.suiteId);
      const input = TriggerSuiteExecutionInputSchema.parse(req.body);

      const summary = await replayService.triggerSuiteExecution({
        projectId,
        suiteId,
        environmentId: input.environmentId,
        userId: user.id,
        captureResponseBody: input.captureResponseBody === true,
      });

      res.json(summary);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/projects/:projectId/suites/:suiteId/runs', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      const suiteId = p(req.params.suiteId);
      await projectService.assertPermission(projectId, user.id, 'replay:read');

      // Enforce 404 non-disclosure: suite must exist in project
      const suite = await projectService.store.getSuite(projectId, suiteId);
      if (!suite) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Regression suite not found in project',
          },
        });
        return;
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const runs = await projectService.store.listSuiteRuns(projectId, suiteId, { limit, offset });
      res.json(runs);
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- Audit Logs ---
  router.get('/projects/:projectId/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const projectId = p(req.params.projectId);
      await projectService.assertPermission(projectId, user.id, 'member:manage');

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const logs = await projectService.store.listAuditLogs(projectId, { limit, offset });
      res.json(logs);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}
