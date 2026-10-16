'use client';

import React, { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { useProject } from '@/components/project/project-provider';
import {
  FolderKanban,
  Plus,
  Shield,
  Clock,
  Trash2,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { CreateProjectInputSchema } from '@replaylab/contracts';

export default function ProjectsPage() {
  const {
    projects,
    activeProject,
    isLoading,
    error,
    setActiveProjectId,
    createProject,
    deleteProject,
  } = useProject();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = CreateProjectInputSchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
    });

    if (!validation.success) {
      setFormError(validation.error.errors[0]?.message || 'Invalid project input');
      return;
    }

    try {
      setIsSubmitting(true);
      await createProject(validation.data);
      setName('');
      setDescription('');
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsSubmitting(true);
      await deleteProject(id);
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <FolderKanban className="h-6 w-6 text-blue-400" />
                Projects & Workspaces
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Tenant isolation boundaries, environment keys, and RBAC memberships
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(true);
                setFormError(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>

          {/* Project Creation Modal */}
          {isCreateOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-white">Create New Project</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Projects represent isolated workspaces with dedicated environments and test fixtures.
                </p>

                {formError && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleCreate} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Payments Gateway"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Core checkout API regression tests"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsCreateOpen(false)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Creating...' : 'Create Project'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-rose-500/20 bg-slate-900 p-6 shadow-2xl">
                <div className="flex items-center gap-3 text-rose-400 mb-3">
                  <AlertCircle className="h-6 w-6 shrink-0" />
                  <h3 className="text-base font-semibold text-white">Delete Project</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to delete this project? All associated environments, fixtures, baselines, and test runs will be permanently removed.
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDelete(deleteConfirmId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center p-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Shield className="h-4 w-4" />
                Workspace Notice
              </div>
              <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">{error}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <FolderKanban className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No projects found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-5">
                Create your first project to start organizing target environments, fixtures, and regression test suites.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition"
              >
                <Plus className="h-4 w-4" />
                Create Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p) => {
                const isSelected = p.id === activeProject?.id;
                const role = p.role || 'MEMBER';
                const isOwner = role === 'OWNER';

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-6 flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/30'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            role === 'OWNER'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : role === 'EDITOR'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {role}
                        </span>

                        {isSelected && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            Active
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-white tracking-tight">
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] font-mono text-slate-500 truncate">
                        ID: {p.id}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isSelected && (
                          <button
                            type="button"
                            onClick={() => setActiveProjectId(p.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                          >
                            <span>Select</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}

                        {isOwner && (
                          <button
                            type="button"
                            title="Delete Project"
                            onClick={() => setDeleteConfirmId(p.id)}
                            className="text-slate-500 hover:text-rose-400 transition p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
