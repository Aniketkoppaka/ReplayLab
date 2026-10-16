import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store + STUBBED dispatcher (see response-capture-security.test.ts for rationale).
vi.mock('../replay-engine/safe-dispatcher.js', () => ({
  executeSafeRequest: vi.fn(),
}));

import { executeSafeRequest } from '../replay-engine/safe-dispatcher.js';
import { globalReplayLimiter } from '../replay-engine/admission-controller.js';
import { InMemoryProjectStore } from './in-memory-project-store.js';
import { ProjectService } from './project-service.js';
import { AuthorizedReplayService } from './authorized-replay-service.js';

const mockedDispatch = vi.mocked(executeSafeRequest);
const OWNER = 'usr_closure_owner';

function respond(body: unknown, statusCode = 200) {
  mockedDispatch.mockResolvedValueOnce({
    statusCode,
    headers: {},
    body,
    durationMs: 3,
  } as Awaited<ReturnType<typeof executeSafeRequest>>);
}

async function setup(store = new InMemoryProjectStore()) {
  await store.syncUser?.({ id: OWNER, email: 'o@test.dev', name: 'o' });
  const project = await store.createProject(OWNER, { name: 'Closure' });
  const env = await store.createEnvironment(project.id, {
    name: 'env',
    baseUrl: 'https://api.example.test',
    headers: {},
    variables: [],
  });
  const projectService = new ProjectService(store);
  const replay = new AuthorizedReplayService(projectService, store);
  return { store, project, env, replay };
}

async function fixtureWithBaseline(
  store: InMemoryProjectStore,
  projectId: string,
  name: string,
  body: unknown
) {
  return store.createFixture(projectId, {
    name,
    tags: [],
    request: { method: 'GET', path: `/${name}`, headers: {}, queryParams: {}, bodyType: 'NONE' },
    baseline: { statusCode: 200, headers: {}, bodyType: 'JSON', body },
  });
}

