import {
  executeFixtureReplay,
  type ReplayExecutionResult,
  type ReplayExecutionParams,
  type MaskRule,
} from '../replay-engine/index.js';
import { decryptSecret } from '../crypto.js';
import type { ProjectService, ProjectStore } from './project-service.js';

export interface TriggerAuthorizedReplayParams {
  projectId: string;
  fixtureId: string;
  environmentId: string;
  userId: string;
  signal?: AbortSignal;
  captureResponseBody?: boolean;
  suiteRunId?: string;
  maskRules?: MaskRule[];
}

export interface ReplayAuditRecord {
  id: string;
  projectId: string;
  userId: string;
  action: 'REPLAY_EXECUTED';
  fixtureId: string;
  environmentId: string;
  status: string;
  durationMs: number;
  timestamp: string;
}

/**
 * Orchestrates authorized replay executions:
 * 1. Checks server-side project membership and permissions ('replay:execute').
 * 2. Retrieves authorized fixture and environment from store (strictly project-scoped).
 * 3. Decrypts environment secrets using ADR-0005 AAD authentication.
 * 4. Dispatches through safe replay engine and bounded admission controller.
 * 5. Re-throws ConcurrencyAdmissionError without fabricating fake results.
 * 6. Records sanitized audit log (no credentials or raw sensitive payloads).
 */
export class AuthorizedReplayService {
  public auditLogs: ReplayAuditRecord[] = [];
  private readonly store: ProjectStore;

  constructor(
    private readonly projectService: ProjectService,
    store?: ProjectStore
  ) {
    this.store = store ?? projectService.store;
  }

