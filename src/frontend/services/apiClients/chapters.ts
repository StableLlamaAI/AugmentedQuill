// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chapters unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Conflict } from '../../types';
import { ChapterDetailResponse, ChapterListResponse } from '../apiTypes';
import { fetchJson, putJson, postJson, deleteJson, projectEndpoint } from './shared';

export interface ChaptersApi {
  list: () => Promise<ChapterListResponse>;
  get: (id: number) => Promise<ChapterDetailResponse>;
  create: (
    title: string,
    content?: string,
    book_id?: string
  ) => Promise<{
    ok: boolean;
    id: number;
    title: string;
    book_id?: string | undefined;
  }>;
  updateContent: (id: number, content: string) => Promise<{ ok: boolean }>;
  updateTitle: (id: number, title: string) => Promise<{ ok: boolean }>;
  updateSummary: (id: number, summary: string) => Promise<{ ok: boolean }>;
  updateMetadata: (
    id: number,
    data: {
      summary?: string;
      notes?: string;
      private_notes?: string;
      conflicts?: Conflict[];
    }
  ) => Promise<{ ok: boolean; id?: number | undefined; message?: string | undefined }>;
  delete: (id: number) => Promise<{ ok: boolean }>;
  reorder: (chapterIds: number[], bookId?: string) => Promise<{ ok: boolean }>;
}

export const createChaptersApi = (projectName: string): ChaptersApi => ({
  list: async () =>
    fetchJson<ChapterListResponse>(
      projectEndpoint(projectName, '/chapters'),
      undefined,
      'Failed to list chapters'
    ),

  get: async (id: number) => {
    return fetchJson<ChapterDetailResponse>(
      projectEndpoint(projectName, `/chapters/${id}`),
      undefined,
      'Failed to get chapter'
    );
  },

  create: async (
    title: string,
    content: string = '',
    book_id?: string
  ): Promise<{
    ok: boolean;
    id: number;
    title: string;
    book_id?: string | undefined;
  }> => {
    return postJson<{ ok: boolean; id: number; title: string; book_id?: string }>(
      projectEndpoint(projectName, '/chapters'),
      { title, content, book_id },
      'Failed to create chapter'
    );
  },

  updateContent: async (id: number, content: string): Promise<{ ok: boolean }> => {
    return putJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chapters/${id}/content`),
      { content },
      'Failed to update chapter content'
    );
  },

  updateTitle: async (id: number, title: string): Promise<{ ok: boolean }> => {
    return putJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chapters/${id}/title`),
      { title },
      'Failed to update chapter title'
    );
  },

  updateSummary: async (id: number, summary: string): Promise<{ ok: boolean }> => {
    return putJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chapters/${id}/summary`),
      { summary },
      'Failed to update chapter summary'
    );
  },

  updateMetadata: async (
    id: number,
    data: {
      summary?: string;
      notes?: string;
      private_notes?: string;
      conflicts?: Conflict[];
    }
  ): Promise<{
    ok: boolean;
    id?: number | undefined;
    message?: string | undefined;
  }> => {
    return putJson<{ ok: boolean; id?: number; message?: string }>(
      projectEndpoint(projectName, `/chapters/${id}/metadata`),
      data,
      'Failed to update chapter metadata'
    );
  },

  delete: async (id: number): Promise<{ ok: boolean }> => {
    return deleteJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chapters/${id}`),
      'Failed to delete chapter'
    );
  },

  reorder: async (chapterIds: number[], bookId?: string): Promise<{ ok: boolean }> => {
    return fetchJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/chapters/reorder'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          bookId
            ? { book_id: bookId, chapter_ids: chapterIds }
            : { chapter_ids: chapterIds }
        ),
      },
      'Failed to reorder chapters'
    );
  },
});

export const chaptersApi = createChaptersApi('');
