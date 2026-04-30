// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for useChatSessionManagement so chat session flows remain predictable.
 */

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useChatSessionManagement } from './useChatSessionManagement';
import { useChatStore } from '../../stores/chatStore';
import { api } from '../../services/api';
import type { ChatSession } from '../../types/chat';

vi.mock('uuid', () => ({
  v4: () => 'incognito-session-id',
}));

vi.mock('../../services/api', () => ({
  api: {
    chat: {
      list: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      deleteAll: vi.fn(),
    },
  },
}));

describe('useChatSessionManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.chat.list).mockResolvedValue([]);
    vi.mocked(api.chat.load).mockResolvedValue(null);
    // Reset chatStore to a clean state between tests
    useChatStore.setState({
      chatMessages: [],
      isChatLoading: false,
      sessionMutations: [],
      chatHistoryList: [],
      currentChatId: null,
      incognitoSessions: [],
      isIncognito: false,
      allowWebSearch: false,
      systemPrompt: '',
      scratchpad: '',
    });
  });

  it('creates an incognito session with expected defaults', async () => {
    const getSystemPrompt = (): string => 'System Prompt';

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
      })
    );

    act(() => {
      result.current.handleNewChat(true);
    });

    expect(useChatStore.getState().isIncognito).toBe(true);
    expect(useChatStore.getState().currentChatId).toBe('incognito-session-id');
    expect(useChatStore.getState().allowWebSearch).toBe(false);
    expect(useChatStore.getState().scratchpad).toBe('');
    expect(useChatStore.getState().incognitoSessions).toHaveLength(1);
    expect(useChatStore.getState().incognitoSessions[0].name).toBe('Incognito Chat');
    expect(useChatStore.getState().incognitoSessions[0].scratchpad).toBe('');
    expect(useChatStore.getState().chatMessages).toHaveLength(0);
  });

  it('loads a persisted chat and applies prompt/search settings', async () => {
    const getSystemPrompt = (): string => 'System Prompt';
    vi.mocked(api.chat.load).mockResolvedValue({
      id: 'chat-1',
      name: 'Saved Chat',
      messages: [{ id: 'm1', role: 'user', text: 'hello' }],
      systemPrompt: 'Saved prompt',
      allowWebSearch: true,
      scratchpad: 'My Scratch',
    } as ChatSession);

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
      })
    );

    await act(async () => {
      await result.current.handleSelectChat('chat-1');
    });

    await waitFor(() => {
      expect(useChatStore.getState().currentChatId).toBe('chat-1');
    });
    await waitFor(() => {
      expect(useChatStore.getState().allowWebSearch).toBe(true);
    });
    expect(useChatStore.getState().isIncognito).toBe(false);
    expect(useChatStore.getState().systemPrompt).toBe('Saved prompt');
    expect(useChatStore.getState().scratchpad).toBe('My Scratch');
    expect(useChatStore.getState().chatMessages).toEqual([
      { id: 'm1', role: 'user', text: 'hello' },
    ]);
  });

  it('restores incognito scratchpad when selecting an incognito chat', async () => {
    const getSystemPrompt = (): string => 'System Prompt';

    useChatStore.setState({
      incognitoSessions: [
        {
          id: 'inc-1',
          name: 'Incognito Chat',
          messages: [{ id: 'm1', role: 'user', text: 'hello' }],
          systemPrompt: 'Incognito prompt',
          isIncognito: true,
          allowWebSearch: true,
          scratchpad: 'Incognito memory',
        },
      ],
      scratchpad: '',
    });

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
      })
    );

    await act(async () => {
      await result.current.handleSelectChat('inc-1');
    });

    expect(useChatStore.getState().isIncognito).toBe(true);
    expect(useChatStore.getState().currentChatId).toBe('inc-1');
    expect(useChatStore.getState().scratchpad).toBe('Incognito memory');
  });

  it('clears session mutation tags when a new chat is started', () => {
    const getSystemPrompt = (): string => 'System Prompt';
    useChatStore.setState({
      sessionMutations: [{ type: 'chapter', label: 'Updated chapter', targetId: '1' }],
    });

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
      })
    );

    act(() => {
      result.current.handleNewChat(false);
    });

    expect(useChatStore.getState().sessionMutations).toEqual([]);
  });

  it('clears session mutation tags when selecting a persisted chat', async () => {
    const getSystemPrompt = (): string => 'System Prompt';
    useChatStore.setState({
      sessionMutations: [{ type: 'chapter', label: 'Updated chapter', targetId: '1' }],
    });
    vi.mocked(api.chat.load).mockResolvedValue({
      id: 'chat-1',
      name: 'Saved Chat',
      messages: [],
      systemPrompt: 'Saved prompt',
      allowWebSearch: false,
      scratchpad: '',
    } as ChatSession);

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
      })
    );

    await act(async () => {
      await result.current.handleSelectChat('chat-1');
    });

    expect(useChatStore.getState().sessionMutations).toEqual([]);
  });

  it('auto-saves non-incognito scratchpad updates even without messages', async () => {
    vi.useFakeTimers();
    try {
      const getSystemPrompt = (): string => 'System Prompt';
      const { result } = renderHook(() =>
        useChatSessionManagement({
          storyId: '',
          getSystemPrompt,
        })
      );

      act(() => {
        useChatStore.setState({
          currentChatId: 'chat-scratchpad',
          isIncognito: false,
          chatMessages: [],
          scratchpad: '',
        });
        result.current.onUpdateScratchpad('Persistent memory text');
      });

      await vi.advanceTimersByTimeAsync(2200);

      expect(api.chat.save).toHaveBeenCalledWith(
        'chat-scratchpad',
        expect.objectContaining({
          name: 'Untitled Chat',
          messages: [],
          allowWebSearch: false,
          scratchpad: 'Persistent memory text',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
