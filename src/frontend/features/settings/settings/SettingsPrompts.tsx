// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings prompts unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState } from 'react';
import { BookOpen, Edit2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { AppTheme, LLMConfig } from '../../../types';
import { useThemeClasses } from '../../layout/ThemeContext';
import { PROMPT_GROUPS } from './constants';

interface SettingsPromptsProps {
  activeProvider: LLMConfig;
  defaultPrompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  onUpdateProvider: (id: string, updates: Partial<LLMConfig>) => void;
  theme: AppTheme;
}

// eslint-disable-next-line max-lines-per-function
export const SettingsPrompts: React.FC<SettingsPromptsProps> = ({
  activeProvider,
  defaultPrompts,
  onUpdateProvider,
  theme: _theme,
}: SettingsPromptsProps): React.ReactElement => {
  const { isLight } = useThemeClasses();

  const promptMetaById = React.useMemo((): Record<
    string,
    { label: string; type: 'CHAT' | 'WRITING' | 'EDITING' }
  > => {
    const map: Record<string, { label: string; type: 'CHAT' | 'WRITING' | 'EDITING' }> =
      {};
    PROMPT_GROUPS.forEach(
      (group: {
        title: string;
        prompts: Array<{
          id: string;
          label: string;
          type: 'CHAT' | 'WRITING' | 'EDITING';
        }>;
      }): void => {
        group.prompts.forEach(
          (prompt: {
            id: string;
            label: string;
            type: 'CHAT' | 'WRITING' | 'EDITING';
          }): void => {
            map[prompt.id] = { label: prompt.label, type: prompt.type };
          }
        );
      }
    );
    return map;
  }, []);

  const allPromptIds = React.useMemo((): string[] => {
    const ids = new Set<string>([
      ...Object.keys(defaultPrompts.system_messages || {}),
      ...Object.keys(defaultPrompts.user_prompts || {}),
    ]);
    return Array.from(ids).sort();
  }, [defaultPrompts]);

  const overrides = activeProvider.prompts || {};
  // Only treat a prompt as “overridden” if it has a non-empty value.
  // The default config supplies empty strings for some legacy keys (e.g. "system",
  // "continuation", "summary"), which should not appear as active overrides.
  const overrideIds = Object.entries(overrides)
    .filter(([, value]: [string, string]): boolean => String(value || '').trim() !== '')
    .map(([key]: [string, string]): string => key);

  const availablePromptIds = React.useMemo(
    () => allPromptIds.filter((id: string): boolean => !overrideIds.includes(id)),
    [allPromptIds, overrideIds]
  );

  const [selectedPromptId, setSelectedPromptId] = useState<string>(
    availablePromptIds[0] || ''
  );

  React.useEffect((): void => {
    if (!availablePromptIds.includes(selectedPromptId)) {
      setSelectedPromptId(availablePromptIds[0] || '');
    }
  }, [availablePromptIds, selectedPromptId]);

  const getPromptDefault = (promptId: string): string => {
    return (
      defaultPrompts.system_messages[promptId] ||
      defaultPrompts.user_prompts[promptId] ||
      ''
    );
  };

  const addOverride = (): void => {
    if (!selectedPromptId) return;
    onUpdateProvider(activeProvider.id, {
      prompts: {
        ...(activeProvider.prompts || {}),
        [selectedPromptId]: getPromptDefault(selectedPromptId),
      },
    });
  };

  const removeOverride = (id: string): void => {
    const next = { ...(activeProvider.prompts || {}) };
    delete next[id];
    onUpdateProvider(activeProvider.id, { prompts: next });
  };

  const updateOverride = (id: string, value: string): void => {
    onUpdateProvider(activeProvider.id, {
      prompts: {
        ...(activeProvider.prompts || {}),
        [id]: value,
      },
    });
  };

  const getMeta = (
    id: string
  ): { label: string; type: 'CHAT' | 'WRITING' | 'EDITING' } =>
    promptMetaById[id] || { label: id, type: 'CHAT' as const };

  return (
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
        Expert: Prompt Overrides
      </h4>
      <p
        className={`mb-4 text-xs leading-relaxed ${
          isLight ? 'text-brand-gray-600' : 'text-brand-gray-400'
        }`}
      >
        Override prompts only when you want to fine-tune role behavior. WRITING should
        stay focused on prose generation, EDITING on refinement and summaries, and CHAT
        on planning, metadata, and delegation. Each role prompt should be
        self-contained: assume the model starts cold and only knows what the current
        prompt and session provide.
      </p>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-medium text-brand-gray-500 uppercase">
              Add prompt override
            </label>
            <select
              value={selectedPromptId}
              onChange={(
                e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
              ): void => setSelectedPromptId(e.target.value)}
              className={`w-full border rounded p-2 text-sm focus:border-brand-500 focus:outline-none ${
                isLight
                  ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                  : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
              }`}
              disabled={availablePromptIds.length === 0}
            >
              {availablePromptIds.length === 0 ? (
                <option value="">No more prompts to add</option>
              ) : (
                availablePromptIds.map((id: string) => {
                  const meta = getMeta(id);
                  return (
                    <option key={id} value={id}>
                      {meta.label}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <button
            onClick={addOverride}
            disabled={!selectedPromptId}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded font-semibold text-xs transition-colors ${
              isLight
                ? 'bg-brand-gray-100 text-brand-gray-700 hover:bg-brand-gray-200'
                : 'bg-brand-gray-800 text-brand-gray-200 hover:bg-brand-gray-700'
            }`}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {overrideIds.length === 0 ? (
          <div
            className={`text-xs text-brand-gray-500 ${
              isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950'
            } p-3 rounded border ${
              isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
            }`}
          >
            No prompt overrides yet. Use the selector above to add one.
          </div>
        ) : (
          <div className="space-y-4">
            {overrideIds.map((promptId: string) => {
              const meta = getMeta(promptId);
              const Icon =
                meta.type === 'CHAT'
                  ? MessageSquare
                  : meta.type === 'WRITING'
                    ? BookOpen
                    : Edit2;
              const colorClass =
                meta.type === 'CHAT'
                  ? 'text-blue-600'
                  : meta.type === 'WRITING'
                    ? 'text-violet-600'
                    : 'text-fuchsia-600';
              const bgColorClass =
                meta.type === 'CHAT'
                  ? 'bg-blue-50'
                  : meta.type === 'WRITING'
                    ? 'bg-violet-50'
                    : 'bg-fuchsia-50';
              const darkBgColorClass =
                meta.type === 'CHAT'
                  ? 'dark:bg-blue-900/20'
                  : meta.type === 'WRITING'
                    ? 'dark:bg-violet-900/20'
                    : 'dark:bg-fuchsia-900/20';

              const promptValue = overrides[promptId] || '';

              return (
                <div key={promptId} className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1 rounded ${bgColorClass} ${darkBgColorClass}`}
                      >
                        <Icon size={10} className={colorClass} />
                      </div>
                      <div>
                        <label
                          className={`text-[10px] font-bold uppercase tracking-tight ${
                            colorClass
                          }`}
                        >
                          {meta.label}
                          <span
                            className={
                              'ml-2 text-[8px] px-1 rounded border border-current opacity-70'
                            }
                          >
                            {meta.type}
                          </span>
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={(): void => removeOverride(promptId)}
                      className={`p-1 rounded transition-colors ${
                        isLight
                          ? 'text-brand-gray-400 hover:text-red-600 hover:bg-red-50'
                          : 'text-brand-gray-500 hover:text-red-400 hover:bg-red-900/40'
                      }`}
                      title="Remove override"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    data-no-smart-quotes="true"
                    rows={5}
                    value={promptValue}
                    onChange={(
                      e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
                    ): void => updateOverride(promptId, e.target.value)}
                    placeholder={getPromptDefault(promptId) || 'Default instruction...'}
                    className={`w-full border rounded p-2 text-[11px] focus:border-brand-500 focus:outline-none ${
                      isLight
                        ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-800'
                        : 'bg-brand-gray-950 border-brand-gray-700 text-brand-gray-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
