// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the openai service.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContinuations } from './openaiService';
import type { LLMConfig } from '../types';

describe('openaiService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes checkedSourcebookIds in request body when provided', async () => {
    const fakeReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: new Uint8Array() }),
    };
    const fakeBody = {
      getReader: () => fakeReader,
    };

    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: fakeBody });

    const cfg: LLMConfig = { id: 'x', name: 'x', baseUrl: '', apiKey: '', timeout: 5 };

    await generateContinuations('text', 'ctx', 'sys', cfg, '1', ['A', 'B']);

    expect(global.fetch).toHaveBeenCalled();
    const callArgs = (global.fetch as vi.Mock).mock.calls[0];
    const options = callArgs[1];
    const body = JSON.parse(options.body);
    expect(body.checked_sourcebook).toEqual(['A', 'B']);
  });
});
