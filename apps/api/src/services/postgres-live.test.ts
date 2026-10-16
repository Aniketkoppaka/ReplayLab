import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@replaylab/db';
import { PrismaProjectStore } from './prisma-project-store.js';
import { createApp } from '../app.js';
import { createTestToken } from '../auth/token-verifier.js';
import { ProjectService } from './project-service.js';
import { AuthorizedReplayService } from './authorized-replay-service.js';
import request from 'supertest';

// Skip if DATABASE_URL is not provided
const isPostgresLive = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgresql://'));
const conditionalDescribe = isPostgresLive ? describe : describe.skip;

conditionalDescribe('Live Supabase PostgreSQL Acceptance & Concurrency Suite', { timeout: 30000 }, () => {
  let prisma: PrismaClient;
  let store: PrismaProjectStore;
  let projectService: ProjectService;
  let replayService: AuthorizedReplayService;
  let app: ReturnType<typeof createApp>;

  const jwtSecret = 'test-jwt-secret-min-32-chars-for-live-pg-acceptance!';
  const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const userOwnerA = { id: `usr_owner_a_${Date.now()}`, email: `owner_a_${Date.now()}@test.replaylab.dev` };
  const userOwnerB = { id: `usr_owner_b_${Date.now()}`, email: `owner_b_${Date.now()}@test.replaylab.dev` };
  const userOutsider = { id: `usr_outsider_${Date.now()}`, email: `outsider_${Date.now()}@test.replaylab.dev` };

  let tokenOwnerA: string;
  let _tokenOwnerB: string;
  let tokenOutsider: string;

  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = jwtSecret;
    process.env.APP_ENCRYPTION_KEY = encryptionKey;

    prisma = new PrismaClient();
    store = new PrismaProjectStore(prisma);
    projectService = new ProjectService(store);
    replayService = new AuthorizedReplayService(projectService, store);
    app = createApp({ projectService, replayService });

    tokenOwnerA = await createTestToken(userOwnerA, jwtSecret);
    _tokenOwnerB = await createTestToken(userOwnerB, jwtSecret);
    tokenOutsider = await createTestToken(userOutsider, jwtSecret);

    // Sync users into the database
    await store.syncUser({ id: userOwnerA.id, email: userOwnerA.email, name: 'Owner A' });
    await store.syncUser({ id: userOwnerB.id, email: userOwnerB.email, name: 'Owner B' });
    await store.syncUser({ id: userOutsider.id, email: userOutsider.email, name: 'Outsider' });
  });

  afterAll(async () => {
    // Deterministic cleanup of test projects created during the run
    for (const projId of createdProjectIds) {
      try {
        await prisma.project.delete({ where: { id: projId } });
      } catch {
        // Ignore deletion errors during cleanup
      }
    }
    // Delete test users
    try {
      await prisma.user.deleteMany({
        where: {
          id: { in: [userOwnerA.id, userOwnerB.id, userOutsider.id] },
        },
      });
    } catch {
      // Ignore
    }
    await prisma.$disconnect();
  });

  describe('1. Real PostgreSQL Persistence & Relations', () => {
    let projectId: string;
    let envId: string;
    let fixtureId: string;
    let suiteId: string;

    it('persists project and owner membership in PostgreSQL', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Live PG Persistence Test',
          description: 'Testing real PostgreSQL writes',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      projectId = res.body.id;
      createdProjectIds.push(projectId);

      // Verify row actually exists in PostgreSQL
      const dbProject = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: true },
      });

      expect(dbProject).not.toBeNull();
      expect(dbProject!.name).toBe('Live PG Persistence Test');
      expect(dbProject!.members.length).toBe(1);
      expect(dbProject!.members[0]!.userId).toBe(userOwnerA.id);
      expect(dbProject!.members[0]!.role).toBe('OWNER');
    });

    it('persists environment with encrypted secrets and verifies plaintext is never stored', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/environments`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Production Target',
          baseUrl: 'https://api.example.com',
          headers: { 'X-Custom-Env': 'live-pg' },
          variables: [
            { key: 'API_SECRET_KEY', value: 'my-super-secret-password-12345', isSecret: true },
            { key: 'PUBLIC_FLAG', value: 'true', isSecret: false },
          ],
        });

      expect(res.status).toBe(201);
      envId = res.body.id;

      // Assert API response masks secret: contract specifies null for secrets
      const secretVar = res.body.variables.find((v: { key: string }) => v.key === 'API_SECRET_KEY');
      expect(secretVar.value).toBeNull();
      expect(secretVar.isSecret).toBe(true);

      // Assert database record has ciphertext and IV, never plaintext
      const dbVar = await prisma.environmentVariable.findFirst({
        where: { environmentId: envId, key: 'API_SECRET_KEY' },
      });

      expect(dbVar).not.toBeNull();
      expect(dbVar!.value).not.toBe('my-super-secret-password-12345');
      expect(dbVar!.secretIv).toBeDefined();
      expect(dbVar!.secretAuthTag).toBeDefined();

      // Retrieve decrypted secrets through internal store
      const internalSecrets = await store.getEnvironmentSecrets(projectId, envId);
      expect(internalSecrets).not.toBeNull();
      const internalVar = internalSecrets!.variables.find((v) => v.key === 'API_SECRET_KEY');
      expect(internalVar!.value).toBe(dbVar!.value); // Ciphertext in store, decrypted in replay
    });

    it('persists fixture and creates immutable baseline history snapshots', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Fetch Users Fixture',
          request: {
            method: 'GET',
            path: '/users',
            bodyType: 'NONE',
          },
        });

      expect(res.status).toBe(201);
      fixtureId = res.body.id;

      // Update baseline version 1
      const v1Res = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures/${fixtureId}/baseline`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          baseline: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ count: 0, users: [] }),
            bodyType: 'JSON',
          },
        });

      expect(v1Res.status).toBe(200);

      // Update baseline version 2
      const v2Res = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures/${fixtureId}/baseline`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          baseline: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ count: 1, users: [{ id: 'usr_1' }] }),
            bodyType: 'JSON',
          },
        });

      expect(v2Res.status).toBe(200);

      // Check PostgreSQL database: both historical snapshots must exist immutably
      const history = await prisma.fixtureBaselineHistory.findMany({
        where: { fixtureId },
        orderBy: { createdAt: 'asc' },
      });

      expect(history.length).toBe(2);
      expect(history[0]!.body).toContain('"users":[]');
      expect(history[1]!.body).toContain('usr_1');

      // Verify immutability: store interface offers NO baseline-history update or delete mutations.
      // Furthermore, subsequent fixture updates do not alter existing baseline history records.
      await store.updateFixture(projectId, fixtureId, {
        name: 'Fetch Users Fixture (Renamed)',
      });

      const historyAfterFixtureRename = await prisma.fixtureBaselineHistory.findMany({
        where: { fixtureId },
        orderBy: { createdAt: 'asc' },
      });
      expect(historyAfterFixtureRename.length).toBe(2);
      expect(historyAfterFixtureRename[0]!.body).toBe(history[0]!.body);
      expect(historyAfterFixtureRename[1]!.body).toBe(history[1]!.body);
    });

    it('persists suite and suite fixtures in PostgreSQL', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/suites`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Regression Suite Live',
          description: 'Live test suite against Supabase PG',
          items: [
            {
              fixtureId,
              order: 0,
              assertions: [{ type: 'STATUS_CODE', expected: 200 }],
            },
          ],
        });

      expect(res.status).toBe(201);
      suiteId = res.body.id;

      const dbSuite = await prisma.regressionSuite.findUnique({
        where: { id: suiteId },
        include: { items: true },
      });

      expect(dbSuite).not.toBeNull();
      expect(dbSuite!.items.length).toBe(1);
      expect(dbSuite!.items[0]!.fixtureId).toBe(fixtureId);
    });

    it('enforces foreign key cascading deletion in PostgreSQL', async () => {
      // Create disposable project
      const tempProject = await store.createProject(userOwnerA.id, { name: 'Cascade Temp' });
      const tempEnv = await store.createEnvironment(tempProject.id, {
        name: 'Temp Env',
        baseUrl: 'https://example.com',
        headers: {},
        variables: [],
      });
      const tempFixture = await store.createFixture(tempProject.id, {
        name: 'Temp Fix',
        tags: [],
        request: {
          method: 'GET',
          path: '/temp',
          headers: {},
          queryParams: {},
          bodyType: 'NONE',
        },
      });

      // Delete the project
      await store.deleteProject(tempProject.id);

      // Verify cascading deletion removed environment and fixture rows from PostgreSQL
      const envCheck = await prisma.environment.findUnique({ where: { id: tempEnv.id } });
      const fixCheck = await prisma.fixture.findUnique({ where: { id: tempFixture.id } });
      expect(envCheck).toBeNull();
      expect(fixCheck).toBeNull();
    });

    it('survives API process restart: creating a new app instance preserves all PostgreSQL state', async () => {
      // Simulate complete process restart: instantiate a separate database client, store, service, and Express app
      const restartedPrisma = new PrismaClient();
      const restartedStore = new PrismaProjectStore(restartedPrisma);
      const restartedProjectService = new ProjectService(restartedStore);
      const restartedReplayService = new AuthorizedReplayService(restartedProjectService, restartedStore);
      const restartedApp = createApp({
        projectService: restartedProjectService,
        replayService: restartedReplayService,
      });

      try {
        // Query the restarted Express API instance over HTTP
        const res = await request(restartedApp)
          .get(`/api/v1/projects/${projectId}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(projectId);
        expect(res.body.name).toBe('Live PG Persistence Test');

        // Query environment via restarted API instance
        const envRes = await request(restartedApp)
          .get(`/api/v1/projects/${projectId}/environments/${envId}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`);

        expect(envRes.status).toBe(200);
        expect(envRes.body.id).toBe(envId);
        expect(envRes.body.name).toBe('Production Target');

        // Query fixture and baseline via restarted API instance
        const fixRes = await request(restartedApp)
          .get(`/api/v1/projects/${projectId}/fixtures/${fixtureId}`)
          .set('Authorization', `Bearer ${tokenOwnerA}`);

        expect(fixRes.status).toBe(200);
        expect(fixRes.body.id).toBe(fixtureId);
        expect(fixRes.body.baseline).toBeDefined();
        expect(fixRes.body.baseline.statusCode).toBe(200);
      } finally {
        await restartedPrisma.$disconnect();
      }
    });
  });

  describe('2. Multi-Tenant Isolation & 404 Non-Disclosure on Live DB', () => {
    let projectAId: string;
    let projectBId: string;
    let fixtureAId: string;

    beforeAll(async () => {
      const pA = await store.createProject(userOwnerA.id, { name: 'Tenant A Project' });
      projectAId = pA.id;
      createdProjectIds.push(projectAId);

      const fA = await store.createFixture(projectAId, {
        name: 'Secret Fixture A',
        tags: [],
        request: {
          method: 'GET',
          path: '/secret-a',
          headers: {},
          queryParams: {},
          bodyType: 'NONE',
        },
      });
      fixtureAId = fA.id;

      const pB = await store.createProject(userOutsider.id, { name: 'Tenant B Project' });
      projectBId = pB.id;
      createdProjectIds.push(projectBId);
    });

    it('returns 404 NOT_FOUND when outsider attempts to access Tenant A project', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectAId}`)
        .set('Authorization', `Bearer ${tokenOutsider}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when accessing Tenant A fixture via Tenant B URL path', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectBId}/fixtures/${fixtureAId}`)
        .set('Authorization', `Bearer ${tokenOutsider}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('3. Concurrency-Safe Last-Owner Protection against Live PostgreSQL', () => {
    let raceProjectId: string;
    let memberAId: string;
    let memberBId: string;

    beforeEach(async () => {
      // Create project with Owner A
      const p = await store.createProject(userOwnerA.id, { name: `Concurrency Race ${Date.now()}` });
      raceProjectId = p.id;
      createdProjectIds.push(raceProjectId);

      // Add Owner B
      const mB = await store.assignProjectMember(raceProjectId, {
        userId: userOwnerB.id,
        role: 'OWNER',
      });
      memberBId = mB.id;

      const members = await store.listProjectMembers(raceProjectId);
      const mA = members.find((m) => m.userId === userOwnerA.id);
      expect(mA).toBeDefined();
      memberAId = mA!.id;

      // Verify exactly two owners exist before race
      const ownerCount = await prisma.projectMember.count({
        where: { projectId: raceProjectId, role: 'OWNER' },
      });
      expect(ownerCount).toBe(2);
    });

    it('concurrent removal of both owners rejects at least one and leaves exactly one owner', async () => {
      // Execute both removals concurrently against live PostgreSQL
      const results = await Promise.allSettled([
        store.removeProjectMember(raceProjectId, memberAId),
        store.removeProjectMember(raceProjectId, memberBId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed and one must fail
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify the rejection was caused by LAST_OWNER_PROTECTION
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason.message).toContain('LAST_OWNER_PROTECTION');

      // Verify exactly one owner remains in PostgreSQL
      const remainingOwners = await prisma.projectMember.findMany({
        where: { projectId: raceProjectId, role: 'OWNER' },
      });
      expect(remainingOwners.length).toBe(1);
    });

    it('concurrent demotion of both owners rejects at least one and leaves at least one owner', async () => {
      // Execute both demotions concurrently against live PostgreSQL
      const results = await Promise.allSettled([
        store.assignProjectMember(raceProjectId, { userId: userOwnerA.id, role: 'VIEWER' }),
        store.assignProjectMember(raceProjectId, { userId: userOwnerB.id, role: 'VIEWER' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason.message).toContain('LAST_OWNER_PROTECTION');

      const remainingOwners = await prisma.projectMember.findMany({
        where: { projectId: raceProjectId, role: 'OWNER' },
      });
      expect(remainingOwners.length).toBe(1);
    });
  });

  describe('5. Real PostgreSQL ReplayRun, SuiteRun & AuditLog Persistence', () => {
    let p4ProjectId: string;
    let p4EnvId: string;
    let p4FixtureId: string;
    let p4SuiteId: string;

    beforeAll(async () => {
      const proj = await store.createProject(userOwnerA.id, {
        name: `P4 Live Test ${Date.now()}`,
      });
      p4ProjectId = proj.id;
      createdProjectIds.push(p4ProjectId);

      const env = await store.createEnvironment(p4ProjectId, {
        name: 'Staging',
        baseUrl: 'https://httpbin.org',
        headers: {},
        variables: [{ key: 'API_KEY', value: 'secret-val', isSecret: true }],
      });
      p4EnvId = env.id;

      const fixture = await store.createFixture(p4ProjectId, {
        name: 'Get User Fixture',
        tags: [],
        request: {
          method: 'GET',
          path: '/get',
          queryParams: {},
          bodyType: 'NONE',
          headers: { 'Accept': 'application/json' },
        },
      });
      p4FixtureId = fixture.id;

      await store.updateBaseline(p4ProjectId, p4FixtureId, {
        baseline: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true }),
          bodyType: 'JSON',
        },
      });

      const suite = await store.createSuite(p4ProjectId, {
        name: 'Smoke Test Suite',
        description: 'Verifies live suite runs',
        items: [
          {
            fixtureId: p4FixtureId,
            order: 0,
            assertions: [
              { type: 'STATUS_CODE', expected: 200 },
            ],
            maskRules: [],
          },
        ],
      });
      p4SuiteId = suite.id;
    });

    it('persists a durable ReplayRun and retrieves it via PrismaProjectStore', async () => {
      const run = await store.createReplayRun({
        projectId: p4ProjectId,
        fixtureId: p4FixtureId,
        environmentId: p4EnvId,
        triggeredById: userOwnerA.id,
        status: 'SUCCESS',
        httpStatusCode: 200,
        durationMs: 142,
        diffFound: false,
        headers: { 'content-type': 'application/json' },
        body: null,
      });

      expect(run.id).toBeDefined();
      expect(run.status).toBe('SUCCESS');

      const fetched = await store.getReplayRun(p4ProjectId, run.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(run.id);
      expect(fetched!.httpStatusCode).toBe(200);

      const list = await store.listReplayRuns(p4ProjectId, { fixtureId: p4FixtureId });
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((r) => r.id === run.id)).toBe(true);
    });

    it('persists a durable SuiteRun with snapshot and links to Prisma', async () => {
      const snapshot = {
        suiteId: p4SuiteId,
        suiteName: 'Smoke Test Suite',
        environmentId: p4EnvId,
        fixtures: [{ fixtureId: p4FixtureId, orderIndex: 0 }],
      };

      const suiteRun = await store.createSuiteRun({
        projectId: p4ProjectId,
        suiteId: p4SuiteId,
        environmentId: p4EnvId,
        triggeredById: userOwnerA.id,
        status: 'SUCCESS',
        totalItems: 1,
        suiteSnapshot: snapshot,
      });

      expect(suiteRun.id).toBeDefined();
      expect(suiteRun.status).toBe('SUCCESS');

      await store.updateSuiteRun(suiteRun.id, {
        status: 'SUCCESS',
        passedItems: 1,
        failedItems: 0,
        durationMs: 250,
        completedAt: new Date().toISOString(),
      });

      const list = await store.listSuiteRuns(p4ProjectId, p4SuiteId);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const found = list.find((sr) => sr.id === suiteRun.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('SUCCESS');
      expect(found!.passedItems).toBe(1);
    });

    it('persists durable AuditLog entries and enforces project isolation', async () => {
      await store.createAuditLog({
        projectId: p4ProjectId,
        userId: userOwnerA.id,
        action: 'SUITE_EXECUTED',
        targetType: 'RegressionSuite',
        targetId: p4SuiteId,
        metadata: { status: 'PASSED' },
      });

      const logs = await store.listAuditLogs(p4ProjectId);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some((l) => l.action === 'SUITE_EXECUTED' && l.targetId === p4SuiteId)).toBe(true);
    });

    it('links child ReplayRuns to parent SuiteRun via suiteRunId foreign key in PostgreSQL', async () => {
      const suiteRun = await store.createSuiteRun({
        projectId: p4ProjectId,
        suiteId: p4SuiteId,
        environmentId: p4EnvId,
        triggeredById: userOwnerA.id,
        status: 'SUCCESS',
        totalItems: 1,
        suiteSnapshot: { id: p4SuiteId, name: 'Linked Suite' },
      });

      const childRun = await store.createReplayRun({
        projectId: p4ProjectId,
        fixtureId: p4FixtureId,
        environmentId: p4EnvId,
        suiteRunId: suiteRun.id,
        triggeredById: userOwnerA.id,
        status: 'SUCCESS',
        httpStatusCode: 200,
        headers: { 'content-type': 'application/json' },
        bodyType: 'JSON',
        body: { ok: true },
        durationMs: 15,
        diffFound: false,
      });

      const fetchedRun = await store.getReplayRun(p4ProjectId, childRun.id);
      expect(fetchedRun?.suiteRunId).toBe(suiteRun.id);

      // Verify Prisma query directly from database
      const dbRun = await prisma.replayRun.findUnique({
        where: { id: childRun.id },
      });
      expect(dbRun?.suiteRunId).toBe(suiteRun.id);
    });
  });
  describe('6. Atomic mutation + audit (live PostgreSQL)', () => {
    let p4ProjectId: string;
    let p4FixtureId: string;

    beforeAll(async () => {
      const proj = await store.createProject(userOwnerA.id, { name: 'Atomic Audit Project' });
      createdProjectIds.push(proj.id);
      p4ProjectId = proj.id;
      const fx = await store.createFixture(p4ProjectId, {
        name: 'Atomic Fixture',
        tags: [],
        request: { method: 'GET', path: '/atomic', headers: {}, queryParams: {}, bodyType: 'NONE' },
        baseline: { statusCode: 200, headers: {}, bodyType: 'JSON', body: { initial: true } },
      });
      p4FixtureId = fx.id;
    });
    // An actor id that does not exist violates the audit_logs.userId FK, forcing the audit insert
    // to fail INSIDE the transaction without any mocking. The mutation must then roll back.
    const ghostActor = `usr_ghost_${Date.now()}`;

    it('baseline update + BASELINE_UPDATED commit atomically; audit failure rolls back the snapshot', async () => {
      const before = await prisma.fixtureBaselineHistory.count({ where: { fixtureId: p4FixtureId } });
      const beforeSnap = await store.getBaselineSnapshot(p4ProjectId, p4FixtureId);

      await expect(
        store.updateBaseline(
          p4ProjectId,
          p4FixtureId,
          { baseline: { statusCode: 201, headers: {}, bodyType: 'JSON', body: { rolledBack: true } } },
          ghostActor
        )
      ).rejects.toThrow();

      expect(await prisma.fixtureBaselineHistory.count({ where: { fixtureId: p4FixtureId } })).toBe(before);
      expect(await store.getBaselineSnapshot(p4ProjectId, p4FixtureId)).toEqual(beforeSnap);

      // Success path: snapshot + audit both present, audit references the exact snapshot id.
      await store.updateBaseline(
        p4ProjectId,
        p4FixtureId,
        { baseline: { statusCode: 202, headers: {}, bodyType: 'JSON', body: { committed: true } } },
        userOwnerA.id
      );
      const snap = await store.getBaselineSnapshot(p4ProjectId, p4FixtureId);
      expect(snap?.statusCode).toBe(202);
      expect(snap?.body).toEqual({ committed: true });
      const audit = await prisma.auditLog.findFirst({
        where: { projectId: p4ProjectId, action: 'BASELINE_UPDATED', targetId: p4FixtureId },
        orderBy: { createdAt: 'desc' },
      });
      expect((audit?.metadata as { baselineId?: string }).baselineId).toBe(snap?.id);
    });

    it('baseline history rows cannot be altered through the store API (append-only)', async () => {
      const rows = await prisma.fixtureBaselineHistory.findMany({
        where: { fixtureId: p4FixtureId },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const firstBody = JSON.stringify(rows[0]!.body);
      await store.updateBaseline(
        p4ProjectId,
        p4FixtureId,
        { baseline: { statusCode: 203, headers: {}, bodyType: 'JSON', body: { another: true } } },
        userOwnerA.id
      );
      const again = await prisma.fixtureBaselineHistory.findUnique({ where: { id: rows[0]!.id } });
      expect(JSON.stringify(again!.body)).toBe(firstBody);
    });

    it('member assign/remove + audit are atomic; audit failure rolls back membership and user creation', async () => {
      const newUserId = `usr_atomic_${Date.now()}`;

      await expect(
        store.assignProjectMember(p4ProjectId, { userId: newUserId, role: 'VIEWER' }, ghostActor)
      ).rejects.toThrow();
      expect((await store.listProjectMembers(p4ProjectId)).some((m) => m.userId === newUserId)).toBe(false);
      expect(await prisma.user.findUnique({ where: { id: newUserId } })).toBeNull();

      const member = await store.assignProjectMember(
        p4ProjectId,
        { userId: newUserId, role: 'VIEWER' },
        userOwnerA.id
      );
      expect(
        await prisma.auditLog.count({
          where: { projectId: p4ProjectId, action: 'MEMBER_ASSIGNED', targetId: member.id },
        })
      ).toBe(1);

      await expect(store.removeProjectMember(p4ProjectId, member.id, ghostActor)).rejects.toThrow();
      expect((await store.listProjectMembers(p4ProjectId)).some((m) => m.id === member.id)).toBe(true);

      await store.removeProjectMember(p4ProjectId, member.id, userOwnerA.id);
      expect((await store.listProjectMembers(p4ProjectId)).some((m) => m.id === member.id)).toBe(false);
      expect(
        await prisma.auditLog.count({
          where: { projectId: p4ProjectId, action: 'MEMBER_REMOVED', targetId: member.id },
        })
      ).toBe(1);
      await prisma.user.delete({ where: { id: newUserId } }).catch(() => undefined);
    });

    it('project delete + PROJECT_DELETED commit atomically; audit failure keeps the project', async () => {
      const project = await store.createProject(userOwnerA.id, { name: 'Atomic Delete Probe' });
      createdProjectIds.push(project.id);

      await expect(store.deleteProject(project.id, ghostActor)).rejects.toThrow();
      expect(await store.getProject(project.id)).not.toBeNull();

      await store.deleteProject(project.id, userOwnerA.id);
      expect(await store.getProject(project.id)).toBeNull();
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'PROJECT_DELETED', targetId: project.id },
      });
      expect(audit).not.toBeNull();
      expect(audit!.projectId).toBeNull();
      expect(audit!.userId).toBe(userOwnerA.id);
      await prisma.auditLog.deleteMany({ where: { action: 'PROJECT_DELETED', targetId: project.id } });
    });
  });
});