describe('Phase 4 audit closure (in-memory store, stubbed dispatcher)', () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
  });

  it('baselineId identifies the exact snapshot compared, even if the baseline is updated concurrently', async () => {
    class RacingStore extends InMemoryProjectStore {
      public raceOnce = false;
      public override async getBaselineSnapshot(projectId: string, fixtureId: string) {
        const snap = await super.getBaselineSnapshot(projectId, fixtureId);
        if (this.raceOnce) {
          this.raceOnce = false;
          // A concurrent explicit baseline update lands right after the snapshot read.
          await this.updateBaseline(projectId, fixtureId, {
            baseline: { statusCode: 200, headers: {}, bodyType: 'JSON', body: { v: 'NEW' } },
          });
        }
        return snap;
      }
    }

    const store = new RacingStore();
    const { project, env, replay } = await setup(store);
    const fx = await fixtureWithBaseline(store, project.id, 'race', { v: 'OLD' });
    const oldId = (await store.getBaselineSnapshot(project.id, fx.id))!.id;

    store.raceOnce = true;
    respond({ v: 'OLD' }); // matches the OLD snapshot that was actually read
    const run = (await replay.triggerReplay({
      projectId: project.id,
      fixtureId: fx.id,
      environmentId: env.id,
      userId: OWNER,
    })) as unknown as { id: string; baselineId?: string; status: string; diffFound: boolean };

    const persisted = await store.getReplayRun(project.id, run.id);
    expect(persisted?.baselineId).toBe(oldId);
    expect(run.baselineId).toBe(oldId);
    expect(run.status).toBe('SUCCESS'); // compared against OLD content
    expect(run.diffFound).toBe(false);

    // History is append-only: old snapshot intact, new one appended.
    const stored = store.fixtures.get(fx.id)!;
    expect(stored.baselineHistory.length).toBe(2);
    expect(stored.baselineHistory[0]!.id).toBe(oldId);
    expect(stored.baselineHistory[0]!.body).toEqual({ v: 'OLD' });

    // Next replay uses the NEW snapshot id.
    respond({ v: 'NEW' });
    const next = (await replay.triggerReplay({
      projectId: project.id,
      fixtureId: fx.id,
      environmentId: env.id,
      userId: OWNER,
    })) as { baselineId?: string };
    expect(next.baselineId).toBe(stored.baselineHistory[1]!.id);
  });

  it('suite mask rules are applied to comparison; child runs link to the parent SuiteRun', async () => {
    const { store, project, env, replay } = await setup();
    const masked = await fixtureWithBaseline(store, project.id, 'masked', { id: 1, ts: 'old' });
    const unmasked = await fixtureWithBaseline(store, project.id, 'unmasked', { id: 1, ts: 'old' });
    const suite = await store.createSuite(project.id, {
      name: 'mask-suite',
      items: [
        { fixtureId: masked.id, order: 0, assertions: [], maskRules: [{ path: '$.ts', action: 'IGNORE' }] },
        { fixtureId: unmasked.id, order: 1, assertions: [], maskRules: [] },
      ],
    });

    respond({ id: 1, ts: 'new' });
    respond({ id: 1, ts: 'new' });
    const summary = await replay.triggerSuiteExecution({
      projectId: project.id,
      suiteId: suite.id,
      environmentId: env.id,
      userId: OWNER,
    });

    expect(summary.passedItems).toBe(1);
    expect(summary.failedItems).toBe(1);
    expect(summary.status).toBe('ASSERTION_FAILURE');

    const [r0, r1] = summary.results as Array<{ id: string; status: string; diffFound: boolean }>;
    expect(r0!.status).toBe('SUCCESS');
    expect(r0!.diffFound).toBe(false);
    expect(r1!.status).toBe('ASSERTION_FAILURE');
    for (const r of [r0!, r1!]) {
      const run = await store.getReplayRun(project.id, r.id);
      expect(run?.suiteRunId).toBe(summary.id);
    }
  });

  it('cancellation stops later dispatches, releases permits, keeps completed child runs and a terminal SuiteRun', async () => {
    const { store, project, env, replay } = await setup();
    const f1 = await fixtureWithBaseline(store, project.id, 'c1', { ok: 1 });
    const f2 = await fixtureWithBaseline(store, project.id, 'c2', { ok: 1 });
    const f3 = await fixtureWithBaseline(store, project.id, 'c3', { ok: 1 });
    const suite = await store.createSuite(project.id, {
      name: 'cancel-suite',
      items: [f1, f2, f3].map((f, i) => ({ fixtureId: f.id, order: i, assertions: [], maskRules: [] })),
    });

    const controller = new AbortController();
    mockedDispatch.mockImplementationOnce(async () => {
      // Cancel while the first dispatch is in flight; it still completes normally.
      controller.abort();
      return { statusCode: 200, headers: {}, body: { ok: 1 }, durationMs: 2 } as Awaited<
        ReturnType<typeof executeSafeRequest>
      >;
    });

    const summary = await replay.triggerSuiteExecution({
      projectId: project.id,
      suiteId: suite.id,
      environmentId: env.id,
      userId: OWNER,
      signal: controller.signal,
    });

    // Only the first fixture was dispatched.
    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    expect(summary.status).toBe('TIMEOUT');
    expect(summary.passedItems).toBe(1);

    // Terminal durable SuiteRun.
    const [sr] = await store.listSuiteRuns(project.id, suite.id);
    expect(sr!.status).toBe('TIMEOUT');
    expect(sr!.completedAt).toBeTruthy();

    // Completed child run is intact and linked; no run exists for skipped fixtures.
    const runs = await store.listReplayRuns(project.id);
    expect(runs.map((r) => r.fixtureId)).toEqual([f1.id]);
    const child = await store.getReplayRun(project.id, runs[0]!.id);
    expect(child?.suiteRunId).toBe(summary.id);
    expect(child?.status).toBe('SUCCESS');

    // Cancellation is durably distinguishable from a genuine timeout via audit metadata.
    const audit = (await store.listAuditLogs(project.id)).find((l) => l.action === 'SUITE_EXECUTED');
    expect(audit?.metadata.cancelled).toBe(true);

    // Permits released.
    expect(globalReplayLimiter.running).toBe(0);
    expect(globalReplayLimiter.queued).toBe(0);
  });

  it('a non-cancelled run is not flagged as cancelled', async () => {
    const { store, project, env, replay } = await setup();
    const f1 = await fixtureWithBaseline(store, project.id, 'n1', { ok: 1 });
    const suite = await store.createSuite(project.id, {
      name: 'plain',
      items: [{ fixtureId: f1.id, order: 0, assertions: [], maskRules: [] }],
    });
    respond({ ok: 1 });
    const summary = await replay.triggerSuiteExecution({
      projectId: project.id,
      suiteId: suite.id,
      environmentId: env.id,
      userId: OWNER,
    });
    expect(summary.status).toBe('SUCCESS');
    const audit = (await store.listAuditLogs(project.id)).find((l) => l.action === 'SUITE_EXECUTED');
    expect(audit?.metadata.cancelled).toBe(false);
  });

  it('replay audit failure is non-fatal and the persisted run is preserved', async () => {
    class BrokenAuditStore extends InMemoryProjectStore {
      public override async createAuditLog(): Promise<void> {
        throw new Error('audit store down: password=hunter2');
      }
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new BrokenAuditStore();
    const { project, env, replay } = await setup(store);
    const fx = await fixtureWithBaseline(store, project.id, 'aud', { ok: 1 });
    respond({ ok: 1 });
    const run = (await replay.triggerReplay({
      projectId: project.id,
      fixtureId: fx.id,
      environmentId: env.id,
      userId: OWNER,
    })) as unknown as { id: string };
    expect(await store.getReplayRun(project.id, run.id)).not.toBeNull();
    // Logged name only: never the error message (which could carry secrets).
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('Error');
    expect(logged).not.toContain('hunter2');
    spy.mockRestore();
  });
});
