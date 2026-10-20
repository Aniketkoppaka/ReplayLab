'use client';

import React, { useState } from 'react';
import {
  Play,
  Zap,
  AlertCircle,
  Clock,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
            <CheckCircle2 className="h-3 w-3" />
            SUCCESS
          </span>
        );
      case 'ASSERTION_FAILURE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-950/40 text-rose-400 border border-rose-800/40">
            <XCircle className="h-3 w-3" />
            ASSERTION_FAILURE
          </span>
        );
      case 'HTTP_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/40 text-amber-400 border border-amber-800/40">
            <AlertTriangle className="h-3 w-3" />
            HTTP_ERROR
          </span>
        );
      case 'SSRF_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-950/40 text-rose-400 border border-rose-800/40">
            <ShieldAlert className="h-3 w-3" />
            SSRF_BLOCKED
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/40 text-amber-400 border border-amber-800/40">
            <Clock className="h-3 w-3" />
            TIMEOUT
          </span>
        );
      case 'TRANSPORT_ERROR':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#20242c] text-[#9aa2b1] border border-[#2d3340]">
            <AlertCircle className="h-3 w-3" />
            TRANSPORT_ERROR
          </span>
        );
    }
  };

  const getMethodBadgeClass = (m: string) => {
    switch (m.toUpperCase()) {
      case 'GET': return 'method-get';
      case 'POST': return 'method-post';
      case 'PUT': return 'method-put';
      case 'PATCH': return 'method-patch';
      case 'DELETE': return 'method-delete';
      default: return 'text-[#9aa2b1] bg-[#181b22] border-[#2d3340]';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded border border-[#2d3340] bg-[#13161c] p-5 shadow-2xl my-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222630]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-[#181b22] text-emerald-400 border border-[#2d3340]">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f0f2f5]">Interactive Fixture Replay</h2>
              <p className="text-[11px] text-[#6b7280]">
                Synchronous single-fixture dispatch with bounded concurrency and baseline comparison
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#f0f2f5] p-1 text-sm font-semibold rounded hover:bg-[#181b22] transition"
          >
            ✕
          </button>
        </div>

        {/* Fixture Target Bar */}
        <div className="p-3 rounded border border-[#222630] bg-[#0e1015] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`method-badge ${getMethodBadgeClass(fixture.request.method)}`}>
                {fixture.request.method}
              </span>
              <span className="font-mono text-xs text-[#f0f2f5]">{fixture.request.path}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-[#6b7280]">Baseline:</span>
              {fixture.baseline ? (
                <span className="text-emerald-400 font-bold">
                  HTTP {fixture.baseline.statusCode}
                </span>
              ) : (
                <span className="text-[#6b7280] italic">None</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-[#9aa2b1] truncate font-sans">
            Fixture: <span className="text-[#f0f2f5] font-medium">{fixture.name}</span>
          </div>
        </div>

        {/* Target Environment Selection Form */}
        <form onSubmit={handleExecute} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#9aa2b1] mb-1">
              Target Environment
            </label>
            {environments.length === 0 ? (
              <div className="p-2.5 rounded border border-amber-900/40 bg-amber-950/20 text-xs text-amber-300">
                No target environments configured. Please add an environment before replaying fixtures.
              </div>
            ) : (
              <select
                value={selectedEnvId}
                onChange={(e) => setSelectedEnvId(e.target.value)}
                disabled={isExecuting}
                className="w-full rounded border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-[#f0f2f5] focus:border-[#3e4657] focus:outline-none"
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
            <div className="flex items-center gap-2 text-xs font-mono text-[#9aa2b1] bg-[#0e1015] p-2 rounded border border-[#222630]">
              <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-[#6b7280]">Egress:</span>
              <span className="text-[#f0f2f5] truncate">
                {selectedEnvironment.baseUrl}
                {fixture.request.path}
              </span>
            </div>
          )}

          {/* Response capture toggle */}
          <div className="flex items-center justify-between p-2.5 rounded border border-[#222630] bg-[#181b22]">
            <div>
              <span className="text-xs font-medium text-[#f0f2f5] block">
                Capture Response Body
              </span>
              <span className="text-[11px] text-[#6b7280]">
                Opt-in body capture for diff inspection. Omitted by default for secret safety.
              </span>
            </div>
            <input
              type="checkbox"
              checked={captureResponseBody}
              onChange={(e) => setCaptureResponseBody(e.target.checked)}
              disabled={isExecuting}
              className="rounded border-[#2d3340] bg-[#0e1015] text-emerald-500 focus:ring-0"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded border border-rose-900/40 bg-rose-950/20 p-2.5 text-xs text-rose-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="rounded px-3 py-1.5 text-xs font-medium text-[#9aa2b1] hover:text-[#f0f2f5] transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isExecuting || environments.length === 0}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-[#0e1015] transition disabled:opacity-50"
            >
              <Play className="h-3 w-3 fill-current" />
              {isExecuting ? 'Dispatching...' : 'Trigger Replay'}
            </button>
          </div>
        </form>

        {/* Live Execution Results Section */}
        {executionResult && (
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded bg-[#0e1015] border border-[#222630]">
              <div className="flex items-center gap-2.5">
                {getStatusBadge(executionResult.status)}
                {executionResult.httpStatusCode !== null &&
                  executionResult.httpStatusCode !== undefined && (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#181b22] text-[#f0f2f5] border border-[#2d3340]">
                      HTTP {executionResult.httpStatusCode}
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-[#9aa2b1]">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-[#6b7280]" />
                  <span>{executionResult.durationMs}ms</span>
                </div>
                {executionResult.baselineId && (
                  <div className="text-[#6b7280]">
                    Baseline: {executionResult.baselineId.slice(0, 8)}...
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
