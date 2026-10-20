'use client';

import React, { useState } from 'react';
import {
  Play,
  Zap,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Globe,
  Layers,
} from 'lucide-react';
import type {
  SuiteResponse,
  EnvironmentResponse,
  FixtureResponse,
  SuiteExecutionSummaryResponse,
  ReplayResultResponse,
} from '@replaylab/contracts';
import { TriggerSuiteExecutionInputSchema } from '@replaylab/contracts';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { VisualDiffViewer } from '@/components/replay/visual-diff-viewer';

export interface SuiteRunModalProps {
  projectId: string;
  suite: SuiteResponse;
  environments: EnvironmentResponse[];
  fixtures: FixtureResponse[];
  onClose: () => void;
  onExecutionComplete?: (summary: SuiteExecutionSummaryResponse) => void;
}

export function SuiteRunModal({
  projectId,
  suite,
  environments,
  fixtures,
  onClose,
  onExecutionComplete,
}: SuiteRunModalProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string>(
    environments[0]?.id || ''
  );
  const [captureResponseBody, setCaptureResponseBody] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SuiteExecutionSummaryResponse | null>(null);
  const [expandedResultIdx, setExpandedResultIdx] = useState<number | null>(null);

  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnvId) {
      setError('Please select a target environment');
      return;
    }

    const payload = {
      suiteId: suite.id,
      environmentId: selectedEnvId,
      captureResponseBody,
    };

    const validation = TriggerSuiteExecutionInputSchema.safeParse(payload);
    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid suite trigger input');
      return;
    }

    try {
      setIsExecuting(true);
      setError(null);
      setSummary(null);

      const result = await apiClient.post<SuiteExecutionSummaryResponse>(
        `/projects/${projectId}/suites/${suite.id}/run`,
        validation.data
      );

      setSummary(result);
      if (onExecutionComplete) {
        onExecutionComplete(result);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to execute regression suite');
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusBadge = (status: SuiteExecutionSummaryResponse['status']) => {
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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
            <AlertCircle className="h-3.5 w-3.5" />
            TRANSPORT_ERROR
          </span>
        );
    }
  };

  const getChildStatusBadge = (status: ReplayResultResponse['status']) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            PASS
          </span>
        );
      case 'ASSERTION_FAILURE':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            FAIL
          </span>
        );
      case 'HTTP_ERROR':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            HTTP_ERR
          </span>
        );
      case 'SSRF_BLOCKED':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            BLOCKED
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            TIMEOUT
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
            ERROR
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded border border-[#222630] bg-[#13161c] p-6 shadow-2xl my-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#222630]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Execute Regression Suite</h2>
              <p className="text-xs text-[#9aa2b1]">
                Synchronous multi-fixture playback with assertions, mask rules, and snapshot recording
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9aa2b1] hover:text-white p-1 text-sm font-semibold rounded"
          >
            ✕
          </button>
        </div>

        {/* Suite Details Preview */}
        <div className="p-4 rounded border border-[#222630] bg-[#181b22] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold text-sm text-white">{suite.name}</span>
            </div>
            <span className="text-xs text-[#9aa2b1] font-mono">
              {suite.items.length} Fixtures Configured
            </span>
          </div>
          {suite.description && (
            <p className="text-xs text-[#9aa2b1]">{suite.description}</p>
          )}
        </div>

        {/* Trigger Form */}
        <form onSubmit={handleExecute} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
              Target Environment *
            </label>
            {environments.length === 0 ? (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
                No target environments configured in this project.
              </div>
            ) : (
              <select
                value={selectedEnvId}
                onChange={(e) => setSelectedEnvId(e.target.value)}
                disabled={isExecuting}
                className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              >
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} — {env.baseUrl}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedEnv && (
            <div className="flex items-center gap-2 text-xs font-mono text-[#9aa2b1] bg-[#0e1015] p-2.5 rounded-lg border border-[#222630]">
              <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-[#6b7280]">Base URL:</span>
              <span className="text-[#f0f2f5] truncate">{selectedEnv.baseUrl}</span>
            </div>
          )}

          {/* Response capture toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-[#222630] bg-[#181b22]">
            <div>
              <span className="text-xs font-medium text-[#f0f2f5] block">
                Capture Child Response Bodies
              </span>
              <span className="text-[11px] text-[#9aa2b1]">
                Enables raw body capture for all fixtures in this run (up to 1MB size limit).
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={captureResponseBody}
                onChange={(e) => setCaptureResponseBody(e.target.checked)}
                disabled={isExecuting}
                className="rounded border-[#2d3340] bg-[#181b22] text-cyan-600 focus:ring-0"
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
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#9aa2b1] hover:text-white transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isExecuting || environments.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 text-xs font-semibold text-white shadow transition hover:bg-cyan-500 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {isExecuting ? 'Executing Suite Dispatches...' : 'Run Regression Suite'}
            </button>
          </div>
        </form>

        {/* Live Execution Results Section */}
        {summary && (
          <div className="pt-4 border-t border-[#222630] space-y-4">
            {/* Metric Overview */}
            <div className="p-4 rounded bg-[#0e1015] border border-[#222630] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {getStatusBadge(summary.status)}
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-400 font-bold">
                    {summary.passedItems} Passed
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-rose-400 font-bold">
                    {summary.failedItems} Failed
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-[#9aa2b1]">
                    {summary.totalItems} Total
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-[#9aa2b1]">
                <Clock className="h-3.5 w-3.5 text-[#6b7280]" />
                <span>Total Duration: {summary.durationMs}ms</span>
              </div>
            </div>

            {/* Child Fixture Executions List */}
            <div className="rounded border border-[#222630] bg-[#13161c]/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#222630] bg-[#181b22] text-xs font-semibold text-white">
                Fixture Dispatches ({summary.results.length})
              </div>

              <div className="divide-y divide-slate-800">
                {summary.results.map((res, idx) => {
                  const fix = fixtureMap.get(res.fixtureId);
                  const isExpanded = expandedResultIdx === idx;

                  return (
                    <div key={idx} className="transition hover:bg-[#181b22]">
                      <div
                        onClick={() => setExpandedResultIdx(isExpanded ? null : idx)}
                        className="p-4 flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-[#6b7280]">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          {getChildStatusBadge(res.status)}

                          <div>
                            <div className="font-semibold text-xs text-white flex items-center gap-2">
                              <span>{fix?.name || `Fixture ${res.fixtureId.slice(0, 8)}`}</span>
                              {fix && (
                                <span className="font-mono text-[10px] text-[#9aa2b1]">
                                  {fix.request.method} {fix.request.path}
                                </span>
                              )}
                            </div>
                            {res.errorMessage && (
                              <div className="text-[11px] text-rose-300 mt-0.5">
                                {res.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono text-[#9aa2b1]">
                          {res.httpStatusCode !== null && res.httpStatusCode !== undefined && (
                            <span className="font-bold text-[#9aa2b1]">
                              HTTP {res.httpStatusCode}
                            </span>
                          )}
                          <span>{res.durationMs}ms</span>
                        </div>
                      </div>

                      {/* Expanded Diff Viewer for Child Run */}
                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-[#222630] bg-[#0e1015]/40">
                          <div className="py-2">
                            <VisualDiffViewer
                              diffFound={res.diffFound}
                              diffDetails={res.diffDetails}
                              status={res.status}
                              httpStatusCode={res.httpStatusCode}
                              baselineStatusCode={fix?.baseline?.statusCode}
                              errorMessage={res.errorMessage}
                              body={res.body}
                              bodyType={res.bodyType}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
