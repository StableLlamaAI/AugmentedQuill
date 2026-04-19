// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use ai actions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';

import { ChatMessage, StoryState, WritingUnit } from '../../types';
import { streamAiAction } from '../../services/openaiService';
import { notifyError } from '../../services/errorNotifier';
import { setupMountedRefLifecycle } from '../../utils/mountedRef';

type PromptsState = {
  system_messages: Record<string, string>;
  user_prompts: Record<string, string>;
};

type UseAiActionsParams = {
  currentUnit?: WritingUnit;
  story: StoryState;
  prompts: PromptsState;
  isEditingAvailable: boolean;
  isWritingAvailable: boolean;
  checkedSourcebookIds?: string[];
  updateChapter: (
    id: string,
    partial: Partial<WritingUnit>,
    sync?: boolean
  ) => Promise<void>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  getErrorMessage: (error: unknown, fallback: string) => string;
};

/** Custom React hook that manages ai actions. */
export function useAiActions({
  currentUnit,
  isEditingAvailable,
  isWritingAvailable,
  checkedSourcebookIds,
  updateChapter,
  getErrorMessage,
}: UseAiActionsParams): {
  isAiActionLoading: boolean;
  handleAiAction: (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => Promise<void>;
  handleSidebarAiAction: (
    type: 'chapter' | 'book' | 'story',
    id: string,
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void,
    source?: 'chapter' | 'notes'
  ) => Promise<string | undefined>;
  cancelAiAction: () => void;
} {
  const [isAiActionLoading, setIsAiActionLoading] = useState(false);
  const cancelSignalRef = useRef<{
    cancelled: boolean;
    reader?: ReadableStreamDefaultReader<Uint8Array>;
  }>({ cancelled: false });
  const isMountedRef = useRef(true);

  // Avoid updating state after the component has unmounted.
  // This can happen if the user cancels a streaming action while the component is still tearing down.
  useEffect(() => setupMountedRefLifecycle(isMountedRef), []);

  const cancelAiAction = () => {
    cancelSignalRef.current.cancelled = true;
    cancelSignalRef.current.reader?.cancel();
    cancelSignalRef.current.reader = undefined;
    if (isMountedRef.current) {
      setIsAiActionLoading(false);
    }
  };

  const handleAiAction = async (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => {
    if (!currentUnit) return;
    if (target === 'summary' && !isEditingAvailable) return;
    if (target === 'chapter' && !isWritingAvailable) return;

    setIsAiActionLoading(true);

    cancelSignalRef.current = { cancelled: false };

    try {
      const isChapterStreamingAction =
        target === 'chapter' && (action === 'extend' || action === 'rewrite');
      const baseContent = currentUnit.content;
      const separator =
        action === 'extend' && baseContent.length > 0 && !baseContent.endsWith('\n')
          ? '\n\n'
          : '';

      let pendingPartial: string | null = null;
      let throttleHandle: ReturnType<typeof setTimeout> | null = null;
      // Throttle interval for streaming preview updates. Fires via setTimeout
      // (macrotask) so it is always outside React's render cycle, avoiding the
      // "Maximum update depth exceeded" error that requestAnimationFrame can
      // trigger when React 19 concurrent rendering is mid-flight.
      const PREVIEW_INTERVAL_MS = 150;

      const flushPending = () => {
        throttleHandle = null;
        if (pendingPartial === null) return;
        const partial = pendingPartial;
        pendingPartial = null;
        const nextContent =
          action === 'extend' ? `${baseContent}${separator}${partial}` : partial;
        // Atomic local state update WITHOUT server sync during stream
        void updateChapter(currentUnit.id, { content: nextContent }, false);
      };

      const pushProgress = (partial: string) => {
        if (!isChapterStreamingAction) return;
        // Coalesce all SSE chunks arriving within PREVIEW_INTERVAL_MS into a
        // single state update. Storing the latest value means we never render
        // a stale intermediate — only the most-recent accumulated text is shown.
        pendingPartial = partial;
        if (throttleHandle === null) {
          throttleHandle = setTimeout(flushPending, PREVIEW_INTERVAL_MS);
        }
      };

      const selectedTarget: 'summary' | 'book_summary' | 'story_summary' =
        target === 'chapter'
          ? 'summary'
          : type === 'book'
            ? 'book_summary'
            : 'story_summary';

      const result = await streamAiAction(
        selectedTarget,
        action,
        currentUnit.id,
        currentUnit.content,
        pushProgress,
        undefined,
        undefined,
        checkedSourcebookIds,
        cancelSignalRef.current
      );

      // Cancel any pending throttle flush before applying the final result to
      // avoid a stale intermediate state overwriting the completed content.
      if (throttleHandle !== null) {
        clearTimeout(throttleHandle);
        throttleHandle = null;
        pendingPartial = null;
      }

      // If the user cancelled the action while it was streaming, avoid
      // applying any final updates and exit quickly so the UI can return to
      // an idle state.
      if (cancelSignalRef.current.cancelled) {
        return;
      }

      if (target === 'summary') {
        await updateChapter(currentUnit.id, { summary: result });
      } else if (action === 'extend') {
        await updateChapter(currentUnit.id, {
          content: baseContent + separator + result,
        });
      } else {
        await updateChapter(currentUnit.id, { content: result });
      }
    } catch (error: unknown) {
      console.error('AI Action Error:', error);
      notifyError(getErrorMessage(error, 'Failed to perform AI action'));
    } finally {
      if (isMountedRef.current) {
        setIsAiActionLoading(false);
      }
      cancelSignalRef.current.cancelled = true;
    }
  };

  const handleSidebarAiAction = async (
    type: 'chapter' | 'book' | 'story',
    id: string,
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void,
    source?: 'chapter' | 'notes'
  ): Promise<string | undefined> => {
    if (!isEditingAvailable) return undefined;
    setIsAiActionLoading(true);

    cancelSignalRef.current = { cancelled: false };

    try {
      const cleanText = (text: string) => {
        return text.replace(/^(\*\*?|##\s*)?(Updated )?Summary:?\**\s*/i, '');
      };

      const target: 'summary' | 'book_summary' | 'story_summary' =
        type === 'chapter'
          ? 'summary'
          : type === 'book'
            ? 'book_summary'
            : 'story_summary';

      const result = await streamAiAction(
        target,
        action,
        type === 'story' ? 'story' : id,
        currentText ?? '',
        onProgress ? (partial: string) => onProgress(cleanText(partial)) : undefined,
        onThinking,
        source,
        undefined,
        cancelSignalRef.current
      );

      return cleanText(result);
    } catch (error: unknown) {
      console.error('AI Sidebar action error:', error);
      notifyError(
        `AI Action Failed: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
      return undefined;
    } finally {
      if (isMountedRef.current) {
        setIsAiActionLoading(false);
      }
      cancelSignalRef.current.cancelled = true;
    }
  };

  return {
    isAiActionLoading,
    handleAiAction,
    handleSidebarAiAction,
    cancelAiAction,
  };
}
