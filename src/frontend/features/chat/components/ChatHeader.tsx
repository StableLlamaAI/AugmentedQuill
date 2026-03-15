// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chat header controls so chat layout remains modular and maintainable.
 */

import React from 'react';
import { Ghost, Globe, History, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { ChatContextUsage } from '../chatContextBudget';

type ChatHeaderProps = {
  title: string;
  headerBg?: string;
  currentSessionId: string | null;
  isIncognito: boolean;
  contextUsage: ChatContextUsage;
  isDisabled?: boolean;
  disabledReason?: string;
  showHistory: boolean;
  setShowHistory: (value: boolean) => void;
  showSystemPrompt: boolean;
  setShowSystemPrompt: (value: boolean) => void;
  allowWebSearch: boolean;
  onDeleteSession: (id: string) => void;
  onNewSession: (incognito?: boolean) => void;
  onToggleWebSearch: (value: boolean) => void;
};

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  headerBg = 'bg-brand-gray-100 dark:bg-brand-gray-900',
  currentSessionId,
  isIncognito,
  contextUsage,
  isDisabled = false,
  disabledReason,
  showHistory,
  setShowHistory,
  showSystemPrompt,
  setShowSystemPrompt,
  allowWebSearch,
  onDeleteSession,
  onNewSession,
  onToggleWebSearch,
}) => {
  const reason =
    disabledReason ||
    'Chat is unavailable because no working CHAT model is configured.';
  const usagePercent = Math.round(Math.min(contextUsage.usageRatio, 1) * 100);
  const usageTone =
    usagePercent >= 90
      ? 'bg-red-500'
      : usagePercent >= 75
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  const usageLabel =
    usagePercent >= 90 ? 'High' : usagePercent >= 75 ? 'Rising' : 'Healthy';

  return (
    <div
      className={`p-4 border-b flex items-center justify-between gap-4 ${headerBg} border-brand-gray-200 dark:border-brand-gray-800`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center space-x-2 overflow-hidden">
          <Sparkles className="text-blue-600 shrink-0" size={20} />
          <h2 className="font-semibold truncate">{title}</h2>
        </div>
        {contextUsage.enabled && (
          <div className="mt-1.5 flex items-center gap-2 opacity-70">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-brand-gray-200 dark:bg-brand-gray-800">
              <div
                className={`h-full rounded-full transition-all ${usageTone}`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-brand-gray-500">
              {usageLabel.toLowerCase()} {usagePercent}%
              {contextUsage.compactionApplied ? ' compacted' : ''}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center space-x-1 shrink-0">
        <button
          onClick={() => {
            if (isDisabled) return;
            if (currentSessionId) {
              onDeleteSession(currentSessionId);
            }
          }}
          className="p-1.5 rounded hover:bg-red-500/10 text-red-500/70 hover:text-red-500 transition-colors"
          title={
            isDisabled
              ? reason
              : !currentSessionId
                ? 'No active chat to delete'
                : 'Delete Current Chat'
          }
          disabled={isDisabled || !currentSessionId}
        >
          <Trash2 size={16} />
        </button>
        <button
          onClick={() => {
            if (isDisabled) return;
            onNewSession(false);
          }}
          className="p-1.5 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800 transition-colors text-brand-gray-500"
          title={isDisabled ? reason : 'New Chat'}
          disabled={isDisabled}
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => {
            if (isDisabled) return;
            onNewSession(true);
          }}
          className={`p-1.5 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800 transition-colors ${
            isIncognito ? 'text-purple-500 bg-purple-500/10' : 'text-brand-gray-500'
          }`}
          title={isDisabled ? reason : 'Incognito Chat (Not Saved)'}
          disabled={isDisabled}
        >
          <Ghost size={16} />
        </button>
        <button
          onClick={() => {
            if (isDisabled) return;
            setShowHistory(!showHistory);
          }}
          className={`p-1.5 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800 transition-colors ${
            showHistory
              ? 'bg-brand-gray-200 dark:bg-brand-gray-800 text-brand-600'
              : 'text-brand-gray-500'
          }`}
          title={isDisabled ? reason : 'Chat History'}
          disabled={isDisabled}
        >
          <History size={16} />
        </button>
        <button
          onClick={() => {
            if (isDisabled) return;
            onToggleWebSearch(!allowWebSearch);
          }}
          className={`p-1.5 rounded border transition-all ${
            allowWebSearch
              ? 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-500/20 dark:border-blue-500/30 shadow-sm'
              : 'text-brand-gray-500 border-transparent hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800'
          }`}
          title={
            isDisabled
              ? reason
              : allowWebSearch
                ? 'Web Search Enabled'
                : 'Enable Web Search'
          }
          disabled={isDisabled}
        >
          <Globe size={16} />
        </button>
        <button
          onClick={() => {
            if (isDisabled) return;
            setShowSystemPrompt(!showSystemPrompt);
          }}
          className={`p-1.5 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800 transition-colors ${
            showSystemPrompt
              ? 'bg-brand-gray-200 dark:bg-brand-gray-800 text-brand-600'
              : 'text-brand-gray-500'
          }`}
          title={isDisabled ? reason : 'Chat Settings'}
          disabled={isDisabled}
        >
          <Settings2 size={16} />
        </button>
      </div>
    </div>
  );
};
