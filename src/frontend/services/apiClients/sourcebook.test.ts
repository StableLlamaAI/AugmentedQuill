// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines sourcebook API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { sourcebookApi } from './sourcebook';
import { fetchJson, postJson, putJson, deleteJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  deleteJson: vi.fn(),
}));
registerSharedApiMockCleanup();

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
    vi.mocked(postJson).mockResolvedValueOnce({ id: '1', name: 'n' });

    const entry = {
      name: 'Entry',
      synonyms: ['Alias'],
      category: 'character',
      description: 'Desc',
      images: ['img.png'],
    };

    await sourcebookApi.create(entry);

    expect(postJson).toHaveBeenCalledWith(
      '/sourcebook',
      entry,
      'Failed to create entry'
    );
  });

  it('calls PUT /sourcebook/{id}', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({ id: '1', name: 'n' });

    const updates = { description: 'Updated' };
    await sourcebookApi.update('entry-id', updates);

    expect(putJson).toHaveBeenCalledWith(
      '/sourcebook/entry-id',
      updates,
      'Failed to update entry'
    );
  });

  it('encodes slashes on PUT /sourcebook/{id}', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({
      id: 'Dennis/Denise',
      name: 'Dennis/Denise',
    });

    const updates = { description: 'Updated' };
    await sourcebookApi.update('Dennis/Denise', updates);

    expect(putJson).toHaveBeenCalledWith(
      '/sourcebook/Dennis%2FDenise',
      updates,
      'Failed to update entry'
    );
  });

  it('calls DELETE /sourcebook/{id}', async () => {
    vi.mocked(deleteJson).mockResolvedValueOnce({ ok: true });

    await sourcebookApi.delete('entry-id');

    expect(deleteJson).toHaveBeenCalledWith(
      '/sourcebook/entry-id',
      'Failed to delete entry'
    );
  });

  it('encodes slashes on DELETE /sourcebook/{id}', async () => {
    vi.mocked(deleteJson).mockResolvedValueOnce({ ok: true });

    await sourcebookApi.delete('Dennis/Denise');

    expect(deleteJson).toHaveBeenCalledWith(
      '/sourcebook/Dennis%2FDenise',
      'Failed to delete entry'
    );
  });

  it('calls POST /sourcebook/keywords', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ keywords: ['a', 'b'] });

    await sourcebookApi.generateKeywords({
      name: 'Entry',
      description: 'Desc',
      synonyms: ['Alias'],
    });

    expect(postJson).toHaveBeenCalledWith(
      '/sourcebook/keywords',
      {
        name: 'Entry',
        description: 'Desc',
        synonyms: ['Alias'],
      },
      'Failed to generate keywords'
    );
  });
});
