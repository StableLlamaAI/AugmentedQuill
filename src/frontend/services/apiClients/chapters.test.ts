// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chapters API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { chaptersApi } from './chapters';
import { fetchJson, postJson, putJson, deleteJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  deleteJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('chaptersApi', () => {
  it('calls GET /chapters', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ chapters: [] });

    await chaptersApi.list();

    expect(fetchJson).toHaveBeenCalledWith(
      '/chapters',
      undefined,
      'Failed to list chapters'
    );
  });

  it('calls GET /chapters/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ id: 1, title: 'C1' });

    await chaptersApi.get(7);

    expect(fetchJson).toHaveBeenCalledWith(
      '/chapters/7',
      undefined,
      'Failed to get chapter'
    );
  });

  it('calls POST /chapters', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true, id: 1, title: 'C1' });

    await chaptersApi.create('C1', 'Body', 'book-1');

    expect(postJson).toHaveBeenCalledWith(
      '/chapters',
      { title: 'C1', content: 'Body', book_id: 'book-1' },
      'Failed to create chapter'
    );
  });

  it('calls PUT /chapters/{id}/content', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({ ok: true });

    await chaptersApi.updateContent(2, 'New content');

    expect(putJson).toHaveBeenCalledWith(
      '/chapters/2/content',
      { content: 'New content' },
      'Failed to update chapter content'
    );
  });

  it('calls PUT /chapters/{id}/title', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({ ok: true });

    await chaptersApi.updateTitle(2, 'New title');

    expect(putJson).toHaveBeenCalledWith(
      '/chapters/2/title',
      { title: 'New title' },
      'Failed to update chapter title'
    );
  });

  it('calls PUT /chapters/{id}/summary', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({ ok: true });

    await chaptersApi.updateSummary(2, 'New summary');

    expect(putJson).toHaveBeenCalledWith(
      '/chapters/2/summary',
      { summary: 'New summary' },
      'Failed to update chapter summary'
    );
  });

  it('calls PUT /chapters/{id}/metadata', async () => {
    vi.mocked(putJson).mockResolvedValueOnce({ ok: true });

    const payload = { summary: 'S', notes: 'N', private_notes: 'P' };
    await chaptersApi.updateMetadata(3, payload);

    expect(putJson).toHaveBeenCalledWith(
      '/chapters/3/metadata',
      payload,
      'Failed to update chapter metadata'
    );
  });

  it('calls DELETE /chapters/{id}', async () => {
    vi.mocked(deleteJson).mockResolvedValueOnce({ ok: true });

    await chaptersApi.delete(9);

    expect(deleteJson).toHaveBeenCalledWith('/chapters/9', 'Failed to delete chapter');
  });

  it('calls POST /chapters/reorder with optional book id', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ ok: true });

    await chaptersApi.reorder([1, 2, 3]);
    expect(fetchJson).toHaveBeenCalledWith(
      '/chapters/reorder',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_ids: [1, 2, 3] }),
      },
      'Failed to reorder chapters'
    );

    await chaptersApi.reorder([4, 5], 'book-2');
    expect(fetchJson).toHaveBeenCalledWith(
      '/chapters/reorder',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: 'book-2', chapter_ids: [4, 5] }),
      },
      'Failed to reorder chapters'
    );
  });
});
