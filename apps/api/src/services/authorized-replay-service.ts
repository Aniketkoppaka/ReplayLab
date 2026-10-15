import {
  executeFixtureReplay,
  type ReplayExecutionResult,
  type ReplayExecutionParams,
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
    const { projectId, fixtureId, environmentId, userId, signal, captureResponseBody } = params;

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
    const currentBaselineId = await this.store.getCurrentBaselineId(projectId, fixtureId);
    const baselineSnapshot = fixture.baseline
      ? {
          id: currentBaselineId ?? undefined,
          statusCode: fixture.baseline.statusCode,
          headers: fixture.baseline.headers,
          body: fixture.baseline.body,
          bodyType: fixture.baseline.bodyType,
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
      signal,
      captureResponseBody: captureResponseBody ?? false,
    };

    // 5. Execute via replay engine (handles admission bounding & SSRF defenses)
    // NOTE: ConcurrencyAdmissionError is re-thrown as-is, never caught to fabricate a fake run!
    const result = await executeFixtureReplay(replayParams);

    // 6. Record sanitized audit log (zero secrets or raw sensitive payloads)
    this.auditLogs.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      userId,
      action: 'REPLAY_EXECUTED',
      fixtureId: fixture.id,
      environmentId: storedEnv.id,
      status: result.status,
      durationMs: result.durationMs,
      timestamp: new Date().toISOString(),
    });

    return result;
  }
}
