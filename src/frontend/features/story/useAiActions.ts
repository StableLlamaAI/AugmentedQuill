// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use ai actions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, SetStateAction, useState } from 'react';

import { ChatMessage, Chapter, StoryState } from '../../types';
import { streamAiAction } from '../../services/openaiService';
import { notifyError } from '../../services/errorNotifier';

type PromptsState = {
  system_messages: Record<string, string>;
  user_prompts: Record<string, string>;
};

type UseAiActionsParams = {
  currentChapter?: Chapter;
  story: StoryState;
  prompts: PromptsState;
  isEditingAvailable: boolean;
  isWritingAvailable: boolean;
  updateChapter: (id: string, partial: Partial<Chapter>) => Promise<void>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  getErrorMessage: (error: unknown, fallback: string) => string;
};

export function useAiActions({
  currentChapter,
  isEditingAvailable,
  isWritingAvailable,
  updateChapter,
  getErrorMessage,
}: UseAiActionsParams) {
  const [isAiActionLoading, setIsAiActionLoading] = useState(false);

  const handleAiAction = async (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => {
    if (!currentChapter) return;
    if (target === 'summary' && !isEditingAvailable) return;
    if (target === 'chapter' && !isWritingAvailable) return;

    setIsAiActionLoading(true);

    try {
      const isChapterStreamingAction =
        target === 'chapter' && (action === 'extend' || action === 'rewrite');
      const baseContent = currentChapter.content;
      const separator =
        action === 'extend' && baseContent.length > 0 && !baseContent.endsWith('\n')
          ? '\n\n'
          : '';

      let lastPushed = '';
      let lastPushAt = 0;

      const pushProgress = (partial: string) => {
        if (!isChapterStreamingAction) return;
        if (partial === lastPushed) return;
        const now = Date.now();
        if (now - lastPushAt < 150) return;
        lastPushAt = now;
        lastPushed = partial;
        const nextContent =
          action === 'extend' ? `${baseContent}${separator}${partial}` : partial;
        void updateChapter(currentChapter.id, { content: nextContent });
      };

      const result = await streamAiAction(
        target as any,
        action,
        currentChapter.id,
        currentChapter.content,
        pushProgress
      );

      if (target === 'summary') {
        await updateChapter(currentChapter.id, { summary: result });
      } else if (action === 'extend') {
        await updateChapter(currentChapter.id, {
          content: baseContent + separator + result,
        });
      } else {
        await updateChapter(currentChapter.id, { content: result });
      }
    } catch (error: unknown) {
      console.error('AI Action Error:', error);
      notifyError(getErrorMessage(error, 'Failed to perform AI action'));
    } finally {
      setIsAiActionLoading(false);
    }
  };

  const handleSidebarAiAction = async (
    type: 'chapter' | 'book' | 'story',
    id: string,
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void
  ): Promise<string | undefined> => {
    if (!isEditingAvailable) return undefined;
    setIsAiActionLoading(true);

    try {
      const cleanText = (text: string) => {
        return text.replace(/^(\*\*?|##\s*)?(Updated )?Summary:?\**\s*/i, '');
      };

      const target: any =
        type === 'chapter'
          ? 'summary'
          : type === 'book'
            ? 'book_summary'
            : 'story_summary';

      const result = await streamAiAction(
        target,
        action,
        id,
        '',
        onProgress ? (partial) => onProgress(cleanText(partial)) : undefined
      );

      return cleanText(result);
    } catch (error: unknown) {
      notifyError(
        `AI Action Failed: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
      return undefined;
    } finally {
      setIsAiActionLoading(false);
    }
  };

  return {
    isAiActionLoading,
    handleAiAction,
    handleSidebarAiAction,
  };
}
