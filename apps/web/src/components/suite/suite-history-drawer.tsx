'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  AlertCircle,
  Layers,
} from 'lucide-react';
import type { ReplayOutcomeStatus } from '@replaylab/contracts';
import { apiClient, ApiClientError } from '@/lib/api-client';

export interface StoredSuiteRunRecord {
  id: string;
  suiteId: string;
  environmentId: string;
  status: ReplayOutcomeStatus;
  totalItems: number;
  passedItems: number;
  failedItems: number;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
}

export interface SuiteHistoryDrawerProps {
  projectId: string;
  suiteId: string;
  suiteName: string;
  onClose: () => void;
}

export function SuiteHistoryDrawer({
  projectId,
  suiteId,
  suiteName,
  onClose,
}: SuiteHistoryDrawerProps) {
  const [runs, setRuns] = useState<StoredSuiteRunRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get<StoredSuiteRunRecord[]>(
        `/projects/${projectId}/suites/${suiteId}/runs`
      );
      setRuns(data);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch suite execution history');
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId, suiteId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const getStatusBadge = (status: ReplayOutcomeStatus) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            SUCCESS
          </span>
        );
      case 'ASSERTION_FAILURE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="h-3 w-3" />
            FAILED
          </span>
        );
      case 'HTTP_ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            HTTP_ERROR
          </span>
        );
      case 'SSRF_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="h-3 w-3" />
            SSRF_BLOCKED
          </span>
        );
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            TIMEOUT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
            <AlertCircle className="h-3 w-3" />
            ERROR
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded border border-[#222630] bg-[#13161c] p-6 shadow-2xl my-8 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-[#222630]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Execution History</h2>
              <p className="text-xs text-[#9aa2b1]">Suite: {suiteName}</p>
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

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6b7280] bg-[#0e1015]/40 rounded border border-[#222630]">
            No executions recorded for this suite yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-[#222630] rounded bg-[#0e1015]/40 overflow-hidden font-mono">
            {runs.map((run) => (
              <div
                key={run.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[#181b22] transition"
              >
                <div className="space-y-1.5 font-sans">
                  <div className="flex items-center gap-2.5">
                    {getStatusBadge(run.status)}
                    <span className="font-mono text-xs text-[#9aa2b1]">
                      ID: {run.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[#9aa2b1] text-xs font-mono">
                    <span className="text-emerald-400 font-bold">{run.passedItems} Passed</span>
                    <span>•</span>
                    <span className="text-rose-400 font-bold">{run.failedItems} Failed</span>
                    <span>•</span>
                    <span>{run.totalItems} Total Fixtures</span>
                  </div>
                </div>

                <div className="text-right text-xs font-mono text-[#9aa2b1] space-y-1">
                  <div className="flex items-center justify-end gap-1 text-[#9aa2b1]">
                    <Clock className="h-3.5 w-3.5 text-[#6b7280]" />
                    <span>{run.durationMs}ms</span>
                  </div>
                  <div className="text-[11px] text-[#6b7280] font-sans">
                    {new Date(run.startedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-[#9aa2b1] hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
