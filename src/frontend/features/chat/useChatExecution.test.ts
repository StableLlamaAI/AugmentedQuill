// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for useChatExecution to ensure tool batch grouping is correct.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useChatExecution } from './useChatExecution';
import { api } from '../../services/api';
import { createChatSession } from '../../services/openaiService';

vi.mock('../../services/api', () => ({
  api: {
    chat: {
      executeTools: vi.fn(),
      undoToolBatch: vi.fn(),
      redoToolBatch: vi.fn(),
    },
    projects: {
      list: vi.fn(),
      select: vi.fn(),
    },
  },
}));

vi.mock('../../services/openaiService', () => ({
  createChatSession: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: () => 'fixed-uuid',
}));

describe('useChatExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups multiple incremental tool_batch calls into a single external history entry with combined undo/redo', async () => {
    const setChatMessages = vi.fn();
    const refreshProjects = vi.fn().mockResolvedValue(undefined);
    const refreshStory = vi.fn().mockResolvedValue(undefined);
    const pushExternalHistoryEntry = vi.fn();

    const sendMessageMock = vi.fn();

    // createChatSession returns object with sendMessage that resolves sequentially.
    vi.mocked(createChatSession).mockReturnValue({
      sendMessage: sendMessageMock,
    } as any);

    sendMessageMock
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [{ id: 'c1', name: 'update_chapter_metadata', args: {} }],
      })
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [{ id: 'c2', name: 'update_chapter_metadata', args: {} }],
      })
      .mockResolvedValueOnce({ text: 'Done', functionCalls: [] });

    vi.mocked(api.chat.executeTools)
      .mockResolvedValueOnce({
        ok: true,
        appended_messages: [
          { content: 'ok1', name: 'update_chapter_metadata', tool_call_id: 'c1' },
        ],
        mutations: {
          story_changed: true,
          tool_batch: {
            batch_id: 'batch1',
            label: 'AI tool: update_chapter_metadata',
            operation_count: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        appended_messages: [
          { content: 'ok2', name: 'update_chapter_metadata', tool_call_id: 'c2' },
        ],
        mutations: {
          story_changed: true,
          tool_batch: {
            batch_id: 'batch2',
            label: 'AI tool: update_chapter_metadata',
            operation_count: 1,
          },
        },
      });

    const { result } = renderHook(() =>
      useChatExecution({
        systemPrompt: 'system',
        activeChatConfig: { model: 'test', temperature: 0.5 },
        isChatAvailable: true,
        allowWebSearch: false,
        currentChapterId: '1',
        currentChapter: { id: '1', title: 'Intro' },
        chatMessages: [],
        setChatMessages,
        isChatLoading: false,
        setIsChatLoading: vi.fn(),
        refreshProjects,
        refreshStory,
        pushExternalHistoryEntry,
        requestToolCallLoopAccess: vi.fn().mockResolvedValue('unlimited'),
      })
    );

    await act(async () => {
      await result.current.handleSendMessage('Edit chapter metadata');
    });

    expect(pushExternalHistoryEntry).toHaveBeenCalledTimes(1);

    const entry = pushExternalHistoryEntry.mock.calls[0][0];
    expect(entry.label).toContain('AI tools');

    await act(async () => {
      await entry.onUndo?.();
    });

    expect(api.chat.undoToolBatch).toHaveBeenCalledTimes(2);
    expect(api.chat.undoToolBatch).toHaveBeenNthCalledWith(1, 'batch2');
    expect(api.chat.undoToolBatch).toHaveBeenNthCalledWith(2, 'batch1');

    await act(async () => {
      await entry.onRedo?.();
    });

    expect(api.chat.redoToolBatch).toHaveBeenCalledTimes(2);
    expect(api.chat.redoToolBatch).toHaveBeenNthCalledWith(1, 'batch1');
    expect(api.chat.redoToolBatch).toHaveBeenNthCalledWith(2, 'batch2');
  });
});