  public async triggerReplay(
    params: TriggerAuthorizedReplayParams
  ): Promise<ReplayExecutionResult> {
    const { projectId, fixtureId, environmentId, userId, signal, captureResponseBody, suiteRunId, maskRules } = params;

    // 1. Authorize: User must have 'replay:execute' on this project
    await this.projectService.assertPermission(projectId, userId, 'replay:execute');

    // 2. Fetch fixture & environment strictly within the project boundary
    const fixture = await this.store.getFixture(projectId, fixtureId);
    if (!fixture) {
      throw new Error('FIXTURE_NOT_FOUND: Fixture does not exist in this project');
    }

    const storedEnv = await this.store.getEnvironmentSecrets(projectId, environmentId);
    if (!storedEnv || storedEnv.projectId !== projectId) {
      throw new Error('ENVIRONMENT_NOT_FOUND: Environment does not exist in this project');
    }

    // 3. Resolve environment headers and decrypt variables (ADR-0005 AAD)
    const combinedHeaders: Record<string, string> = { ...storedEnv.headers };
    for (const v of storedEnv.variables) {
      if (v.isSecret && v.secretIv && v.secretAuthTag) {
        try {
          const decrypted = decryptSecret(
            { ciphertext: v.value, iv: v.secretIv, authTag: v.secretAuthTag },
            undefined,
            `env:${storedEnv.id}:key:${v.key}`
          );
          combinedHeaders[`x-env-${v.key.toLowerCase()}`] = decrypted;
        } catch {
          throw new Error('SECRET_DECRYPTION_FAILED: Failed to decrypt environment secret');
        }
      } else {
        combinedHeaders[`x-env-${v.key.toLowerCase()}`] = v.value;
      }
    }

    // 4. Construct execution parameters using authorized baseline
    // Single read: baseline id and content come from the same immutable history row, so a
    // concurrent baseline update cannot make the recorded id disagree with the compared content.
    const snapshotRow = await this.store.getBaselineSnapshot(projectId, fixtureId);
    const currentBaselineId = snapshotRow?.id ?? null;
    const baselineSnapshot = snapshotRow
      ? {
          id: snapshotRow.id,
          statusCode: snapshotRow.statusCode,
          headers: snapshotRow.headers,
          body: snapshotRow.body,
          bodyType: snapshotRow.bodyType,
        }
      : undefined;

    const replayParams: ReplayExecutionParams = {
      fixtureId: fixture.id,
      projectId,
      environmentId: storedEnv.id,
      environmentBaseUrl: storedEnv.baseUrl,
      environmentHeaders: combinedHeaders,
      request: {
        method: fixture.request.method,
        path: fixture.request.path,
        queryParams: fixture.request.queryParams,
        headers: fixture.request.headers,
        bodyType: fixture.request.bodyType,
        body: fixture.request.body,
      },
      baseline: baselineSnapshot,
      maskRules,
      signal,
      captureResponseBody: captureResponseBody ?? false,
    };

    // 5. Execute via replay engine (handles admission bounding & SSRF defenses)
    // NOTE: ConcurrencyAdmissionError is re-thrown as-is, never caught to fabricate a fake run!
    const result = await executeFixtureReplay(replayParams);

    // 6. Durable ReplayRun Persistence: Store the actual replay outcome in the database
    let persistedRunId: string | undefined;
    try {
      const persisted = await this.store.createReplayRun({
        projectId,
        fixtureId: fixture.id,
        environmentId: storedEnv.id,
        suiteRunId: suiteRunId ?? null,
        baselineId: currentBaselineId ?? null,
        triggeredById: userId,
        status: result.status,
        httpStatusCode: result.httpStatusCode,
        headers: result.headers,
        bodyType: fixture.request.bodyType,
        body: result.body,
        durationMs: result.durationMs,
        errorMessage: result.errorMessage,
        diffFound: result.diffFound,
        diffDetails: result.diffDetails,
      });
      persistedRunId = persisted.id;
    } catch (err) {
      // The outbound request already happened and cannot be rolled back: preserve the result,
      // but surface the gap (sanitized: error name only, never message/payload).
      console.error('[replay] ReplayRun persistence failed', err instanceof Error ? err.name : 'UnknownError');
    }

    // 7. Record sanitized audit log (best-effort: the replay has already executed)
    try {
      await this.store.createAuditLog({
        projectId,
        userId,
        action: 'REPLAY_EXECUTED',
        targetType: 'Fixture',
        targetId: fixture.id,
        metadata: {
          runId: persistedRunId,
          suiteRunId: suiteRunId ?? null,
          environmentId: storedEnv.id,
          baselineId: currentBaselineId,
          status: result.status,
          durationMs: result.durationMs,
          diffFound: result.diffFound,
          bodyCaptured: captureResponseBody === true,
        },
      });
    } catch (err) {
      console.error('[replay] REPLAY_EXECUTED audit failed', err instanceof Error ? err.name : 'UnknownError');
    }

    return {
      ...result,
      id: persistedRunId,
      baselineId: currentBaselineId ?? undefined,
    } as ReplayExecutionResult & { id?: string };
  }

