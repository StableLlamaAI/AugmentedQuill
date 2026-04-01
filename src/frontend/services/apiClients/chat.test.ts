// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { chatApi } from './chat';
import { fetchJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('chatApi', () => {
  it('calls GET /chats', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([]);

    await chatApi.list();

    expect(fetchJson).toHaveBeenCalledWith('/chats', undefined, 'Failed to list chats');
  });

  it('calls GET /chats/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ id: 'c1' });

    await chatApi.load('c1');

    expect(fetchJson).toHaveBeenCalledWith(
      '/chats/c1',
      undefined,
      'Failed to load chat'
    );
  });

  it('calls POST /chats/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    const payload = {
      name: 'Session',
      messages: [],
      systemPrompt: 'Prompt',
      allowWebSearch: true,
    };

    await chatApi.save('c1', payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/chats/c1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to save chat'
    );
  });

  it('calls DELETE /chats/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await chatApi.delete('c1');

    expect(fetchJson).toHaveBeenCalledWith(
      '/chats/c1',
      { method: 'DELETE' },
      'Failed to delete chat'
    );
  });

  it('calls DELETE /chats', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await chatApi.deleteAll();

    expect(fetchJson).toHaveBeenCalledWith(
      '/chats',
      { method: 'DELETE' },
      'Failed to delete all chats'
    );
  });

  it('calls POST /chat/tools', async () => {
    const payload = {
      messages: [
        {
          role: 'assistant' as const,
          content: 'hello',
          tool_calls: [],
        },
      ],
      active_chapter_id: 1,
      model_name: 'demo-model',
    };

    const encoder = new TextEncoder();
    const resultChunk = encoder.encode(
      'data: {"type":"result","ok":true,"appended_messages":[]}\n\n'
    );
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: resultChunk })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({ read }),
      },
    } as unknown as Response);

    await chatApi.executeTools(payload);

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/chat/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    fetchSpy.mockRestore();
  });
});
