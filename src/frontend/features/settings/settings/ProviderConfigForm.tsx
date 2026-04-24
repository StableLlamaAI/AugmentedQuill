// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Right-panel configuration form for a single LLM provider in machine settings.
 * Contains all parameter inputs, preset management, capability toggles, and the prompts section.
 * Extracted from SettingsMachine.tsx to separate list-selection from form-editing concerns.
 */

import React, { useState } from 'react';
import {
  MessageSquare,
  BookOpen,
  Edit2,
  AlertTriangle,
  Trash2,
  Terminal,
  Key,
  ChevronDown,
} from 'lucide-react';
import { AppTheme, LLMConfig } from '../../../types';
import { ModelPresetEntry } from '../../../services/apiTypes';
import { Button } from '../../../components/ui/Button';
import { SettingsPrompts } from './SettingsPrompts';

export interface ProviderConfigFormProps {
  activeProvider: LLMConfig | undefined;
  isActiveProviderAvailable: boolean;
  activeWritingProviderId: string;
  activeEditingProviderId: string;
  activeChatProviderId: string;
  connectionStatus: Record<string, 'idle' | 'success' | 'error' | 'loading'>;
  modelStatus: Record<string, 'idle' | 'success' | 'error' | 'loading'>;
  detectedCapabilities: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  modelLists: Record<string, string[]>;
  modelPresets: ModelPresetEntry[];
  theme: AppTheme;
  defaultPrompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  isLight: boolean;
  onSetActiveWritingProvider: (id: string) => void;
  onSetActiveEditingProvider: (id: string) => void;
  onSetActiveChatProvider: (id: string) => void;
  onUpdateProvider: (id: string, updates: Partial<LLMConfig>) => void;
  onRemoveProvider: (id: string) => void;
}

