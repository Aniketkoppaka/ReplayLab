'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { Key, LogIn, AlertCircle, Terminal } from 'lucide-react';
import { getPublicEnv } from '@/lib/env';

export default function LoginPage() {
  const router = useRouter();
  const { signInWithPassword, setDevToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devTokenInput, setDevTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'supabase' | 'dev'>('supabase');

  const { enableDevAuth } = getPublicEnv();

  const handleSupabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await signInWithPassword(email, password);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devTokenInput.trim()) {
      setError('Please provide a valid bearer token or JWT');
      return;
    }
    setDevToken(devTokenInput.trim());
    router.push('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e1015] px-4 py-12 text-[#f0f2f5]">
      <div className="w-full max-w-sm rounded border border-[#2d3340] bg-[#13161c] p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-[#20242c] border border-[#2d3340] text-emerald-400 mb-3">
            <Terminal className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[#f0f2f5]">Sign in to ReplayLab</h1>
          <p className="mt-1 text-xs text-[#6b7280]">
            API fixture playback, deterministic regression, and diff engine
          </p>
        </div>

        {/* Tab switch between Supabase and Dev Token */}
        {enableDevAuth && (
          <div className="flex rounded bg-[#181b22] p-0.5 border border-[#222630]">
            <button
              type="button"
              onClick={() => {
                setMode('supabase');
                setError(null);
              }}
              className={`flex-1 rounded py-1 text-xs font-medium transition ${
                mode === 'supabase'
                  ? 'bg-[#20242c] text-[#f0f2f5] font-semibold border border-[#2d3340]'
                  : 'text-[#6b7280] hover:text-[#f0f2f5]'
              }`}
            >
              Supabase Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('dev');
                setError(null);
              }}
              className={`flex-1 rounded py-1 text-xs font-medium transition ${
                mode === 'dev'
                  ? 'bg-[#20242c] text-[#f0f2f5] font-semibold border border-[#2d3340]'
                  : 'text-[#6b7280] hover:text-[#f0f2f5]'
              }`}
            >
              Developer Token
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded border border-rose-900/40 bg-rose-950/20 p-2.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <div className="text-[11px] leading-relaxed">{error}</div>
          </div>
        )}

        {mode === 'supabase' ? (
          <form onSubmit={handleSupabaseSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#9aa2b1] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-[#f0f2f5] placeholder-[#6b7280] focus:border-[#3e4657] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9aa2b1] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-[#f0f2f5] placeholder-[#6b7280] focus:border-[#3e4657] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-600 px-3 py-2 text-xs font-semibold text-[#0e1015] transition focus:outline-none disabled:opacity-50"
            >
              <LogIn className="h-3.5 w-3.5" />
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleDevTokenSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#9aa2b1] mb-1">
                Bearer Token / Local JWT
              </label>
              <textarea
                rows={3}
                required
                value={devTokenInput}
                onChange={(e) => setDevTokenInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full font-mono text-xs rounded border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-[#f0f2f5] placeholder-[#6b7280] focus:border-[#3e4657] focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-[#6b7280] leading-normal font-mono">
                For offline dev, test suites, or pre-signed Supabase tokens.
              </p>
            </div>

            <button
              type="submit"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-600 px-3 py-2 text-xs font-semibold text-[#0e1015] transition focus:outline-none"
            >
              <Key className="h-3.5 w-3.5" />
              Inject Session Token
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
