// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: API client for project-wide search and replace operations.
 */

import { components } from '../../types/api.generated';
import { fetchJson } from './shared';

// ─── Re-export generated types ────────────────────────────────────────────────

export type SearchScope = components['schemas']['SearchScope'];
export type SearchOptions = components['schemas']['SearchOptions'];
export type SearchMatch = components['schemas']['SearchMatch'];
export type SearchResultSection = components['schemas']['SearchResultSection'];
// SearchResponse.results is optional in the generated schema; we narrow it here
// so that existing consumers that destructure results directly continue to work.
export type SearchResponse = Omit<
  components['schemas']['SearchResponse'],
  'results'
> & {
  results: SearchResultSection[];
};
export type ReplaceAllRequest = components['schemas']['ReplaceAllRequest'];
export type ReplaceSingleRequest = components['schemas']['ReplaceSingleRequest'];
export type ReplaceResponse = components['schemas']['ReplaceResponse'];

// ─── Client ──────────────────────────────────────────────────────────────────

export const searchApi = {
  search: (opts: SearchOptions): Promise<SearchResponse> =>
    fetchJson<SearchResponse>(
      '/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      },
      'Search failed'
    ),

  replaceAll: (req: ReplaceAllRequest): Promise<ReplaceResponse> =>
    fetchJson<ReplaceResponse>(
      '/search/replace-all',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'Replace all failed'
    ),

  replaceSingle: (req: ReplaceSingleRequest): Promise<ReplaceResponse> =>
    fetchJson<ReplaceResponse>(
      '/search/replace-single',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'Replace failed'
    ),
};