export const ProviderConfigForm: React.FC<ProviderConfigFormProps> = ({
  activeProvider,
  isActiveProviderAvailable,
  activeWritingProviderId,
  activeEditingProviderId,
  activeChatProviderId,
  connectionStatus,
  modelStatus,
  detectedCapabilities,
  modelLists,
  modelPresets,
  theme,
  defaultPrompts,
  isLight,
  onSetActiveWritingProvider,
  onSetActiveEditingProvider,
  onSetActiveChatProvider,
  onUpdateProvider,
  onRemoveProvider,
}: ProviderConfigFormProps) => {
  const [modelPickerOpenFor, setModelPickerOpenFor] = useState<string | null>(null);
  const [suggestedPresetByProvider, setSuggestedPresetByProvider] = useState<
    Record<string, string | null>
  >({});
  const [lastDeltaByProvider, setLastDeltaByProvider] = useState<
    Record<string, string | null>
  >({});

  const absolutePresets = modelPresets.filter(
    (p: ModelPresetEntry) => (p.preset_type ?? 'absolute') === 'absolute'
  );
  const deltaPresets = modelPresets.filter(
    (p: ModelPresetEntry) => p.preset_type === 'delta'
  );

  const getPresetById = (id?: string | null) => {
    if (!id) return null;
    return modelPresets.find((preset: ModelPresetEntry) => preset.id === id) || null;
  };

  const suggestPresetForModelId = (modelId: string): ModelPresetEntry | null => {
    const modelIdTrimmed = (modelId || '').trim();
    if (!modelIdTrimmed) return null;
    for (const preset of absolutePresets) {
      if (!Array.isArray(preset.model_id_patterns)) continue;
      const matches = preset.model_id_patterns.some((pattern: string) => {
        try {
          return new RegExp(pattern, 'i').test(modelIdTrimmed);
        } catch {
          return false;
        }
      });
      if (matches) return preset;
    }
    return null;
  };

  /** Returns absolute presets that match the given model ID, most specific first. */
  const getMatchingAbsolutePresets = (modelId: string): ModelPresetEntry[] => {
    const modelIdTrimmed = (modelId || '').trim();
    if (!modelIdTrimmed) return [];
    return absolutePresets.filter((preset: ModelPresetEntry) => {
      if (!Array.isArray(preset.model_id_patterns)) return false;
      return preset.model_id_patterns.some((pattern: string) => {
        try {
          return new RegExp(pattern, 'i').test(modelIdTrimmed);
        } catch {
          return false;
        }
      });
    });
  };

  const applyPreset = (providerId: string, preset: ModelPresetEntry | null) => {
    if (!preset) return;
    const p = preset.parameters || {};
    const nextStop = Array.isArray(p.stop)
      ? p.stop.map((entry: string) => String(entry))
      : [];
    onUpdateProvider(providerId, {
      temperature: p.temperature ?? undefined,
      topP: p.top_p ?? undefined,
      maxTokens: p.max_tokens ?? undefined,
      presencePenalty: p.presence_penalty ?? undefined,
      frequencyPenalty: p.frequency_penalty ?? undefined,
      stop: nextStop,
      seed: p.seed ?? undefined,
      topK: p.top_k ?? undefined,
      minP: p.min_p ?? undefined,
      extraBody: p.extra_body ?? '',
      presetId: preset.id,
      writingWarning: preset.warnings?.writing ?? null,
    });
    setSuggestedPresetByProvider((previous: Record<string, string | null>) => ({
      ...previous,
      [providerId]: null,
    }));
  };

  /** Applies only the non-null fields from a delta preset without locking the provider. */
  const applyDelta = (providerId: string, preset: ModelPresetEntry | null) => {
    if (!preset) {
      setLastDeltaByProvider((prev: Record<string, string | null>) => ({
        ...prev,
        [providerId]: null,
      }));
      return;
    }
    const p = preset.parameters || {};
    const updates: Partial<LLMConfig> = {};
    if (p.temperature != null) updates.temperature = p.temperature;
    if (p.top_p != null) updates.topP = p.top_p;
    if (p.max_tokens != null) updates.maxTokens = p.max_tokens;
    if (p.presence_penalty != null) updates.presencePenalty = p.presence_penalty;
    if (p.frequency_penalty != null) updates.frequencyPenalty = p.frequency_penalty;
    if (Array.isArray(p.stop)) updates.stop = p.stop.map((s: string) => String(s));
    if (p.seed != null) updates.seed = p.seed;
    if (p.top_k != null) updates.topK = p.top_k;
    if (p.min_p != null) updates.minP = p.min_p;
    if (p.extra_body != null) updates.extraBody = p.extra_body;
    onUpdateProvider(providerId, updates);
    setLastDeltaByProvider((prev: Record<string, string | null>) => ({
      ...prev,
      [providerId]: preset.id,
    }));
  };

  const renderCapabilitySelect = (
    label: string,
    field: 'isMultimodal' | 'supportsFunctionCalling',
    detectedField: 'is_multimodal' | 'supports_function_calling'
  ) => {
    if (!activeProvider) return null;
    const val = activeProvider[field];
    const detected = detectedCapabilities[activeProvider.id]?.[detectedField];
    const id = `provider-${field}`;
    return (
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="text-xs font-medium text-brand-gray-500 uppercase"
        >
          {label}
        </label>
        <select
          id={id}
          value={val === true ? 'true' : val === false ? 'false' : 'auto'}
          onChange={(e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
            const v = e.target.value;
            onUpdateProvider(activeProvider.id, {
              [field]: v === 'auto' ? null : v === 'true',
            });
          }}
          className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
              : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
          }`}
        >
          <option value="auto">
            Auto
            {detected !== undefined ? ` (${detected ? 'Yes' : 'No'})` : ''}
          </option>
          <option value="true">Supported</option>
          <option value="false">Unsupported</option>
        </select>
      </div>
    );
  };

  const renderSlider = (
    label: string,
    field: 'temperature' | 'topP' | 'minP',
    min: number,
    max: number,
    step: number,
    tooltip?: string
  ) => {
    if (!activeProvider) return null;
    const id = `provider-${field}`;
    return (
      <div className="space-y-2">
        <div
          className={`flex justify-between text-xs ${
            isLight ? 'text-brand-gray-600' : 'text-brand-gray-400'
          }`}
        >
          <label
            htmlFor={id}
            title={tooltip}
            className={
              tooltip
                ? 'cursor-help underline decoration-dotted underline-offset-2'
                : ''
            }
          >
            {label}
          </label>
          <span>{activeProvider[field] ?? 0}</span>
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={activeProvider[field] ?? 0}
          onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) =>
            onUpdateProvider(activeProvider.id, {
              [field]: Number(e.target.value),
            })
          }
          className="w-full accent-brand-500"
        />
      </div>
    );
  };

  const renderNumberInput = (
    label: string,
    field:
      | 'contextWindowTokens'
      | 'maxTokens'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'seed'
      | 'topK',
    placeholder: string = '',
    tooltip?: string
  ) => {
    if (!activeProvider) return null;
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-brand-gray-500 uppercase">
          <span
            title={tooltip}
            className={
              tooltip
                ? 'cursor-help underline decoration-dotted underline-offset-2'
                : ''
            }
          >
            {label}
          </span>
        </label>
        <input
          id={`provider-${field}`}
          type="number"
          step={
            field === 'seed' ||
            field === 'topK' ||
            field === 'maxTokens' ||
            field === 'contextWindowTokens'
              ? 1
              : 0.01
          }
          value={activeProvider[field] ?? ''}
          placeholder={placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
            const raw = e.target.value;
            onUpdateProvider(activeProvider.id, {
              [field]: raw === '' ? undefined : Number(raw),
            });
          }}
          className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
              : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
          }`}
        />
      </div>
    );
  };

  if (!activeProvider) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-brand-gray-600">
        <p>Select a provider to configure</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pl-0 md:pl-2 md:pr-2">
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex justify-between items-start">
          <div>
            <h3
              className={`text-xl font-bold ${
                isLight ? 'text-brand-gray-800' : 'text-brand-gray-300'
              }`}
            >
              {activeProvider.name}
            </h3>
            <p className="text-xs text-brand-gray-500 mt-1">ID: {activeProvider.id}</p>
          </div>
          <div className="flex space-x-2">
            <Button
              theme={theme}
              size="sm"
              variant="danger"
              onClick={() => onRemoveProvider(activeProvider.id)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        {/* Role Selection Buttons */}
        <div
          className={`grid grid-cols-3 gap-3 p-3 rounded-lg border ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-200'
              : 'bg-brand-gray-950 border-brand-gray-800'
          }`}
        >
          <button
            onClick={() => onSetActiveWritingProvider(activeProvider.id)}
            disabled={!isActiveProviderAvailable}
            className={`flex items-center justify-center gap-2 py-2 rounded text-[10px] font-bold uppercase transition-all ${
              activeWritingProviderId === activeProvider.id
                ? isLight
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-violet-900/40 text-violet-300 border border-violet-800/50'
                : isLight
                  ? 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
                  : 'bg-brand-gray-800 text-brand-gray-400 hover:bg-brand-gray-700'
            }`}
          >
            <BookOpen size={14} />
            Writing
            {activeWritingProviderId === activeProvider.id &&
              activeProvider.writingWarning && (
                <AlertTriangle size={12} className="text-amber-300" />
              )}
          </button>
          <button
            onClick={() => onSetActiveEditingProvider(activeProvider.id)}
            disabled={!isActiveProviderAvailable}
            className={`flex items-center justify-center gap-2 py-2 rounded text-[10px] font-bold uppercase transition-all ${
              activeEditingProviderId === activeProvider.id
                ? isLight
                  ? 'bg-fuchsia-600 text-white shadow-md'
                  : 'bg-fuchsia-900/40 text-fuchsia-300 border border-fuchsia-800/50'
                : isLight
                  ? 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
                  : 'bg-brand-gray-800 text-brand-gray-400 hover:bg-brand-gray-700'
            }`}
          >
            <Edit2 size={14} />
            Editing
          </button>
          <button
            onClick={() => onSetActiveChatProvider(activeProvider.id)}
            disabled={!isActiveProviderAvailable}
            className={`flex items-center justify-center gap-2 py-2 rounded text-[10px] font-bold uppercase transition-all ${
              activeChatProviderId === activeProvider.id
                ? isLight
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-blue-900/40 text-blue-300 border border-blue-800/50'
                : isLight
                  ? 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
                  : 'bg-brand-gray-800 text-brand-gray-400 hover:bg-brand-gray-700'
            }`}
          >
            <MessageSquare size={14} />
            Chat
          </button>
        </div>

        <div
          className={`text-xs leading-relaxed rounded-lg border p-3 ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-600'
              : 'bg-brand-gray-950 border-brand-gray-800 text-brand-gray-400'
          }`}
        >
          WRITING creates new prose. EDITING refines existing prose and summaries
          without adding fresh story content. CHAT plans the workflow, maintains
          metadata and sourcebook state, and decides when to delegate to WRITING or
          EDITING.
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-brand-gray-500 uppercase">
                Name
              </label>
              <input
                data-no-smart-quotes="true"
                value={activeProvider.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) =>
                  onUpdateProvider(activeProvider.id, { name: e.target.value })
                }
                className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-brand-gray-500 uppercase flex items-center gap-2">
              <Terminal size={12} /> Base URL
            </label>
            <input
              data-no-smart-quotes="true"
              value={activeProvider.baseUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) =>
                onUpdateProvider(activeProvider.id, { baseUrl: e.target.value })
              }
              placeholder="https://api.openai.com/v1"
              className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50 ${
                isLight
                  ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                  : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
              }`}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-brand-gray-500 uppercase flex items-center gap-2">
              <Key size={12} /> API Key
            </label>
            <div className="relative">
              <input
                data-no-smart-quotes="true"
                type="text"
                value={activeProvider.apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) =>
                  onUpdateProvider(activeProvider.id, { apiKey: e.target.value })
                }
                placeholder="sk... (visible)"
                className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus[activeProvider.id] === 'success'
                    ? 'bg-emerald-500'
                    : connectionStatus[activeProvider.id] === 'error'
                      ? 'bg-red-500'
                      : connectionStatus[activeProvider.id] === 'loading'
                        ? 'bg-brand-500'
                        : isLight
                          ? 'bg-brand-gray-300'
                          : 'bg-brand-gray-600'
                }`}
              />
              {connectionStatus[activeProvider.id] === 'success' && (
                <span className="text-emerald-600">Connected</span>
              )}
              {connectionStatus[activeProvider.id] === 'error' && (
                <span className="text-red-500">Connection failed</span>
              )}
              {connectionStatus[activeProvider.id] === 'loading' && (
                <span className="text-brand-600">Testing…</span>
              )}
              {(!connectionStatus[activeProvider.id] ||
                connectionStatus[activeProvider.id] === 'idle') && (
                <span className="text-brand-gray-500">Idle</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-brand-gray-500 uppercase flex items-center justify-between">
              <span>Model ID</span>
              <span className="text-xs text-brand-gray-400">
                You can type a custom model id
              </span>
            </label>
            <div className="relative">
              <input
                data-no-smart-quotes="true"
                value={activeProvider.modelId}
                onFocus={() => setModelPickerOpenFor(activeProvider.id)}
                onBlur={() => {
                  setTimeout(() => setModelPickerOpenFor(null), 120);
                }}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
                ) => {
                  const nextModelId = e.target.value;
                  onUpdateProvider(activeProvider.id, { modelId: nextModelId });
                  const suggested = suggestPresetForModelId(nextModelId);
                  setSuggestedPresetByProvider(
                    (previous: Record<string, string | null>) => ({
                      ...previous,
                      [activeProvider.id]: suggested?.id || null,
                    })
                  );
                }}
                placeholder="Select or type a model id"
                className={`w-full border rounded p-2 pr-9 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
              />
              <button
                type="button"
                onMouseDown={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                  e.preventDefault();
                  const models = modelLists[activeProvider.id] || [];
                  if (models.length === 0) return;
                  setModelPickerOpenFor((cur: string | null) =>
                    cur === activeProvider.id ? null : activeProvider.id
                  );
                }}
                disabled={(modelLists[activeProvider.id] || []).length === 0}
                className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded border text-xs transition-colors disabled:opacity-50 ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-500 hover:bg-brand-gray-50'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-400 hover:bg-brand-gray-900'
                }`}
                title={
                  (modelLists[activeProvider.id] || []).length === 0
                    ? 'No models loaded'
                    : 'Show available models'
                }
              >
                <ChevronDown size={14} />
              </button>

              {modelPickerOpenFor === activeProvider.id &&
                (modelLists[activeProvider.id] || []).length > 0 && (
                  <div
                    className={`absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded border shadow-lg ${
                      isLight
                        ? 'bg-brand-gray-50 border-brand-gray-200'
                        : 'bg-brand-gray-950 border-brand-gray-800'
                    }`}
                  >
                    {(modelLists[activeProvider.id] || []).map((m: string) => {
                      const isSelected = m === activeProvider.modelId;
                      return (
                        <button
                          type="button"
                          key={m}
                          title={m}
                          onMouseDown={(
                            e: React.MouseEvent<HTMLButtonElement, MouseEvent>
                          ) => {
                            e.preventDefault();
                            onUpdateProvider(activeProvider.id, { modelId: m });
                            const suggested = suggestPresetForModelId(m);
                            setSuggestedPresetByProvider(
                              (previous: Record<string, string | null>) => ({
                                ...previous,
                                [activeProvider.id]: suggested?.id || null,
                              })
                            );
                            setModelPickerOpenFor(null);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors truncate ${
                            isSelected
                              ? isLight
                                ? 'bg-brand-50 text-brand-gray-900'
                                : 'bg-brand-gray-900 text-brand-gray-300'
                              : isLight
                                ? 'text-brand-gray-800 hover:bg-brand-gray-50'
                                : 'text-brand-gray-300 hover:bg-brand-gray-900'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
            {suggestedPresetByProvider[activeProvider.id] && (
              <div className="mt-1 flex items-center justify-between gap-2 text-xs rounded border border-amber-500/40 bg-amber-100/50 dark:bg-amber-900/20 p-2">
                <span className="text-amber-700 dark:text-amber-300">
                  Suggested preset:{' '}
                  {getPresetById(suggestedPresetByProvider[activeProvider.id])?.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    applyPreset(
                      activeProvider.id,
                      getPresetById(suggestedPresetByProvider[activeProvider.id])
                    )
                  }
                  className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                >
                  Apply
                </button>
              </div>
            )}
            {/* Model availability indicator */}
            <div
              className="mt-1 flex items-center gap-2 text-xs"
              role="status"
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  modelStatus[activeProvider.id] === 'success'
                    ? 'bg-emerald-500'
                    : modelStatus[activeProvider.id] === 'error'
                      ? 'bg-red-500'
                      : modelStatus[activeProvider.id] === 'loading'
                        ? 'bg-brand-500'
                        : isLight
                          ? 'bg-brand-gray-300'
                          : 'bg-brand-gray-600'
                }`}
              />
              {modelStatus[activeProvider.id] === 'success' && (
                <span className="text-emerald-600">Model OK</span>
              )}
              {modelStatus[activeProvider.id] === 'error' && (
                <span className="text-red-500">Model unavailable</span>
              )}
              {modelStatus[activeProvider.id] === 'loading' && (
                <span className="text-brand-600">Checking…</span>
              )}
              {(!modelStatus[activeProvider.id] ||
                modelStatus[activeProvider.id] === 'idle') && (
                <span className="text-brand-gray-500">Idle</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderCapabilitySelect('Multimodal', 'isMultimodal', 'is_multimodal')}
            {renderCapabilitySelect(
              'Function Calling',
              'supportsFunctionCalling',
              'supports_function_calling'
            )}
          </div>

          {/* Timeout + Max Tokens: not controlled by preset */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-brand-gray-500 uppercase">
                <span
                  title="Maximum time in milliseconds to wait for a response from the model API before timing out."
                  className="cursor-help underline decoration-dotted underline-offset-2"
                >
                  Timeout (ms)
                </span>
              </label>
              <input
                type="number"
                value={activeProvider.timeout}
                onChange={(e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>) =>
                  onUpdateProvider(activeProvider.id, {
                    timeout: Number(e.target.value),
                  })
                }
                className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-brand-gray-500 uppercase">
                <span
                  title="Maximum number of tokens the model will generate in a single response."
                  className="cursor-help underline decoration-dotted underline-offset-2"
                >
                  Max Tokens
                </span>
              </label>
              <input
                type="number"
                step={1}
                value={activeProvider.maxTokens ?? ''}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
                ) => {
                  const raw = e.target.value;
                  onUpdateProvider(activeProvider.id, {
                    maxTokens: raw === '' ? undefined : Number(raw),
                  });
                }}
                className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
              />
            </div>
          </div>

          {/* Preset — controls which named parameter configuration is active */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-brand-gray-500 uppercase">
                Preset
              </label>
              <select
                value={activeProvider.presetId || ''}
                onChange={(
                  e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
                ) => {
                  const preset = getPresetById(e.target.value || null);
                  if (!preset) {
                    onUpdateProvider(activeProvider.id, {
                      presetId: null,
                      writingWarning: null,
                    });
                    return;
                  }
                  applyPreset(activeProvider.id, preset);
                }}
                className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                    : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                }`}
                title={
                  getPresetById(activeProvider.presetId)?.description ||
                  'Choose a preset to apply a named parameter configuration'
                }
              >
                <option value="">No preset — edit parameters manually</option>
                {(() => {
                  const matching = getMatchingAbsolutePresets(activeProvider.modelId);
                  const matchingIds = new Set(
                    matching.map((p: ModelPresetEntry) => p.id)
                  );
                  const others = absolutePresets.filter(
                    (p: ModelPresetEntry) => !matchingIds.has(p.id)
                  );
                  return (
                    <>
                      {matching.length > 0 && (
                        <optgroup label="Suggested for this model">
                          {matching.map((preset: ModelPresetEntry) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {others.length > 0 && (
                        <optgroup label="All presets">
                          {others.map((preset: ModelPresetEntry) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
              {getPresetById(activeProvider.presetId)?.description && (
                <p className="text-[11px] text-brand-gray-500">
                  {getPresetById(activeProvider.presetId)?.description}
                </p>
              )}
              {activeProvider.presetId && (
                <p className="text-[11px] text-brand-gray-400 italic">
                  Preset values are applied below. You can freely edit any parameter to
                  override it — your changes take effect immediately.
                </p>
              )}
            </div>

            {/* Delta tweak — applies partial parameter overrides on top of any preset */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-brand-gray-500 uppercase">
                Parameter Tweak{' '}
                <span className="normal-case font-normal text-brand-gray-400">
                  (applied on top of preset)
                </span>
              </label>
              <div className="flex gap-2">
                <select
                  value=""
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
                  ) => {
                    const preset = getPresetById(e.target.value || null);
                    applyDelta(activeProvider.id, preset);
                  }}
                  className={`flex-1 border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                  title="Apply a partial tweak on top of the current parameters"
                >
                  <option value="">Apply a tweak…</option>
                  {deltaPresets.map((preset: ModelPresetEntry) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
              {lastDeltaByProvider[activeProvider.id] && (
                <p className="text-[11px] text-brand-gray-500 italic">
                  Last tweak applied:{' '}
                  {getPresetById(lastDeltaByProvider[activeProvider.id])?.name}
                  {' — '}
                  {getPresetById(lastDeltaByProvider[activeProvider.id])?.description}
                </p>
              )}
            </div>
          </div>

          <div
            className={`pt-4 border-t ${
              isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
            }`}
          >
            <h4
              className={`text-sm font-bold mb-3 uppercase tracking-wider ${
                isLight ? 'text-brand-gray-600' : 'text-brand-gray-400'
              }`}
            >
              Parameters
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {renderSlider(
                'Temperature',
                'temperature',
                0,
                2,
                0.1,
                'Controls randomness. Higher values (e.g. 1.5) produce more creative, varied output; lower values (e.g. 0.2) make output more focused and deterministic.'
              )}
              {renderSlider(
                'Top P',
                'topP',
                0,
                1,
                0.05,
                'Nucleus sampling: only tokens within the top-P cumulative probability mass are considered. Lower values restrict vocabulary; 1.0 disables this filter.'
              )}
              {renderSlider(
                'Min P',
                'minP',
                0,
                1,
                0.01,
                'Minimum token probability relative to the top token. Tokens below this threshold are excluded. Typical range: 0.01–0.1; 0 disables.'
              )}
              {renderNumberInput(
                'Top K',
                'topK',
                '',
                'Restricts sampling to the K most likely tokens at each step. Lower values make output more predictable; 0 disables this filter.'
              )}
              {renderNumberInput(
                'Context Window',
                'contextWindowTokens',
                '',
                'Maximum number of tokens in the combined prompt + response. Overrides the model default if set.'
              )}
              {renderNumberInput(
                'Seed',
                'seed',
                '',
                'Random seed for reproducible outputs. Set a fixed integer to get deterministic results; leave empty for random.'
              )}
              {renderNumberInput(
                'Presence Penalty',
                'presencePenalty',
                '',
                'Penalizes tokens that have already appeared, encouraging the model to explore new topics. Range: −2.0 to 2.0.'
              )}
              {renderNumberInput(
                'Frequency Penalty',
                'frequencyPenalty',
                '',
                'Reduces repetition by penalizing tokens in proportion to how often they have already been used. Range: −2.0 to 2.0.'
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="Enable suggestion loop guard: detects repeated n-gram loops and retries generation once or more."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Suggestion Loop Guard
                  </span>
                </label>
                <select
                  value={
                    activeProvider.suggestLoopGuardEnabled === false ? 'off' : 'on'
                  }
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
                  ) => {
                    onUpdateProvider(activeProvider.id, {
                      suggestLoopGuardEnabled: e.target.value === 'on',
                    });
                  }}
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="N-gram size used for loop detection in suggestion mode."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Loop N-gram
                  </span>
                </label>
                <select
                  value={activeProvider.suggestLoopGuardNgram === 4 ? '4' : '3'}
                  onChange={(
                    e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
                  ) => {
                    onUpdateProvider(activeProvider.id, {
                      suggestLoopGuardNgram: e.target.value === '4' ? 4 : 3,
                    });
                  }}
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                >
                  <option value="3">3-gram</option>
                  <option value="4">4-gram</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="How many repeats of the same n-gram trigger loop detection."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Min Repeats
                  </span>
                </label>
                <input
                  type="number"
                  step={1}
                  min={2}
                  max={8}
                  value={activeProvider.suggestLoopGuardMinRepeats ?? 3}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
                  ) =>
                    onUpdateProvider(activeProvider.id, {
                      suggestLoopGuardMinRepeats: Math.max(
                        2,
                        Math.min(8, Number(e.target.value) || 3)
                      ),
                    })
                  }
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="Maximum number of regeneration retries when loop/low-quality output is detected."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Max Regenerations
                  </span>
                </label>
                <input
                  type="number"
                  step={1}
                  min={0}
                  max={3}
                  value={activeProvider.suggestLoopGuardMaxRegens ?? 1}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
                  ) =>
                    onUpdateProvider(activeProvider.id, {
                      suggestLoopGuardMaxRegens: Math.max(
                        0,
                        Math.min(3, Number(e.target.value) || 0)
                      ),
                    })
                  }
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="Sequences that cause the model to stop generating immediately when encountered."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Stop Sequences (one per line)
                  </span>
                </label>
                <textarea
                  data-no-smart-quotes="true"
                  rows={3}
                  value={(activeProvider.stop || []).join('\n')}
                  onChange={(
                    e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
                  ) =>
                    onUpdateProvider(activeProvider.id, {
                      stop: e.target.value
                        .split('\n')
                        .map((line: string) => line.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-brand-gray-500 uppercase">
                  <span
                    title="Additional JSON fields merged into the API request body. Use for provider-specific options not exposed above."
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    Extra Body (JSON)
                  </span>
                </label>
                <textarea
                  data-no-smart-quotes="true"
                  rows={4}
                  value={activeProvider.extraBody || ''}
                  onChange={(
                    e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
                  ) =>
                    onUpdateProvider(activeProvider.id, {
                      extraBody: e.target.value,
                    })
                  }
                  placeholder='{"reasoning": {"enabled": false}}'
                  className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none font-mono ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                      : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                  }`}
                />
                {activeProvider.writingWarning && (
                  <div
                    className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-300"
                    title={activeProvider.writingWarning}
                  >
                    <AlertTriangle size={12} />
                    <span>{activeProvider.writingWarning}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <SettingsPrompts
            activeProvider={activeProvider}
            defaultPrompts={defaultPrompts}
            onUpdateProvider={onUpdateProvider}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
};
