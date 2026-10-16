'use client';

import React, { useState } from 'react';
import {
  Play,
  Zap,
  AlertCircle,
  Clock,
  Layers,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  FileCode2,
} from 'lucide-react';
import type {
  FixtureResponse,
  EnvironmentResponse,
  ReplayResultResponse,
  TriggerReplayInput,
} from '@replaylab/contracts';
import { TriggerReplayInputSchema } from '@replaylab/contracts';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { VisualDiffViewer } from './visual-diff-viewer';

export interface ReplayTriggerModalProps {
  projectId: string;
  fixture: FixtureResponse;
  environments: EnvironmentResponse[];
  onClose: () => void;
  onExecutionComplete?: (result: ReplayResultResponse) => void;
}

export function ReplayTriggerModal({
  projectId,
  fixture,
  environments,
  onClose,
  onExecutionComplete,
}: ReplayTriggerModalProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string>(
    environments[0]?.id || ''
  );
  const [captureResponseBody, setCaptureResponseBody] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ReplayResultResponse | null>(null);

  const selectedEnvironment = environments.find((e) => e.id === selectedEnvId);

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnvId) {
      setError('Please select an active target environment');
      return;
    }

    const payload: TriggerReplayInput = {
      fixtureId: fixture.id,
      environmentId: selectedEnvId,
      captureResponseBody,
    };

    const validation = TriggerReplayInputSchema.safeParse(payload);
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid replay trigger input');
      return;
    }

    try {
      setIsExecuting(true);
      setError(null);
      setExecutionResult(null);

      const result = await apiClient.post<ReplayResultResponse>(
        `/projects/${projectId}/replay`,
        validation.data
      );

      setExecutionResult(result);
      if (onExecutionComplete) {
        onExecutionComplete(result);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to dispatch replay execution');
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusBadge = (status: ReplayResultResponse['status']) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            SUCCESS
          </span>
        );
      case 'ASSERTION_FAILURE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="h-3.5 w-3.5" />
            ASSERTION_FAILURE
          </span>
        );
      case 'HTTP_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5" />
            HTTP_ERROR
          </span>
        );
      case 'SSRF_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="h-3.5 w-3.5" />
            SSRF_BLOCKED
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="h-3.5 w-3.5" />
            TIMEOUT
          </span>
        );
      case 'TRANSPORT_ERROR':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <AlertCircle className="h-3.5 w-3.5" />
            TRANSPORT_ERROR
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Interactive Fixture Replay</h2>
              <p className="text-xs text-slate-400">
                Synchronous single-fixture dispatch with bounded concurrency and baseline comparison
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-semibold rounded"
          >
            ✕
          </button>
        </div>

        {/* Fixture Target Metadata */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-800/40 space-y-2">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-sm text-white">{fixture.name}</span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              {fixture.request.method}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Path:</span>
              <span className="text-slate-200">{fixture.request.path}</span>
            </div>

            <div className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-slate-500">Baseline:</span>
              {fixture.baseline ? (
                <span className="text-emerald-400 font-semibold">
                  HTTP {fixture.baseline.statusCode}
                </span>
              ) : (
                <span className="text-slate-500 italic">No Baseline Set</span>
              )}
            </div>
          </div>
        </div>

        {/* Target Environment Selection Form */}
        <form onSubmit={handleExecute} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Select Target Environment *
            </label>
            {environments.length === 0 ? (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
                No target environments configured in this project. Please add an environment before replaying fixtures.
              </div>
            ) : (
              <select
                value={selectedEnvId}
                onChange={(e) => setSelectedEnvId(e.target.value)}
                disabled={isExecuting}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} — {env.baseUrl}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedEnvironment && (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-500">Egress Target:</span>
              <span className="text-slate-200 truncate">
                {selectedEnvironment.baseUrl}
                {fixture.request.path}
              </span>
            </div>
          )}

          {/* Response capture toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-800/30">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                Capture Response Body
              </span>
              <span className="text-[11px] text-slate-400">
                Opt-in body capture for diff inspection. Omitted by default for secret safety and bounded size.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={captureResponseBody}
                onChange={(e) => setCaptureResponseBody(e.target.checked)}
                disabled={isExecuting}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0"
              />
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isExecuting || environments.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {isExecuting ? 'Dispatching Outbound Request...' : 'Trigger Replay'}
            </button>
          </div>
        </form>

        {/* Live Execution Results Section */}
        {executionResult && (
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-3">
                {getStatusBadge(executionResult.status)}
                {executionResult.httpStatusCode !== null &&
                  executionResult.httpStatusCode !== undefined && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                      HTTP {executionResult.httpStatusCode}
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  <span>{executionResult.durationMs}ms</span>
                </div>
                {executionResult.baselineId && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span>Baseline: {executionResult.baselineId.slice(0, 8)}...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Diff Component */}
            <VisualDiffViewer
              diffFound={executionResult.diffFound}
              diffDetails={executionResult.diffDetails}
              status={executionResult.status}
              httpStatusCode={executionResult.httpStatusCode}
              baselineStatusCode={fixture.baseline?.statusCode}
              errorMessage={executionResult.errorMessage}
              body={executionResult.body}
              bodyType={executionResult.bodyType}
            />
          </div>
        )}
      </div>
    </div>
  );
}
