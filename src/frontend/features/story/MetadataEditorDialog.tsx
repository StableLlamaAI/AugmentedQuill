// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the metadata editor dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useEffect, useRef } from 'react';
import { MetadataParams, computeSyncUpdates } from './metadataSync';
import { useFocusTrap } from '../layout/useFocusTrap';
import { createPortal } from 'react-dom';
import {
  Maximize2,
  Minimize2,
  FileText,
  StickyNote,
  Lock,
  AlertTriangle,
  Loader2,
  Check,
  Trash2,
  Wand2,
  RefreshCw,
  PenLine,
  ChevronDown,
  ChevronRight,
  Undo,
  Redo,
  Brain,
  MessageSquareDiff,
} from 'lucide-react';
import { Conflict, AppTheme } from '../../types';
import { Button } from '../../components/ui/Button';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { useSearchHighlight } from '../search/SearchHighlightContext';
import { useMetadataDialogHistory } from './useMetadataDialogHistory';

interface Props {
  type: 'story' | 'book' | 'chapter';
  initialData: MetadataParams;
  baseline?: MetadataParams;
  onSave: (data: MetadataParams) => Promise<void>;
  onClose: () => void;
  title: string;
  theme?: AppTheme;
  languages?: string[];
  language?: string;
  spellCheck?: boolean;
  allowConflicts?: boolean;
  primarySourceLabel?: string;
  primarySourceAvailable?: boolean;
  initialTab?: 'summary' | 'notes' | 'private' | 'conflicts';
  onAiGenerate?: (
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void,
    source?: 'chapter' | 'notes'
  ) => Promise<string | undefined>;
  aiDisabledReason?: string;
}

