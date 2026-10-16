'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Sliders,
} from 'lucide-react';
import type {
  SuiteResponse,
  FixtureResponse,
  CreateSuiteInput,
  UpdateSuiteInput,
  SuiteItem,
  DifferentialMaskRule,
} from '@replaylab/contracts';
import { CreateSuiteInputSchema, UpdateSuiteInputSchema } from '@replaylab/contracts';
import { apiClient, ApiClientError } from '@/lib/api-client';

export interface SuiteEditorModalProps {
  projectId: string;
  suiteToEdit?: SuiteResponse | null;
  availableFixtures: FixtureResponse[];
  onClose: () => void;
  onSaved: (suite: SuiteResponse) => void;
}

export function SuiteEditorModal({
  projectId,
  suiteToEdit,
  availableFixtures,
  onClose,
  onSaved,
}: SuiteEditorModalProps) {
  const isEditing = Boolean(suiteToEdit);

  const [name, setName] = useState(suiteToEdit?.name || '');
  const [description, setDescription] = useState(suiteToEdit?.description || '');
  const [items, setItems] = useState<SuiteItem[]>(
    suiteToEdit?.items || []
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected fixture to add
  const [selectedFixtureToAdd, setSelectedFixtureToAdd] = useState<string>(
    availableFixtures[0]?.id || ''
  );

  const fixtureMap = new Map(availableFixtures.map((f) => [f.id, f]));

  const handleAddFixture = () => {
    if (!selectedFixtureToAdd) return;
    const newItem: SuiteItem = {
      fixtureId: selectedFixtureToAdd,
      order: items.length,
      assertions: [],
      maskRules: [],
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, newIdx) => ({ ...item, order: newIdx }))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[index - 1]!;
      copy[index - 1] = temp;
      return copy.map((item, idx) => ({ ...item, order: idx }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    setItems((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[index + 1]!;
      copy[index + 1] = temp;
      return copy.map((item, idx) => ({ ...item, order: idx }));
    });
  };

  const handleAddMaskRule = (itemIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const newRule: DifferentialMaskRule = {
          path: '$.timestamp',
          action: 'IGNORE',
        };
        return {
          ...item,
          maskRules: [...(item.maskRules || []), newRule],
        };
      })
    );
  };

  const handleRemoveMaskRule = (itemIndex: number, ruleIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        return {
          ...item,
          maskRules: (item.maskRules || []).filter((_, rIdx) => rIdx !== ruleIndex),
        };
      })
    );
  };

  const handleUpdateMaskRule = (
    itemIndex: number,
    ruleIndex: number,
    field: 'path' | 'action',
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const updatedRules = [...(item.maskRules || [])];
        const target = updatedRules[ruleIndex]!;
        if (field === 'path') {
          target.path = value;
        } else if (field === 'action') {
          target.action = value as 'IGNORE' | 'TYPE_MATCH';
        }
        return {
          ...item,
          maskRules: updatedRules,
        };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError('Please add at least one fixture to the regression suite');
      return;
    }

    try {
      setIsSubmitting(true);

      if (isEditing && suiteToEdit) {
        const payload: UpdateSuiteInput = {
          name: name.trim(),
          description: description.trim() || null,
          items,
        };
        const validation = UpdateSuiteInputSchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.errors[0]?.message || 'Invalid suite payload');
          return;
        }

        const updated = await apiClient.patch<SuiteResponse>(
          `/projects/${projectId}/suites/${suiteToEdit.id}`,
          validation.data
        );
        onSaved(updated);
      } else {
        const payload: CreateSuiteInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          items,
        };
        const validation = CreateSuiteInputSchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.errors[0]?.message || 'Invalid suite payload');
          return;
        }

        const created = await apiClient.post<SuiteResponse>(
          `/projects/${projectId}/suites`,
          validation.data
        );
        onSaved(created);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save regression suite');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Regression Suite' : 'Create Regression Suite'}
            </h2>
            <p className="text-xs text-slate-400">
              Configure ordered test fixtures and dynamic field masking rules
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-semibold rounded"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Suite Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Core Authentication & Checkout Smoke Suite"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Runs on staging deploys to verify regression resistance"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Add Fixture Section */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Add Fixture to Suite
              </span>
              <span className="text-[11px] text-slate-500">
                Fixtures execute in sequential order
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedFixtureToAdd}
                onChange={(e) => setSelectedFixtureToAdd(e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                {availableFixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.request.method} {f.request.path})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddFixture}
                disabled={availableFixtures.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Fixture
              </button>
            </div>
          </div>

          {/* Ordered Items List */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Suite Fixtures & Mask Rules ({items.length})
            </label>

            {items.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-500">
                No fixtures in this suite yet. Add fixtures above to configure regression execution.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const fix = fixtureMap.get(item.fixtureId);

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-white">
                            {fix?.name || `Fixture ${item.fixtureId.slice(0, 8)}`}
                          </span>
                          {fix && (
                            <span className="font-mono text-[10px] text-slate-400">
                              {fix.request.method} {fix.request.path}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800"
                            title="Move Up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800"
                            title="Move Down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Differential Mask Rules Section for this item */}
                      <div className="pl-6 pt-2 border-t border-slate-800/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                            <Sliders className="h-3 w-3 text-cyan-400" />
                            Differential Field Mask Rules
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddMaskRule(idx)}
                            className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Add Mask Rule
                          </button>
                        </div>

                        {item.maskRules && item.maskRules.length > 0 ? (
                          <div className="space-y-1.5">
                            {item.maskRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rule.path}
                                  placeholder="$.data.token"
                                  onChange={(e) =>
                                    handleUpdateMaskRule(idx, rIdx, 'path', e.target.value)
                                  }
                                  className="flex-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-white focus:outline-none"
                                />
                                <select
                                  value={rule.action}
                                  onChange={(e) =>
                                    handleUpdateMaskRule(idx, rIdx, 'action', e.target.value)
                                  }
                                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
                                >
                                  <option value="IGNORE">IGNORE (Skip Diff)</option>
                                  <option value="TYPE_MATCH">TYPE_MATCH (Match Type Only)</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMaskRule(idx, rIdx)}
                                  className="text-slate-500 hover:text-rose-400 p-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600 italic block">
                            No mask rules configured. All response fields will be evaluated against baseline.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-cyan-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSubmitting
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Create Regression Suite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
