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
import { api } from '../../services/api';

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
    vi.mocked(api.chat.load).mockResolvedValue(null as any);
  });

  it('creates an incognito session with expected defaults', async () => {
    const setChatMessages = vi.fn();
    const getSystemPrompt = () => 'System Prompt';

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
        chatMessages: [],
        setChatMessages,
        isChatLoading: false,
      })
    );

    act(() => {
      result.current.handleNewChat(true);
    });

    expect(result.current.isIncognito).toBe(true);
    expect(result.current.currentChatId).toBe('incognito-session-id');
    expect(result.current.allowWebSearch).toBe(false);
    expect(result.current.incognitoSessions).toHaveLength(1);
    expect(result.current.incognitoSessions[0].name).toBe('Incognito Chat');
    expect(setChatMessages).toHaveBeenCalled();
  });

  it('loads a persisted chat and applies prompt/search settings', async () => {
    const setChatMessages = vi.fn();
    const getSystemPrompt = () => 'System Prompt';
    vi.mocked(api.chat.load).mockResolvedValue({
      id: 'chat-1',
      name: 'Saved Chat',
      messages: [{ id: 'm1', role: 'user', text: 'hello' }],
      systemPrompt: 'Saved prompt',
      allowWebSearch: true,
    } as any);

    const { result } = renderHook(() =>
      useChatSessionManagement({
        storyId: '',
        getSystemPrompt,
        chatMessages: [],
        setChatMessages,
        isChatLoading: false,
      })
    );

    await act(async () => {
      await result.current.handleSelectChat('chat-1');
    });

    await waitFor(() => {
      expect(result.current.currentChatId).toBe('chat-1');
    });
    await waitFor(() => {
      expect(result.current.allowWebSearch).toBe(true);
    });
    expect(result.current.isIncognito).toBe(false);
    expect(result.current.systemPrompt).toBe('Saved prompt');
    expect(setChatMessages).toHaveBeenCalledWith([
      { id: 'm1', role: 'user', text: 'hello' },
    ]);
  });
});
