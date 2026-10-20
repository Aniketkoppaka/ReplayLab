'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { useProject } from '@/components/project/project-provider';
import { apiClient, ApiClientError } from '@/lib/api-client';
import {
  FileCode2,
  Plus,
  Trash2,
  Edit2,
  History,
  AlertCircle,
  CheckCircle2,
  Layers,
  Sparkles,
  ShieldAlert,
  Play,
  ChevronDown,
  ChevronRight,
  Code,
} from 'lucide-react';
import type {
  FixtureResponse,
  EnvironmentResponse,
  CreateFixtureInput,
  UpdateFixtureInput,
  HttpMethod,
  BodyType,
} from '@replaylab/contracts';
import { ReplayTriggerModal } from '@/components/replay/replay-trigger-modal';
import { CopyButton } from '@/components/ui/copy-button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CreateFixtureInputSchema,
  UpdateFixtureInputSchema,
  UpdateBaselineInputSchema,
} from '@replaylab/contracts';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_TYPES: BodyType[] = ['NONE', 'JSON', 'TEXT'];

export default function FixturesPage() {
  const { activeProject } = useProject();
  const [fixtures, setFixtures] = useState<FixtureResponse[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [targetFixtureId, setTargetFixtureId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [baselineModalFixture, setBaselineModalFixture] = useState<FixtureResponse | null>(null);
  const [replayModalFixture, setReplayModalFixture] = useState<FixtureResponse | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('/api/v1/endpoint');
  const [headerEntries, setHeaderEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [bodyType, setBodyType] = useState<BodyType>('NONE');
  const [bodyString, setBodyString] = useState('');
  const [tagsString, setTagsString] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Baseline Form states
  const [baselineStatusCode, setBaselineStatusCode] = useState(200);
  const [baselineBodyType, setBaselineBodyType] = useState<BodyType>('JSON');
  const [baselineBodyString, setBaselineBodyString] = useState('');
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // Expanded payloads per fixture ID
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Set<string>>(new Set());

  const togglePayloadExpand = (id: string) => {
    setExpandedPayloadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const fetchFixtures = useCallback(async () => {
    if (!activeProject) {
      setFixtures([]);
      setEnvironments([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [fixturesData, envsData] = await Promise.all([
        apiClient.get<FixtureResponse[]>(`/projects/${activeProject.id}/fixtures`),
        apiClient.get<EnvironmentResponse[]>(`/projects/${activeProject.id}/environments`),
      ]);
      setFixtures(fixturesData);
      setEnvironments(envsData);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch fixtures');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    void fetchFixtures();
  }, [fetchFixtures]);

  const openCreateModal = () => {
    setName('');
    setDescription('');
    setMethod('GET');
    setPath('/api/v1/endpoint');
    setHeaderEntries([]);
    setBodyType('NONE');
    setBodyString('');
    setTagsString('');
    setFormError(null);
    setTargetFixtureId(null);
    setModalMode('create');
  };

  const openEditModal = (fixture: FixtureResponse) => {
    setName(fixture.name);
    setDescription(fixture.description || '');
    setMethod(fixture.request.method);
    setPath(fixture.request.path);
    setHeaderEntries(
      Object.entries(fixture.request.headers || {}).map(([key, value]) => ({ key, value }))
    );
    setBodyType(fixture.request.bodyType);
    setBodyString(
      fixture.request.body !== undefined
        ? typeof fixture.request.body === 'string'
          ? fixture.request.body
          : JSON.stringify(fixture.request.body, null, 2)
        : ''
    );
    setTagsString((fixture.tags || []).join(', '));
    setFormError(null);
    setTargetFixtureId(fixture.id);
    setModalMode('edit');
  };

  const openBaselineModal = (fixture: FixtureResponse) => {
    setBaselineModalFixture(fixture);
    setBaselineStatusCode(fixture.baseline?.statusCode || 200);
    setBaselineBodyType(fixture.baseline?.bodyType || 'JSON');
    setBaselineBodyString(
      fixture.baseline?.body !== undefined
        ? typeof fixture.baseline.body === 'string'
          ? fixture.baseline.body
          : JSON.stringify(fixture.baseline.body, null, 2)
        : '{\n  "status": "success"\n}'
    );
    setBaselineError(null);
  };

  const handleAddHeader = () => {
    setHeaderEntries((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemoveHeader = (idx: number) => {
    setHeaderEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setFormError(null);

    // Build headers map
    const headersRecord: Record<string, string> = {};
    for (const h of headerEntries) {
      const k = h.key.trim();
      if (k) headersRecord[k] = h.value;
    }

    // Process body
    let parsedBody: unknown = undefined;
    if (bodyType === 'JSON' && bodyString.trim()) {
      try {
        parsedBody = JSON.parse(bodyString);
      } catch {
        setFormError('Invalid JSON body payload. Please verify syntax.');
        return;
      }
    } else if (bodyType === 'TEXT') {
      parsedBody = bodyString;
    }

    const tags = tagsString
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);

      if (modalMode === 'create') {
        const payload: CreateFixtureInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          tags,
          request: {
            method,
            path: path.trim(),
            queryParams: {},
            headers: headersRecord,
            bodyType,
            body: parsedBody,
          },
        };

        const validation = CreateFixtureInputSchema.safeParse(payload);
        if (!validation.success) {
          setFormError(validation.error.errors[0]?.message || 'Invalid fixture payload');
          return;
        }

        const created = await apiClient.post<FixtureResponse>(
          `/projects/${activeProject.id}/fixtures`,
          validation.data
        );
        setFixtures((prev) => [created, ...prev]);
      } else if (modalMode === 'edit' && targetFixtureId) {
        const payload: UpdateFixtureInput = {
          name: name.trim(),
          description: description.trim() || null,
          tags,
          request: {
            method,
            path: path.trim(),
            queryParams: {},
            headers: headersRecord,
            bodyType,
            body: parsedBody,
          },
        };

        const validation = UpdateFixtureInputSchema.safeParse(payload);
        if (!validation.success) {
          setFormError(validation.error.errors[0]?.message || 'Invalid fixture payload');
          return;
        }

        const updated = await apiClient.patch<FixtureResponse>(
          `/projects/${activeProject.id}/fixtures/${targetFixtureId}`,
          validation.data
        );
        setFixtures((prev) =>
          prev.map((item) => (item.id === targetFixtureId ? updated : item))
        );
      }

      setModalMode(null);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setFormError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('Failed to save fixture');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateBaseline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !baselineModalFixture) return;
    setBaselineError(null);

    let parsedBody: unknown = undefined;
    if (baselineBodyType === 'JSON' && baselineBodyString.trim()) {
      try {
        parsedBody = JSON.parse(baselineBodyString);
      } catch {
        setBaselineError('Invalid JSON baseline body. Please verify syntax.');
        return;
      }
    } else if (baselineBodyType === 'TEXT') {
      parsedBody = baselineBodyString;
    }

    const payload = {
      baseline: {
        statusCode: Number(baselineStatusCode),
        headers: {},
        bodyType: baselineBodyType,
        body: parsedBody,
      },
    };

    const validation = UpdateBaselineInputSchema.safeParse(payload);
    if (!validation.success) {
      setBaselineError(validation.error.errors[0]?.message || 'Invalid baseline configuration');
      return;
    }

    try {
      setIsSubmitting(true);
      const updated = await apiClient.post<FixtureResponse>(
        `/projects/${activeProject.id}/fixtures/${baselineModalFixture.id}/baseline`,
        validation.data
      );
      setFixtures((prev) =>
        prev.map((f) => (f.id === baselineModalFixture.id ? updated : f))
      );
      setBaselineModalFixture(null);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setBaselineError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setBaselineError(err.message);
      } else {
        setBaselineError('Failed to update baseline snapshot');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFixture = async (id: string) => {
    if (!activeProject) return;
    try {
      setIsSubmitting(true);
      await apiClient.delete(`/projects/${activeProject.id}/fixtures/${id}`);
      setFixtures((prev) => prev.filter((f) => f.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete fixture');
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
                <FileCode2 className="h-6 w-6 text-amber-400" />
                Sanitized Fixtures
              </h1>
              <p className="mt-1 text-sm text-[#9aa2b1]">
                Deterministic HTTP traffic snapshots with secret redaction and immutable baselines
              </p>
            </div>

            {activeProject && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <Plus className="h-4 w-4" />
                New Fixture
              </button>
            )}
          </div>

          {!activeProject ? (
            <EmptyState
              icon={FileCode2}
              title="No active project selected"
              description="Please create or select a project from the top workspace menu to manage fixtures."
            />
          ) : isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : error ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-6 text-amber-300">
              <div className="flex items-center gap-2 font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Fixture Notice
              </div>
              <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">{error}</p>
            </div>
          ) : fixtures.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              title="No fixtures found"
              description="Create a fixture with HTTP method, relative path, and expected baseline to start regression testing."
              actionLabel="Create Fixture"
              onAction={openCreateModal}
            />
          ) : (
            <div className="space-y-4">
              {fixtures.map((fixture) => {
                const methodKey = fixture.request.method.toLowerCase();
                const isExpanded = expandedPayloadIds.has(fixture.id);
                const hasBody = Boolean(fixture.request.body);

                return (
                  <div
                    key={fixture.id}
                    className="rounded border border-[#222630] bg-[#13161c]/50 p-5 flex flex-col justify-between gap-4 hover:border-[#2d3340] transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2 max-w-2xl">
                        <div className="flex items-center gap-3">
                          <span className={`method-badge method-${methodKey}`}>
                            {fixture.request.method}
                          </span>
                          <h3 className="text-base font-semibold text-white tracking-tight">
                            {fixture.name}
                          </h3>
                          {fixture.baseline ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" />
                              Baseline Set (HTTP {fixture.baseline.statusCode})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6b7280] bg-[#181b22] px-2 py-0.5 rounded-full border border-[#2d3340]">
                              No Baseline
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono text-[#9aa2b1]">
                          <span className="text-[#6b7280]">Path:</span>
                          <span className="bg-[#181b22]/80 px-2 py-0.5 rounded border border-[#2d3340]">
                            {fixture.request.path}
                          </span>
                          <CopyButton value={fixture.request.path} label="path" />
                        </div>

                        {fixture.description && (
                          <p className="text-xs text-[#9aa2b1] line-clamp-1">{fixture.description}</p>
                        )}

                        {fixture.tags && fixture.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {fixture.tags.map((t) => (
                              <span
                                key={t}
                                className="text-[10px] text-[#9aa2b1] bg-[#181b22] px-2 py-0.5 rounded"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-[#222630]">
                        <button
                          type="button"
                          onClick={() => setReplayModalFixture(fixture)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 text-[#0e1015] shadow shadow-indigo-600/20 transition"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Replay
                        </button>

                        <button
                          type="button"
                          onClick={() => openBaselineModal(fixture)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Baseline
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(fixture)}
                          className="p-1.5 text-[#9aa2b1] hover:text-white transition rounded-md hover:bg-[#181b22]"
                          title="Edit Fixture"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(fixture.id)}
                          className="p-1.5 text-[#9aa2b1] hover:text-rose-400 transition rounded-md hover:bg-[#181b22]"
                          title="Delete Fixture"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {hasBody && (
                      <div className="border-t border-[#222630] pt-2 mt-1">
                        <button
                          type="button"
                          onClick={() => togglePayloadExpand(fixture.id)}
                          className="inline-flex items-center gap-1.5 text-xs text-[#9aa2b1] hover:text-[#f0f2f5] font-mono transition"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-amber-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[#6b7280]" />
                          )}
                          <Code className="h-3.5 w-3.5 text-amber-400/80" />
                          <span>Request Payload ({fixture.request.bodyType})</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-2 rounded border border-[#222630] bg-[#0e1015] p-3 text-xs font-mono overflow-x-auto relative">
                            <div className="absolute top-2 right-2">
                              <CopyButton
                                value={
                                  typeof fixture.request.body === 'string'
                                    ? fixture.request.body
                                    : JSON.stringify(fixture.request.body, null, 2)
                                }
                                label="payload"
                              />
                            </div>
                            <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed pr-10">
                              {typeof fixture.request.body === 'string'
                                ? fixture.request.body
                                : JSON.stringify(fixture.request.body, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Create / Edit Fixture Modal */}
          {modalMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-2xl rounded border border-[#222630] bg-[#13161c] p-6 shadow-2xl my-8">
                <h3 className="text-lg font-semibold text-white">
                  {modalMode === 'create' ? 'Create Fixture' : 'Edit Fixture'}
                </h3>
                <p className="mt-1 text-xs text-[#9aa2b1]">
                  Fixtures represent test HTTP requests. Sensitive tokens like authorization headers are automatically redacted.
                </p>

                {formError && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveFixture} className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Fixture Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Get User Profile"
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={tagsString}
                        onChange={(e) => setTagsString(e.target.value)}
                        placeholder="e.g. auth, users, smoke"
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Validates 200 OK profile payload"
                      className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* HTTP Method and Path */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        HTTP Method
                      </label>
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value as HttpMethod)}
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm font-semibold text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {HTTP_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Relative Path *
                      </label>
                      <input
                        type="text"
                        required
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/api/v1/resource"
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Request Headers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[#9aa2b1]">
                        Request Headers
                      </label>
                      <button
                        type="button"
                        onClick={handleAddHeader}
                        className="text-xs font-medium text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Header
                      </button>
                    </div>

                    {headerEntries.length === 0 ? (
                      <p className="text-xs text-[#6b7280] italic">No request headers defined.</p>
                    ) : (
                      <div className="space-y-2">
                        {headerEntries.map((h, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={h.key}
                              placeholder="Header-Name"
                              onChange={(e) => {
                                const val = e.target.value;
                                setHeaderEntries((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, key: val } : item))
                                );
                              }}
                              className="flex-1 rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
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
                              className="flex-1 rounded-md border border-[#2d3340] bg-[#181b22] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
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

                  {/* Body Type and Body Editor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[#9aa2b1]">
                        Request Body
                      </label>
                      <div className="flex gap-2">
                        {BODY_TYPES.map((bt) => (
                          <button
                            key={bt}
                            type="button"
                            onClick={() => setBodyType(bt)}
                            className={`px-2.5 py-0.5 rounded text-xs font-semibold transition ${
                              bodyType === bt
                                ? 'bg-amber-600 text-white'
                                : 'bg-[#181b22] text-[#9aa2b1] hover:text-white'
                            }`}
                          >
                            {bt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {bodyType !== 'NONE' && (
                      <textarea
                        rows={5}
                        value={bodyString}
                        onChange={(e) => setBodyString(e.target.value)}
                        placeholder={bodyType === 'JSON' ? '{\n  "key": "value"\n}' : 'Plaintext body...'}
                        className="w-full font-mono text-xs rounded-lg border border-[#2d3340] bg-[#181b22]/80 p-3 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
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
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-amber-500 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isSubmitting
                        ? 'Saving...'
                        : modalMode === 'create'
                        ? 'Create Fixture'
                        : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Explicit Baseline Update Confirmation Modal */}
          {baselineModalFixture && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-xl rounded border border-amber-500/30 bg-[#13161c] p-6 shadow-2xl my-8">
                <div className="flex items-center gap-2.5 text-amber-400 mb-2">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="text-base font-semibold text-white">
                    Explicit Baseline Snapshot Update
                  </h3>
                </div>
                <p className="text-xs text-[#9aa2b1] leading-relaxed">
                  Baselines define expected responses for regression differential comparisons.
                  Updating a baseline is an explicit versioned operation.
                </p>

                {baselineError && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{baselineError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateBaseline} className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Expected HTTP Status
                      </label>
                      <input
                        type="number"
                        min={100}
                        max={599}
                        required
                        value={baselineStatusCode}
                        onChange={(e) => setBaselineStatusCode(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Response Body Type
                      </label>
                      <select
                        value={baselineBodyType}
                        onChange={(e) => setBaselineBodyType(e.target.value as BodyType)}
                        className="w-full rounded-lg border border-[#2d3340] bg-[#181b22] px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                      >
                        <option value="NONE">NONE (Empty Body)</option>
                        <option value="JSON">JSON</option>
                        <option value="TEXT">TEXT</option>
                      </select>
                    </div>
                  </div>

                  {baselineBodyType !== 'NONE' && (
                    <div>
                      <label className="block text-xs font-medium text-[#9aa2b1] mb-1.5">
                        Expected Body Snapshot
                      </label>
                      <textarea
                        rows={6}
                        value={baselineBodyString}
                        onChange={(e) => setBaselineBodyString(e.target.value)}
                        placeholder="Expected baseline JSON or text..."
                        className="w-full font-mono text-xs rounded-lg border border-[#2d3340] bg-[#181b22]/80 p-3 text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2.5 text-xs text-amber-200">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      Confirmation Notice: This will persist a new immutable baseline record in PostgreSQL.
                      Prior suite runs referencing previous baseline snapshots will remain preserved.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222630]">
                    <button
                      type="button"
                      onClick={() => setBaselineModalFixture(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#9aa2b1] hover:text-white transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-amber-500 disabled:opacity-50"
                    >
                      <History className="h-4 w-4" />
                      {isSubmitting ? 'Recording Snapshot...' : 'Confirm Baseline Update'}
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
                  <h3 className="text-base font-semibold text-white">Delete Fixture</h3>
                </div>
                <p className="text-xs text-[#9aa2b1] leading-relaxed">
                  Are you sure you want to delete this fixture? All associated baseline history and differential comparisons will be removed.
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
                    onClick={() => handleDeleteFixture(deleteConfirmId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Replay Trigger Modal */}
          {replayModalFixture && activeProject && (
            <ReplayTriggerModal
              projectId={activeProject.id}
              fixture={replayModalFixture}
              environments={environments}
              onClose={() => setReplayModalFixture(null)}
            />
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
