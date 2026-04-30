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
import { fetchJson, projectEndpoint } from './shared';

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

export interface SearchApi {
  search: (opts: SearchOptions) => Promise<SearchResponse>;
  replaceAll: (req: ReplaceAllRequest) => Promise<ReplaceResponse>;
  replaceSingle: (req: ReplaceSingleRequest) => Promise<ReplaceResponse>;
}

export const createSearchApi = (projectName: string): SearchApi => ({
  search: (opts: SearchOptions): Promise<SearchResponse> =>
    fetchJson<SearchResponse>(
      projectEndpoint(projectName, '/search'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      },
      'Search failed'
    ),

  replaceAll: (req: ReplaceAllRequest): Promise<ReplaceResponse> =>
    fetchJson<ReplaceResponse>(
      projectEndpoint(projectName, '/search/replace-all'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'Replace all failed'
    ),

  replaceSingle: (req: ReplaceSingleRequest): Promise<ReplaceResponse> =>
    fetchJson<ReplaceResponse>(
      projectEndpoint(projectName, '/search/replace-single'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'Replace failed'
    ),
});

export const searchApi = createSearchApi('');
