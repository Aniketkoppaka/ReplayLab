'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { FileCode2, Shield, EyeOff, Layers } from 'lucide-react';

export default function FixturesPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <FileCode2 className="h-6 w-6 text-amber-400" />
                Sanitized Fixtures
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Deterministic HTTP traffic snapshots with automated secret redaction and baseline history
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <Shield className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Fixture Sanitization Standard</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Fixtures ingested into ReplayLab strip out bearer tokens, API keys, cookies, and sensitive payload parameters before persisting to the database. Each fixture can maintain an immutable baseline history for deterministic regression testing.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <EyeOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Header & Body Redaction</div>
                  <div className="text-slate-400 mt-1">
                    Redaction rules scrub headers such as Authorization and Cookie, replacing sensitive values with [REDACTED].
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <Layers className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Immutable Baselines</div>
                  <div className="text-slate-400 mt-1">
                    Differential test comparisons reference immutable baseline snapshots, ensuring historical reproducibility.
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
