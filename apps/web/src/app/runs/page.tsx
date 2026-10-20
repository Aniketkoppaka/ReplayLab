'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { useProject } from '@/components/project/project-provider';
import { apiClient, ApiClientError } from '@/lib/api-client';
import {
  PlayCircle,
  Clock,
  Layers,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  AlertCircle,
  ChevronRight,
  Eye,
} from 'lucide-react';
import type {
  FixtureResponse,
  EnvironmentResponse,
  ReplayOutcomeStatus,
} from '@replaylab/contracts';
import { VisualDiffViewer } from '@/components/replay/visual-diff-viewer';
import { ReplayTriggerModal } from '@/components/replay/replay-trigger-modal';

interface StoredReplayRunSummary {
  id: string;
  fixtureId: string;
  environmentId: string;
  status: ReplayOutcomeStatus;
  httpStatusCode?: number | null;
  durationMs: number;
  diffFound: boolean;
  executedAt: string;
}

interface StoredReplayRunDetail extends StoredReplayRunSummary {
  projectId: string;
  baselineId?: string | null;
  headers: Record<string, string>;
  bodyType?: string | null;
  body?: unknown;
  errorMessage?: string | null;
  diffDetails?: unknown;
}

export default function RunsPage() {
  const { activeProject } = useProject();
  const [runs, setRuns] = useState<StoredReplayRunSummary[]>([]);
  const [fixtures, setFixtures] = useState<FixtureResponse[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [selectedFixtureFilter, setSelectedFixtureFilter] = useState<string>('');
  const [limit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);

  // Run detail modal state
  const [detailModalRunId, setDetailModalRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<StoredReplayRunDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Replay modal state from runs page
  const [triggerModalFixture, setTriggerModalFixture] = useState<FixtureResponse | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!activeProject) {
      setRuns([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        limit,
        offset,
      };
      if (selectedFixtureFilter) {
        params.fixtureId = selectedFixtureFilter;
      }

      const runsData = await apiClient.get<StoredReplayRunSummary[]>(
        `/projects/${activeProject.id}/runs`,
        { params }
      );
      setRuns(runsData);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch replay runs history');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeProject, limit, offset, selectedFixtureFilter]);

  const fetchMetadata = useCallback(async () => {
    if (!activeProject) return;
    try {
      const [fixturesData, envsData] = await Promise.all([
        apiClient.get<FixtureResponse[]>(`/projects/${activeProject.id}/fixtures`),
        apiClient.get<EnvironmentResponse[]>(`/projects/${activeProject.id}/environments`),
      ]);
      setFixtures(fixturesData);
      setEnvironments(envsData);
    } catch {
      // Non-critical background metadata fetch
    }
  }, [activeProject]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    void fetchMetadata();
  }, [fetchMetadata]);

  const openRunDetail = async (runId: string) => {
    if (!activeProject) return;
    setDetailModalRunId(runId);
    setRunDetail(null);
    setDetailError(null);
    setIsLoadingDetail(true);

    try {
      const detail = await apiClient.get<StoredReplayRunDetail>(
        `/projects/${activeProject.id}/runs/${runId}`
      );
      setRunDetail(detail);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setDetailError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load run details');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const getStatusBadge = (status: ReplayOutcomeStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            SUCCESS
          </span>
        );
      case 'ASSERTION_FAILURE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="h-3 w-3" />
            ASSERTION_FAILURE
          </span>
        );
      case 'HTTP_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            HTTP_ERROR
          </span>
        );
      case 'SSRF_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="h-3 w-3" />
            SSRF_BLOCKED
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            TIMEOUT
          </span>
        );
      case 'TRANSPORT_ERROR':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
            <AlertCircle className="h-3 w-3" />
            TRANSPORT_ERROR
          </span>
        );
    }
  };

  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const envMap = new Map(environments.map((e) => [e.id, e]));

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <PlayCircle className="h-6 w-6 text-indigo-400" />
                Replay Runs History
              </h1>
              <p className="mt-1 text-sm text-[#9aa2b1]">
                Durable execution history, differential comparison results, and response timings
              </p>
            </div>

            {/* Quick Trigger Button if fixtures exist */}
            {activeProject && fixtures.length > 0 && (
              <button
                type="button"
                onClick={() => setTriggerModalFixture(fixtures[0] || null)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#0e1015] px-4 py-2 text-sm font-semibold text-white shadow transition  focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <PlayCircle className="h-4 w-4" />
                Launch Replay
              </button>
            )}
          </div>

          {!activeProject ? (
            <div className="rounded border border-[#222630] bg-[#13161c] p-12 text-center">
              <PlayCircle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No active project selected</h3>
              <p className="text-xs text-[#9aa2b1] mt-1 max-w-sm mx-auto">
                Please select a project to view its replay execution history.
              </p>
            </div>
          ) : (
            <>
              {/* Fixture Filter Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded border border-[#222630] bg-[#13161c]">
                <div className="flex items-center gap-2 text-xs text-[#9aa2b1]">
                  <Filter className="h-4 w-4 text-[#6b7280]" />
                  <span>Filter by Fixture:</span>
                  <select
                    value={selectedFixtureFilter}
                    onChange={(e) => {
                      setSelectedFixtureFilter(e.target.value);
                      setOffset(0);
                    }}
                    className="rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All Fixtures</option>
                    {fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.request.method} {f.request.path})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-xs text-[#6b7280] font-mono">
                  Showing {runs.length} runs (Page {Math.floor(offset / limit) + 1})
                </div>
              </div>

              {error && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center p-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                </div>
              ) : runs.length === 0 ? (
                <div className="rounded border border-[#222630] bg-[#13161c] p-12 text-center">
                  <PlayCircle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-white">No replay runs recorded</h3>
                  <p className="text-xs text-[#9aa2b1] mt-1 max-w-sm mx-auto mb-4">
                    Trigger your first fixture replay against a target environment to see execution results and diff comparisons here.
                  </p>
                  {fixtures.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTriggerModalFixture(fixtures[0] || null)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#0e1015] px-4 py-2 text-xs font-semibold text-white shadow  transition"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Execute First Run
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded border border-[#222630] bg-[#13161c] overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#181b22] border-b border-[#222630] text-[11px] font-semibold text-[#9aa2b1] uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5">Outcome Status</th>
                          <th className="px-5 py-3.5">Fixture / Path</th>
                          <th className="px-5 py-3.5">Environment</th>
                          <th className="px-5 py-3.5">HTTP Status</th>
                          <th className="px-5 py-3.5">Duration</th>
                          <th className="px-5 py-3.5">Executed At</th>
                          <th className="px-5 py-3.5 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {runs.map((run) => {
                          const fix = fixtureMap.get(run.fixtureId);
                          const env = envMap.get(run.environmentId);

                          return (
                            <tr
                              key={run.id}
                              onClick={() => openRunDetail(run.id)}
                              className="hover:bg-[#181b22] transition cursor-pointer"
                            >
                              <td className="px-5 py-4 whitespace-nowrap font-sans">
                                {getStatusBadge(run.status)}
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap">
                                <div className="font-semibold text-white font-sans">
                                  {fix?.name || `Fixture ${run.fixtureId.slice(0, 8)}`}
                                </div>
                                <div className="text-[11px] text-[#9aa2b1] truncate max-w-xs">
                                  {fix ? `${fix.request.method} ${fix.request.path}` : run.fixtureId}
                                </div>
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap font-sans text-[#9aa2b1]">
                                {env?.name || run.environmentId.slice(0, 8)}
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap">
                                {run.httpStatusCode !== null && run.httpStatusCode !== undefined ? (
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      run.httpStatusCode >= 400
                                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}
                                  >
                                    {run.httpStatusCode}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap text-[#9aa2b1]">
                                {run.durationMs}ms
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap text-[#9aa2b1] text-[11px] font-sans">
                                {new Date(run.executedAt).toLocaleString()}
                              </td>

                              <td className="px-5 py-4 whitespace-nowrap text-right font-sans">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRunDetail(run.id);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>View Diff</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="px-5 py-3 border-t border-[#222630] bg-[#13161c]/80 flex items-center justify-between text-xs text-[#9aa2b1]">
                    <button
                      type="button"
                      disabled={offset === 0}
                      onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                      className="px-3 py-1.5 rounded-lg border border-[#2d3340] bg-[#181b22] text-[#9aa2b1] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Previous
                    </button>

                    <span>Page {Math.floor(offset / limit) + 1}</span>

                    <button
                      type="button"
                      disabled={runs.length < limit}
                      onClick={() => setOffset((prev) => prev + limit)}
                      className="px-3 py-1.5 rounded-lg border border-[#2d3340] bg-[#181b22] text-[#9aa2b1] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Historical Run Details & Diff Modal */}
          {detailModalRunId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-3xl rounded border border-[#222630] bg-[#13161c] p-6 shadow-2xl my-8 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-[#222630]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[#0e1015]/20 text-indigo-400 border border-indigo-500/30">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Replay Run Detail & Diff</h2>
                      <p className="text-xs font-mono text-[#6b7280]">ID: {detailModalRunId}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailModalRunId(null)}
                    className="text-[#9aa2b1] hover:text-white p-1 text-sm font-semibold rounded"
                  >
                    ✕
                  </button>
                </div>

                {isLoadingDetail ? (
                  <div className="flex items-center justify-center p-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  </div>
                ) : detailError ? (
                  <div className="p-4 rounded border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{detailError}</span>
                  </div>
                ) : runDetail ? (
                  <div className="space-y-4">
                    {/* Run Summary Meta */}
                    <div className="p-4 rounded border border-[#222630] bg-[#0e1015] flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(runDetail.status)}
                        {runDetail.httpStatusCode !== null && runDetail.httpStatusCode !== undefined && (
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#181b22] text-[#f0f2f5] border border-[#2d3340]">
                            HTTP {runDetail.httpStatusCode}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono text-[#9aa2b1]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-[#6b7280]" />
                          <span>{runDetail.durationMs}ms</span>
                        </div>
                        {runDetail.baselineId && (
                          <div className="flex items-center gap-1.5 text-[#6b7280]">
                            <span>Baseline: {runDetail.baselineId.slice(0, 8)}...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Associated Target Context */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                      <div className="p-3 rounded-lg border border-[#222630] bg-[#181b22]">
                        <span className="text-[#6b7280] block text-[10px] uppercase font-sans">
                          Target Fixture
                        </span>
                        <span className="text-white font-medium">
                          {fixtureMap.get(runDetail.fixtureId)?.name || runDetail.fixtureId}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-[#222630] bg-[#181b22]">
                        <span className="text-[#6b7280] block text-[10px] uppercase font-sans">
                          Target Environment
                        </span>
                        <span className="text-white font-medium">
                          {envMap.get(runDetail.environmentId)?.name || runDetail.environmentId}
                        </span>
                      </div>
                    </div>

                    {/* Visual Diff Component */}
                    <VisualDiffViewer
                      diffFound={runDetail.diffFound}
                      diffDetails={runDetail.diffDetails}
                      status={runDetail.status}
                      httpStatusCode={runDetail.httpStatusCode}
                      errorMessage={runDetail.errorMessage}
                      body={runDetail.body}
                      bodyType={runDetail.bodyType}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Quick Launch Trigger Modal from Runs page */}
          {triggerModalFixture && activeProject && (
            <ReplayTriggerModal
              projectId={activeProject.id}
              fixture={triggerModalFixture}
              environments={environments}
              onClose={() => setTriggerModalFixture(null)}
              onExecutionComplete={() => {
                void fetchRuns();
              }}
            />
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
