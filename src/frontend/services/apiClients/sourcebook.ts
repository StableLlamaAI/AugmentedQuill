// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebook unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { SourcebookEntry } from '../../types';
import { SourcebookUpsertPayload } from '../apiTypes';
import { fetchJson, postJson, putJson, deleteJson, projectEndpoint } from './shared';

export const createSourcebookApi = (projectName: string) => ({
  list: async (
    query?: string,
    matchMode: 'direct' | 'extensive' = 'extensive',
    splitQueryFallback: boolean = false
  ) => {
    const params = new URLSearchParams();
    if (query !== undefined) {
      params.set('query', query);
    }
    params.set('match_mode', matchMode);
    params.set('split_query_fallback', splitQueryFallback ? 'true' : 'false');
    const qs = params.toString();
    const baseUrl = projectEndpoint(projectName, '/sourcebook');
    const url = qs ? `${baseUrl}?${qs}` : baseUrl;
    return fetchJson<SourcebookEntry[]>(url, undefined, 'Failed to load sourcebook');
  },

  create: async (entry: SourcebookUpsertPayload) => {
    return postJson<SourcebookEntry>(
      projectEndpoint(projectName, '/sourcebook'),
      entry,
      'Failed to create entry'
    );
  },

  update: async (id: string, updates: Partial<SourcebookUpsertPayload>) => {
    const escapedId = encodeURIComponent(id);
    return putJson<SourcebookEntry>(
      projectEndpoint(projectName, `/sourcebook/${escapedId}`),
      updates,
      'Failed to update entry'
    );
  },

  delete: async (id: string) => {
    const escapedId = encodeURIComponent(id);
    return deleteJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/sourcebook/${escapedId}`),
      'Failed to delete entry'
    );
  },

  generateKeywords: async (payload: {
    name: string;
    description: string;
    synonyms?: string[];
  }) => {
    return postJson<{ keywords: string[] }>(
      projectEndpoint(projectName, '/sourcebook/keywords'),
      payload,
      'Failed to generate keywords'
    );
  },
});

export const sourcebookApi = createSourcebookApi('');
