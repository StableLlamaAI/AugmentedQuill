// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Provides a centralized search highlight context for editor and
 * metadata renderers so active search hits can remain visible outside the
 * search dialog.
 */

import React, { createContext, useContext } from 'react';
import type { SearchHighlightMap, SearchHighlightTextMap } from './useSearchReplace';

export const buildSearchSectionKey = (
  sectionType: string,
  sectionId: string,
  field: string
): string => `${sectionType}:${sectionId}:${field}`;

interface SearchHighlightContextValue {
  highlightActive: boolean;
  ranges: SearchHighlightMap;
  texts: SearchHighlightTextMap;
}

const SearchHighlightContext = createContext<SearchHighlightContextValue | null>(null);

export const SearchHighlightProvider: React.FC<{
  value: SearchHighlightContextValue;
  children: React.ReactNode;
}> = ({
  value,
  children,
}: {
  value: SearchHighlightContextValue;
  children: React.ReactNode;
}) => (
  <SearchHighlightContext.Provider value={value}>
    {children}
  </SearchHighlightContext.Provider>
);

export interface SearchHighlightHookResult {
  highlightActive: boolean;
  getRanges: (sectionType: string, sectionId: string, field: string) => unknown[];
  getMatchTexts: (sectionType: string, sectionId: string, field: string) => string[];
}

export const useSearchHighlight = (): SearchHighlightHookResult => {
  const context = useContext(SearchHighlightContext);
  const getKey = (sectionType: string, sectionId: string, field: string): string =>
    buildSearchSectionKey(sectionType, sectionId, field);

  return {
    highlightActive: context?.highlightActive ?? false,
    getRanges: (sectionType: string, sectionId: string, field: string) =>
      context?.ranges[getKey(sectionType, sectionId, field)] ?? [],
    getMatchTexts: (sectionType: string, sectionId: string, field: string): string[] =>
      context?.texts[getKey(sectionType, sectionId, field)] ?? [],
  };
};
