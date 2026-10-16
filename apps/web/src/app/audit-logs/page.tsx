'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { ShieldAlert, CheckCheck, Eye } from 'lucide-react';

export default function AuditLogsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <ShieldAlert className="h-6 w-6 text-rose-400" />
                Audit Logs
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Immutable security audit trails for environment secret access, baseline updates, and project mutations
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Compliance & Security Audit Trail</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Every sensitive action is committed within atomic database transactions alongside audit records. This guarantees audit logs cannot succeed or fail independently from the underlying state change.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <Eye className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Secret Access Auditing</div>
                  <div className="text-slate-400 mt-1">
                    Environment secret decryptions log actor identity and timestamp without ever logging the plaintext secret value.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <CheckCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">Atomic Transaction Guarantees</div>
                  <div className="text-slate-400 mt-1">
                    Project deletions, membership changes, and baseline updates use Prisma interactive transactions to ensure total atomicity.
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
