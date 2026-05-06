// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the debug logs unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Bug,
  Layers,
  List,
} from 'lucide-react';
import { useConfirm } from '../layout/ConfirmDialogContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import { AppTheme } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { api } from '../../services/api';
import { DebugLogEntry } from '../../services/apiTypes';

interface DebugLogsProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
}

type LogEntry = DebugLogEntry;

const JsonView: React.FC<{
  data: unknown;
  theme: AppTheme;
  depth?: number;
  label?: string;
}> = ({
  data,
  theme,
  depth = 0,
  label,
}: {
  data: unknown;
  theme: AppTheme;
  depth?: number;
  label?: string;
}): React.ReactElement => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (label === 'tools') return true;
    return false;
  });

  const textMuted = 'text-brand-gray-500';

  const renderValue = (): React.ReactElement => {
    if (data === null) return <span className="text-blue-400">null</span>;
    if (typeof data === 'undefined')
      return <span className="text-brand-gray-600">undefined</span>;
    if (typeof data === 'string') {
      // Replace escaped newlines (e.g. from JSON strings in tool arguments) with real line breaks
      const formattedData = data.replace(/\\n/g, '\n');
      return (
        <span className="text-green-500 whitespace-pre-wrap break-words break-all">
          "{formattedData}"
        </span>
      );
    }
    if (typeof data === 'number')
      return <span className="text-orange-500">{data}</span>;
    if (typeof data === 'boolean')
      return <span className="text-purple-500">{data.toString()}</span>;
    return <span>{String(data)}</span>;
  };

  if (data === null || typeof data !== 'object') {
    return (
      <div className="flex items-start gap-1 py-0.5">
        {label && <span className="text-blue-400 shrink-0">{label}:</span>}
        {renderValue()}
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const keys = Object.keys(data as Record<string, unknown>);

  if (keys.length === 0) return <span>{isArray ? '[]' : '{}'}</span>;

  return (
    <div className="pl-4 border-l border-brand-gray-500/20 my-0.5">
      <button
        type="button"
        className="flex items-center gap-1 cursor-pointer hover:bg-brand-gray-500/5 -ml-4 px-1 rounded w-full text-left"
        onClick={(): void => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {label && <span className="text-blue-400 mr-1">{label}:</span>}
        <span className={textMuted}>
          {isArray ? `Array(${keys.length})` : 'Object'}
        </span>
      </button>
      {!isCollapsed && (
        <div className="space-y-0.5 mt-0.5">
          {keys.map((key: string) => (
            <div key={key} className="flex flex-col">
              <JsonView
                data={(data as Record<string, unknown>)[key]}
                theme={theme}
                depth={depth + 1}
                label={isArray ? undefined : key}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const getCallerOrigin = (
  caller_id?: string
): 'Unknown' | 'User request' | 'Internal workflow' | 'Internal' => {
  if (!caller_id) return 'Unknown';
  if (caller_id.startsWith('api.')) return 'User request';
  if (
    caller_id.startsWith('story_generation') ||
    caller_id.startsWith('sourcebook.') ||
    caller_id.startsWith('chat_tools.') ||
    caller_id.startsWith('llm_utils.') ||
    caller_id.startsWith('settings_machine.') ||
    caller_id.startsWith('story_api_stream.') ||
    caller_id.startsWith('chat_api_proxy.')
  ) {
    return 'Internal workflow';
  }
  return 'Internal';
};

// ─── Sub-components ─────────────────────────────────────────────────────────

interface DebugLogsHeaderProps {
  streamMode: 'chunks' | 'aggregated';
  setStreamMode: (mode: 'chunks' | 'aggregated') => void;
  isLoading: boolean;
  onFetchLogs: () => void;
  onClearLogs: () => void;
  onClose: () => void;
  textMain: string;
  borderMain: string;
  bgSecondary: string;
  t: (key: string) => string;
}

const DebugLogsHeader: React.FC<DebugLogsHeaderProps> = ({
  streamMode,
  setStreamMode,
  isLoading,
  onFetchLogs,
  onClearLogs,
  onClose,
  textMain,
  borderMain,
  bgSecondary,
  t,
}: DebugLogsHeaderProps) => (
  <div
    className={`flex items-center justify-between px-6 py-4 border-b ${borderMain} ${bgSecondary}`}
  >
    <div className="flex items-center gap-3">
      <div className="p-2 bg-blue-500/10 rounded-lg">
        <Bug className="text-blue-500" size={20} />
      </div>
      <div>
        <h2 id="debug-logs-title" className={`text-lg font-bold ${textMain}`}>
          {t('LLM Communication Logs')}
        </h2>
        <p className="text-xs text-brand-gray-500">
          {t('Debug view for all LLM requests and responses')}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center rounded-lg border ${borderMain} overflow-hidden mr-2`}
      >
        <button
          onClick={(): void => setStreamMode('aggregated')}
          className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
            streamMode === 'aggregated'
              ? 'bg-blue-500 text-white'
              : `${bgSecondary} ${textMain} hover:bg-brand-gray-500/10`
          }`}
          title={t('Aggregated View')}
        >
          <Layers size={14} /> {t('Aggregated')}
        </button>
        <button
          onClick={(): void => setStreamMode('chunks')}
          className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
            streamMode === 'chunks'
              ? 'bg-blue-500 text-white'
              : `${bgSecondary} ${textMain} hover:bg-brand-gray-500/10`
          }`}
          title={t('Chunks View')}
        >
          <List size={14} /> {t('Chunks')}
        </button>
      </div>
      <button
        onClick={onFetchLogs}
        disabled={isLoading}
        className={`p-2 rounded-lg hover:bg-brand-gray-500/10 transition-colors ${
          isLoading ? 'animate-spin' : ''
        }`}
        title={t('Refresh Logs')}
      >
        <RefreshCw size={18} className="text-brand-gray-500" />
      </button>
      <button
        onClick={onClearLogs}
        className="p-2 rounded-lg hover:bg-red-500/10 transition-colors group"
        title={t('Clear Logs')}
      >
        <Trash2 size={18} className="text-brand-gray-500 group-hover:text-red-500" />
      </button>
      <div className={`w-px h-6 mx-2 ${borderMain}`} />
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-brand-gray-500/10 transition-colors"
        title={t('Close')}
      >
        <X size={20} className="text-brand-gray-500" />
      </button>
    </div>
  </div>
);

interface StreamingAggregatedViewProps {
  response: NonNullable<LogEntry['response']>;
  theme: AppTheme;
  isLight: boolean;
  borderMain: string;
  t: (key: string) => string;
}

const StreamingAggregatedView: React.FC<StreamingAggregatedViewProps> = ({
  response,
  theme,
  isLight,
  borderMain,
  t,
}: StreamingAggregatedViewProps) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <span className="text-blue-400">{t('status_code')}:</span> {response.status_code}
    </div>
    {Boolean(response.error) && (
      <div className="space-y-1">
        <span className="text-red-400">{t('error')}:</span>
        <div className="mt-1 p-2 rounded border border-red-500/30 bg-red-500/5 text-red-500 whitespace-pre-wrap font-sans text-sm">
          {typeof response.error === 'string'
            ? response.error
            : JSON.stringify(response.error, null, 2)}
        </div>
      </div>
    )}
    {response.thinking && (
      <div className="space-y-1">
        <span className="text-blue-400">{t('thinking')}:</span>
        <div className="mt-1 p-2 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 whitespace-pre-wrap font-sans text-sm italic">
          {response.thinking}
        </div>
      </div>
    )}
    <div className="space-y-1">
      <span className="text-blue-400">{t('full_content')}:</span>
      <div
        className={`mt-1 p-2 rounded border ${borderMain} whitespace-pre-wrap font-sans text-sm`}
      >
        {response.full_content}
      </div>
    </div>
    {response.tool_calls && (
      <div className="space-y-1">
        <span className="text-blue-400">{t('tool_calls')}:</span>
        <div className="mt-1">
          <JsonView data={response.tool_calls} theme={theme} />
        </div>
      </div>
    )}
    <div className="space-y-1">
      <span className="text-blue-400">{t('metadata')}:</span>
      <JsonView
        data={{ chunks_count: response.chunks?.length, streaming: true }}
        theme={theme}
      />
    </div>
    <div
      className={`p-3 rounded-lg overflow-x-auto ${
        isLight ? 'bg-brand-gray-100' : 'bg-brand-gray-900'
      }`}
    />
  </div>
);

interface DebugLogEntryDetailsProps {
  log: LogEntry;
  streamMode: 'chunks' | 'aggregated';
  theme: AppTheme;
  isLight: boolean;
  borderMain: string;
  t: (key: string) => string;
}

const DebugLogEntryDetails: React.FC<DebugLogEntryDetailsProps> = ({
  log,
  streamMode,
  theme,
  isLight,
  borderMain,
  t,
}: DebugLogEntryDetailsProps) => {
  const codeBlockBg = isLight ? 'bg-brand-gray-100' : 'bg-brand-gray-900';
  const isStreaming = log.response?.streaming === true;
  return (
    <div className={`p-4 border-t ${borderMain} space-y-4 font-mono text-xs`}>
      {log.caller_id && (
        <div className="space-y-2">
          <h4 className="text-brand-gray-500 uppercase tracking-wider text-[10px] font-bold">
            {t('Caller')}
          </h4>
          <div className={`p-3 rounded-lg overflow-x-auto ${codeBlockBg}`}>
            <div className="text-blue-400">
              {log.caller_id} ({t(getCallerOrigin(log.caller_id))})
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h4 className="text-brand-gray-500 uppercase tracking-wider text-[10px] font-bold">
          {t('Request')}
        </h4>
        <div className={`p-3 rounded-lg overflow-x-auto ${codeBlockBg}`}>
          <JsonView data={log.request} theme={theme} />
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="text-brand-gray-500 uppercase tracking-wider text-[10px] font-bold">
          {t('Response')}
        </h4>
        <div className={`p-3 rounded-lg overflow-x-auto ${codeBlockBg}`}>
          {isStreaming && streamMode === 'aggregated' && log.response ? (
            <StreamingAggregatedView
              response={log.response}
              theme={theme}
              isLight={isLight}
              borderMain={borderMain}
              t={t}
            />
          ) : (
            <JsonView data={log.response} theme={theme} />
          )}
        </div>
      </div>
    </div>
  );
};

interface DebugLogEntryCardProps {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  streamMode: 'chunks' | 'aggregated';
  theme: AppTheme;
  isLight: boolean;
  textMain: string;
  borderMain: string;
  bgSecondary: string;
  t: (key: string) => string;
}

const DebugLogEntryCard: React.FC<DebugLogEntryCardProps> = ({
  log,
  isExpanded,
  onToggle,
  streamMode,
  theme,
  isLight,
  textMain,
  borderMain,
  bgSecondary,
  t,
}: DebugLogEntryCardProps) => {
  // Pre-compute optional chains so they don't add to JSX complexity
  const requestMethod = log.request?.method;
  const requestUrl = log.request ? getLastUrlSegment(log.request.url) : '';
  const statusCode = log.response?.status_code;
  const methodClass =
    requestMethod === 'POST'
      ? 'bg-green-500/10 text-green-500'
      : 'bg-blue-500/10 text-blue-500';
  const modelTypeClass =
    log.model_type === 'EDITING'
      ? 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20'
      : log.model_type === 'WRITING'
        ? 'bg-violet-500/10 text-violet-500 border-violet-500/20'
        : 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  const statusCodeClass =
    statusCode != null && statusCode >= 200 && statusCode < 300
      ? 'bg-green-500/10 text-green-500'
      : 'bg-red-500/10 text-red-500';

  return (
    <div
      className={`border rounded-lg overflow-hidden ${borderMain} ${
        isExpanded ? 'ring-1 ring-blue-500/30' : ''
      }`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 hover:bg-brand-gray-500/5 transition-colors ${
          isExpanded ? bgSecondary : ''
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
          <button
            type="button"
            className="flex items-center gap-4 min-w-0 flex-1 sm:max-w-[75%] text-left"
            onClick={onToggle}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
              {requestMethod && (
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${methodClass}`}
                >
                  {requestMethod}
                </span>
              )}
              {log.model_type && (
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded border ${modelTypeClass}`}
                >
                  {log.model_type}
                </span>
              )}
              <span className={`text-sm font-medium truncate ${textMain}`}>
                {requestUrl}
              </span>
              {statusCode != null && (
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${statusCodeClass}`}
                >
                  {statusCode}
                </span>
              )}
            </div>
          </button>
          <div className="w-full sm:w-[36%] text-right flex flex-wrap items-center justify-end gap-3 text-[10px] text-brand-gray-500 font-mono">
            {log.caller_id && (
              <span className="truncate">
                {t('Caller')}: {log.caller_id} ({t(getCallerOrigin(log.caller_id))})
              </span>
            )}
            <span className="truncate">
              {t('Start')}: {new Date(log.timestamp_start).toLocaleTimeString()}
            </span>
            {log.timestamp_end && (
              <span className="truncate">
                {t('End')}: {new Date(log.timestamp_end).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <DebugLogEntryDetails
          log={log}
          streamMode={streamMode}
          theme={theme}
          isLight={isLight}
          borderMain={borderMain}
          t={t}
        />
      )}
    </div>
  );
};

const getLastUrlSegment = (url: string): string => url.split('/').pop() ?? '';

// ─── Main component ──────────────────────────────────────────────────────────

export const DebugLogs: React.FC<DebugLogsProps> = ({
  isOpen,
  onClose,
  theme,
}: DebugLogsProps): React.ReactElement | null => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [streamMode, setStreamMode] = useState<'chunks' | 'aggregated'>('aggregated');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, dialogRef, onClose);

  const { isLight } = useThemeClasses();
  const confirm = useConfirm();
  const bgMain = isLight ? 'bg-white' : 'bg-brand-gray-950';
  const textMain = isLight ? 'text-brand-gray-900' : 'text-brand-gray-100';
  const borderMain = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const bgSecondary = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-900';

  const fetchLogs = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await api.debug.getLogs();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (error) {
      console.error(t('Failed to fetch debug logs:'), error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = async (): Promise<void> => {
    if (!(await confirm(t('Are you sure you want to clear all logs?')))) return;
    try {
      await api.debug.clearLogs();
      setLogs([]);
    } catch (error) {
      console.error(t('Failed to clear debug logs:'), error);
    }
  };

  const toggleExpand = (id: string): void => {
    setExpandedLogs((prev: Record<string, boolean>): { [x: string]: boolean } => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect((): void => {
    if (isOpen) fetchLogs();
  }, [isOpen]);

  useEffect((): (() => void) | undefined => {
    if (isOpen && logs.length > 0) {
      const timeoutId = setTimeout((): void => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
      return (): void => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isOpen, logs.length]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/50 backdrop-blur-sm p-4 md:p-8"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-logs-title"
        className={`flex-1 flex flex-col rounded-xl shadow-2xl overflow-hidden border ${borderMain} ${bgMain}`}
      >
        <DebugLogsHeader
          streamMode={streamMode}
          setStreamMode={setStreamMode}
          isLoading={isLoading}
          onFetchLogs={fetchLogs}
          onClearLogs={clearLogs}
          onClose={onClose}
          textMain={textMain}
          borderMain={borderMain}
          bgSecondary={bgSecondary}
          t={t}
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-brand-gray-500 space-y-4">
              <Bug size={48} className="opacity-20" />
              <p>{t('No LLM communications logged yet.')}</p>
            </div>
          ) : (
            logs.map((log: LogEntry, idx: number) => (
              <DebugLogEntryCard
                key={`${log.id ?? 'log'}-${idx}`}
                log={log}
                isExpanded={expandedLogs[log.id]}
                onToggle={(): void => toggleExpand(log.id)}
                streamMode={streamMode}
                theme={theme}
                isLight={isLight}
                textMain={textMain}
                borderMain={borderMain}
                bgSecondary={bgSecondary}
                t={t}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
