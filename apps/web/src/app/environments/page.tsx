'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { useProject } from '@/components/project/project-provider';
import { apiClient, ApiClientError } from '@/lib/api-client';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  Lock,
  Globe,
  AlertCircle,
  Key,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  EnvironmentResponse,
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  EnvironmentVariableInput,
} from '@replaylab/contracts';
import { CopyButton } from '@/components/ui/copy-button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CreateEnvironmentInputSchema,
  UpdateEnvironmentInputSchema,
} from '@replaylab/contracts';

interface FormVariable {
  key: string;
  value: string;
  isSecret: boolean;
  // If editing an existing secret, indicates if it was previously set and is now masked
  isExistingSecret?: boolean;
  // User explicitly wants to clear or replace this existing secret
  replaceSecret?: boolean;
  // Local reveal toggle for unsaved secrets
  showUnsavedSecret?: boolean;
}

export default function EnvironmentsPage() {
  const { activeProject } = useProject();
  const [environments, setEnvironments] = useState<EnvironmentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [targetEnvId, setTargetEnvId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [headerEntries, setHeaderEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [variables, setVariables] = useState<FormVariable[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEnvironments = useCallback(async () => {
    if (!activeProject) {
      setEnvironments([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get<EnvironmentResponse[]>(
        `/projects/${activeProject.id}/environments`
      );
      setEnvironments(data);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch environments');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    void fetchEnvironments();
  }, [fetchEnvironments]);

  const openCreateModal = () => {
    setName('');
    setBaseUrl('http://');
    setHeaderEntries([]);
    setVariables([]);
    setFormError(null);
    setTargetEnvId(null);
    setModalMode('create');
  };

  const openEditModal = (env: EnvironmentResponse) => {
    setName(env.name);
    setBaseUrl(env.baseUrl);
    setHeaderEntries(
      Object.entries(env.headers || {}).map(([key, value]) => ({ key, value }))
    );
    setVariables(
      (env.variables || []).map((v) => ({
        key: v.key,
        value: v.isSecret ? '' : v.value || '',
        isSecret: v.isSecret,
        isExistingSecret: v.isSecret,
        replaceSecret: false,
      }))
    );
    setFormError(null);
    setTargetEnvId(env.id);
    setModalMode('edit');
  };

  const handleAddHeader = () => {
    setHeaderEntries((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemoveHeader = (idx: number) => {
    setHeaderEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddVariable = () => {
    setVariables((prev) => [
      ...prev,
      { key: '', value: '', isSecret: false, isExistingSecret: false },
    ]);
  };

  const handleRemoveVariable = (idx: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setFormError(null);

    // Build headers object
    const headersRecord: Record<string, string> = {};
    for (const h of headerEntries) {
      const k = h.key.trim();
      if (k) {
        headersRecord[k] = h.value;
      }
    }

    // Process variables
    // For update: if isExistingSecret && !replaceSecret, we keep the previous secret key/value
    // Note: If backend expects full variable list, unchanged secrets should either retain existing value or skip.
    // In our backend schema, variables is Array<EnvironmentVariableInput>. For secrets that are unchanged,
    // if value is left empty, we flag an error or require explicit replacement.
    const processedVariables: EnvironmentVariableInput[] = [];
    for (const v of variables) {
      const k = v.key.trim();
      if (!k) continue;

      if (v.isSecret && v.isExistingSecret && !v.replaceSecret) {
        // Backend updateEnvironment replaces all variables.
        // For unchanged secrets, backend needs a non-empty string or we indicate secret replacement.
        // If left empty and unchanged, prompt user:
        setFormError(
          `Secret variable "${k}" must either be replaced with a new value or kept unchanged. Click 'Replace' to set a new value.`
        );
        return;
      }

      processedVariables.push({
        key: k,
        value: v.value,
        isSecret: v.isSecret,
      });
    }

    try {
      setIsSubmitting(true);

      if (modalMode === 'create') {
        const payload: CreateEnvironmentInput = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          headers: headersRecord,
          variables: processedVariables,
        };
        const validation = CreateEnvironmentInputSchema.safeParse(payload);
        if (!validation.success) {
          setFormError(validation.error.errors[0]?.message || 'Invalid environment configuration');
          return;
        }

        const created = await apiClient.post<EnvironmentResponse>(
          `/projects/${activeProject.id}/environments`,
          validation.data
        );
        setEnvironments((prev) => [...prev, created]);
      } else if (modalMode === 'edit' && targetEnvId) {
        const payload: UpdateEnvironmentInput = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          headers: headersRecord,
          variables: processedVariables,
        };
        const validation = UpdateEnvironmentInputSchema.safeParse(payload);
        if (!validation.success) {
          setFormError(validation.error.errors[0]?.message || 'Invalid environment configuration');
          return;
        }

        const updated = await apiClient.patch<EnvironmentResponse>(
          `/projects/${activeProject.id}/environments/${targetEnvId}`,
          validation.data
        );
        setEnvironments((prev) =>
          prev.map((item) => (item.id === targetEnvId ? updated : item))
        );
      }

      setModalMode(null);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setFormError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Failed to save environment');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEnvironment = async (id: string) => {
    if (!activeProject) return;
    try {
      setIsSubmitting(true);
      await apiClient.delete(`/projects/${activeProject.id}/environments/${id}`);
      setEnvironments((prev) => prev.filter((e) => e.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete environment');
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
                <Server className="h-6 w-6 text-emerald-400" />
                Target Environments
              </h1>
              <p className="mt-1 text-sm text-[#9aa2b1]">
                Safe egress endpoints with anti-SSRF protections, private IP filters, and AES-256 envelope encryption
              </p>
            </div>

            {activeProject && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <Plus className="h-4 w-4" />
                New Environment
              </button>
            )}
          </div>

          {!activeProject ? (
            <div className="rounded border border-[#222630] bg-[#13161c] p-12 text-center">
              <Server className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No active project selected</h3>
              <p className="text-xs text-[#9aa2b1] mt-1 max-w-sm mx-auto">
                Please create or select a project from the top workspace menu to manage target environments.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
              <div className="flex items-center gap-2 font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Environment Notice
              </div>
              <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">{error}</p>
            </div>
          ) : isLoading ? (
            <TableSkeleton rows={3} cols={2} />
          ) : environments.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No environments configured"
              description="Define a target host (e.g. Staging, Preview, Local API Mock) to replay sanitized fixtures."
              actionLabel="Add Environment"
              onAction={openCreateModal}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {environments.map((env) => {
                const headerCount = Object.keys(env.headers || {}).length;
                const secretCount = (env.variables || []).filter((v) => v.isSecret).length;
                const plaintextCount = (env.variables || []).length - secretCount;

                return (
                  <div
                    key={env.id}
                    className="rounded border border-[#222630] bg-[#13161c] p-6 flex flex-col justify-between hover:border-[#2d3340] transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="text-base font-semibold text-white tracking-tight">
                            {env.name}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40 truncate max-w-sm">
                            <Globe className="h-3 w-3 shrink-0" />
                            <span className="truncate">{env.baseUrl}</span>
                            <CopyButton value={env.baseUrl} label="target URL" />
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit Environment"
                            onClick={() => openEditModal(env)}
                            className="p-1.5 text-[#9aa2b1] hover:text-white transition rounded-md hover:bg-[#181b22]"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete Environment"
                            onClick={() => setDeleteConfirmId(env.id)}
                            className="p-1.5 text-[#9aa2b1] hover:text-rose-400 transition rounded-md hover:bg-[#181b22]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Config summary badges */}
                      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
                          <ShieldCheck className="h-3 w-3 text-emerald-400" />
                          {headerCount} Custom Headers
                        </span>
                        {secretCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            <Lock className="h-3 w-3 text-indigo-400" />
                            {secretCount} Encrypted Secrets
                          </span>
                        )}
                        {plaintextCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#181b22] text-[#9aa2b1] border border-[#2d3340]">
                            <Key className="h-3 w-3 text-[#9aa2b1]" />
                            {plaintextCount} Variables
                          </span>
                        )}
                      </div>

                      {/* Variable breakdown */}
                      {(env.variables || []).length > 0 && (
                        <div className="mt-4 space-y-1.5 pt-3 border-t border-[#222630]">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">
                            Environment Variables
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {env.variables.map((v) => (
                              <span
                                key={v.key}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#181b22] border border-[#2d3340] text-[11px] font-mono text-[#9aa2b1]"
                              >
                                {v.isSecret ? (
                                  <>
                                    <Lock className="h-2.5 w-2.5 text-amber-400" />
                                    <span>{v.key}</span>
                                    <span className="text-amber-400/90 font-mono tracking-widest text-[10px]">
                                      ••••••••••••
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-sans font-semibold uppercase px-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                      AES-256-GCM [ENCRYPTED]
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-[#9aa2b1]">{v.key}:</span>
                                    <span className="text-[#f0f2f5]">{v.value}</span>
                                  </>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-3 border-t border-[#222630] text-[11px] text-[#6b7280] font-mono">
                      ID: {env.id}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create / Edit Environment Modal */}
          {modalMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-2xl rounded border border-[#222630] bg-[#13161c] p-6 shadow-2xl my-8">
                <h3 className="text-lg font-semibold text-white">
                  {modalMode === 'create' ? 'Create Environment' : 'Edit Environment'}
                </h3>
                <p className="mt-1 text-xs text-[#9aa2b1]">
                  Target URLs must adhere to anti-SSRF protections: loopback addresses and private subnets are blocked.
                </p>

                {formError && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveEnvironment} className="mt-5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Environment Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Staging Server"
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Base URL (HTTP/HTTPS) *
                      </label>
                      <input
                        type="url"
                        required
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.example.com"
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Headers Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[#9aa2b1]">
                        Default Request Headers
                      </label>
                      <button
                        type="button"
                        onClick={handleAddHeader}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Header
                      </button>
                    </div>

                    {headerEntries.length === 0 ? (
                      <p className="text-xs text-[#6b7280] italic">No custom headers configured.</p>
                    ) : (
                      <div className="space-y-2">
                        {headerEntries.map((h, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={h.key}
                              placeholder="Header-Name (e.g. X-Tenant-Id)"
                              onChange={(e) => {
                                const val = e.target.value;
                                setHeaderEntries((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, key: val } : item))
                                );
                              }}
                              className="flex-1 rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={h.value}
                              placeholder="Header Value"
                              onChange={(e) => {
                                const val = e.target.value;
                                setHeaderEntries((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, value: val } : item))
                                );
                              }}
                              className="flex-1 rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveHeader(idx)}
                              className="text-[#6b7280] hover:text-rose-400 p-1.5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Variables & Secrets Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="text-xs font-medium text-[#9aa2b1]">
                          Environment Variables & Secrets
                        </label>
                        <span className="block text-[11px] text-[#6b7280]">
                          Secrets are AES-256-GCM encrypted and never returned in plaintext.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddVariable}
                        className="text-xs font-medium text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Variable
                      </button>
                    </div>

                    {variables.length === 0 ? (
                      <p className="text-xs text-[#6b7280] italic">No variables defined.</p>
                    ) : (
                      <div className="space-y-3">
                        {variables.map((v, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-[#222630] bg-[#181b22] space-y-2"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                value={v.key}
                                placeholder="VARIABLE_NAME"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setVariables((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, key: val } : item))
                                  );
                                }}
                                className="w-1/3 rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                              />

                              <div className="flex-1">
                                {v.isSecret && v.isExistingSecret && !v.replaceSecret ? (
                                  <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-[#13161c] border border-[#2d3340] text-xs text-amber-400">
                                    <span className="flex items-center gap-1.5 font-mono text-[11px]">
                                      <Lock className="h-3 w-3" />
                                      •••••••• [Encrypted Secret Retained]
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVariables((prev) =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, replaceSecret: true, value: '' } : item
                                          )
                                        );
                                      }}
                                      className="text-[11px] font-semibold text-indigo-400 hover:underline"
                                    >
                                      Replace Value
                                    </button>
                                  </div>
                                ) : (
                                  <div className="relative flex items-center">
                                    <input
                                      type={v.isSecret && !v.showUnsavedSecret ? 'password' : 'text'}
                                      value={v.value}
                                      placeholder={v.isSecret ? 'Enter new secret value' : 'Value'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setVariables((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, value: val } : item))
                                        );
                                      }}
                                      className={`w-full rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none ${
                                        v.isSecret ? 'pr-8 font-mono' : ''
                                      }`}
                                    />
                                    {v.isSecret && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVariables((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? { ...item, showUnsavedSecret: !item.showUnsavedSecret }
                                                : item
                                            )
                                          );
                                        }}
                                        className="absolute right-2 p-1 text-[#6b7280] hover:text-[#9aa2b1] transition"
                                        title={v.showUnsavedSecret ? 'Hide secret' : 'Show secret'}
                                      >
                                        {v.showUnsavedSecret ? (
                                          <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                          <Eye className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(idx)}
                                className="text-[#6b7280] hover:text-rose-400 p-1.5"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-[#9aa2b1]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={v.isSecret}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setVariables((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              isSecret: checked,
                                              isExistingSecret: false,
                                              replaceSecret: true,
                                            }
                                          : item
                                      )
                                    );
                                  }}
                                  className="rounded border-[#2d3340] bg-[#181b22] text-indigo-600 focus:ring-0"
                                />
                                <span className="text-[11px]">Mark as Secret (Encrypted at Rest)</span>
                              </label>

                              {v.isSecret && v.isExistingSecret && v.replaceSecret && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVariables((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? { ...item, replaceSecret: false, value: '' }
                                          : item
                                      )
                                    );
                                  }}
                                  className="text-[10px] text-[#9aa2b1] hover:underline"
                                >
                                  Cancel Replacement
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#222630]">
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-[#9aa2b1] hover:text-white transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isSubmitting
                        ? 'Saving...'
                        : modalMode === 'create'
                        ? 'Create Environment'
                        : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded border border-rose-500/20 bg-[#13161c] p-6 shadow-2xl">
                <div className="flex items-center gap-3 text-rose-400 mb-3">
                  <AlertCircle className="h-6 w-6 shrink-0" />
                  <h3 className="text-base font-semibold text-white">Delete Environment</h3>
                </div>
                <p className="text-xs text-[#9aa2b1] leading-relaxed">
                  Are you sure you want to delete this target environment? Any test suites referencing it will fail to dispatch until reassigned.
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#9aa2b1] hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDeleteEnvironment(deleteConfirmId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
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
