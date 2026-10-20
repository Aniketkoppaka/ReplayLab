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
  Terminal,
} from 'lucide-react';

export default function HomePage() {
  const cards = [
    {
      title: 'Projects & Workspaces',
      description: 'Manage tenant workspaces, multi-user role memberships, and ownership isolation.',
      href: '/projects',
      icon: FolderKanban,
      badge: 'Multi-Tenant',
    },
    {
      title: 'Target Environments',
      description: 'Configure target hosts with strict anti-SSRF defenses, private IP blocks, and AES-256 encrypted credentials.',
      href: '/environments',
      icon: Server,
      badge: 'SSRF Protected',
    },
    {
      title: 'Sanitized Fixtures',
      description: 'Capture, inspect, and organize incoming HTTP requests with automatic token and authorization redaction.',
      href: '/fixtures',
      icon: FileCode2,
      badge: 'Redacted',
    },
    {
      title: 'Replay Engine & Runs',
      description: 'Dispatch high-fidelity replay dispatches with bounded concurrency and microsecond timing analysis.',
      href: '/runs',
      icon: PlayCircle,
      badge: 'Deterministic',
    },
    {
      title: 'Regression Suites',
      description: 'Run automated regression test suites against baseline snapshots with customizable diff mask rules.',
      href: '/suites',
      icon: CheckCircle2,
      badge: 'Diff Baselines',
    },
    {
      title: 'Audit Logs',
      description: 'Inspect immutable, cryptographically bounded audit trails for compliance and security events.',
      href: '/audit-logs',
      icon: ShieldAlert,
      badge: 'Append-Only',
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Workspace Hero */}
          <div className="p-5 rounded border border-[#222630] bg-[#13161c]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-mono font-medium text-emerald-400 uppercase tracking-wider">
                    Developer Workspace
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-[#f0f2f5]">
                  ReplayLab API Testing & Differential Engine
                </h1>
                <p className="text-xs text-[#9aa2b1] max-w-2xl leading-relaxed">
                  Capture sanitized HTTP fixtures, dispatch deterministic replays against configurable target environments with pinned IP socket dialing, and evaluate assertions against baseline snapshots.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/fixtures"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-[#0e1015] font-semibold transition"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Open Fixtures
                </Link>
                <Link
                  href="/environments"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#181b22] hover:bg-[#20242c] text-[#f0f2f5] border border-[#2d3340] transition"
                >
                  <Server className="h-3.5 w-3.5 text-[#9aa2b1]" />
                  Environments
                </Link>
              </div>
            </div>

            {/* Architecture Metrics / Invariants Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 mt-4 border-t border-[#222630] text-xs font-mono">
              <div className="p-2 rounded bg-[#0e1015] border border-[#222630]">
                <span className="text-[10px] text-[#6b7280] block">SSRF DEFENSE</span>
                <span className="text-[#f0f2f5] font-semibold">Pinned IP Socket</span>
              </div>
              <div className="p-2 rounded bg-[#0e1015] border border-[#222630]">
                <span className="text-[10px] text-[#6b7280] block">SECRET CIPHER</span>
                <span className="text-[#f0f2f5] font-semibold">AES-256-GCM</span>
              </div>
              <div className="p-2 rounded bg-[#0e1015] border border-[#222630]">
                <span className="text-[10px] text-[#6b7280] block">DIFF ENGINE</span>
                <span className="text-[#f0f2f5] font-semibold">Semantic Match</span>
              </div>
              <div className="p-2 rounded bg-[#0e1015] border border-[#222630]">
                <span className="text-[10px] text-[#6b7280] block">AUDIT RETENTION</span>
                <span className="text-[#f0f2f5] font-semibold">Immutable Logs</span>
              </div>
            </div>
          </div>

          {/* Quick-Action Navigation Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="p-3.5 rounded border border-[#222630] bg-[#13161c] hover:bg-[#181b22] hover:border-[#2d3340] transition flex flex-col justify-between group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-1.5 rounded bg-[#181b22] border border-[#222630] text-[#9aa2b1] group-hover:text-emerald-400 group-hover:border-[#2d3340] transition">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#6b7280] bg-[#0e1015] border border-[#222630]">
                        {card.badge}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold text-[#f0f2f5] group-hover:text-emerald-400 transition">
                        {card.title}
                      </h2>
                      <p className="mt-1 text-[11px] text-[#9aa2b1] leading-normal">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#222630]/60 flex items-center justify-between text-[11px] text-[#6b7280] group-hover:text-[#9aa2b1]">
                    <span>Manage</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Defensive Invariant Banner */}
          <div className="p-3.5 rounded border border-[#222630] bg-[#111318] flex items-center gap-3 text-xs text-[#9aa2b1]">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="flex-1 text-[11px] leading-relaxed">
              <span className="font-semibold text-[#f0f2f5]">Defensive Security Isolation: </span>
              All outbound HTTP requests resolve destination hosts via secure DNS lookup, validate destination IPs against non-routable CIDRs, and pin active TCP sockets directly to the verified address.
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
