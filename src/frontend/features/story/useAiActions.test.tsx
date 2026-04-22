// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines useAiActions.test unit so streaming cancellation state regressions are caught.
 */

// @vitest-environment jsdom

import { StrictMode, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useAiActions } from './useAiActions';
import { streamAiAction } from '../../services/openaiService';

vi.mock('../../services/openaiService', () => ({
  streamAiAction: vi.fn(),
}));

vi.mock('../../services/errorNotifier', () => ({
  notifyError: vi.fn(),
}));

describe('useAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets isAiActionLoading after canceling a chapter stream in StrictMode', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);

    const streamDeferred = (() => {
      let resolve!: (value: string) => void;
      const promise = new Promise<string>(
        (res: (value: string | PromiseLike<string>) => void) => {
          resolve = res;
        }
      );
      return { promise, resolve };
    })();

    vi.mocked(streamAiAction).mockImplementation(
      async (
        _target: 'summary' | 'chapter' | 'book_summary' | 'story_summary',
        _action: 'update' | 'rewrite' | 'extend' | 'write',
        _chapId: string,
        _currentText: string,
        _onUpdate: ((fullText: string) => void) | undefined,
        _onThinking: ((thinking: string) => void) | undefined,
        _source: 'notes' | 'chapter' | undefined,
        _checked: string[] | undefined,
        cancelSignal: import('../../services/openaiService').CancelSignal | undefined
      ) => {
        const value = await streamDeferred.promise;
        if (cancelSignal?.cancelled) {
          return '';
        }
        return value;
      }
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result } = renderHook(
      () =>
        useAiActions({
          currentUnit: {
            id: '1',
            scope: 'chapter',
            title: 'Chapter 1',
            summary: '',
            content: 'Existing content',
          },
          story: {
            id: 'demo',
            title: 'Demo',
            summary: '',
            styleTags: [],
            image_style: '',
            image_additional_info: '',
            chapters: [],
            draft: null,
            projectType: 'novel',
            books: [],
            sourcebook: [],
            conflicts: [],
            currentChapterId: '1',
            lastUpdated: 0,
          },
          prompts: {
            system_messages: {},
            user_prompts: {},
          },
          isEditingAvailable: true,
          isWritingAvailable: true,
          checkedSourcebookIds: [],
          updateChapter,
          setChatMessages: vi.fn(),
          getErrorMessage: () => 'error',
        }),
      { wrapper }
    );

    await act(async () => {
      void result.current.handleAiAction('chapter', 'extend');
    });

    await waitFor(() => {
      expect(result.current.isAiActionLoading).toBe(true);
    });

    act(() => {
      result.current.cancelAiAction();
    });

    streamDeferred.resolve('ignored completion');

    await waitFor(() => {
      expect(result.current.isAiActionLoading).toBe(false);
    });

    // Final chapter sync should not run after cancellation.
    expect(updateChapter).not.toHaveBeenCalled();
  });

  it('strips imposed chapter heading prefix before saving rewrite content', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);

    vi.mocked(streamAiAction).mockResolvedValue('# Chapter 1\n\nRewritten body text.');

    const { result } = renderHook(() =>
      useAiActions({
        currentUnit: {
          id: '1',
          scope: 'chapter',
          title: 'Chapter 1',
          summary: '',
          content: 'Old body text.',
        },
        story: {
          id: 'demo',
          title: 'Demo',
          summary: '',
          styleTags: [],
          image_style: '',
          image_additional_info: '',
          chapters: [],
          draft: null,
          projectType: 'novel',
          books: [],
          sourcebook: [],
          conflicts: [],
          currentChapterId: '1',
          lastUpdated: 0,
        },
        prompts: {
          system_messages: {},
          user_prompts: {},
        },
        isEditingAvailable: true,
        isWritingAvailable: true,
        checkedSourcebookIds: [],
        updateChapter,
        setChatMessages: vi.fn(),
        getErrorMessage: () => 'error',
      })
    );

    await act(async () => {
      await result.current.handleAiAction('chapter', 'rewrite');
    });

    expect(updateChapter).toHaveBeenCalledWith('1', {
      content: 'Rewritten body text.',
    });
  });
});
