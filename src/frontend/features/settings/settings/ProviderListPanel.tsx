// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Left-panel list of LLM providers in the machine settings tab.
 * Shows each provider with role badges, status indicators and actions.
 * Extracted from SettingsMachine.tsx to keep list and form concerns separate.
 */

import React from 'react';
import {
  BookOpen,
  Edit2,
  MessageSquare,
  AlertTriangle,
  Eye,
  Wand2,
  Plus,
  CopyPlus,
} from 'lucide-react';
import { LLMConfig } from '../../../types';

export interface ProviderListPanelProps {
  providers: LLMConfig[];
  editingProviderId: string | null;
  activeWritingProviderId: string;
  activeEditingProviderId: string;
  activeChatProviderId: string;
  connectionStatus: Record<string, 'idle' | 'success' | 'error' | 'loading'>;
  modelStatus: Record<string, 'idle' | 'success' | 'error' | 'loading'>;
  detectedCapabilities: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  isLight: boolean;
  onSelectProvider: (id: string) => void;
  onAddProvider: () => void;
  onDuplicateProvider: (id: string) => void;
}

export const ProviderListPanel: React.FC<ProviderListPanelProps> = ({
  providers,
  editingProviderId,
  activeWritingProviderId,
  activeEditingProviderId,
  activeChatProviderId,
  connectionStatus,
  modelStatus,
  detectedCapabilities,
  isLight,
  onSelectProvider,
  onAddProvider,
  onDuplicateProvider,
}) => {
  return (
    <div
      className={`w-full md:w-1/3 h-48 md:h-full border-b md:border-b-0 md:border-r md:pr-6 overflow-y-auto shrink-0 ${
        isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h3
          className={`font-bold ${
            isLight ? 'text-brand-gray-700' : 'text-brand-gray-300'
          }`}
        >
          Providers
        </h3>
        <button
          onClick={onAddProvider}
          aria-label="Add provider"
          className={`p-1 rounded transition-colors ${
            isLight
              ? 'bg-brand-gray-100 text-brand-gray-600 hover:text-brand-600'
              : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-400'
          }`}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="space-y-2">
        {providers.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectProvider(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectProvider(p.id);
              }
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col gap-2 group w-full text-left ${
              editingProviderId === p.id
                ? 'bg-brand-50 border-brand-500/50'
                : isLight
                  ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-100'
                  : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-750'
            }`}
          >
            <div className="flex justify-between items-center w-full">
              <div className="truncate flex-1">
                <div
                  className={`font-medium text-sm ${
                    isLight ? 'text-brand-gray-800' : 'text-brand-gray-300'
                  }`}
                >
                  {p.name}
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {(p.isMultimodal === true ||
                  ((p.isMultimodal === null || p.isMultimodal === undefined) &&
                    detectedCapabilities[p.id]?.is_multimodal)) && (
                  <Eye
                    size={12}
                    className={isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}
                    title="Multimodal (Vision)"
                  />
                )}
                {(p.supportsFunctionCalling === true ||
                  ((p.supportsFunctionCalling === null ||
                    p.supportsFunctionCalling === undefined) &&
                    detectedCapabilities[p.id]?.supports_function_calling)) && (
                  <Wand2
                    size={12}
                    className={isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}
                    title="Function Calling"
                  />
                )}
                <span
                  className={`h-2.5 w-2.5 rounded-full border ${
                    connectionStatus[p.id] === 'success'
                      ? 'bg-emerald-500 border-emerald-500'
                      : connectionStatus[p.id] === 'error'
                        ? 'bg-red-500 border-red-500'
                        : connectionStatus[p.id] === 'loading'
                          ? 'bg-brand-500 border-brand-500'
                          : isLight
                            ? 'bg-brand-gray-200 border-brand-gray-300'
                            : 'bg-brand-gray-700 border-brand-gray-600'
                  }`}
                  title={`Connection: ${connectionStatus[p.id] || 'idle'}`}
                />
                <span
                  className={`h-2.5 w-2.5 rounded-full border ${
                    modelStatus[p.id] === 'success'
                      ? 'bg-emerald-500 border-emerald-500'
                      : modelStatus[p.id] === 'error'
                        ? 'bg-red-500 border-red-500'
                        : modelStatus[p.id] === 'loading'
                          ? 'bg-brand-500 border-brand-500'
                          : isLight
                            ? 'bg-brand-gray-200 border-brand-gray-300'
                            : 'bg-brand-gray-700 border-brand-gray-600'
                  }`}
                  title={`Model: ${modelStatus[p.id] || 'idle'}`}
                />
              </div>
            </div>
            <div className="flex justify-between items-start">
              <div className="flex flex-wrap gap-1">
                {p.id === activeWritingProviderId && (
                  <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded border border-violet-200 flex items-center gap-1">
                    <BookOpen size={10} /> Writing
                    {p.writingWarning && (
                      <AlertTriangle
                        size={10}
                        className="text-amber-500"
                        title={p.writingWarning}
                      />
                    )}
                  </span>
                )}
                {p.id === activeEditingProviderId && (
                  <span className="text-[9px] bg-fuchsia-100 text-fuchsia-700 px-1.5 py-0.5 rounded border border-fuchsia-200 flex items-center gap-1">
                    <Edit2 size={10} /> Editing
                  </span>
                )}
                {p.id === activeChatProviderId && (
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                    <MessageSquare size={10} /> Chat
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateProvider(p.id);
                }}
                className={`p-1 rounded transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100 ${
                  isLight
                    ? 'text-brand-gray-400 hover:text-brand-600 hover:bg-brand-gray-200'
                    : 'text-brand-gray-500 hover:text-brand-400 hover:bg-brand-gray-700'
                }`}
                title="Duplicate provider"
              >
                <CopyPlus size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
