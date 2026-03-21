// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use chapter suggestions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import {
  Dispatch,
  SetStateAction,
  useState,
  useEffect,
  useRef,
  startTransition,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ChatMessage, Chapter, LLMConfig, StoryState, ViewMode } from '../../types';
import { generateContinuations } from '../../services/openaiService';
import { computeContentWithSeparator } from '../../utils/textUtils';
import { api } from '../../services/api';
import { setupMountedRefLifecycle } from '../../utils/mountedRef';

type UseChapterSuggestionsParams = {
  currentChapter?: Chapter;
  currentChapterId: string | null;
  story: StoryState;
  systemPrompt: string;
  activeWritingConfig: LLMConfig;
  isWritingAvailable: boolean;
  updateChapter: (id: string, partial: Partial<Chapter>) => Promise<void>;
  viewMode: ViewMode;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  getErrorMessage: (error: unknown, fallback: string) => string;
};

export function useChapterSuggestions({
  currentChapter,
  currentChapterId,
  story,
  systemPrompt,
  activeWritingConfig,
  isWritingAvailable,
  updateChapter,
  viewMode,
  setChatMessages,
  getErrorMessage,
}: UseChapterSuggestionsParams) {
  const [continuations, setContinuations] = useState<string[]>([]);
  // ids of sourcebook entries currently checked (suggested by model or user)
  const [checkedEntries, setCheckedEntries] = useState<Set<string>>(new Set());
  const [isAutoSourcebookSelectionEnabled, setIsAutoSourcebookSelectionEnabled] =
    useState(() => {
      const saved = localStorage.getItem('aq_auto_sourcebook_selection');
      return saved !== null ? saved === 'true' : true;
    });
  const [isSourcebookSelectionRunning, setIsSourcebookSelectionRunning] =
    useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestionMode, setIsSuggestionMode] = useState(false);
  const [suggestCursor, setSuggestCursor] = useState<number | null>(null);
  const [suggestUndoStack, setSuggestUndoStack] = useState<
    Array<{ content: string; cursor: number }>
  >([]);
  const autoSelectionEnabledRef = useRef(isAutoSourcebookSelectionEnabled);
  const relevanceInFlightRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => setupMountedRefLifecycle(isMountedRef), []);

  useEffect(() => {
    autoSelectionEnabledRef.current = isAutoSourcebookSelectionEnabled;
    localStorage.setItem(
      'aq_auto_sourcebook_selection',
      isAutoSourcebookSelectionEnabled.toString()
    );
  }, [isAutoSourcebookSelectionEnabled]);

  const clampCursor = (cursor: number, content: string) => {
    if (!Number.isFinite(cursor)) return content.length;
    return Math.max(0, Math.min(Math.floor(cursor), content.length));
  };

  // request the backend to recompute which sourcebook entries appear
  // relevant given the provided text; results replace the current checks.
  const fetchRelevance = async (text: string) => {
    if (!currentChapterId || !autoSelectionEnabledRef.current) return;
    relevanceInFlightRef.current += 1;
    setIsSourcebookSelectionRunning(true);
    try {
      const res = await api.story.computeSourcebookRelevance(currentChapterId, text);
      if (!autoSelectionEnabledRef.current) return;
      const relevant = new Set<string>(res.relevant || []);
      setCheckedEntries(relevant);
    } catch {
      // ignore failures; relevance is a nice‑to‑have
    } finally {
      relevanceInFlightRef.current = Math.max(0, relevanceInFlightRef.current - 1);
      if (relevanceInFlightRef.current === 0) {
        setIsSourcebookSelectionRunning(false);
      }
    }
  };

  // allow user to manually override a checkbox; these will be overwritten
  // on the next model recompute triggered by text changes or suggestion
  // acceptance.
  const handleToggleEntry = (id: string, checked: boolean) => {
    setCheckedEntries((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // when chapter content changes, recompute sourcebook relevance after a
  // pause; this prevents a flood of model calls while the user types.
  useEffect(() => {
    if (!currentChapter || !isAutoSourcebookSelectionEnabled) return;
    const timer = setTimeout(() => {
      fetchRelevance(currentChapter.content);
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentChapter?.content, isAutoSourcebookSelectionEnabled]);

  const cancelSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const suggestionUpdateQueueRef = useRef<Record<number, string>>({});
  const suggestionUpdateTimerRef = useRef<number | null>(null);

  const flushSuggestionUpdates = () => {
    const queued = suggestionUpdateQueueRef.current;
    if (Object.keys(queued).length === 0) {
      suggestionUpdateTimerRef.current = null;
      return;
    }

    const updates = { ...queued };
    suggestionUpdateQueueRef.current = {};
    suggestionUpdateTimerRef.current = null;

    startTransition(() => {
      setContinuations((previous) => {
        const next = [...previous];
        for (const [idxStr, text] of Object.entries(updates)) {
          const index = Number(idxStr);
          if (next[index] !== text) {
            next[index] = text;
          }
        }
        return next;
      });
    });
  };

  const scheduleSuggestionUpdate = (index: number, text: string) => {
    suggestionUpdateQueueRef.current[index] = text;
    if (suggestionUpdateTimerRef.current === null) {
      suggestionUpdateTimerRef.current = window.setTimeout(flushSuggestionUpdates, 100);
    }
  };

  const cancelSuggestions = () => {
    cancelSignalRef.current.cancelled = true;
    cancelSignalRef.current.reader?.cancel();
    cancelSignalRef.current.reader = undefined;
    if (suggestionUpdateTimerRef.current !== null) {
      window.clearTimeout(suggestionUpdateTimerRef.current);
      suggestionUpdateTimerRef.current = null;
      suggestionUpdateQueueRef.current = {};
    }
    if (!isMountedRef.current) return;
    setIsSuggesting(false);
    setIsSuggestionMode(false);
    setContinuations([]);
  };

  const isAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === 'AbortError';

  const handleTriggerSuggestions = async (
    cursor?: number,
    contentOverride?: string,
    enableSuggestionMode: boolean = true
  ) => {
    if (!currentChapter) return;
    if (!isWritingAvailable) return;
    if (isSuggesting) return;

    const baseContent = contentOverride ?? currentChapter.content;
    const c = clampCursor(cursor ?? baseContent.length, baseContent);

    if (enableSuggestionMode) setIsSuggestionMode(true);
    setSuggestCursor(c);

    setIsSuggesting(true);
    setContinuations([]);

    cancelSignalRef.current = { cancelled: false };

    try {
      const storyContext = `Title: ${story.title}\nSummary: ${story.summary}\nTags: ${story.styleTags.join(', ')}`;
      const options = await generateContinuations(
        baseContent.slice(0, c),
        storyContext,
        systemPrompt,
        activeWritingConfig,
        currentChapter.id,
        Array.from(checkedEntries),
        {
          cancelSignal: cancelSignalRef.current,
          onSuggestionUpdate: (index, text) => {
            if (!text) return;
            scheduleSuggestionUpdate(index, text);
          },
        }
      );
      if (suggestionUpdateTimerRef.current !== null) {
        window.clearTimeout(suggestionUpdateTimerRef.current);
        suggestionUpdateTimerRef.current = null;
      }
      flushSuggestionUpdates();
      setContinuations(options);
    } catch (error: unknown) {
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'model',
        text: `Suggestion Error: ${getErrorMessage(error, 'Failed to generate suggestions')}`,
        isError: true,
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      if (isMountedRef.current) {
        setIsSuggesting(false);
      }
      cancelSignalRef.current.cancelled = true;
    }
  };

  const handleAcceptContinuation = async (text: string) => {
    if (!currentChapterId || !currentChapter) return;

    if (!text) {
      setContinuations([]);
      setIsSuggestionMode(false);
      setSuggestCursor(null);
      setSuggestUndoStack([]);
      return;
    }

    const currentContent = currentChapter.content;
    const c = clampCursor(suggestCursor ?? currentContent.length, currentContent);
    const prefix = currentContent.slice(0, c);
    const suffix = currentContent.slice(c);

    const { newContent, separator } = computeContentWithSeparator(
      prefix,
      text,
      suffix,
      viewMode
    );

    setSuggestUndoStack((prev) => [...prev, { content: currentContent, cursor: c }]);
    await updateChapter(currentChapterId, { content: newContent });

    const newCursor = c + separator.length + text.length;
    setSuggestCursor(newCursor);
    setIsSuggestionMode(true);

    // recompute relevance immediately now that the text has been committed
    await fetchRelevance(newContent);

    await handleTriggerSuggestions(newCursor, newContent, true);
  };

  const handleKeyboardSuggestionAction = async (
    action: 'trigger' | 'chooseLeft' | 'chooseRight' | 'regenerate' | 'undo' | 'exit',
    cursor?: number
  ) => {
    if (!currentChapterId || !currentChapter) return;
    if (isSuggesting && action !== 'exit') return;

    if (action === 'exit') {
      setContinuations([]);
      setIsSuggestionMode(false);
      setSuggestCursor(null);
      setSuggestUndoStack([]);
      return;
    }

    if (action === 'trigger') {
      await handleTriggerSuggestions(cursor, undefined, true);
      return;
    }

    if (action === 'chooseLeft') {
      if (continuations[0]) await handleAcceptContinuation(continuations[0]);
      return;
    }

    if (action === 'chooseRight') {
      if (continuations[1]) await handleAcceptContinuation(continuations[1]);
      return;
    }

    if (action === 'regenerate') {
      const clampedCursor = clampCursor(
        suggestCursor ?? cursor ?? currentChapter.content.length,
        currentChapter.content
      );
      await handleTriggerSuggestions(clampedCursor, undefined, true);
      return;
    }

    if (action === 'undo') {
      const last = suggestUndoStack[suggestUndoStack.length - 1];
      if (!last) return;
      const nextStack = suggestUndoStack.slice(0, -1);
      setSuggestUndoStack(nextStack);

      await updateChapter(currentChapterId, { content: last.content });
      setSuggestCursor(last.cursor);
      setIsSuggestionMode(true);
      await handleTriggerSuggestions(last.cursor, last.content, true);
    }
  };

  return {
    continuations,
    isSuggesting,
    isSuggestionMode,
    suggestCursor,
    handleTriggerSuggestions,
    handleKeyboardSuggestionAction,
    handleAcceptContinuation,
    cancelSuggestions,
    checkedEntries,
    handleToggleEntry,
    isAutoSourcebookSelectionEnabled,
    setIsAutoSourcebookSelectionEnabled,
    isSourcebookSelectionRunning,
  };
}
