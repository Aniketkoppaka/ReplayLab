import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Live PostgreSQL + STUBBED dispatcher: exercises durable orchestration behaviour (suite masks,
// cancellation, captured-body persistence) against the real database. The outbound HTTP layer is
// stubbed because the real dispatcher cannot reach loopback targets by design (SSRF).
vi.mock('../replay-engine/safe-dispatcher.js', () => ({
  executeSafeRequest: vi.fn(),
}));

import { PrismaClient } from '@replaylab/db';
import { executeSafeRequest } from '../replay-engine/safe-dispatcher.js';
import { globalReplayLimiter } from '../replay-engine/admission-controller.js';
import { PrismaProjectStore } from './prisma-project-store.js';
import { ProjectService } from './project-service.js';
import { AuthorizedReplayService } from './authorized-replay-service.js';

const isPostgresLive = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgresql://'));
const conditionalDescribe = isPostgresLive ? describe : describe.skip;

const mockedDispatch = vi.mocked(executeSafeRequest);

function respond(body: unknown, statusCode = 200) {
  mockedDispatch.mockResolvedValueOnce({
    statusCode,
    headers: {},
    body,
    durationMs: 4,
  } as Awaited<ReturnType<typeof executeSafeRequest>>);
}

conditionalDescribe('Live PostgreSQL orchestration lifecycle', { timeout: 60000 }, () => {
  let prisma: PrismaClient;
  let store: PrismaProjectStore;
  let replay: AuthorizedReplayService;
  const owner = { id: `usr_lifecycle_${Date.now()}`, email: `lifecycle_${Date.now()}@test.replaylab.dev` };
  let projectId: string;
  let envId: string;

  async function mkFixture(name: string, body: unknown) {
    return store.createFixture(projectId, {
      name,
      tags: [],
      request: { method: 'GET', path: `/${name}`, headers: {}, queryParams: {}, bodyType: 'NONE' },
      baseline: { statusCode: 200, headers: {}, bodyType: 'JSON', body },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    store = new PrismaProjectStore(prisma);
    replay = new AuthorizedReplayService(new ProjectService(store), store);
    await store.syncUser({ id: owner.id, email: owner.email, name: 'Lifecycle Owner' });
    const project = await store.createProject(owner.id, { name: 'Lifecycle Project' });
    projectId = project.id;
    const env = await store.createEnvironment(projectId, {
      name: 'env',
      baseUrl: 'https://api.example.test',
      headers: {},
      variables: [],
    });
    envId = env.id;
  });

  beforeEach(() => {
    mockedDispatch.mockReset();
  });

  afterAll(async () => {
    try {
      await prisma.project.delete({ where: { id: projectId } });
      await prisma.auditLog.deleteMany({ where: { userId: owner.id } });
      await prisma.user.delete({ where: { id: owner.id } });
    } catch {
      // best-effort cleanup of disposable test data
    }
    await prisma.$disconnect();
  });

  it('persisted suite mask rules are applied; child ReplayRuns link to the SuiteRun in PostgreSQL', async () => {
    const masked = await mkFixture('masked', { id: 1, ts: 'old' });
    const unmasked = await mkFixture('unmasked', { id: 1, ts: 'old' });
    const suite = await store.createSuite(projectId, {
      name: 'mask-suite',
      items: [
        { fixtureId: masked.id, order: 0, assertions: [], maskRules: [{ path: '$.ts', action: 'IGNORE' }] },
        { fixtureId: unmasked.id, order: 1, assertions: [], maskRules: [] },
      ],
    });

    respond({ id: 1, ts: 'new' });
    respond({ id: 1, ts: 'new' });
    const summary = await replay.triggerSuiteExecution({
      projectId,
      suiteId: suite.id,
      environmentId: envId,
      userId: owner.id,
    });

    expect(summary.passedItems).toBe(1);
    expect(summary.failedItems).toBe(1);

    const rows = await prisma.replayRun.findMany({ where: { suiteRunId: summary.id }, orderBy: { executedAt: 'asc' } });
    expect(rows).toHaveLength(2);
    const byFixture = new Map(rows.map((r) => [r.fixtureId, r]));
    expect(byFixture.get(masked.id)!.status).toBe('SUCCESS');
    expect(byFixture.get(unmasked.id)!.status).toBe('ASSERTION_FAILURE');
    // baselineId recorded is the exact history row of the fixture's baseline
    const maskedBaseline = await store.getBaselineSnapshot(projectId, masked.id);
    expect(byFixture.get(masked.id)!.baselineId).toBe(maskedBaseline!.id);
  });

  it('cancellation: stops later dispatches, durable terminal SuiteRun, completed child run intact, permits released', async () => {
    const f1 = await mkFixture('cancel1', { ok: 1 });
    const f2 = await mkFixture('cancel2', { ok: 1 });
    const f3 = await mkFixture('cancel3', { ok: 1 });
    const suite = await store.createSuite(projectId, {
      name: 'cancel-suite',
      items: [f1, f2, f3].map((f, i) => ({ fixtureId: f.id, order: i, assertions: [], maskRules: [] })),
    });

    const controller = new AbortController();
    mockedDispatch.mockImplementationOnce(async () => {
      controller.abort();
      return { statusCode: 200, headers: {}, body: { ok: 1 }, durationMs: 2 } as Awaited<
        ReturnType<typeof executeSafeRequest>
      >;
    });

    const summary = await replay.triggerSuiteExecution({
      projectId,
      suiteId: suite.id,
      environmentId: envId,
      userId: owner.id,
      signal: controller.signal,
    });

    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    const sr = await prisma.suiteRun.findUnique({ where: { id: summary.id } });
    expect(sr!.status).toBe('TIMEOUT');
    expect(sr!.completedAt).not.toBeNull();
    expect(sr!.passedItems).toBe(1);

    const children = await prisma.replayRun.findMany({ where: { suiteRunId: summary.id } });
    expect(children).toHaveLength(1);
    expect(children[0]!.fixtureId).toBe(f1.id);
    expect(children[0]!.status).toBe('SUCCESS');

    const audit = await prisma.auditLog.findFirst({
      where: { projectId, action: 'SUITE_EXECUTED', targetId: suite.id },
    });
    expect((audit!.metadata as { cancelled?: boolean }).cancelled).toBe(true);
    expect(globalReplayLimiter.running).toBe(0);
    expect(globalReplayLimiter.queued).toBe(0);
  });

  it('response capture: default stores NULL body; explicit capture stores only the redacted body', async () => {
    const fx = await mkFixture('capture', { ok: 1 });

    respond({ ok: 1, password: 'plain-pw-111' });
    const noCapture = (await replay.triggerReplay({
      projectId,
      fixtureId: fx.id,
      environmentId: envId,
      userId: owner.id,
    })) as unknown as { id: string };
    const rowDefault = await prisma.replayRun.findUnique({ where: { id: noCapture.id } });
    expect(rowDefault!.body).toBeNull();
    expect(JSON.stringify(rowDefault)).not.toContain('plain-pw-111');

    respond({ ok: 1, password: 'plain-pw-222', nested: { api_key: 'key-333' } });
    const withCapture = (await replay.triggerReplay({
      projectId,
      fixtureId: fx.id,
      environmentId: envId,
      userId: owner.id,
      captureResponseBody: true,
    })) as unknown as { id: string };
    const rowCaptured = await prisma.replayRun.findUnique({ where: { id: withCapture.id } });
    const serialized = JSON.stringify(rowCaptured);
    expect(rowCaptured!.body).not.toBeNull();
    expect(serialized).not.toContain('plain-pw-222');
    expect(serialized).not.toContain('key-333');
    expect(serialized).toContain('[REDACTED]');

    // Audit metadata for the replay never carries body content.
    const audits = await prisma.auditLog.findMany({ where: { projectId, action: 'REPLAY_EXECUTED' } });
    expect(JSON.stringify(audits)).not.toContain('plain-pw');
  });

  it('diff values containing secrets are redacted in the persisted ReplayRun even without capture', async () => {
    const fx = await mkFixture('diffsecret', { token: 'OLD-TOK', note: 'a' });
    respond({ token: 'NEW-TOK', note: 'b' });
    const run = (await replay.triggerReplay({
      projectId,
      fixtureId: fx.id,
      environmentId: envId,
      userId: owner.id,
    })) as unknown as { id: string };
    const row = await prisma.replayRun.findUnique({ where: { id: run.id } });
    expect(row!.diffFound).toBe(true);
    const serialized = JSON.stringify(row!.diffDetails);
    expect(serialized).not.toContain('OLD-TOK');
    expect(serialized).not.toContain('NEW-TOK');
  });
});
