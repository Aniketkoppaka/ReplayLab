import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createTestToken } from './auth/token-verifier.js';
import { InMemoryProjectStore } from './services/in-memory-project-store.js';
import { ProjectService } from './services/project-service.js';
import { AuthorizedReplayService } from './services/authorized-replay-service.js';
import { ConcurrencyAdmissionError } from './replay-engine/admission-controller.js';

describe('Authenticated API Foundation Integration Tests', () => {
  const secretKey = 'super-secret-jwt-key-for-test-suites-minimum-32-chars';
  let app: ReturnType<typeof createApp>;
  let store: InMemoryProjectStore;
  let projectService: ProjectService;
  let replayService: AuthorizedReplayService;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  const ownerId = 'usr_owner_001';
  const editorId = 'usr_editor_002';
  const viewerId = 'usr_viewer_003';
  const outsiderId = 'usr_outsider_004';

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = secretKey;
    process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    store = new InMemoryProjectStore();
    projectService = new ProjectService(store);
    replayService = new AuthorizedReplayService(projectService, store);
    app = createApp({ projectService, replayService });

    ownerToken = await createTestToken({ id: ownerId, email: 'owner@replaylab.dev' }, secretKey);
    editorToken = await createTestToken({ id: editorId, email: 'editor@replaylab.dev' }, secretKey);
    viewerToken = await createTestToken({ id: viewerId, email: 'viewer@replaylab.dev' }, secretKey);
    outsiderToken = await createTestToken({ id: outsiderId, email: 'outsider@replaylab.dev' }, secretKey);
  });

  describe('1. Authentication Gate', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/projects');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 401 when Bearer token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 401 when token is signed with different secret', async () => {
      const forgedToken = await createTestToken(
        { id: 'usr_hacker', email: 'hacker@replaylab.dev' },
        'wrong-secret-key-32-chars-long-minimum-size!'
      );
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 200 with project list when valid token provided', async () => {
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('2. Project Lifecycle & Multi-Tenancy Isolation', () => {
    let projectId: string;

    it('allows authenticated user to create a project', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Payment Service Testing',
          description: 'Regression tests for checkout flow',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Payment Service Testing');
      expect(res.body.id).toBeDefined();
      projectId = res.body.id;
    });

    it('shows the project in owner project list', async () => {
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect((res.body as Array<{ id: string }>).some((p) => p.id === projectId)).toBe(true);
    });

    it('isolates projects: outsider cannot see or read project (returns 404 to prevent enumeration)', async () => {
      const listRes = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(listRes.status).toBe(200);
      expect((listRes.body as Array<{ id: string }>).some((p) => p.id === projectId)).toBe(false);

      const getRes = await request(app)
        .get(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('NOT_FOUND');
    });

    it('owner can invite EDITOR and VIEWER members', async () => {
      const addEditor = await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          userId: editorId,
          role: 'EDITOR',
        });
      expect(addEditor.status).toBe(201);
      expect(addEditor.body.role).toBe('EDITOR');

      const addViewer = await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          userId: viewerId,
          role: 'VIEWER',
        });
      expect(addViewer.status).toBe(201);
      expect(addViewer.body.role).toBe('VIEWER');
    });

    it('lists project members for project members', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3); // owner, editor, viewer
    });
  });

  describe('3. Role-Based Access Control (RBAC) Enforcement', () => {
    let projectId: string;
    let environmentId: string;
    let fixtureId: string;

    beforeAll(async () => {
      const pRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'RBAC Test Project' });
      projectId = pRes.body.id;

      await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: editorId, role: 'EDITOR' });

      await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: viewerId, role: 'VIEWER' });
    });

    it('EDITOR can create environments and fixtures', async () => {
      const envRes = await request(app)
        .post(`/api/v1/projects/${projectId}/environments`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          name: 'Staging Internal',
          baseUrl: 'https://staging.internal.example.com',
          headers: { 'X-Custom-Env': 'staging' },
          variables: [
            { key: 'API_SECRET', value: 'super-secret-token', isSecret: true },
          ],
        });
      expect(envRes.status).toBe(201);
      expect(envRes.body.name).toBe('Staging Internal');
      environmentId = envRes.body.id;

      const fixRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          name: 'Get Customer Profile',
          request: {
            method: 'GET',
            path: '/api/v1/customers/123',
            headers: { 'Accept': 'application/json' },
            bodyType: 'NONE',
          },
        });
      expect(fixRes.status).toBe(201);
      expect(fixRes.body.name).toBe('Get Customer Profile');
      fixtureId = fixRes.body.id;
    });

    it('EDITOR cannot delete project or assign members (403 FORBIDDEN)', async () => {
      const deleteRes = await request(app)
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${editorToken}`);
      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe('FORBIDDEN');

      const memberRes = await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ userId: 'usr_stranger', role: 'VIEWER' });
      expect(memberRes.status).toBe(403);
      expect(memberRes.body.error.code).toBe('FORBIDDEN');
    });

    it('VIEWER cannot modify resources or create fixtures (403 FORBIDDEN)', async () => {
      const fixRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Forbidden Fixture',
          request: {
            method: 'GET',
            path: '/forbidden',
            bodyType: 'NONE',
          },
        });
      expect(fixRes.status).toBe(403);
      expect(fixRes.body.error.code).toBe('FORBIDDEN');

      const envRes = await request(app)
        .patch(`/api/v1/projects/${projectId}/environments/${environmentId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Hacked Env Name' });
      expect(envRes.status).toBe(403);
      expect(envRes.body.error.code).toBe('FORBIDDEN');
    });

    it('enforces last-owner protection (cannot remove or delete the only project owner)', async () => {
      // Find the owner member ID
      const membersRes = await request(app)
        .get(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const ownerMember = membersRes.body.find((m: { role: string }) => m.role === 'OWNER');
      expect(ownerMember).toBeDefined();

      // Attempt to remove the only owner
      const removeRes = await request(app)
        .delete(`/api/v1/projects/${projectId}/members/${ownerMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(removeRes.status).toBe(403);
      expect(removeRes.body.error.code).toBe('FORBIDDEN');
      expect(removeRes.body.error.message).toContain('LAST_OWNER_PROTECTION');
    });

    it('enforces last-owner protection against role demotion (cannot change last owner to EDITOR or VIEWER)', async () => {
      // Attempt to demote the sole owner to VIEWER
      const demoteRes = await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          userId: ownerId,
          role: 'VIEWER',
        });

      expect(demoteRes.status).toBe(403);
      expect(demoteRes.body.error.code).toBe('FORBIDDEN');
      expect(demoteRes.body.error.message).toContain('LAST_OWNER_PROTECTION');
    });

    it('enforces cross-project isolation: cannot access or modify resources using mismatched project IDs', async () => {
      // Create a second project owned by outsider
      const otherProjectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ name: 'Foreign Isolated Project' });
      const foreignProjectId = otherProjectRes.body.id;

      // Outsider attempts to access projectId's fixture via foreignProjectId path
      const crossFixtureRes = await request(app)
        .get(`/api/v1/projects/${foreignProjectId}/fixtures/${fixtureId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(crossFixtureRes.status).toBe(404);
      expect(crossFixtureRes.body.error.code).toBe('NOT_FOUND');

      // Outsider attempts to access projectId's environment via foreignProjectId path
      const crossEnvRes = await request(app)
        .get(`/api/v1/projects/${foreignProjectId}/environments/${environmentId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(crossEnvRes.status).toBe(404);
      expect(crossEnvRes.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('4. Explicit Baseline Updates & Versioning', () => {
    let projectId: string;
    let fixtureId: string;

    beforeAll(async () => {
      const pRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Baseline Versioning Project' });
      projectId = pRes.body.id;

      const fRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Orders API',
          request: {
            method: 'GET',
            path: '/orders',
            bodyType: 'NONE',
          },
        });
      fixtureId = fRes.body.id;
    });

    it('explicit baseline update saves baseline snapshot and returns updated fixture', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures/${fixtureId}/baseline`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          baseline: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ orders: [] }),
            bodyType: 'JSON',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.baseline).toBeDefined();
      expect(res.body.baseline.statusCode).toBe(200);

      // Verify baseline snapshot history in store
      const fixture = store.fixtures.get(fixtureId);
      expect(fixture).toBeDefined();
      expect(fixture!.baselineHistory.length).toBe(1);
      expect(fixture!.baselineHistory[0]!.statusCode).toBe(200);
    });

    it('updating baseline again appends to snapshot history without mutating prior snapshot', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures/${fixtureId}/baseline`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          baseline: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ orders: [{ id: 'ord_1' }] }),
            bodyType: 'JSON',
          },
        });

      expect(res.status).toBe(200);
      const fixture = store.fixtures.get(fixtureId);
      expect(fixture!.baselineHistory.length).toBe(2);
      expect(fixture!.baselineHistory[0]!.body).toContain('[]');
      expect(fixture!.baselineHistory[1]!.body).toContain('ord_1');
    });
  });

  describe('5. Replay Trigger & Admission Rejection Semantics', () => {
    let projectId: string;
    let environmentId: string;
    let fixtureId: string;

    beforeAll(async () => {
      const pRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Replay Trigger Project' });
      projectId = pRes.body.id;

      const envRes = await request(app)
        .post(`/api/v1/projects/${projectId}/environments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Staging',
          baseUrl: 'https://httpbin.org',
          variables: [{ key: 'API_KEY', value: 'secret123', isSecret: true }],
        });
      environmentId = envRes.body.id;

      const fRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'HttpBin IP',
          request: {
            method: 'GET',
            path: '/ip',
            bodyType: 'NONE',
          },
        });
      fixtureId = fRes.body.id;
    });

    it('rejects replay trigger with 404 when fixture does not exist', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/replay`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          fixtureId: 'fix_nonexistent',
          environmentId,
        });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects replay trigger with 403 when VIEWER tries to execute', async () => {
      await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: viewerId, role: 'VIEWER' });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/replay`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          fixtureId,
          environmentId,
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns HTTP 503 ADMISSION_REJECTED without fabricating a run when admission controller is saturated', async () => {
      // Mock replay service throwing ConcurrencyAdmissionError as if admission controller rejected it
      const mockReplayService = {
        async triggerReplay() {
          throw new ConcurrencyAdmissionError(
            'CONCURRENCY_LIMIT_EXCEEDED: Replay queue is saturated',
            'SATURATED'
          );
        },
      } as unknown as AuthorizedReplayService;

      const saturatedApp = createApp({
        projectService,
        replayService: mockReplayService,
      });

      const res = await request(saturatedApp)
        .post(`/api/v1/projects/${projectId}/replay`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          fixtureId,
          environmentId,
        });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('ADMISSION_REJECTED');
      expect(res.body.error.message).toContain('maximum capacity');
    });
  });

  describe('6. Suite Endpoints', () => {
    let projectId: string;
    let fixtureId: string;
    let suiteId: string;

    beforeAll(async () => {
      const pRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Suite Test Project' });
      projectId = pRes.body.id;

      const fRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Fixture for Suite',
          request: {
            method: 'GET',
            path: '/users',
            bodyType: 'NONE',
          },
        });
      fixtureId = fRes.body.id;
    });

    it('creates a test suite with fixtures and assertion configs', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/suites`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Smoke Test Suite',
          description: 'Runs on every PR merge',
          items: [
            {
              fixtureId,
              order: 0,
              assertions: [
                {
                  type: 'STATUS_CODE',
                  expected: 200,
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Smoke Test Suite');
      expect(res.body.items.length).toBe(1);
      suiteId = res.body.id;
    });

    it('gets a test suite by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/suites/${suiteId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(suiteId);
    });

    it('updates a test suite', async () => {
      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/suites/${suiteId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Smoke Test Suite (Renamed)' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Smoke Test Suite (Renamed)');
    });

    it('deletes a test suite', async () => {
      const res = await request(app)
        .delete(`/api/v1/projects/${projectId}/suites/${suiteId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/v1/projects/${projectId}/suites/${suiteId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(getRes.status).toBe(404);
    });

    it('enforces 404 non-disclosure on suites for unauthorized outsiders', async () => {
      const getRes = await request(app)
        .get(`/api/v1/projects/${projectId}/suites/${suiteId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('7. Replay History, Suite Execution & Audit Log Endpoints', () => {
    let projectId: string;
    let envId: string;
    let fixtureId: string;
    let suiteId: string;

    beforeAll(async () => {
      const pRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Orchestration API Test' });
      projectId = pRes.body.id;

      const eRes = await request(app)
        .post(`/api/v1/projects/${projectId}/environments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Demo Env', baseUrl: 'https://example.com' });
      envId = eRes.body.id;

      const fRes = await request(app)
        .post(`/api/v1/projects/${projectId}/fixtures`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Fixture for History',
          request: { method: 'GET', path: '/test', bodyType: 'NONE' },
        });
      fixtureId = fRes.body.id;

      const sRes = await request(app)
        .post(`/api/v1/projects/${projectId}/suites`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Suite for Execution',
          items: [{ fixtureId, order: 0 }],
        });
      suiteId = sRes.body.id;
    });

    it('records a durable ReplayRun and retrieves it via GET /runs', async () => {
      // Create a replay run via store directly or trigger
      await store.createReplayRun({
        projectId,
        fixtureId,
        environmentId: envId,
        status: 'SUCCESS',
        httpStatusCode: 200,
        durationMs: 45,
        diffFound: false,
      });

      const listRes = await request(app)
        .get(`/api/v1/projects/${projectId}/runs`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThan(0);
      const runId = listRes.body[0].id;

      const detailRes = await request(app)
        .get(`/api/v1/projects/${projectId}/runs/${runId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(runId);
      expect(detailRes.body.status).toBe('SUCCESS');
    });

    it('executes a suite via POST /suites/:suiteId/run and returns summary', async () => {
      const runRes = await request(app)
        .post(`/api/v1/projects/${projectId}/suites/${suiteId}/run`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ environmentId: envId });

      expect(runRes.status).toBe(200);
      expect(runRes.body.suiteId).toBe(suiteId);
      expect(runRes.body.totalItems).toBe(1);

      const listSuiteRuns = await request(app)
        .get(`/api/v1/projects/${projectId}/suites/${suiteId}/runs`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(listSuiteRuns.status).toBe(200);
      expect(listSuiteRuns.body.length).toBeGreaterThan(0);
    });

    it('retrieves project audit logs via GET /audit-logs', async () => {
      const logsRes = await request(app)
        .get(`/api/v1/projects/${projectId}/audit-logs`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(logsRes.status).toBe(200);
      expect(Array.isArray(logsRes.body)).toBe(true);
    });
  });
});

