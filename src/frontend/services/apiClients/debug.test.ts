// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines debug API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { debugApi } from './debug';
import { fetchJson } from './shared';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('debugApi', () => {
  it('calls GET /debug/llm_logs', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([]);

    await debugApi.getLogs();

    expect(fetchJson).toHaveBeenCalledWith(
      '/debug/llm_logs',
      undefined,
      'Failed to fetch debug logs'
    );
  });

  it('calls DELETE /debug/llm_logs', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ status: 'ok' });

    await debugApi.clearLogs();

    expect(fetchJson).toHaveBeenCalledWith(
      '/debug/llm_logs',
      { method: 'DELETE' },
      'Failed to clear debug logs'
    );
  });
});
