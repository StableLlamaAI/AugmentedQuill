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

import { useState, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { useDebounce } from '../../utils/hooks';
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

export interface SearchHighlightRange {
  start: number;
  end: number;
}

export type SearchHighlightMap = Record<string, SearchHighlightRange[]>;
export type SearchHighlightTextMap = Record<string, string[]>;

export const buildSearchSectionKey = (
  sectionType: string,
  sectionId: string,
  field: string
): string => `${sectionType}:${sectionId}:${field}`;

export interface UseSearchReplaceResult {
  isOpen: boolean;
  open: () => void;
  close: (keepHighlight?: boolean) => void;
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
  highlightActive: boolean;
  highlightRanges: SearchHighlightMap;
  highlightTexts: SearchHighlightTextMap;
  runSearch: (activeChapterId?: number | null) => Promise<void>;
  selectMatch: (index: number) => void;
  navigateNext: () => void;
  navigatePrev: () => void;
  replaceCurrent: (activeChapterId?: number | null) => Promise<boolean>;
  replaceAllMatches: (activeChapterId?: number | null) => Promise<{
    count: number;
    storyChanged: boolean;
  }>;
  notifyContentChanged: (activeChapterId?: number | null) => void;
}

const buildFlatMatches = (results: SearchResultSection[]): FlatMatch[] => {
  const flat: FlatMatch[] = [];
  results.forEach((section: SearchResultSection, si: number): void => {
    (section.matches ?? []).forEach(
      (
        match: import('../../services/apiClients/search').SearchMatch,
        mi: number
      ): void => {
        flat.push({
          sectionIndex: si,
          matchIndex: mi,
          sectionType: section.section_type,
          sectionId: section.section_id,
          field: section.field,
          start: match.start,
          end: match.end,
        });
      }
    );
  });
  return flat;
};

const buildHighlightMaps = (
  results: SearchResultSection[]
): {
  ranges: SearchHighlightMap;
  texts: SearchHighlightTextMap;
} => {
  const ranges: SearchHighlightMap = {};
  const texts: SearchHighlightTextMap = {};

  results.forEach((section: SearchResultSection): void => {
    const key = buildSearchSectionKey(
      section.section_type,
      section.section_id,
      section.field
    );
    ranges[key] = (section.matches ?? []).map(
      (
        match: import('../../services/apiClients/search').SearchMatch
      ): { start: number; end: number } => ({
        start: match.start,
        end: match.end,
      })
    );
    const seen = new Set<string>();
    texts[key] = (section.matches ?? []).reduce<string[]>(
      (
        acc: string[],
        match: import('../../services/apiClients/search').SearchMatch
      ): string[] => {
        if (!seen.has(match.match_text)) {
          seen.add(match.match_text);
          acc.push(match.match_text);
        }
        return acc;
      },
      []
    );
  });

  return { ranges, texts };
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
  const [highlightActive, setHighlightActive] = useState(false);
  const [highlightRanges, setHighlightRanges] = useState<SearchHighlightMap>({});
  const [highlightTexts, setHighlightTexts] = useState<SearchHighlightTextMap>({});

  // Stable refs used by notifyContentChanged so the debounce callback always
  // reads the latest values without becoming a new function reference on every render.
  const highlightActiveRef = useRef(false);
  highlightActiveRef.current = highlightActive;
  const searchParamsRef = useRef({ query, scope, caseSensitive, isRegex, isPhonetic });
  searchParamsRef.current = { query, scope, caseSensitive, isRegex, isPhonetic };

  const open = useCallback((): void => setIsOpen(true), []);
  const close = useCallback((keepHighlight: boolean | undefined = false): void => {
    setIsOpen(false);
    setError(null);
    if (!keepHighlight) {
      setHighlightActive(false);
      setHighlightRanges({});
      setHighlightTexts({});
      setQuery('');
      setResults([]);
      setTotalMatches(0);
      setFlatMatches([]);
      setCurrentMatchIndex(null);
    }
  }, []);

  const runSearch = useCallback(
    async (activeChapterId?: number | null): Promise<void> => {
      if (!query.trim()) {
        setResults([]);
        setTotalMatches(0);
        setFlatMatches([]);
        setCurrentMatchIndex(null);
        setHighlightActive(false);
        setHighlightRanges({});
        setHighlightTexts({});
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
        const { ranges, texts } = buildHighlightMaps(resp.results);
        setHighlightRanges(ranges);
        setHighlightTexts(texts);
        setHighlightActive(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setResults([]);
        setTotalMatches(0);
        setFlatMatches([]);
        setCurrentMatchIndex(null);
        setHighlightActive(false);
        setHighlightRanges({});
        setHighlightTexts({});
      } finally {
        setIsLoading(false);
      }
    },
    [query, scope, caseSensitive, isRegex, isPhonetic]
  );

  const navigateNext = useCallback((): void => {
    if (flatMatches.length === 0) return;
    setCurrentMatchIndex((prev: number | null): number => {
      if (prev === null) return 0;
      return (prev + 1) % flatMatches.length;
    });
  }, [flatMatches.length]);

  const navigatePrev = useCallback((): void => {
    if (flatMatches.length === 0) return;
    setCurrentMatchIndex((prev: number | null): number => {
      if (prev === null) return flatMatches.length - 1;
      return (prev - 1 + flatMatches.length) % flatMatches.length;
    });
  }, [flatMatches.length]);

  const selectMatch = useCallback(
    (index: number): void => {
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
          setCurrentMatchIndex((prev: number | null): number =>
            prev === null ? 0 : Math.min(prev, flat.length - 1)
          );
        } else {
          setCurrentMatchIndex(null);
        }
        const { ranges, texts } = buildHighlightMaps(resp.results);
        setHighlightRanges(ranges);
        setHighlightTexts(texts);
        setHighlightActive(true);
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
    async (
      activeChapterId?: number | null
    ): Promise<{ count: number; storyChanged: boolean }> => {
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
        const { ranges, texts } = buildHighlightMaps(searchResp.results);
        setHighlightRanges(ranges);
        setHighlightTexts(texts);
        setHighlightActive(true);
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

  const refreshHighlights = useCallback(
    (activeChapterId?: number | null): void => {
      const {
        query: q,
        scope: s,
        caseSensitive: cs,
        isRegex: ir,
        isPhonetic: ip,
      } = searchParamsRef.current;
      void (async (): Promise<void> => {
        try {
          const resp = await api.search.search({
            query: q,
            scope: s,
            case_sensitive: cs,
            is_regex: ir,
            is_phonetic: ip,
            active_chapter_id: activeChapterId ?? null,
          });
          const flat = buildFlatMatches(resp.results);
          const { ranges, texts } = buildHighlightMaps(resp.results);
          setResults(resp.results);
          setTotalMatches(resp.total_matches);
          setFlatMatches(flat);
          setCurrentMatchIndex((prev: number | null): number | null =>
            flat.length === 0
              ? null
              : prev === null
                ? null
                : Math.min(prev, flat.length - 1)
          );
          setHighlightRanges(ranges);
          setHighlightTexts(texts);
        } catch {
          // Silently ignore errors on background highlight refresh
        }
      })();
    },
    [] // stable — all values read via refs
  );

  const debouncedRefreshHighlights = useDebounce(refreshHighlights, 800);

  const notifyContentChanged = useCallback(
    (activeChapterId?: number | null): void => {
      if (!highlightActiveRef.current || !searchParamsRef.current.query.trim()) return;
      debouncedRefreshHighlights(activeChapterId);
    },
    [debouncedRefreshHighlights]
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
    highlightActive,
    highlightRanges,
    highlightTexts,
    runSearch,
    selectMatch,
    navigateNext,
    navigatePrev,
    replaceCurrent,
    replaceAllMatches,
    notifyContentChanged,
  };
};
