// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use chapter suggestions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, SetStateAction, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ChatMessage, Chapter, LLMConfig, StoryState, ViewMode } from '../../types';
import { generateContinuations } from '../../services/openaiService';
import { computeContentWithSeparator } from '../../utils/textUtils';
import { api } from '../../services/api';

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
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestionMode, setIsSuggestionMode] = useState(false);
  const [suggestCursor, setSuggestCursor] = useState<number | null>(null);
  const [suggestUndoStack, setSuggestUndoStack] = useState<
    Array<{ content: string; cursor: number }>
  >([]);

  const clampCursor = (cursor: number, content: string) => {
    if (!Number.isFinite(cursor)) return content.length;
    return Math.max(0, Math.min(Math.floor(cursor), content.length));
  };

  // request the backend to recompute which sourcebook entries appear
  // relevant given the provided text; results replace the current checks.
  const fetchRelevance = async (text: string) => {
    if (!currentChapterId) return;
    try {
      const res = await api.story.computeSourcebookRelevance(currentChapterId, text);
      const relevant = new Set<string>(res.relevant || []);
      setCheckedEntries(relevant);
    } catch {
      // ignore failures; relevance is a nice‑to‑have
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
    if (!currentChapter) return;
    const timer = setTimeout(() => {
      fetchRelevance(currentChapter.content);
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentChapter?.content]);

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
          onSuggestionUpdate: (index, text) => {
            if (!text) return;
            setContinuations((previous) => {
              const next = [...previous];
              if (next[index] === text) return previous;
              next[index] = text;
              return next;
            });
          },
        }
      );
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
      setIsSuggesting(false);
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
    checkedEntries,
    handleToggleEntry,
  };
}
