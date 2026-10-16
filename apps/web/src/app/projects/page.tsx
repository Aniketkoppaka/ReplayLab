'use client';

import React, { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { FolderKanban, Plus, Users, Shield, Clock } from 'lucide-react';
import type { ProjectResponse } from '@replaylab/contracts';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProjects() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await apiClient.get<ProjectResponse[]>('/projects');
        setProjects(data);
      } catch (err: unknown) {
        if (err instanceof ApiClientError) {
          setError(`[${err.code}] ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to fetch projects');
        }
      } finally {
        setIsLoading(false);
      }
    }

    void loadProjects();
  }, []);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <FolderKanban className="h-6 w-6 text-blue-400" />
                Projects
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Tenant isolation boundaries, environment keys, and RBAC memberships
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Shield className="h-4 w-4" />
                API Notice
              </div>
              <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">
                {error}
              </p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <FolderKanban className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No projects found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Create a project to start organizing target environments, fixtures, and regression test suites.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-slate-700 transition"
                >
                  <h3 className="text-base font-semibold text-white">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 font-mono">ID: {p.id}</p>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      Owner
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
