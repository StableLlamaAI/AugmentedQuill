// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines debug API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { debugApi } from './debug';
import { fetchJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('debugApi', () => {
  it('calls GET /debug/llm_logs', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([]);

    await debugApi.getLogs();

    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringMatching(/^\/debug\/llm_logs(\?_t=\d+)?$/),
      undefined,
      'Failed to fetch debug logs'
    );
  });

  it('calls DELETE /debug/llm_logs', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ status: 'ok' });

    await debugApi.clearLogs();

    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringMatching(/^\/debug\/llm_logs(\?_t=\d+)?$/),
      { method: 'DELETE' },
      'Failed to clear debug logs'
    );
  });
});
