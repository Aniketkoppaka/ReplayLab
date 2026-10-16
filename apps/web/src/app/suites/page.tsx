'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { CheckCircle2, Sliders, GitCompare, Zap } from 'lucide-react';

export default function SuitesPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <CheckCircle2 className="h-6 w-6 text-cyan-400" />
                Regression Suites
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Automated regression testing workflows with differential response masks and pass/fail thresholds
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 space-y-4">
            <div className="flex items-center gap-3 text-cyan-400">
              <Zap className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Differential Comparison Engine</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Suite runs execute a collection of test fixtures against target environments, evaluating status codes, headers, and body payloads against baselines.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <Sliders className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Dynamic Field Masking</div>
                  <div className="text-slate-400 mt-1">
                    Ignore timestamps, UUIDs, trace IDs, and variable tokens from regression comparisons using custom JSONPath/regex mask rules.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <GitCompare className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Atomic Suite Snapshots</div>
                  <div className="text-slate-400 mt-1">
                    Suite executions persist detailed pass/fail counts, total duration, and individual child run references.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
