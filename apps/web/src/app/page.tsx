'use client';

import React from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import {
  FolderKanban,
  Server,
  FileCode2,
  PlayCircle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function HomePage() {
  const cards = [
    {
      title: 'Projects & Workspaces',
      description: 'Manage tenant workspaces, multi-user role memberships, and ownership isolation.',
      href: '/projects',
      icon: FolderKanban,
      color: 'text-blue-400',
      badge: 'Multi-Tenant',
    },
    {
      title: 'Target Environments',
      description: 'Configure target hosts with strict anti-SSRF defenses, private IP blocks, and AES-256 encrypted credentials.',
      href: '/environments',
      icon: Server,
      color: 'text-emerald-400',
      badge: 'SSRF Protected',
    },
    {
      title: 'Sanitized Fixtures',
      description: 'Capture, inspect, and organize incoming HTTP requests with automatic token and authorization redaction.',
      href: '/fixtures',
      icon: FileCode2,
      color: 'text-amber-400',
      badge: 'Redacted',
    },
    {
      title: 'Replay Engine & Runs',
      description: 'Dispatch high-fidelity replay dispatches with bounded concurrency and microsecond timing analysis.',
      href: '/runs',
      icon: PlayCircle,
      color: 'text-indigo-400',
      badge: 'Deterministic',
    },
    {
      title: 'Regression Suites',
      description: 'Run automated regression test suites against baseline snapshots with customizable diff mask rules.',
      href: '/suites',
      icon: CheckCircle2,
      color: 'text-cyan-400',
      badge: 'Diff Baselines',
    },
    {
      title: 'Audit Logging',
      description: 'Track sensitive environment key access, project modifications, and execution events with tamper-evident audit trails.',
      href: '/audit-logs',
      icon: ShieldAlert,
      color: 'text-rose-400',
      badge: 'Compliance',
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Welcome Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900/40 p-8 shadow-xl">
            <div className="relative z-10 max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Phase 5.1 Application Foundation Active
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                ReplayLab API Workspace
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Deterministic replay orchestration, anti-SSRF egress protection, immutable baseline differential testing, and encrypted environment credentials.
              </p>
            </div>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900 hover:shadow-lg hover:shadow-slate-950/50"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-2.5 rounded-lg bg-slate-800/80 ${card.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                        {card.badge}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white group-hover:text-indigo-400 transition-colors">
                        {card.title}
                      </h2>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center text-xs font-medium text-indigo-400 gap-1.5 group-hover:translate-x-1 transition-transform">
                    <span>Enter module</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Quick Engine Status Footer */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Next.js App Router 15 + React 19 Client Session Active</span>
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              API Base: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
