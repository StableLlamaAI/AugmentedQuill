// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for useChatMessageActions so message edit/delete behavior remains stable.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';

import { useChatMessageActions } from './useChatMessageActions';
import { ChatMessage } from '../../types';

describe('useChatMessageActions', () => {
  it('edits only the targeted message', () => {
    const initialMessages: ChatMessage[] = [
      { id: 'm1', role: 'user', text: 'Original user message' },
      { id: 'm2', role: 'model', text: 'Original model message' },
    ];

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
      const actions = useChatMessageActions({ setChatMessages: setMessages });
      return { messages, ...actions };
    });

    act(() => {
      result.current.handleEditMessage('m1', 'Edited user message');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].text).toBe('Edited user message');
    expect(result.current.messages[1].text).toBe('Original model message');
  });

  it('deletes only the targeted message', () => {
    const initialMessages: ChatMessage[] = [
      { id: 'm1', role: 'user', text: 'Keep me' },
      { id: 'm2', role: 'model', text: 'Delete me' },
      { id: 'm3', role: 'user', text: 'Keep me too' },
    ];

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
      const actions = useChatMessageActions({ setChatMessages: setMessages });
      return { messages, ...actions };
    });

    act(() => {
      result.current.handleDeleteMessage('m2');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.map((message: ChatMessage) => message.id)).toEqual([
      'm1',
      'm3',
    ]);
  });

  it('keeps action identities stable across message updates', () => {
    const initialMessages: ChatMessage[] = [
      { id: 'm1', role: 'user', text: 'Hello' },
      { id: 'm2', role: 'model', text: 'World' },
    ];

    const { result } = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
      const actions = useChatMessageActions({ setChatMessages: setMessages });
      return { messages, ...actions };
    });

    const firstEditHandler = result.current.handleEditMessage;
    const firstDeleteHandler = result.current.handleDeleteMessage;

    act(() => {
      result.current.handleEditMessage('m1', 'Updated');
    });

    expect(result.current.handleEditMessage).toBe(firstEditHandler);
    expect(result.current.handleDeleteMessage).toBe(firstDeleteHandler);
  });
});
