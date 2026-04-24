// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use ai actions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useEffect, useRef, useState } from 'react';

import { WritingUnit } from '../../types';
import { streamAiAction } from '../../services/openaiService';
import { notifyError } from '../../services/errorNotifier';
import { setupMountedRefLifecycle } from '../../utils/mountedRef';
import { useStoryStore } from '../../stores/storyStore';

type PromptsState = {
  system_messages: Record<string, string>;
  user_prompts: Record<string, string>;
};

type UseAiActionsParams = {
  currentUnit?: WritingUnit;
  prompts: PromptsState;
  isEditingAvailable: boolean;
  isWritingAvailable: boolean;
  checkedSourcebookIds?: string[];
  updateChapter: (
    id: string,
    partial: Partial<WritingUnit>,
    sync?: boolean
  ) => Promise<void>;
  getErrorMessage: (error: unknown, fallback: string) => string;
};

const createPrefillStripper =
  (imposedActionPrefill: string, imposedHeadingPrefix: string) =>
  (text: string): string => {
    if (!text) return text;
    let cleaned = text;

    if (imposedActionPrefill && cleaned.startsWith(imposedActionPrefill)) {
      cleaned = cleaned.slice(imposedActionPrefill.length);
    }
    if (imposedHeadingPrefix && cleaned.startsWith(imposedHeadingPrefix)) {
      cleaned = cleaned.slice(imposedHeadingPrefix.length);
    }

    return cleaned;
  };

const normalizeAiActionText = (text: string): string =>
  text.replace(/^(\*\*?|##\s*)?(Updated )?Summary:?\*\*?\s*/i, '');

const getImposedHeadingPrefix = (
  target: 'summary' | 'chapter',
  action: 'update' | 'rewrite' | 'extend',
  title: string
): string =>
  target === 'chapter' && action === 'rewrite' && title.trim().length > 0
    ? `# ${title.trim()}\n\n`
    : '';

const getImposedActionPrefill = (
  target: 'summary' | 'chapter',
  action: 'update' | 'rewrite' | 'extend',
  title: string,
  baseContent: string,
  imposedHeadingPrefix: string
): string =>
  target === 'chapter' && action === 'extend' && title.trim().length > 0
    ? `${imposedHeadingPrefix}${baseContent}`
    : action === 'rewrite'
      ? imposedHeadingPrefix
      : '';

const getAiActionTarget = (
  target: 'summary' | 'chapter',
  scope: string | undefined
): 'summary' | 'story_summary' | 'chapter' =>
  target === 'chapter' ? 'chapter' : scope === 'chapter' ? 'summary' : 'story_summary';

const getSeparator = (
  action: 'update' | 'rewrite' | 'extend',
  baseContent: string
): string =>
  action === 'extend' && baseContent.length > 0 && !baseContent.endsWith('\n')
    ? '\n\n'
    : '';

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

  const cancelAiAction = (): void => {
    cancelSignalRef.current.cancelled = true;
    cancelSignalRef.current.reader?.cancel();
    cancelSignalRef.current.reader = undefined;
    // Clear streaming slot so the editor reverts to committed chapter content.
    useStoryStore.getState().setStreamingContent(null);
    if (isMountedRef.current) {
      setIsAiActionLoading(false);
    }
  };

  const handleAiAction = async (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ): Promise<void> => {
    if (!currentUnit) return;
    if (target === 'summary' && !isEditingAvailable) return;
    if (target === 'chapter' && !isWritingAvailable) return;

    setIsAiActionLoading(true);

    cancelSignalRef.current = { cancelled: false };

    try {
      const isChapterStreamingAction =
        target === 'chapter' && (action === 'extend' || action === 'rewrite');
      const baseContent = currentUnit.content;
      const imposedHeadingPrefix = getImposedHeadingPrefix(
        target,
        action,
        currentUnit.title
      );
      const imposedActionPrefill = getImposedActionPrefill(
        target,
        action,
        currentUnit.title,
        baseContent,
        imposedHeadingPrefix
      );
      const stripPrefillEcho = createPrefillStripper(
        imposedActionPrefill,
        imposedHeadingPrefix
      );
      const separator = getSeparator(action, baseContent);

      let pendingPartial: string | null = null;
      let throttleHandle: ReturnType<typeof setTimeout> | null = null;
      // Throttle interval for streaming preview updates. Fires via setTimeout
      // (macrotask) so it is always outside React's render cycle, avoiding the
      // "Maximum update depth exceeded" error that requestAnimationFrame can
      // trigger when React 19 concurrent rendering is mid-flight.
      const PREVIEW_INTERVAL_MS = 150;

      const flushPending = (): void => {
        throttleHandle = null;
        if (pendingPartial === null) return;
        const partial = pendingPartial;
        pendingPartial = null;
        const normalizedPartial = stripPrefillEcho(partial);
        const nextContent =
          action === 'extend'
            ? `${baseContent}${separator}${normalizedPartial}`
            : normalizedPartial;
        // Write into the dedicated streaming slot instead of story.chapters so
        // only the editor re-renders; sourcebook, chat, and sidebar are unaffected.
        useStoryStore.getState().setStreamingContent({
          chapterId: currentUnit.id,
          content: nextContent,
        });
      };

      const pushProgress = (partial: string): void => {
        if (!isChapterStreamingAction) return;
        // Coalesce all SSE chunks arriving within PREVIEW_INTERVAL_MS into a
        // single state update. Storing the latest value means we never render
        // a stale intermediate — only the most-recent accumulated text is shown.
        pendingPartial = partial;
        if (throttleHandle === null) {
          throttleHandle = setTimeout(flushPending, PREVIEW_INTERVAL_MS);
        }
      };

      const selectedTarget = getAiActionTarget(target, currentUnit.scope);

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

      // Clear the streaming slot before committing the final result so the
      // editor transitions directly from streaming text → final text without
      // a flash back to the pre-AI baseline content.
      useStoryStore.getState().setStreamingContent(null);

      if (target === 'summary') {
        await updateChapter(currentUnit.id, { summary: result });
      } else if (action === 'extend') {
        await updateChapter(currentUnit.id, {
          content: baseContent + separator + stripPrefillEcho(result),
        });
      } else {
        await updateChapter(currentUnit.id, {
          content: stripPrefillEcho(result),
        });
      }
    } catch (error: unknown) {
      console.error('AI Action Error:', error);
      notifyError(getErrorMessage(error, 'Failed to perform AI action'));
    } finally {
      // Safety-net: clear the streaming slot in case the try block exited
      // via an exception before reaching the explicit clearance above.
      useStoryStore.getState().setStreamingContent(null);
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
      const cleanText = (text: string): string => normalizeAiActionText(text);

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
