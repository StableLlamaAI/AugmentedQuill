// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines sourcebook API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sourcebookApi } from './sourcebook';
import { fetchJson } from './shared';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('sourcebookApi', () => {
  it('calls GET /sourcebook', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([]);

    await sourcebookApi.list();

    expect(fetchJson).toHaveBeenCalledWith(
      '/sourcebook?match_mode=extensive&split_query_fallback=false',
      undefined,
      'Failed to load sourcebook'
    );
  });

  it('calls POST /sourcebook', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ id: '1', name: 'n' });

    const entry = {
      name: 'Entry',
      synonyms: ['Alias'],
      category: 'character',
      description: 'Desc',
      images: ['img.png'],
    };

    await sourcebookApi.create(entry);

    expect(fetchJson).toHaveBeenCalledWith(
      '/sourcebook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      },
      'Failed to create entry'
    );
  });

  it('calls PUT /sourcebook/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ id: '1', name: 'n' });

    const updates = { description: 'Updated' };
    await sourcebookApi.update('entry-id', updates);

    expect(fetchJson).toHaveBeenCalledWith(
      '/sourcebook/entry-id',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
      'Failed to update entry'
    );
  });

  it('calls DELETE /sourcebook/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    await sourcebookApi.delete('entry-id');

    expect(fetchJson).toHaveBeenCalledWith(
      '/sourcebook/entry-id',
      { method: 'DELETE' },
      'Failed to delete entry'
    );
  });

  it('calls POST /sourcebook/keywords', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ keywords: ['a', 'b'] });

    await sourcebookApi.generateKeywords({
      name: 'Entry',
      description: 'Desc',
      synonyms: ['Alias'],
    });

    expect(fetchJson).toHaveBeenCalledWith(
      '/sourcebook/keywords',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Entry',
          description: 'Desc',
          synonyms: ['Alias'],
        }),
      },
      'Failed to generate keywords'
    );
  });
});
