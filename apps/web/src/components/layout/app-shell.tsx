'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import {
  FolderKanban,
  Server,
  FileCode2,
  PlayCircle,
  CheckCircle2,
  ShieldAlert,
  LogOut,
  User as UserIcon,
  Activity,
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

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo / Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800/80">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-white tracking-tight text-base block leading-tight">
                ReplayLab
              </span>
              <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">
                API Platform
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 font-semibold border border-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile / session footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="truncate text-xs">
                <div className="font-medium text-slate-200 truncate">
                  {user?.email || (user?.user_metadata?.name as string) || 'Authenticated User'}
                </div>
                <div className="text-slate-500 text-[10px] truncate">
                  {user?.id ? `ID: ${user.id.slice(0, 8)}...` : 'Active Session'}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => void signOut()}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-800 bg-slate-900/20 backdrop-blur px-8 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Environment Target:{' '}
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Engine Online
            </span>
          </div>
        </header>

        {/* Dynamic page content */}
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
