// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the books unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { postJson, projectEndpoint } from './shared';

export interface BooksApi {
  create: (
    title: string
  ) => Promise<{ ok: boolean; book_id?: string; story?: unknown }>;
  delete: (
    id: string
  ) => Promise<{ ok: boolean; story?: unknown; restore_id?: string }>;
  restore: (
    restoreId: string
  ) => Promise<{ ok: boolean; story?: unknown; book_id?: string }>;
  reorder: (bookIds: string[]) => Promise<{ ok: boolean }>;
  updateBookMetadata: (
    bookId: string,
    data: {
      title?: string;
      summary?: string;
      notes?: string;
      private_notes?: string;
    }
  ) => Promise<{ ok: boolean; detail?: string | undefined }>;
}

export const createBooksApi = (projectName: string): BooksApi => ({
  create: async (title: string) => {
    return postJson<{ ok: boolean; book_id?: string; story?: unknown }>(
      '/books/create',
      { name: title },
      'Failed to create book'
    );
  },

  delete: async (id: string) => {
    return postJson<{ ok: boolean; story?: unknown; restore_id?: string }>(
      '/books/delete',
      { name: id },
      'Failed to delete book'
    );
  },

  restore: async (restoreId: string) => {
    return postJson<{ ok: boolean; story?: unknown; book_id?: string }>(
      '/books/restore',
      { restore_id: restoreId },
      'Failed to restore book'
    );
  },

  reorder: async (bookIds: string[]): Promise<{ ok: boolean }> => {
    return postJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/books/reorder'),
      { book_ids: bookIds },
      'Failed to reorder books'
    );
  },

  updateBookMetadata: async (
    bookId: string,
    data: {
      title?: string;
      summary?: string;
      notes?: string;
      private_notes?: string;
    }
  ): Promise<{ ok: boolean; detail?: string | undefined }> => {
    return postJson<{ ok: boolean; detail?: string }>(
      projectEndpoint(projectName, `/books/${bookId}/metadata`),
      data,
      'Failed to update book metadata'
    );
  },
});

export const booksApi = createBooksApi('');
