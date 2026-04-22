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

import { makeMessageUpdater } from './chatExecutionHelpers';
import type { ChatMessage } from '../../types';

describe('chatExecutionHelpers streaming cadence', () => {
  it('flushes each incoming stream update immediately', () => {
    let state: ChatMessage[] = [];
    let setCalls = 0;

    const setChatMessages = (
      v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
    ) => {
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
