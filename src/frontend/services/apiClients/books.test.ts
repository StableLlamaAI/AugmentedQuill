// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines books API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { booksApi } from './books';
import { postJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  projectEndpoint: vi.fn((projectName: string, path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!projectName) return normalizedPath;
    return `/projects/${encodeURIComponent(projectName)}${normalizedPath}`;
  }),
  fetchJson: vi.fn(),
  postJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('booksApi', () => {
  it('calls POST /books/create', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true, book_id: 'b1' });

    await booksApi.create('Book One');

    expect(postJson).toHaveBeenCalledWith(
      '/books/create',
      { name: 'Book One' },
      'Failed to create book'
    );
  });

  it('calls POST /books/delete', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true });

    await booksApi.delete('book-id');

    expect(postJson).toHaveBeenCalledWith(
      '/books/delete',
      { name: 'book-id' },
      'Failed to delete book'
    );
  });

  it('calls POST /books/reorder', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true });

    await booksApi.reorder(['a', 'b']);

    expect(postJson).toHaveBeenCalledWith(
      '/books/reorder',
      { book_ids: ['a', 'b'] },
      'Failed to reorder books'
    );
  });

  it('calls POST /books/{id}/metadata', async () => {
    vi.mocked(postJson).mockResolvedValueOnce({ ok: true });

    await booksApi.updateBookMetadata('book-7', {
      title: 'T',
      summary: 'S',
      notes: 'N',
      private_notes: 'P',
    });

    expect(postJson).toHaveBeenCalledWith(
      '/books/book-7/metadata',
      { title: 'T', summary: 'S', notes: 'N', private_notes: 'P' },
      'Failed to update book metadata'
    );
  });
});
