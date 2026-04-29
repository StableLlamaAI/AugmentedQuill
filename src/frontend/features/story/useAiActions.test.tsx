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
import type { CancelSignal } from '../../services/openaiService';
import { useStoryStore } from '../../stores/storyStore';
import { useChatStore } from '../../stores/chatStore';

vi.mock('../../services/openaiService', () => ({
  streamAiAction: vi.fn(),
}));

vi.mock('../../services/errorNotifier', () => ({
  notifyError: vi.fn(),
}));

const baseUnit = {
  id: '1',
  scope: 'chapter' as const,
  title: 'Chapter 1',
  summary: '',
  content: 'Existing content',
};

type StreamAiActionImpl = (
  target: 'summary' | 'chapter' | 'book_summary' | 'story_summary',
  action: 'update' | 'rewrite' | 'extend' | 'write',
  chapId: string,
  currentText: string,
  onUpdate: ((fullText: string) => void) | undefined,
  onThinking: ((thinking: string) => void) | undefined,
  source: 'notes' | 'chapter' | undefined,
  checked: string[] | undefined,
  cancelSignal: CancelSignal | undefined
) => Promise<string>;

const makeParams = (
  updateChapter: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined)
): {
  currentUnit: typeof baseUnit;
  prompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  isEditingAvailable: boolean;
  isWritingAvailable: boolean;
  checkedSourcebookIds: string[];
  updateChapter: ReturnType<typeof vi.fn>;
  getErrorMessage: (error: unknown, fallback: string) => string;
} => ({
  currentUnit: baseUnit,
  prompts: { system_messages: {}, user_prompts: {} },
  isEditingAvailable: true,
  isWritingAvailable: true,
  checkedSourcebookIds: [],
  updateChapter,
  getErrorMessage: (_error: unknown, _fallback: string): string => 'error',
});

const strictWrapper = ({ children }: { children: ReactNode }): ReactNode => (
  <StrictMode>{children}</StrictMode>
);

