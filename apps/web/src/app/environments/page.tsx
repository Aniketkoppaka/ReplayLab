'use client';

import React from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { Server, ShieldCheck, Lock, ExternalLink } from 'lucide-react';

export default function EnvironmentsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <Server className="h-6 w-6 text-emerald-400" />
                Target Environments
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Safe egress endpoints with anti-SSRF protection, private network validation, and encrypted secrets
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
              <h2 className="text-lg font-semibold text-white">Egress Safety Architecture</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Target URLs configured in ReplayLab are subjected to strict runtime validation:
              loopback (127.0.0.0/8), RFC 1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
              and cloud provider metadata endpoints (169.254.169.254) are rejected before any socket connection is opened.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <Lock className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">AES-256-GCM Envelope Encryption</div>
                  <div className="text-slate-400 mt-1">
                    Environment tokens and custom request headers are encrypted at rest using per-item initialization vectors.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                <ExternalLink className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-white">DNS Rebinding Defense</div>
                  <div className="text-slate-400 mt-1">
                    Hostnames are pre-resolved via lookup before socket creation; redirect hops are individually re-inspected.
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
