// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines settings API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { settingsApi } from './settings';
import { fetchJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('settingsApi', () => {
  it('calls GET /prompts without query when model name is missing', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true, languages: ['en'] });

    const result = await settingsApi.getPrompts();
    expect(result.languages).toEqual(['en']);

    expect(fetchJson).toHaveBeenCalledWith(
      '/prompts',
      undefined,
      'Failed to fetch prompts'
    );
  });

  it('calls GET /prompts?model_name=... when model name is provided', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true, languages: [] });

    const result = await settingsApi.getPrompts('my model');
    expect(result.languages).toEqual([]);

    expect(fetchJson).toHaveBeenCalledWith(
      '/prompts?model_name=my%20model',
      undefined,
      'Failed to fetch prompts'
    );
  });
});
