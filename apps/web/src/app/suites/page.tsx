'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { useProject } from '@/components/project/project-provider';
import { apiClient, ApiClientError } from '@/lib/api-client';
import {
  CheckCircle2,
  Plus,
  Play,
  History,
  Trash2,
  Edit2,
  Layers,
  AlertCircle,
  Sliders,
  Clock,
} from 'lucide-react';
import type {
  SuiteResponse,
  EnvironmentResponse,
  FixtureResponse,
} from '@replaylab/contracts';
import { SuiteEditorModal } from '@/components/suite/suite-editor-modal';
import { SuiteRunModal } from '@/components/suite/suite-run-modal';
import { SuiteHistoryDrawer } from '@/components/suite/suite-history-drawer';

export default function SuitesPage() {
  const { activeProject } = useProject();
  const [suites, setSuites] = useState<SuiteResponse[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentResponse[]>([]);
  const [fixtures, setFixtures] = useState<FixtureResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSuite, setEditingSuite] = useState<SuiteResponse | null>(null);
  const [runningSuite, setRunningSuite] = useState<SuiteResponse | null>(null);
  const [historySuite, setHistorySuite] = useState<SuiteResponse | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchSuites = useCallback(async () => {
    if (!activeProject) {
      setSuites([]);
      setEnvironments([]);
      setFixtures([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [suitesData, envsData, fixturesData] = await Promise.all([
        apiClient.get<SuiteResponse[]>(`/projects/${activeProject.id}/suites`),
        apiClient.get<EnvironmentResponse[]>(`/projects/${activeProject.id}/environments`),
        apiClient.get<FixtureResponse[]>(`/projects/${activeProject.id}/fixtures`),
      ]);
      setSuites(suitesData);
      setEnvironments(envsData);
      setFixtures(fixturesData);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch regression suites');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    void fetchSuites();
  }, [fetchSuites]);

  const handleDeleteSuite = async (suiteId: string) => {
    if (!activeProject) return;
    try {
      await apiClient.delete(`/projects/${activeProject.id}/suites/${suiteId}`);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete suite');
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
                <CheckCircle2 className="h-6 w-6 text-cyan-400" />
                Regression Suites
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Automated regression testing workflows with differential response masks and pass/fail thresholds
              </p>
            </div>

            {activeProject && (
              <button
                type="button"
                onClick={() => {
                  setEditingSuite(null);
                  setIsEditorOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <Plus className="h-4 w-4" />
                New Regression Suite
              </button>
            )}
          </div>

          {!activeProject ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No active project selected</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Please select a project from the top workspace menu to manage regression test suites.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
              <div className="flex items-center gap-2 font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Regression Suite Notice
              </div>
              <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">{error}</p>
            </div>
          ) : suites.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <Layers className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No regression suites found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-5">
                Group multiple fixtures together into an ordered regression suite with dynamic mask rules to test full user journeys.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingSuite(null);
                  setIsEditorOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-cyan-500 transition"
              >
                <Plus className="h-4 w-4" />
                Create First Suite
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {suites.map((suite) => {
                const totalMasks = suite.items.reduce(
                  (acc, item) => acc + (item.maskRules?.length || 0),
                  0
                );

                return (
                  <div
                    key={suite.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="text-base font-semibold text-white tracking-tight">
                            {suite.name}
                          </h3>
                          {suite.description && (
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {suite.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit Suite"
                            onClick={() => {
                              setEditingSuite(suite);
                              setIsEditorOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white transition rounded-md hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete Suite"
                            onClick={() => setDeleteConfirmId(suite.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded-md hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Suite Config Badges */}
                      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          <Layers className="h-3 w-3 text-cyan-400" />
                          {suite.items.length} Fixtures
                        </span>
                        {totalMasks > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            <Sliders className="h-3 w-3 text-cyan-400" />
                            {totalMasks} Mask Rules
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          <Clock className="h-3 w-3 text-slate-500" />
                          {new Date(suite.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setHistorySuite(suite)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition"
                      >
                        <History className="h-3.5 w-3.5 text-slate-500" />
                        <span>Execution History</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRunningSuite(suite)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 shadow shadow-cyan-600/20 transition"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Run Suite</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Suite Editor Modal */}
          {isEditorOpen && activeProject && (
            <SuiteEditorModal
              projectId={activeProject.id}
              suiteToEdit={editingSuite}
              availableFixtures={fixtures}
              onClose={() => {
                setIsEditorOpen(false);
                setEditingSuite(null);
              }}
              onSaved={(saved) => {
                setSuites((prev) => {
                  const exists = prev.some((s) => s.id === saved.id);
                  if (exists) {
                    return prev.map((s) => (s.id === saved.id ? saved : s));
                  }
                  return [saved, ...prev];
                });
              }}
            />
          )}

          {/* Suite Run Modal */}
          {runningSuite && activeProject && (
            <SuiteRunModal
              projectId={activeProject.id}
              suite={runningSuite}
              environments={environments}
              fixtures={fixtures}
              onClose={() => setRunningSuite(null)}
            />
          )}

          {/* Suite History Drawer */}
          {historySuite && activeProject && (
            <SuiteHistoryDrawer
              projectId={activeProject.id}
              suiteId={historySuite.id}
              suiteName={historySuite.name}
              onClose={() => setHistorySuite(null)}
            />
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-rose-500/20 bg-slate-900 p-6 shadow-2xl">
                <div className="flex items-center gap-3 text-rose-400 mb-3">
                  <AlertCircle className="h-6 w-6 shrink-0" />
                  <h3 className="text-base font-semibold text-white">Delete Suite</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to delete this regression suite? The underlying fixtures and historical runs will remain intact.
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
                    onClick={() => handleDeleteSuite(deleteConfirmId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
