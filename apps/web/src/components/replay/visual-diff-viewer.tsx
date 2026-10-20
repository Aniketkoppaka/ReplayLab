'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  FileDiff,
  EyeOff,
  Columns,
  Rows,
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
  durationMs?: number;
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
  durationMs,
}: VisualDiffViewerProps) {
  const [layoutMode, setLayoutMode] = useState<'split' | 'unified'>('split');

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
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
            + ADDED
          </span>
        );
      case 'REMOVED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/40 text-rose-400 border border-rose-800/40">
            - REMOVED
          </span>
        );
      case 'CHANGED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/40 text-amber-400 border border-amber-800/40">
            ~ CHANGED
          </span>
        );
      case 'TYPE_MISMATCH':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/40 text-purple-400 border border-purple-800/40">
            ≠ TYPE_MISMATCH
          </span>
        );
      default:
        return null;
    }
  };

  // Safely compute body size in bytes if present
  const getBodySizeDisplay = () => {
    if (body === null || body === undefined) return null;
    const size = typeof body === 'string' ? new Blob([body]).size : new Blob([JSON.stringify(body)]).size;
    if (size < 1024) return `${size} B`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  const bodySize = getBodySizeDisplay();

  return (
    <div className="space-y-3">
      {/* Metrics Strip */}
      {(httpStatusCode !== undefined || durationMs !== undefined || bodySize) && (
        <div className="flex items-center gap-2 p-2 rounded bg-[#0e1015] border border-[#222630] text-xs font-mono">
          {httpStatusCode !== undefined && httpStatusCode !== null && (
            <span className="px-2 py-0.5 rounded bg-[#181b22] text-[#f0f2f5] border border-[#2d3340]">
              Status: <span className="text-emerald-400 font-bold">{httpStatusCode}</span>
            </span>
          )}
          {durationMs !== undefined && (
            <span className="px-2 py-0.5 rounded bg-[#181b22] text-[#9aa2b1] border border-[#2d3340] flex items-center gap-1">
              <Clock className="h-3 w-3 text-[#6b7280]" />
              {durationMs}ms
            </span>
          )}
          {bodySize && (
            <span className="px-2 py-0.5 rounded bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
              Size: {bodySize}
            </span>
          )}
        </div>
      )}

      {/* High-Level Comparison Banner */}
      {!diffFound && status === 'SUCCESS' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-emerald-900/40 bg-emerald-950/20 text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <div className="text-xs">
            <span className="font-semibold text-emerald-300">Full Differential Match: </span>
            <span className="text-[#9aa2b1]">Response body, headers, and status code match baseline snapshot precisely.</span>
          </div>
        </div>
      )}

      {status === 'ASSERTION_FAILURE' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-rose-900/40 bg-rose-950/20 text-rose-300">
          <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <div className="text-xs">
            <span className="font-semibold text-rose-300">Baseline Assertion Discrepancy: </span>
            <span className="text-[#9aa2b1]">Differences detected between actual response and the immutable baseline snapshot.</span>
          </div>
        </div>
      )}

      {status === 'HTTP_ERROR' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-amber-900/40 bg-amber-950/20 text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs">
            <span className="font-semibold text-amber-300">Target Returned HTTP Error: </span>
            <span className="text-[#9aa2b1]">Received HTTP {httpStatusCode || 'Error'}. (Target host reachable, returned 4xx or 5xx code).</span>
          </div>
        </div>
      )}

      {status === 'SSRF_BLOCKED' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-rose-900/40 bg-rose-950/30 text-rose-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <div className="text-xs">
            <span className="font-semibold text-rose-300">SSRF Security Policy Blocked: </span>
            <span className="text-[#9aa2b1]">{errorMessage || 'Target destination resolved to a private, loopback, or metadata address.'}</span>
          </div>
        </div>
      )}

      {status === 'TIMEOUT' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-amber-900/40 bg-amber-950/20 text-amber-300">
          <Clock className="h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs">
            <span className="font-semibold text-amber-300">Execution Timeout: </span>
            <span className="text-[#9aa2b1]">Target socket did not respond within the configured timeout window.</span>
          </div>
        </div>
      )}

      {status === 'TRANSPORT_ERROR' && (
        <div className="flex items-center gap-2.5 p-3 rounded border border-[#2d3340] bg-[#181b22] text-[#f0f2f5]">
          <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <div className="text-xs">
            <span className="font-semibold text-rose-300">Network Transport Failure: </span>
            <span className="text-[#9aa2b1]">{errorMessage || 'Network connection dropped, refused, or DNS resolution failed.'}</span>
          </div>
        </div>
      )}

      {/* Status Code Comparison Card (if statusCode differs) */}
      {baselineStatusCode && httpStatusCode && baselineStatusCode !== httpStatusCode && (
        <div className="rounded border border-[#222630] bg-[#13161c] p-3">
          <div className="text-xs font-semibold text-[#f0f2f5] mb-2 flex items-center gap-2">
            <FileDiff className="h-3.5 w-3.5 text-amber-400" />
            HTTP Status Code Mismatch
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded bg-[#181b22] border border-[#2d3340]">
              <span className="text-[#6b7280] block text-[10px] uppercase mb-0.5">Expected Baseline</span>
              <span className="text-emerald-400 font-bold text-sm">HTTP {baselineStatusCode}</span>
            </div>
            <div className="p-2.5 rounded bg-[#181b22] border border-[#2d3340]">
              <span className="text-[#6b7280] block text-[10px] uppercase mb-0.5">Actual Response</span>
              <span className="text-rose-400 font-bold text-sm">HTTP {httpStatusCode}</span>
            </div>
          </div>
        </div>
      )}

      {/* Structured Differences Table */}
      {parsedDiff && parsedDiff.differences.length > 0 && (
        <div className="rounded border border-[#222630] bg-[#13161c] overflow-hidden">
          <div className="px-3.5 py-2 border-b border-[#222630] bg-[#181b22] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#f0f2f5] flex items-center gap-2">
              <FileDiff className="h-3.5 w-3.5 text-amber-400" />
              Structural & Value Differences ({parsedDiff.differences.length})
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded bg-[#13161c] p-0.5 border border-[#222630]">
                <button
                  type="button"
                  onClick={() => setLayoutMode('split')}
                  title="Side-by-side comparison"
                  className={`p-1 rounded text-xs ${layoutMode === 'split' ? 'bg-[#20242c] text-[#f0f2f5]' : 'text-[#6b7280] hover:text-[#f0f2f5]'}`}
                >
                  <Columns className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('unified')}
                  title="Unified comparison"
                  className={`p-1 rounded text-xs ${layoutMode === 'unified' ? 'bg-[#20242c] text-[#f0f2f5]' : 'text-[#6b7280] hover:text-[#f0f2f5]'}`}
                >
                  <Rows className="h-3 w-3" />
                </button>
              </div>
              <span className="text-[10px] text-[#6b7280] font-mono hidden sm:inline">
                Semantic Diff
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#222630]">
            {parsedDiff.differences.map((diff, idx) => (
              <div key={idx} className="p-3 space-y-2 hover:bg-[#181b22]/50 transition">
                <div className="flex items-center gap-2">
                  {getDiffBadge(diff.type)}
                  <span className="font-mono text-xs font-semibold text-[#f0f2f5]">
                    {diff.path}
                  </span>
                </div>

                {layoutMode === 'split' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                    {diff.expected !== undefined && (
                      <div className="p-2 rounded bg-rose-950/20 border border-rose-900/30">
                        <span className="text-rose-400 text-[10px] uppercase font-bold block mb-1">
                          Expected (Baseline)
                        </span>
                        <pre className="text-rose-200 overflow-x-auto text-[11px] whitespace-pre-wrap max-h-32">
                          {formatValue(diff.expected)}
                        </pre>
                      </div>
                    )}

                    {diff.actual !== undefined && (
                      <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/30">
                        <span className="text-emerald-400 text-[10px] uppercase font-bold block mb-1">
                          Actual (Received)
                        </span>
                        <pre className="text-emerald-200 overflow-x-auto text-[11px] whitespace-pre-wrap max-h-32">
                          {formatValue(diff.actual)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs font-mono">
                    {diff.expected !== undefined && (
                      <div className="p-2 rounded bg-rose-950/20 border-l-2 border-rose-500">
                        <span className="text-rose-400 text-[10px] uppercase font-bold block mb-0.5">- EXPECTED</span>
                        <pre className="text-rose-200 text-[11px] whitespace-pre-wrap max-h-24 overflow-x-auto">
                          {formatValue(diff.expected)}
                        </pre>
                      </div>
                    )}
                    {diff.actual !== undefined && (
                      <div className="p-2 rounded bg-emerald-950/20 border-l-2 border-emerald-500">
                        <span className="text-emerald-400 text-[10px] uppercase font-bold block mb-0.5">+ ACTUAL</span>
                        <pre className="text-emerald-200 text-[11px] whitespace-pre-wrap max-h-24 overflow-x-auto">
                          {formatValue(diff.actual)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Captured Response Body */}
      <div className="rounded border border-[#222630] bg-[#13161c] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#f0f2f5]">Response Body</span>
          {bodyType && (
            <span className="text-[10px] font-mono text-[#6b7280] uppercase">
              Format: {bodyType}
            </span>
          )}
        </div>

        {body !== null && body !== undefined ? (
          <pre className="font-mono text-xs text-[#f0f2f5] bg-[#0e1015] p-3 rounded border border-[#222630] overflow-x-auto max-h-64 whitespace-pre-wrap">
            {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
          </pre>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#6b7280] italic p-2.5 rounded bg-[#0e1015] border border-[#222630]">
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
            <span className="text-[11px]">
              Response body omitted by default for secret safety and bounded size. Opt in via &quot;Capture Response Body&quot; during trigger.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