export function MetadataEditorDialog({
  type,
  initialData,
  baseline,
  onSave,
  onClose,
  title,
  theme = 'mixed',
  languages = [],
  language,
  spellCheck = true,
  allowConflicts = false,
  primarySourceLabel = 'Chapters',
  primarySourceAvailable = true,
  initialTab,
  onAiGenerate,
  aiDisabledReason,
}: Props) {
  const [data, setData] = useState<MetadataParams>(initialData);
  const effectiveLanguage = data.language || language || 'en';
  const [activeTab, setActiveTab] = useState<
    'summary' | 'notes' | 'private' | 'conflicts'
  >(initialTab || 'summary');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef, onClose);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [showDiff, setShowDiff] = useState(true);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const { getRanges } = useSearchHighlight();
  const summaryHighlightRanges = getRanges('story_metadata', 'story', 'story_summary');
  const notesHighlightRanges = getRanges('story_metadata', 'story', 'notes');
  const privateNotesHighlightRanges = getRanges(
    'story_metadata',
    'story',
    'private_notes'
  );
  const getConflictRanges = (index: number, field: 'description' | 'resolution') =>
    getRanges('story_metadata', 'story', `conflicts[${index}].${field}`);

  const normalizeConflict = (value: Partial<Conflict> | undefined | null): Conflict => {
    return {
      id: value?.id || crypto.randomUUID(),
      description: value?.description || '',
      resolution: value?.resolution || 'TBD',
    };
  };

  const normalizeMetadataParams = (value: MetadataParams): MetadataParams => ({
    ...value,
    conflicts: (value.conflicts || []).map((c) => normalizeConflict(c)),
  });

  const diffFieldsEqual = (a: MetadataParams, b: MetadataParams): boolean =>
    (a.summary || '') === (b.summary || '') &&
    (a.notes || '') === (b.notes || '') &&
    (a.private_notes || '') === (b.private_notes || '') &&
    JSON.stringify(a.conflicts || []) === JSON.stringify(b.conflicts || []);

  const [conflicts, setConflicts] = useState<Conflict[]>(
    (initialData.conflicts || []).map((c) => normalizeConflict(c))
  );

  const { history, historyIndex, restoreMetadataHistory } = useMetadataDialogHistory({
    data,
    initialData,
    baseline,
    normalizeMetadataParams,
    diffFieldsEqual,
    setData,
    setConflicts,
  });
  // Track latest data in a ref so the baselineData effect can read it
  // without adding `data` to its dependency array (which would cause the
  // effect to re-run on every keystroke and reset diff highlights).
  const dataRef = useRef<MetadataParams>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const [baselineData, setBaselineData] = useState<MetadataParams>(() => {
    const raw = baseline || initialData;
    return {
      ...raw,
      conflicts: (raw.conflicts || []).map((c) => normalizeConflict(c)),
    };
  });

  useEffect(() => {
    const normalizedBaseline = baseline
      ? {
          ...baseline,
          conflicts: (baseline.conflicts || []).map((c) => normalizeConflict(c)),
        }
      : null;

    if (normalizedBaseline) {
      setBaselineData((prev) => {
        const currentData = dataRef.current;
        const isSaveRoundTrip =
          diffFieldsEqual(normalizedBaseline, currentData) &&
          !diffFieldsEqual(prev, currentData);

        if (isSaveRoundTrip) {
          return prev;
        }

        if (diffFieldsEqual(prev, normalizedBaseline)) {
          return prev;
        }

        return normalizedBaseline;
      });
      return;
    }

    setBaselineData((prev) => {
      // If the user has explicitly cleared a diff in this session, we don't
      // want to immediately restore the baseline when initialData updates
      // (e.g. from an autosave).
      const currentData = dataRef.current;
      const next: MetadataParams = {
        ...initialData,
        conflicts: (initialData.conflicts || []).map((c) => normalizeConflict(c)),
      };

      // Update baseline fields only if they haven't been "modified" away from
      // the baseline (i.e., if no diff is currently being shown).
      return {
        ...next,
        summary: prev.summary !== currentData.summary ? prev.summary : next.summary,
        notes: prev.notes !== currentData.notes ? prev.notes : next.notes,
        private_notes:
          prev.private_notes !== currentData.private_notes
            ? prev.private_notes
            : next.private_notes,
        // Conflicts diffing is more complex, but we basically want to preserve the
        // diff state if the current view doesn't match the current baseline.
        conflicts:
          JSON.stringify(prev.conflicts) !== JSON.stringify(currentData.conflicts)
            ? prev.conflicts
            : next.conflicts,
      };
    });
  }, [initialData, baseline]);

  // Store the latest callback reference so debounced saves use current props.
  const onSaveRef = useRef(onSave);
  const isFirstRun = useRef(true);
  const lastSavedDataRef = useRef<MetadataParams>(initialData);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const prevInitialRef = useRef<MetadataParams>(initialData);

  useEffect(() => {
    const updates = computeSyncUpdates(prevInitialRef.current, initialData, data);
    prevInitialRef.current = initialData;

    if (Object.keys(updates).length > 0) {
      setData((prev) => ({ ...prev, ...updates }));
      if (updates.conflicts) {
        setConflicts(updates.conflicts.map((conflict) => normalizeConflict(conflict)));
      }
      lastSavedDataRef.current = {
        ...lastSavedDataRef.current,
        ...updates,
      };
    }
  }, [initialData]);

  useEffect(() => {
    setData((prev) => {
      // Avoid creating a new object reference (and thus a spurious debounce
      // push) when the conflicts content is already in sync — e.g. right after
      // restoreMetadataHistory sets both data and conflicts simultaneously.
      if (JSON.stringify(prev.conflicts) === JSON.stringify(conflicts)) return prev;
      return { ...prev, conflicts };
    });
  }, [conflicts]);

  // Debounced autosave reduces write pressure while preserving quick feedback.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const lastSaved = lastSavedDataRef.current;
      const isTitleSame = (data.title || '') === (lastSaved.title || '');
      const isSummarySame = (data.summary || '') === (lastSaved.summary || '');
      const isNotesSame = (data.notes || '') === (lastSaved.notes || '');
      const isPrivateNotesSame =
        (data.private_notes || '') === (lastSaved.private_notes || '');
      const isTagsSame =
        JSON.stringify(data.tags || []) === JSON.stringify(lastSaved.tags || []);
      const isConflictsSame =
        JSON.stringify(data.conflicts || []) ===
        JSON.stringify(lastSaved.conflicts || []);

      if (
        isTitleSame &&
        isSummarySame &&
        isNotesSame &&
        isTagsSame &&
        isPrivateNotesSame &&
        isConflictsSame
      ) {
        setSaveStatus('saved');
        return;
      }

      try {
        await onSaveRef.current(data);
        lastSavedDataRef.current = data;
        setSaveStatus('saved');
      } catch (e) {
        console.error(e);
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [data]);

  const handleClose = async () => {
    // Best-effort flush on close prevents losing the latest unsaved keystrokes.
    if (saveStatus !== 'saved') {
      try {
        await onSave(data);
      } catch (e) {
        console.error('Failed to save on close', e);
      }
    }
    onClose();
  };

  const addConflict = () => {
    const newConflict: Conflict = {
      id: crypto.randomUUID(),
      description: '',
      resolution: '',
    };
    setConflicts([...conflicts, newConflict]);
    // Anchor the new conflict in baselineData immediately so it is NOT
    // treated as an LLM-added "new" conflict in the diff view.
    setBaselineData((prev) => ({
      ...prev,
      conflicts: [...(prev.conflicts || []), newConflict],
    }));
  };

  const deleteConflict = (id: string) => {
    setConflicts(conflicts.filter((c) => c.id !== id));
  };

  const updateConflict = (id: string, field: keyof Conflict, value: string) => {
    setConflicts(conflicts.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const moveConflict = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newConfigs = [...conflicts];
      [newConfigs[index], newConfigs[index - 1]] = [
        newConfigs[index - 1],
        newConfigs[index],
      ];
      setConflicts(newConfigs);
    } else if (direction === 'down' && index < conflicts.length - 1) {
      const newConfigs = [...conflicts];
      [newConfigs[index], newConfigs[index + 1]] = [
        newConfigs[index + 1],
        newConfigs[index],
      ];
      setConflicts(newConfigs);
    }
  };

  const [aiWriteSource, setAiWriteSource] = useState<'chapter' | 'notes'>('chapter');

  const handleAiGenerate = async (
    action: 'write' | 'update' | 'rewrite',
    source: 'chapter' | 'notes' = 'chapter'
  ) => {
    if (aiDisabledReason) return;
    if (!onAiGenerate) return;
    setIsAiGenerating(true);
    setAiThinking(null);
    setIsThinkingExpanded(true);
    try {
      // Stream partial text into the editor so users can intervene early.
      const sourceText = source === 'notes' ? data.notes || '' : undefined;
      // Throttle progress updates to avoid triggering React's maximum update
      // depth limit (50 consecutive commits) when the LLM streams many tokens
      // per second.
      let lastProgressAt = 0;
      const result = await onAiGenerate(
        action,
        (partialText) => {
          const now = Date.now();
          if (now - lastProgressAt < 50) return;
          lastProgressAt = now;
          setData((prev) => ({ ...prev, summary: partialText }));
        },
        sourceText,
        (thinking) => {
          setAiThinking(thinking);
        },
        source
      );
      if (result) {
        setData((prev) => ({ ...prev, summary: result }));
      }
    } catch (e) {
      console.error('AI Generation failed', e);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const isDarkMode = theme === 'dark' || theme === 'mixed';
  const hasAiSummaryControls = !!onAiGenerate || !!aiDisabledReason;
  const primarySourceTitle = `from ${primarySourceLabel}`;
  const regeneratePrimaryTitle = `Regenerate summary from ${primarySourceLabel}`;
  const updatePrimaryTitle = `Update existing summary with facts from ${primarySourceLabel}`;
  const rewritePrimaryTitle = `Rewrite existing summary using ${primarySourceLabel} style`;
  const hasNotesSource = !!data.notes?.trim();
  const hasPrimarySource = !!primarySourceAvailable;

  useEffect(() => {
    if (!hasPrimarySource && hasNotesSource && aiWriteSource !== 'notes') {
      setAiWriteSource('notes');
    } else if (!hasNotesSource && hasPrimarySource && aiWriteSource !== 'chapter') {
      setAiWriteSource('chapter');
    }
  }, [hasPrimarySource, hasNotesSource, aiWriteSource]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleClose]);

  const modalContent = (
    <div
      ref={dialogRef}
      role="none"
      className={isDarkMode ? 'dark' : ''}
      onKeyDown={(e) => {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        if (!isCtrlOrMeta) return;
        const isUndo = !e.shiftKey && e.key === 'z';
        const isRedo = (e.shiftKey && e.key === 'z') || e.key === 'y';
        if (!isUndo && !isRedo) return;
        // If a child handler (e.g. CodeMirror's historyKeymap) already handled
        // the keystroke and called preventDefault, respect that and back off.
        // This covers the case where the user has typed text inside a conflict
        // field and wants to undo their own keystrokes via Ctrl+Z — CM handles
        // those fine and we should not interfere.  But when CM has nothing left
        // to undo (empty undo stack — the normal case for LLM-assigned values
        // because we tag those dispatches with addToHistory=false), CM does NOT
        // call preventDefault, so the event reaches here and we perform the
        // dialog-level undo/redo as expected.
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (isUndo) restoreMetadataHistory(historyIndex - 1);
        else restoreMetadataHistory(historyIndex + 1);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-dialog-title"
        tabIndex={-1}
        className={`${
          isFullscreen
            ? 'fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/50'
            : 'fixed top-14 bottom-0 z-[60] bg-white dark:bg-brand-gray-900 border-r dark:border-brand-gray-800 flex flex-col'
        }`}
        style={!isFullscreen ? { width: 'var(--sidebar-width)', left: 0 } : {}}
      >
        <div
          className={`flex flex-col pointer-events-auto ${
            isFullscreen
              ? 'w-[98vw] h-[95vh] bg-white dark:bg-brand-gray-900 text-brand-gray-800 dark:text-brand-gray-400 rounded-lg shadow-xl border dark:border-brand-gray-800'
              : 'w-full h-full text-brand-gray-800 dark:text-brand-gray-400'
          }`}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b dark:border-brand-gray-800">
            <div className="flex items-center gap-3">
              <h2
                id="metadata-dialog-title"
                className="text-base font-semibold dark:text-brand-gray-300"
              >
                {title}
              </h2>
              <div className="text-xs font-mono" role="status" aria-live="polite">
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-brand-500">
                    <Loader2 size={12} className="animate-spin" /> Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Check size={12} /> Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-red-500">Error saving</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  historyIndex > 0 && restoreMetadataHistory(historyIndex - 1)
                }
                disabled={historyIndex === 0}
                className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
                title="Undo"
                aria-label="Undo metadata editor changes"
              >
                <Undo size={16} />
              </button>
              <button
                onClick={() =>
                  historyIndex < history.length - 1 &&
                  restoreMetadataHistory(historyIndex + 1)
                }
                disabled={historyIndex >= history.length - 1}
                className="text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
                title="Redo"
                aria-label="Redo metadata editor changes"
              >
                <Redo size={16} />
              </button>
              <button
                onClick={() => setShowDiff(!showDiff)}
                className={`${showDiff ? 'text-brand-500 hover:text-brand-600' : 'text-gray-400 hover:text-gray-600 dark:text-brand-gray-600 dark:hover:text-brand-gray-400'}`}
                title={showDiff ? 'Hide diff highlights' : 'Show diff highlights'}
                aria-label="Toggle diff view"
                aria-pressed={showDiff}
              >
                <MessageSquareDiff size={16} />
              </button>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-gray-500 hover:text-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
                title={
                  isFullscreen ? 'Switch to Sidebar View' : 'Switch to Full Screen'
                }
                aria-label={
                  isFullscreen ? 'Switch to sidebar view' : 'Switch to full screen view'
                }
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
                title="Close dialog"
                aria-label="Close metadata editor dialog"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Title Editor */}
            <div className="p-4 border-b dark:border-brand-gray-800 space-y-2 flex-shrink-0">
              <label
                htmlFor="metadata-dialog-title-input"
                className="block text-sm font-medium dark:text-brand-gray-400"
              >
                Title
              </label>
              <input
                id="metadata-dialog-title-input"
                value={data.title || ''}
                lang={data.language || 'en'}
                spellCheck={true}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                className="w-full p-2 border rounded dark:bg-brand-gray-950 dark:border-brand-gray-800 text-brand-gray-900 dark:text-brand-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-sans text-sm"
              />

              {type === 'story' && (
                <>
                  <div className="flex items-start gap-3 mt-3">
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium dark:text-brand-gray-400">
                        Style Tags
                      </label>
                      <input
                        value={data.tags ? data.tags.join(', ') : ''}
                        lang={data.language || 'en'}
                        spellCheck={true}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Preserve user-entered ordering; normalization happens server-side.
                          const tags = val.split(',').map((s) => s.trimStart());
                          setData({ ...data, tags: tags });
                        }}
                        className="w-full p-2 border rounded dark:bg-brand-gray-950 dark:border-brand-gray-800 text-brand-gray-900 dark:text-brand-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-sans text-sm"
                        placeholder="e.g. Noir, Sci-Fi, First-Person"
                      />
                    </div>
                    {languages && (
                      <div className="flex-shrink-0 w-24">
                        <label className="block text-sm font-medium dark:text-brand-gray-400 text-right">
                          Lang
                        </label>
                        <select
                          value={data.language || ''}
                          onChange={(e) =>
                            setData({ ...data, language: e.target.value })
                          }
                          className="w-full p-2 border rounded dark:bg-brand-gray-950 dark:border-brand-gray-800 text-brand-gray-900 dark:text-brand-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-sans text-sm"
                        >
                          {languages.map((lng) => (
                            <option key={lng} value={lng}>
                              {lng.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-brand-gray-500 dark:text-brand-gray-500 mt-2">
                    Style tags guide the WRITING model’s voice and the EDITING model’s
                    tone checks. Keep them short, specific, and stable.
                  </p>
                </>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b dark:border-brand-gray-800 overflow-x-auto flex-shrink-0">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'summary'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <FileText size={16} />
                Summary
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'notes'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <StickyNote size={16} />
                Notes
              </button>
              <button
                onClick={() => setActiveTab('private')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'private'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <Lock size={16} />
                Private Notes
              </button>
              {(type === 'chapter' || allowConflicts) && (
                <button
                  onClick={() => setActiveTab('conflicts')}
                  className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                    activeTab === 'conflicts'
                      ? 'border-b-2 border-primary text-primary font-semibold'
                      : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                  }`}
                >
                  <AlertTriangle size={16} />
                  Conflicts
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 p-4 min-h-[500px]">
              {activeTab === 'summary' && (
                <div className="h-full flex flex-col gap-2">
                  <div className="text-sm text-brand-gray-500 mb-1">
                    This summary is part of the story logic that CHAT maintains and the
                    other models read as context.
                  </div>
                  {hasAiSummaryControls && (
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          {aiThinking && (
                            <button
                              onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 dark:bg-brand-500/20 dark:text-brand-400 dark:hover:bg-brand-500/30"
                              title={
                                isThinkingExpanded ? 'Hide thinking' : 'Show thinking'
                              }
                            >
                              <Brain
                                size={14}
                                className={isAiGenerating ? 'animate-pulse' : ''}
                              />
                              <span>Thinking</span>
                              {isThinkingExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          )}
                          {isAiGenerating && !aiThinking && (
                            <span className="text-xs text-brand-500 flex items-center gap-1 animate-in fade-in">
                              <Loader2 size={12} className="animate-spin" />{' '}
                              Generating...
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 justify-end ml-auto">
                          {/* Source Controls */}
                          {!data.summary ? (
                            <div
                              className={`flex items-center rounded-md p-1 space-x-1 border ${
                                theme === 'light'
                                  ? 'bg-brand-gray-100 border-brand-gray-200'
                                  : 'bg-brand-gray-800 border-brand-gray-700'
                              }`}
                              role="group"
                              aria-label="AI summary generation"
                            >
                              <span
                                className={`inline-flex items-center justify-center rounded-md text-xs h-6 font-bold uppercase px-3 py-1.5 cursor-default pointer-events-none select-none ${
                                  aiWriteSource === 'chapter'
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:hover:text-brand-gray-300'
                                }`}
                                aria-hidden="true"
                              >
                                AI Write
                              </span>
                              <div
                                className={`w-px h-4 ${
                                  theme === 'light'
                                    ? 'bg-brand-gray-300'
                                    : 'bg-brand-gray-700'
                                }`}
                                role="presentation"
                              />
                              <Button
                                theme={theme}
                                variant="ghost"
                                size="sm"
                                icon={<Wand2 size={12} />}
                                onClick={() => {
                                  setAiWriteSource('chapter');
                                  handleAiGenerate('write', 'chapter');
                                }}
                                disabled={
                                  !hasPrimarySource ||
                                  isAiGenerating ||
                                  !!aiDisabledReason
                                }
                                className="text-xs h-6"
                                title={
                                  hasPrimarySource
                                    ? `Generate summary ${primarySourceTitle}`
                                    : `${primarySourceLabel} text not available`
                                }
                                aria-label={`Generate summary ${primarySourceTitle}`}
                              >
                                {primarySourceTitle}
                              </Button>
                              <Button
                                theme={theme}
                                variant="ghost"
                                size="sm"
                                icon={<StickyNote size={12} />}
                                onClick={() => {
                                  setAiWriteSource('notes');
                                  handleAiGenerate('write', 'notes');
                                }}
                                disabled={
                                  !hasNotesSource ||
                                  isAiGenerating ||
                                  !!aiDisabledReason
                                }
                                className="text-xs h-6"
                                title={
                                  hasNotesSource
                                    ? 'Generate summary from Notes'
                                    : 'Add notes to enable this source'
                                }
                                aria-label="Generate summary from Notes"
                              >
                                from Notes
                              </Button>
                            </div>
                          ) : (
                            <>
                              {/* Primary Source Group */}
                              <div
                                className={`flex items-center rounded-md p-1 space-x-1 border ${
                                  theme === 'light'
                                    ? 'bg-brand-gray-100 border-brand-gray-200'
                                    : 'bg-brand-gray-800 border-brand-gray-700'
                                }`}
                                role="group"
                                aria-label={`${primarySourceLabel} summary actions`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center rounded-md text-xs h-6 font-bold uppercase px-3 py-1.5 cursor-default pointer-events-none select-none ${
                                    aiWriteSource === 'chapter'
                                      ? 'bg-primary/20 text-primary'
                                      : 'text-brand-gray-500'
                                  }`}
                                  aria-hidden="true"
                                  title={regeneratePrimaryTitle}
                                >
                                  <Wand2 size={12} className="mr-2" />
                                  {primarySourceTitle}
                                </span>
                                <div
                                  className={`w-px h-4 ${
                                    theme === 'light'
                                      ? 'bg-brand-gray-300'
                                      : 'bg-brand-gray-700'
                                  }`}
                                  role="presentation"
                                />
                                <Button
                                  theme={theme}
                                  variant="ghost"
                                  size="sm"
                                  icon={<RefreshCw size={12} />}
                                  onClick={() => {
                                    setAiWriteSource('chapter');
                                    handleAiGenerate('update', 'chapter');
                                  }}
                                  disabled={
                                    !hasPrimarySource ||
                                    isAiGenerating ||
                                    !!aiDisabledReason
                                  }
                                  className="text-xs h-6"
                                  title={
                                    hasPrimarySource
                                      ? updatePrimaryTitle
                                      : `${primarySourceLabel} text not available`
                                  }
                                  aria-label={`Update summary ${primarySourceTitle}`}
                                >
                                  Update
                                </Button>
                                <Button
                                  theme={theme}
                                  variant="ghost"
                                  size="sm"
                                  icon={<PenLine size={12} />}
                                  onClick={() => {
                                    setAiWriteSource('chapter');
                                    handleAiGenerate('rewrite', 'chapter');
                                  }}
                                  disabled={
                                    !hasPrimarySource ||
                                    isAiGenerating ||
                                    !!aiDisabledReason
                                  }
                                  className="text-xs h-6"
                                  title={
                                    hasPrimarySource
                                      ? rewritePrimaryTitle
                                      : `${primarySourceLabel} text not available`
                                  }
                                  aria-label={`Rewrite summary ${primarySourceTitle}`}
                                >
                                  Rewrite
                                </Button>
                              </div>

                              {/* Notes Group */}
                              <div
                                className={`flex items-center rounded-md p-1 space-x-1 border ${
                                  theme === 'light'
                                    ? 'bg-brand-gray-100 border-brand-gray-200'
                                    : 'bg-brand-gray-800 border-brand-gray-700'
                                }`}
                                role="group"
                                aria-label="Notes summary actions"
                              >
                                <span
                                  className={`inline-flex items-center justify-center rounded-md text-xs h-6 font-bold uppercase px-3 py-1.5 cursor-default pointer-events-none select-none ${
                                    aiWriteSource === 'notes'
                                      ? 'bg-primary/20 text-primary'
                                      : 'text-brand-gray-500'
                                  }`}
                                  aria-hidden="true"
                                  title="Regenerate summary from Notes"
                                >
                                  <StickyNote size={12} className="mr-2" />
                                  from Notes
                                </span>
                                <div
                                  className={`w-px h-4 ${
                                    theme === 'light'
                                      ? 'bg-brand-gray-300'
                                      : 'bg-brand-gray-700'
                                  }`}
                                  role="presentation"
                                />
                                <Button
                                  theme={theme}
                                  variant="ghost"
                                  size="sm"
                                  icon={<RefreshCw size={12} />}
                                  onClick={() => {
                                    setAiWriteSource('notes');
                                    handleAiGenerate('update', 'notes');
                                  }}
                                  disabled={
                                    !hasNotesSource ||
                                    isAiGenerating ||
                                    !!aiDisabledReason
                                  }
                                  className="text-xs h-6"
                                  title={
                                    hasNotesSource
                                      ? 'Update existing summary with facts from Notes'
                                      : 'Add notes to enable this source'
                                  }
                                  aria-label="Update summary from Notes"
                                >
                                  Update
                                </Button>
                                <Button
                                  theme={theme}
                                  variant="ghost"
                                  size="sm"
                                  icon={<PenLine size={12} />}
                                  onClick={() => {
                                    setAiWriteSource('notes');
                                    handleAiGenerate('rewrite', 'notes');
                                  }}
                                  disabled={
                                    !hasNotesSource ||
                                    isAiGenerating ||
                                    !!aiDisabledReason
                                  }
                                  className="text-xs h-6"
                                  title={
                                    hasNotesSource
                                      ? 'Rewrite existing summary using Notes style'
                                      : 'Add notes to enable this source'
                                  }
                                  aria-label="Rewrite summary from Notes"
                                >
                                  Rewrite
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {aiThinking && isThinkingExpanded && (
                    <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-brand-gray-50/50 dark:bg-brand-gray-800/20 border-brand-gray-200 dark:border-brand-gray-700 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-gray-500 dark:text-brand-gray-400">
                        <Brain size={12} />
                        LLM Thinking Process
                      </div>
                      <div className="text-xs font-serif leading-relaxed text-brand-gray-600 dark:text-brand-gray-400 whitespace-pre-wrap max-h-[150px] overflow-y-auto custom-scrollbar italic italic-shadow">
                        {aiThinking}
                        {isAiGenerating && (
                          <span className="inline-block w-1.5 h-3 ml-1 bg-brand-500/50 animate-pulse" />
                        )}
                      </div>
                    </div>
                  )}
                  <CodeMirrorEditor
                    value={data.summary || ''}
                    onChange={(val) => {
                      setBaselineData((prev) => ({ ...prev, summary: val }));
                      setData((prev) => ({ ...prev, summary: val }));
                    }}
                    language={effectiveLanguage}
                    spellCheck={spellCheck}
                    baselineValue={baselineData.summary}
                    showDiff={showDiff}
                    searchHighlightRanges={summaryHighlightRanges}
                    mode="markdown"
                    className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 font-sans text-sm md:text-base leading-relaxed transition-all overflow-y-auto"
                    placeholder="Write a public summary..."
                    style={{ minHeight: '300px' }}
                  />
                </div>
              )}
              {activeTab === 'notes' && (
                <div className="h-full flex flex-col">
                  <div className="text-sm text-brand-gray-500 mb-2">Visible to LLM</div>
                  <div className="text-xs text-brand-gray-500 mb-2">
                    Use notes for facts, intentions, foreshadowing, and constraints that
                    should inform CHAT, EDITING, and WRITING.
                  </div>
                  <CodeMirrorEditor
                    value={data.notes || ''}
                    onChange={(val) => {
                      setBaselineData((prev) => ({ ...prev, notes: val }));
                      setData((prev) => ({ ...prev, notes: val }));
                    }}
                    language={effectiveLanguage}
                    spellCheck={spellCheck}
                    baselineValue={baselineData.notes}
                    showDiff={showDiff}
                    searchHighlightRanges={notesHighlightRanges}
                    mode="markdown"
                    className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 font-sans text-sm md:text-base leading-relaxed transition-all overflow-y-auto"
                    placeholder="Write notes (readable by LLM)..."
                    style={{ minHeight: '300px' }}
                  />
                </div>
              )}
              {activeTab === 'private' && (
                <div className="h-full flex flex-col">
                  <div className="text-sm text-brand-gray-500 mb-2">
                    Not visible to LLM
                  </div>
                  <div className="text-xs text-brand-gray-500 mb-2">
                    Keep private reminders, spoilers, and experiments here when they
                    should stay outside model context.
                  </div>
                  <CodeMirrorEditor
                    value={data.private_notes || ''}
                    onChange={(val) => {
                      setBaselineData((prev) => ({ ...prev, private_notes: val }));
                      setData((prev) => ({ ...prev, private_notes: val }));
                    }}
                    language={effectiveLanguage}
                    spellCheck={spellCheck}
                    baselineValue={baselineData.private_notes}
                    showDiff={showDiff}
                    searchHighlightRanges={privateNotesHighlightRanges}
                    mode="markdown"
                    className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 font-sans text-sm md:text-base leading-relaxed transition-all overflow-y-auto"
                    placeholder="Write private notes (hidden from LLM)..."
                    style={{ minHeight: '300px' }}
                  />
                </div>
              )}
              {activeTab === 'conflicts' && (
                <div className="space-y-4">
                  <div className="text-sm text-brand-gray-500">
                    {allowConflicts
                      ? 'Track unresolved tensions in the story draft. CHAT can use these conflicts to maintain continuity while planning and revising the text.'
                      : 'Track unresolved tensions in story order. CHAT can use these to keep pacing and logic coherent while planning later chapters.'}
                  </div>
                  <Button onClick={addConflict} variant="secondary" theme={theme}>
                    + Add Conflict
                  </Button>
                  <div className="space-y-4">
                    {conflicts.map((c, idx) => {
                      const baselineConflict = (baselineData.conflicts || []).find(
                        (bc) => bc.id === c.id
                      );
                      // A conflict absent from the baseline was added by the LLM.
                      // Pass '' rather than undefined so CodeMirrorEditor treats
                      // its entire content as newly inserted in the diff view.
                      const isNewConflict = showDiff && baselineConflict === undefined;

                      return (
                        <div
                          key={c.id}
                          className={`border rounded-lg p-4 bg-gray-50 dark:bg-brand-gray-800/50 shadow-sm ${
                            isNewConflict
                              ? 'border-green-400 dark:border-green-700'
                              : 'dark:border-brand-gray-700'
                          }`}
                        >
                          <div className="flex justify-between mb-2">
                            <span className="font-semibold text-sm dark:text-brand-gray-300 flex items-center gap-2">
                              Conflict #{idx + 1}
                              {isNewConflict && (
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                                  New
                                </span>
                              )}
                            </span>
                            <div className="space-x-2 flex items-center">
                              <button
                                onClick={() => moveConflict(idx, 'up')}
                                disabled={idx === 0}
                                className="disabled:opacity-30 dark:text-brand-gray-500 hover:text-brand-gray-700 dark:hover:text-brand-gray-300 px-1"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveConflict(idx, 'down')}
                                disabled={idx === conflicts.length - 1}
                                className="disabled:opacity-30 dark:text-brand-gray-500 hover:text-brand-gray-700 dark:hover:text-brand-gray-300 px-1"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => deleteConflict(c.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1 ml-2"
                                title="Delete Conflict"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div
                            className={`grid gap-4 ${isFullscreen ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}
                          >
                            <div>
                              <label className="block text-xs font-medium mb-1 dark:text-brand-gray-400 uppercase tracking-wide">
                                Description
                              </label>
                              <CodeMirrorEditor
                                value={c.description}
                                onChange={(val) => {
                                  updateConflict(c.id, 'description', val);
                                  setBaselineData((prev) => ({
                                    ...prev,
                                    conflicts: (prev.conflicts || []).map((bc) =>
                                      bc.id === c.id ? { ...bc, description: val } : bc
                                    ),
                                  }));
                                }}
                                language={effectiveLanguage}
                                spellCheck={spellCheck}
                                baselineValue={
                                  isNewConflict ? '' : baselineConflict?.description
                                }
                                showDiff={showDiff}
                                searchHighlightRanges={getConflictRanges(
                                  idx,
                                  'description'
                                )}
                                mode="markdown"
                                className="w-full p-3 border rounded-lg dark:bg-brand-gray-950 dark:border-brand-gray-800 dark:text-brand-gray-300 text-sm font-sans transition-all"
                                placeholder="Describe the conflict..."
                                style={{ minHeight: '60px' }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1 dark:text-brand-gray-400 uppercase tracking-wide">
                                Resolution Plan
                              </label>
                              <CodeMirrorEditor
                                value={c.resolution}
                                onChange={(val) => {
                                  updateConflict(c.id, 'resolution', val);
                                  setBaselineData((prev) => ({
                                    ...prev,
                                    conflicts: (prev.conflicts || []).map((bc) =>
                                      bc.id === c.id ? { ...bc, resolution: val } : bc
                                    ),
                                  }));
                                }}
                                language={effectiveLanguage}
                                spellCheck={spellCheck}
                                baselineValue={
                                  isNewConflict ? '' : baselineConflict?.resolution
                                }
                                showDiff={showDiff}
                                searchHighlightRanges={getConflictRanges(
                                  idx,
                                  'resolution'
                                )}
                                mode="markdown"
                                className="w-full p-3 border rounded-lg dark:bg-brand-gray-950 dark:border-brand-gray-800 dark:text-brand-gray-300 text-sm font-sans transition-all"
                                placeholder="How will this conflict be resolved?"
                                style={{ minHeight: '80px' }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer removed for autosave */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
