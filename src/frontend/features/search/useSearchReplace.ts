// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: State hook that manages all search-and-replace UI state and
 * orchestrates API calls for the SearchReplaceDialog.
 */

import { useState, useCallback } from 'react';
import { api } from '../../services/api';
import type {
  SearchScope,
  SearchResultSection,
} from '../../services/apiClients/search';

export interface FlatMatch {
  sectionIndex: number;
  matchIndex: number;
  sectionType: string;
  sectionId: string;
  field: string;
  start: number;
  end: number;
}

export interface UseSearchReplaceResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  query: string;
  setQuery: (q: string) => void;
  replacement: string;
  setReplacement: (r: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (v: boolean) => void;
  isRegex: boolean;
  setIsRegex: (v: boolean) => void;
  isPhonetic: boolean;
  setIsPhonetic: (v: boolean) => void;
  scope: SearchScope;
  setScope: (s: SearchScope) => void;
  results: SearchResultSection[];
  totalMatches: number;
  currentMatchIndex: number | null;
  flatMatches: FlatMatch[];
  isLoading: boolean;
  error: string | null;
  runSearch: (activeChapterId?: number | null) => Promise<void>;
  selectMatch: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  replaceCurrent: (activeChapterId?: number | null) => Promise<boolean>;
  replaceAllMatches: (activeChapterId?: number | null) => Promise<{
    count: number;
    storyChanged: boolean;
  }>;
}

const buildFlatMatches = (results: SearchResultSection[]): FlatMatch[] => {
  const flat: FlatMatch[] = [];
  results.forEach((section, si) => {
    section.matches.forEach((match, mi) => {
      flat.push({
        sectionIndex: si,
        matchIndex: mi,
        sectionType: section.section_type,
        sectionId: section.section_id,
        field: section.field,
        start: match.start,
        end: match.end,
      });
    });
  });
  return flat;
};

export const useSearchReplace = (): UseSearchReplaceResult => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [isPhonetic, setIsPhonetic] = useState(false);
  const [scope, setScope] = useState<SearchScope>('all');
  const [results, setResults] = useState<SearchResultSection[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number | null>(null);
  const [flatMatches, setFlatMatches] = useState<FlatMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const runSearch = useCallback(
    async (activeChapterId?: number | null) => {
      if (!query.trim()) {
        setResults([]);
        setTotalMatches(0);
        setFlatMatches([]);
        setCurrentMatchIndex(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const resp = await api.search.search({
          query,
          scope,
          case_sensitive: caseSensitive,
          is_regex: isRegex,
          is_phonetic: isPhonetic,
          active_chapter_id: activeChapterId ?? null,
        });
        setResults(resp.results);
        setTotalMatches(resp.total_matches);
        const flat = buildFlatMatches(resp.results);
        setFlatMatches(flat);
        setCurrentMatchIndex(flat.length > 0 ? 0 : null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setResults([]);
        setTotalMatches(0);
        setFlatMatches([]);
        setCurrentMatchIndex(null);
      } finally {
        setIsLoading(false);
      }
    },
    [query, scope, caseSensitive, isRegex, isPhonetic]
  );

  const navigateNext = useCallback(() => {
    if (flatMatches.length === 0) return;
    setCurrentMatchIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % flatMatches.length;
    });
  }, [flatMatches.length]);

  const navigatePrev = useCallback(() => {
    if (flatMatches.length === 0) return;
    setCurrentMatchIndex((prev) => {
      if (prev === null) return flatMatches.length - 1;
      return (prev - 1 + flatMatches.length) % flatMatches.length;
    });
  }, [flatMatches.length]);

  const selectMatch = useCallback(
    (index: number) => {
      if (flatMatches.length === 0) return;
      if (index < 0 || index >= flatMatches.length) return;
      setCurrentMatchIndex(index);
    },
    [flatMatches.length]
  );

  const replaceCurrent = useCallback(
    async (activeChapterId?: number | null): Promise<boolean> => {
      if (currentMatchIndex === null || flatMatches.length === 0) return false;
      const match = flatMatches[currentMatchIndex];
      setIsLoading(true);
      setError(null);
      try {
        await api.search.replaceSingle({
          query,
          scope,
          case_sensitive: caseSensitive,
          is_regex: isRegex,
          is_phonetic: isPhonetic,
          active_chapter_id: activeChapterId ?? null,
          replacement,
          section_type: match.sectionType,
          section_id: match.sectionId,
          field: match.field,
          match_index: match.matchIndex,
        });
        // Re-run search to refresh results
        const resp = await api.search.search({
          query,
          scope,
          case_sensitive: caseSensitive,
          is_regex: isRegex,
          is_phonetic: isPhonetic,
          active_chapter_id: activeChapterId ?? null,
        });
        setResults(resp.results);
        setTotalMatches(resp.total_matches);
        const flat = buildFlatMatches(resp.results);
        setFlatMatches(flat);
        if (flat.length > 0) {
          setCurrentMatchIndex((prev) =>
            prev === null ? 0 : Math.min(prev, flat.length - 1)
          );
        } else {
          setCurrentMatchIndex(null);
        }
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [
      currentMatchIndex,
      flatMatches,
      query,
      replacement,
      scope,
      caseSensitive,
      isRegex,
      isPhonetic,
    ]
  );

  const replaceAllMatches = useCallback(
    async (activeChapterId?: number | null) => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await api.search.replaceAll({
          query,
          scope,
          case_sensitive: caseSensitive,
          is_regex: isRegex,
          is_phonetic: isPhonetic,
          active_chapter_id: activeChapterId ?? null,
          replacement,
        });
        // Re-run search to confirm empty results
        const searchResp = await api.search.search({
          query,
          scope,
          case_sensitive: caseSensitive,
          is_regex: isRegex,
          is_phonetic: isPhonetic,
          active_chapter_id: activeChapterId ?? null,
        });
        setResults(searchResp.results);
        setTotalMatches(searchResp.total_matches);
        const flat = buildFlatMatches(searchResp.results);
        setFlatMatches(flat);
        setCurrentMatchIndex(flat.length > 0 ? 0 : null);
        return {
          count: resp.replacements_made,
          storyChanged: resp.replacements_made > 0,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return { count: 0, storyChanged: false };
      } finally {
        setIsLoading(false);
      }
    },
    [query, replacement, scope, caseSensitive, isRegex, isPhonetic]
  );

  return {
    isOpen,
    open,
    close,
    query,
    setQuery,
    replacement,
    setReplacement,
    caseSensitive,
    setCaseSensitive,
    isRegex,
    setIsRegex,
    isPhonetic,
    setIsPhonetic,
    scope,
    setScope,
    results,
    totalMatches,
    currentMatchIndex,
    flatMatches,
    isLoading,
    error,
    runSearch,
    selectMatch,
    navigateNext,
    navigatePrev,
    replaceCurrent,
    replaceAllMatches,
  };
};
