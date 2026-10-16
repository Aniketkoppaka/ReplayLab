'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  FileDiff,
  EyeOff,
} from 'lucide-react';
import type { ReplayOutcomeStatus } from '@replaylab/contracts';

export interface DiffDifference {
  path: string;
  type: 'ADDED' | 'REMOVED' | 'CHANGED' | 'TYPE_MISMATCH';
  expected?: unknown;
  actual?: unknown;
}

export interface DiffResult {
  match: boolean;
  differences: DiffDifference[];
}

export interface VisualDiffViewerProps {
  diffFound: boolean;
  diffDetails?: unknown;
  status: ReplayOutcomeStatus;
  httpStatusCode?: number | null;
  baselineStatusCode?: number | null;
  errorMessage?: string | null;
  body?: unknown;
  bodyType?: string | null;
}

export function VisualDiffViewer({
  diffFound,
  diffDetails,
  status,
  httpStatusCode,
  baselineStatusCode,
  errorMessage,
  body,
  bodyType,
}: VisualDiffViewerProps) {
  // Format diff differences if present
  let parsedDiff: DiffResult | null = null;
  if (diffDetails && typeof diffDetails === 'object') {
    const candidate = diffDetails as Record<string, unknown>;
    if (Array.isArray(candidate.differences)) {
      parsedDiff = {
        match: Boolean(candidate.match),
        differences: candidate.differences as DiffDifference[],
      };
    }
  }

  const formatValue = (val: unknown): string => {
    if (val === undefined) return '<undefined>';
    if (val === null) return 'null';
    if (typeof val === 'string') return `"${val}"`;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const getDiffBadge = (type: DiffDifference['type']) => {
    switch (type) {
      case 'ADDED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            + ADDED
          </span>
        );
      case 'REMOVED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            - REMOVED
          </span>
        );
      case 'CHANGED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            ~ CHANGED
          </span>
        );
      case 'TYPE_MISMATCH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
            ≠ TYPE_MISMATCH
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* High-Level Comparison Banner */}
      {!diffFound && status === 'SUCCESS' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">Full Differential Match</div>
            <div className="text-emerald-300/80 mt-0.5">
              The HTTP response matches baseline expectations exactly. No structural or value differences detected.
            </div>
          </div>
        </div>
      )}

      {status === 'ASSERTION_FAILURE' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300">
          <XCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">Baseline Assertion Discrepancy</div>
            <div className="text-rose-300/80 mt-0.5">
              Differences detected between actual response and the immutable baseline snapshot.
            </div>
          </div>
        </div>
      )}

      {status === 'HTTP_ERROR' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">Target Returned HTTP Error</div>
            <div className="text-amber-300/80 mt-0.5">
              Received HTTP {httpStatusCode || 'Error'}. (Target host was reachable, but returned a 4xx or 5xx status code).
            </div>
          </div>
        </div>
      )}

      {status === 'SSRF_BLOCKED' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-950/30 text-rose-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">SSRF Security Policy Blocked</div>
            <div className="text-rose-300/80 mt-0.5">
              {errorMessage || 'Dispatch destination resolved to a private subnet, loopback address, or cloud metadata endpoint.'}
            </div>
          </div>
        </div>
      )}

      {status === 'TIMEOUT' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300">
          <Clock className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">Execution Timeout</div>
            <div className="text-amber-300/80 mt-0.5">
              Target host did not complete socket response within the configured timeout window.
            </div>
          </div>
        </div>
      )}

      {status === 'TRANSPORT_ERROR' && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300">
          <XCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div className="text-xs">
            <div className="font-semibold text-white">Network Transport Failure</div>
            <div className="text-slate-400 mt-0.5">
              {errorMessage || 'A network error (e.g. ECONNREFUSED, socket drop, or DNS resolution failure) interrupted dispatch.'}
            </div>
          </div>
        </div>
      )}

      {/* Status Code Comparison Card (if statusCode differs) */}
      {baselineStatusCode && httpStatusCode && baselineStatusCode !== httpStatusCode && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-xs font-semibold text-white mb-2 flex items-center gap-2">
            <FileDiff className="h-4 w-4 text-amber-400" />
            HTTP Status Code Mismatch
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
              <span className="text-slate-400 block text-[11px] mb-1">Expected Baseline:</span>
              <span className="text-emerald-400 font-bold text-sm">HTTP {baselineStatusCode}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
              <span className="text-slate-400 block text-[11px] mb-1">Actual Response:</span>
              <span className="text-rose-400 font-bold text-sm">HTTP {httpStatusCode}</span>
            </div>
          </div>
        </div>
      )}

      {/* Structured Differences Table */}
      {parsedDiff && parsedDiff.differences.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-white flex items-center gap-2">
              <FileDiff className="h-4 w-4 text-indigo-400" />
              Structural & Value Differences ({parsedDiff.differences.length})
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Semantic Diff (Sensitive fields redacted)
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {parsedDiff.differences.map((diff, idx) => (
              <div key={idx} className="p-4 space-y-2 hover:bg-slate-800/20 transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getDiffBadge(diff.type)}
                    <span className="font-mono text-xs font-semibold text-indigo-300">
                      {diff.path}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-1">
                  {diff.expected !== undefined && (
                    <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/30">
                      <span className="text-rose-400 text-[10px] uppercase font-bold block mb-1">
                        Expected (Baseline)
                      </span>
                      <pre className="text-rose-200 overflow-x-auto text-[11px] whitespace-pre-wrap max-h-32">
                        {formatValue(diff.expected)}
                      </pre>
                    </div>
                  )}

                  {diff.actual !== undefined && (
                    <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/30">
                      <span className="text-emerald-400 text-[10px] uppercase font-bold block mb-1">
                        Actual (Received)
                      </span>
                      <pre className="text-emerald-200 overflow-x-auto text-[11px] whitespace-pre-wrap max-h-32">
                        {formatValue(diff.actual)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Captured Response Body (or safe notice) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-white">Response Body</span>
          {bodyType && (
            <span className="text-[10px] font-mono text-slate-500 uppercase">
              Format: {bodyType}
            </span>
          )}
        </div>

        {body !== null && body !== undefined ? (
          <pre className="font-mono text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto max-h-64 whitespace-pre-wrap">
            {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
          </pre>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500 italic p-3 rounded-lg bg-slate-950 border border-slate-800/80">
            <EyeOff className="h-4 w-4 shrink-0 text-slate-600" />
            <span>
              Response body was omitted by default to prevent secret leakage and bounded memory consumption. Opt in via &quot;Capture Response Body&quot; during trigger.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
