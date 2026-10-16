'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { Activity, Key, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { signInWithPassword, setDevToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devTokenInput, setDevTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'supabase' | 'dev'>('supabase');

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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Activity className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Sign in to ReplayLab</h1>
          <p className="mt-1 text-sm text-slate-400">
            API fixture playback, deterministic regression, and diff engine
          </p>
        </div>

        {/* Tab switch between Supabase and Dev Token (Dev Token only allowed in non-production) */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mb-6 flex rounded-lg bg-slate-800/80 p-1 border border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                setMode('supabase');
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                mode === 'supabase'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
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
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                mode === 'dev'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Developer Token
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div className="text-xs leading-relaxed">{error}</div>
          </div>
        )}

        {mode === 'supabase' ? (
          <form onSubmit={handleSupabaseSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleDevTokenSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Bearer Token / Local JWT
              </label>
              <textarea
                rows={3}
                required
                value={devTokenInput}
                onChange={(e) => setDevTokenInput(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full font-mono text-xs rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1.5 text-[11px] text-slate-500 leading-normal">
                Use for offline dev, testing environments, or pre-generated Supabase service JWTs.
              </p>
            </div>

            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <Key className="h-4 w-4" />
              Inject Session Token
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
