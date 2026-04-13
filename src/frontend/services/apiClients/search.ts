// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: API client for project-wide search and replace operations.
 */

import { fetchJson } from './shared';

// ─── Request / response types ────────────────────────────────────────────────

export type SearchScope =
  | 'current_chapter'
  | 'all_chapters'
  | 'sourcebook'
  | 'metadata'
  | 'all';

export interface SearchOptions {
  query: string;
  scope: SearchScope;
  case_sensitive: boolean;
  is_regex: boolean;
  is_phonetic: boolean;
  active_chapter_id?: number | null;
}

export interface SearchMatch {
  start: number;
  end: number;
  match_text: string;
  context_before: string;
  context_after: string;
}

export interface SearchResultSection {
  section_type:
    | 'chapter_content'
    | 'chapter_metadata'
    | 'story_metadata'
    | 'sourcebook';
  section_id: string;
  section_title: string;
  field: string;
  field_display: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  results: SearchResultSection[];
  total_matches: number;
}

export interface ReplaceAllRequest extends SearchOptions {
  replacement: string;
}

export interface ReplaceSingleRequest extends SearchOptions {
  replacement: string;
  section_type: string;
  section_id: string;
  field: string;
  match_index: number;
}

export interface ReplaceResponse {
  replacements_made: number;
  changed_sections: string[];
}

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
