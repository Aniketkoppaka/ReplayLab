'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { PlayCircle, Cpu, Timer, ShieldAlert } from 'lucide-react';

export default function RunsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <PlayCircle className="h-6 w-6 text-indigo-400" />
                Replay Runs
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Durable execution history, differential comparison results, and response timings
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <Cpu className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Execution Orchestration</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              ReplayLab tracks every outbound dispatch in durable PostgreSQL persistence with outcome status, HTTP response status code, timing metrics, and differential match results against baseline snapshots.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <Timer className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Bounded Concurrency</div>
                  <div className="text-slate-400 mt-1">
                    Worker concurrency limits ensure target systems are never overwhelmed during mass replay batches.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Response Capture Controls</div>
                  <div className="text-slate-400 mt-1">
                    Response body capture is strictly opt-in and size-capped at 1MB to prevent memory exhaustion and data leakage.
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
