// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for chat execution helpers so streaming UI update cadence stays smooth.
 */

import { describe, it, expect } from 'vitest';

import { applyScratchpadToolResult, makeMessageUpdater } from './chatExecutionHelpers';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../types';

describe('chatExecutionHelpers streaming cadence', () => {
  it('flushes each incoming stream update immediately', () => {
    let state: ChatMessage[] = [];
    let setCalls = 0;

    const setChatMessages = (
      v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
    ): void => {
      setCalls += 1;
      state = typeof v === 'function' ? v(state) : v;
    };

    const updater = makeMessageUpdater(setChatMessages)('msg-1');

    updater({ text: 'He' });
    expect(setCalls).toBe(1);
    expect(state[0]?.text).toBe('He');

    updater({ text: 'Hello' });
    expect(setCalls).toBe(2);
    expect(state[0]?.text).toBe('Hello');
  });
});

describe('scratchpad tool results', () => {
  it('updates chat scratchpad when write_scratchpad tool is executed', () => {
    useChatStore.setState({
      scratchpad: '',
      isIncognito: false,
      currentChatId: null,
      incognitoSessions: [],
    });

    applyScratchpadToolResult({ content: 'Generated scratchpad text' });

    expect(useChatStore.getState().scratchpad).toBe('Generated scratchpad text');
  });

  it('updates incognito session scratchpad when write_scratchpad tool is executed in incognito', () => {
    const sessionId = 'incognito-1';
    useChatStore.setState({
      scratchpad: '',
      isIncognito: true,
      currentChatId: sessionId,
      incognitoSessions: [
        {
          id: sessionId,
          name: 'Incognito Chat',
          messages: [],
          systemPrompt: '',
          isIncognito: true,
          allowWebSearch: false,
          scratchpad: '',
        },
      ],
    });

    applyScratchpadToolResult({ content: 'Incognito scratchpad' });

    expect(useChatStore.getState().scratchpad).toBe('Incognito scratchpad');
    expect(useChatStore.getState().incognitoSessions[0].scratchpad).toBe(
      'Incognito scratchpad'
    );
  });

  it('supports raw tool args when write_scratchpad tool args are not parsed into an object', () => {
    useChatStore.setState({
      scratchpad: '',
      isIncognito: false,
      currentChatId: null,
      incognitoSessions: [],
    });

    applyScratchpadToolResult({ raw: '{"content":"raw args scratchpad"}' });

    expect(useChatStore.getState().scratchpad).toBe('raw args scratchpad');
  });

  it('falls back to result content when args are absent', () => {
    useChatStore.setState({
      scratchpad: '',
      isIncognito: false,
      currentChatId: null,
      incognitoSessions: [],
    });

    applyScratchpadToolResult(undefined, { content: 'result scratchpad' });

    expect(useChatStore.getState().scratchpad).toBe('result scratchpad');
  });
});