describe('useAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stores between tests.
    useStoryStore.getState().setStreamingContent(null);
    useChatStore.getState().setIsProseStreamingFrozen(false);
  });

  it('resets isAiActionLoading after canceling a chapter stream in StrictMode', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);
    const streamDeferred = (() => {
      let resolve!: (value: string) => void;
      const promise = new Promise<string>((res: (v: string) => void) => {
        resolve = res;
      });
      return { promise, resolve };
    })();

    vi.mocked(streamAiAction).mockImplementation((async (
      ...args: Parameters<StreamAiActionImpl>
    ) => {
      const cancelSignal = args[8];
      const value = await streamDeferred.promise;
      if (cancelSignal?.cancelled) return '';
      return value;
    }) as StreamAiActionImpl);

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)), {
      wrapper: strictWrapper,
    });

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

    // No streaming content → updateChapter must not be called for partial commit.
    expect(updateChapter).not.toHaveBeenCalled();
  });

  it('strips imposed chapter heading prefix before saving rewrite content', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);
    vi.mocked(streamAiAction).mockResolvedValue('# Chapter 1\n\nRewritten body text.');

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)));

    await act(async () => {
      await result.current.handleAiAction('chapter', 'rewrite');
    });

    expect(updateChapter).toHaveBeenCalledWith('1', {
      content: 'Rewritten body text.',
    });
  });

  it('commits partial streamed content when cancel is called during extend', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);
    let capturedOnUpdate: ((text: string) => void) | undefined;

    vi.mocked(streamAiAction).mockImplementation((async (
      ...args: Parameters<StreamAiActionImpl>
    ) => {
      const onUpdate = args[4];
      const cancelSignal = args[8];
      capturedOnUpdate = onUpdate;
      await new Promise<void>((resolve: () => void) => {
        const timer = setInterval(() => {
          if (cancelSignal?.cancelled) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
      return '';
    }) as StreamAiActionImpl);

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)));

    await act(async () => {
      void result.current.handleAiAction('chapter', 'extend');
    });

    await waitFor(() => expect(result.current.isAiActionLoading).toBe(true));

    // Simulate SSE chunks arriving — each call to onUpdate is the accumulated text.
    act(() => {
      capturedOnUpdate?.('Hello');
    });
    // Allow the 150ms throttle to fire.
    await act(async () => {
      await new Promise((r: (v: void) => void) => setTimeout(r, 200));
    });

    act(() => {
      result.current.cancelAiAction();
    });

    await waitFor(() => {
      expect(result.current.isAiActionLoading).toBe(false);
    });

    // Partial content commit must have been called with the streamed content.
    await waitFor(() => {
      expect(updateChapter).toHaveBeenCalledWith(
        '1',
        { content: 'Existing content\n\nHello' },
        true,
        true,
        false
      );
    });
  });

  it('sets isProseStreamingFrozen when partial content is committed on cancel', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);
    let capturedOnUpdate: ((text: string) => void) | undefined;

    vi.mocked(streamAiAction).mockImplementation((async (
      ...args: Parameters<StreamAiActionImpl>
    ) => {
      const onUpdate = args[4];
      const cancelSignal = args[8];
      capturedOnUpdate = onUpdate;
      await new Promise<void>((resolve: () => void) => {
        const timer = setInterval(() => {
          if (cancelSignal?.cancelled) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
      return '';
    }) as StreamAiActionImpl);

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)));

    await act(async () => {
      void result.current.handleAiAction('chapter', 'extend');
    });

    await waitFor(() => expect(result.current.isAiActionLoading).toBe(true));

    act(() => {
      capturedOnUpdate?.('Streamed chunk');
    });
    await act(async () => {
      await new Promise((r: (v: void) => void) => setTimeout(r, 200));
    });

    act(() => {
      result.current.cancelAiAction();
    });

    // isProseStreamingFrozen must be true before setIsAiActionLoading(false) propagates.
    expect(useChatStore.getState().isProseStreamingFrozen).toBe(true);

    await waitFor(() => {
      expect(result.current.isAiActionLoading).toBe(false);
    });
    // Frozen flag stays true until the next AI action clears it.
    expect(useChatStore.getState().isProseStreamingFrozen).toBe(true);
  });

  it('clears isProseStreamingFrozen when a new AI action starts', async () => {
    // Pre-set the frozen flag as if a previous stop had occurred.
    useChatStore.getState().setIsProseStreamingFrozen(true);

    const updateChapter = vi.fn().mockResolvedValue(undefined);
    vi.mocked(streamAiAction).mockResolvedValue('New content');

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)));

    await act(async () => {
      await result.current.handleAiAction('chapter', 'rewrite');
    });

    expect(useChatStore.getState().isProseStreamingFrozen).toBe(false);
  });

  it('does not commit partial content if cancel is called before any chunks arrive', async () => {
    const updateChapter = vi.fn().mockResolvedValue(undefined);

    vi.mocked(streamAiAction).mockImplementation((async (
      ...args: Parameters<StreamAiActionImpl>
    ) => {
      const cancelSignal = args[8];
      await new Promise<void>((resolve: () => void) => {
        const timer = setInterval(() => {
          if (cancelSignal?.cancelled) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
      return '';
    }) as StreamAiActionImpl);

    const { result } = renderHook(() => useAiActions(makeParams(updateChapter)));

    await act(async () => {
      void result.current.handleAiAction('chapter', 'extend');
    });

    await waitFor(() => expect(result.current.isAiActionLoading).toBe(true));

    act(() => {
      result.current.cancelAiAction();
    });

    await waitFor(() => {
      expect(result.current.isAiActionLoading).toBe(false);
    });

    expect(updateChapter).not.toHaveBeenCalled();
    expect(useChatStore.getState().isProseStreamingFrozen).toBe(false);
  });
});
