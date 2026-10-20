'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { useProject } from '@/components/project/project-provider';
import {
  FolderKanban,
  Server,
  FileCode2,
  PlayCircle,
  CheckCircle2,
  ShieldAlert,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Terminal,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Environments', href: '/environments', icon: Server },
  { name: 'Fixtures', href: '/fixtures', icon: FileCode2 },
  { name: 'Replay Runs', href: '/runs', icon: PlayCircle },
  { name: 'Regression Suites', href: '/suites', icon: CheckCircle2 },
  { name: 'Audit Logs', href: '/audit-logs', icon: ShieldAlert },
];

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { projects, activeProject, setActiveProjectId } = useProject();

  return (
    <div className="flex min-h-screen bg-[#0e1015] text-[#f0f2f5]">
      {/* Sidebar - Compact Developer Workspace */}
      <aside className="w-56 border-r border-[#222630] bg-[#13161c] flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Brand header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#222630]">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#20242c] border border-[#2d3340] text-emerald-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <span className="font-semibold text-sm tracking-tight text-[#f0f2f5] block">
                ReplayLab
              </span>
              <span className="text-[10px] font-mono text-[#6b7280]">
                v0.1.0 • api replay
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#20242c] text-[#f0f2f5] font-semibold border border-[#2d3340]'
                      : 'text-[#9aa2b1] hover:text-[#f0f2f5] hover:bg-[#181b22]'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-[#6b7280]'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile / session footer */}
        <div className="p-2.5 border-t border-[#222630] bg-[#111318]">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="h-6 w-6 rounded bg-[#20242c] border border-[#2d3340] flex items-center justify-center shrink-0 text-[#9aa2b1]">
              <UserIcon className="h-3 w-3" />
            </div>
            <div className="truncate text-xs leading-none">
              <div className="font-medium text-[#f0f2f5] truncate text-[11px]">
                {user?.email || (user?.user_metadata?.name as string) || 'Authenticated'}
              </div>
              <div className="text-[#6b7280] text-[9px] font-mono truncate mt-0.5">
                {user?.id ? `id:${user.id.slice(0, 8)}` : 'session active'}
              </div>
            </div>
          </div>

          <button
            onClick={() => void signOut()}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-[#9aa2b1] hover:text-rose-400 hover:bg-rose-950/20 border border-[#222630] hover:border-rose-900/40 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-11 border-b border-[#222630] bg-[#13161c]/80 backdrop-blur px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Workspace / Project Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] text-[#6b7280] font-medium">Workspace:</span>
              {projects.length > 0 ? (
                <div className="relative inline-block">
                  <select
                    value={activeProject?.id || ''}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="appearance-none bg-[#181b22] hover:bg-[#20242c] text-[#f0f2f5] font-medium text-xs px-2.5 py-1 pr-6 rounded border border-[#2d3340] focus:outline-none focus:border-[#3e4657] cursor-pointer"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role || 'MEMBER'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3 w-3 text-[#6b7280] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                <Link
                  href="/projects"
                  className="text-xs text-emerald-400 hover:underline font-medium"
                >
                  Create your first project
                </Link>
              )}
            </div>

            <div className="hidden md:flex items-center text-xs text-[#6b7280]">
              <span className="mx-1 text-[#2d3340]">/</span>
              <span>
                API Target:{' '}
                <span className="font-mono text-[11px] text-[#9aa2b1]">
                  {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ENGINE READY
            </span>
          </div>
        </header>

        {/* Dynamic page content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