  /**
   * Orchestrates full Regression Suite execution:
   * 1. Authorizes user on project ('replay:execute').
   * 2. Captures an immutable suiteSnapshot of fixtures, order, assertions, and mask rules.
   * 3. Creates a durable SuiteRun in the database.
   * 4. Bounded sequential execution of each fixture within the suite.
   * 5. Evaluates configured assertions and links individual ReplayRuns to suiteRunId.
   * 6. Updates SuiteRun with final tallies and status.
   */
  public async triggerSuiteExecution(params: {
    projectId: string;
    suiteId: string;
    environmentId: string;
    userId: string;
    signal?: AbortSignal;
    captureResponseBody?: boolean;
  }) {
    const { projectId, suiteId, environmentId, userId, signal, captureResponseBody } = params;

    // 1. Authorize
    await this.projectService.assertPermission(projectId, userId, 'replay:execute');

    // 2. Load suite & environment
    const suite = await this.store.getSuite(projectId, suiteId);
    if (!suite) {
      throw new Error('SUITE_NOT_FOUND: Suite does not exist in this project');
    }

    const storedEnv = await this.store.getEnvironmentSecrets(projectId, environmentId);
    if (!storedEnv || storedEnv.projectId !== projectId) {
      throw new Error('ENVIRONMENT_NOT_FOUND: Environment does not exist in this project');
    }

    // 3. Create initial SuiteRun with immutable snapshot
    const totalItems = suite.items.length;
    const suiteRun = await this.store.createSuiteRun({
      projectId,
      suiteId,
      environmentId,
      triggeredById: userId,
      status: 'SUCCESS',
      totalItems,
      suiteSnapshot: suite,
    });

    const results: Array<ReplayExecutionResult & { id?: string }> = [];
    let passedItems = 0;
    let failedItems = 0;
    const suiteStartTime = Date.now();
    let overallStatus = 'SUCCESS';
    // Intentional cancellation (AbortSignal). The outcome contract has no CANCELLED value, so it is
    // persisted as TIMEOUT and distinguished durably via cancelled: true in the audit metadata.
    let cancelled = false;

    try {
      // 4. Execute fixtures sequentially
      for (const item of suite.items) {
        if (signal?.aborted) {
          cancelled = true;
          break;
        }

        try {
          const fixture = await this.store.getFixture(projectId, item.fixtureId);
          if (!fixture) {
            failedItems++;
            overallStatus = 'ASSERTION_FAILURE';
            continue;
          }

          // Replay fixture with suiteRunId and suite item maskRules
          const runResult = await this.triggerReplay({
            projectId,
            fixtureId: item.fixtureId,
            environmentId,
            userId,
            signal,
            captureResponseBody,
            suiteRunId: suiteRun.id,
            maskRules: item.maskRules,
          });

          // Evaluate suite-specific assertions if configured
          let assertionFailed = false;
          if (item.assertions && item.assertions.length > 0) {
            for (const assertion of item.assertions) {
              if (assertion.type === 'STATUS_CODE' && runResult.httpStatusCode !== assertion.expected) {
                assertionFailed = true;
              }
              if (assertion.type === 'RESPONSE_TIME_MAX' && runResult.durationMs > assertion.maxDurationMs) {
                assertionFailed = true;
              }
            }
          }

          if (runResult.status !== 'SUCCESS' || assertionFailed) {
            failedItems++;
            overallStatus = 'ASSERTION_FAILURE';
          } else {
            passedItems++;
          }

          results.push(runResult);
        } catch {
          failedItems++;
          if (signal?.aborted) {
            cancelled = true;
          } else {
            overallStatus = 'TRANSPORT_ERROR';
          }
        }
      }
      if (cancelled) overallStatus = 'TIMEOUT';
    } catch (unhandledErr) {
      cancelled = signal?.aborted === true;
      overallStatus = cancelled ? 'TIMEOUT' : 'TRANSPORT_ERROR';
      const durationMs = Date.now() - suiteStartTime;
      const completedAt = new Date().toISOString();
      await this.store.updateSuiteRun(suiteRun.id, {
        status: overallStatus,
        passedItems,
        failedItems,
        durationMs,
        completedAt,
      });
      throw unhandledErr;
    }

    const durationMs = Date.now() - suiteStartTime;
    const completedAt = new Date().toISOString();

    // 5. Update SuiteRun with final metrics
    await this.store.updateSuiteRun(suiteRun.id, {
      status: overallStatus,
      passedItems,
      failedItems,
      durationMs,
      completedAt,
    });

    // 6. Record Audit Log for suite execution (best-effort: the SuiteRun is already durable)
    try {
      await this.store.createAuditLog({
        projectId,
        userId,
        action: 'SUITE_EXECUTED',
        targetType: 'RegressionSuite',
        targetId: suiteId,
        metadata: {
          suiteRunId: suiteRun.id,
          totalItems,
          passedItems,
          failedItems,
          durationMs,
          status: overallStatus,
          cancelled,
        },
      });
    } catch (err) {
      console.error('[suite] SUITE_EXECUTED audit failed', err instanceof Error ? err.name : 'UnknownError');
    }

    return {
      id: suiteRun.id,
      suiteId,
      environmentId,
      status: overallStatus,
      totalItems,
      passedItems,
      failedItems,
      durationMs,
      results,
      startedAt: suiteRun.startedAt,
      completedAt,
    };
  }
}

