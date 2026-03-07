// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines story API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { storyApi } from './story';
import { fetchJson } from './shared';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('storyApi', () => {
  it('calls POST /story/title', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await storyApi.updateTitle('New Title');

    expect(fetchJson).toHaveBeenCalledWith(
      '/story/title',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      },
      'Failed to update story title'
    );
  });

  it('calls PUT /story/summary', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await storyApi.updateSummary('Summary');

    expect(fetchJson).toHaveBeenCalledWith(
      '/story/summary',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'Summary' }),
      },
      'Failed to update story summary'
    );
  });

  it('calls PUT /story/tags', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await storyApi.updateTags(['a', 'b']);

    expect(fetchJson).toHaveBeenCalledWith(
      '/story/tags',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['a', 'b'] }),
      },
      'Failed to update story tags'
    );
  });

  it('calls POST /story/settings', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    const payload = { image_style: 'style', image_additional_info: 'info' };
    await storyApi.updateSettings(payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/story/settings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to update story settings'
    );
  });

  it('calls POST /story/metadata', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    const payload = {
      title: 'T',
      summary: 'S',
      tags: ['x'],
      notes: 'N',
      private_notes: 'P',
    };
    await storyApi.updateMetadata(payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/story/metadata',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to update story metadata'
    );

    // language forwarding
    const payload2 = { ...payload, language: 'es' };
    await storyApi.updateMetadata(payload2);
    expect(fetchJson).toHaveBeenCalledWith(
      '/story/metadata',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload2),
      },
      'Failed to update story metadata'
    );
  });
});
