// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for useSearchReplace so highlight lifecycle and
 * search/close state management cannot break silently.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { api } from '../../services/api';
import { useSearchReplace } from './useSearchReplace';
import type { SearchResponse } from '../../services/apiClients/search';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeResponse = (matchText: string): SearchResponse => ({
  total_matches: 1,
  results: [
    {
      section_type: 'chapter_content',
      section_id: '42',
      section_title: 'Chapter 1',
      field: 'content',
      field_display: 'Content',
      matches: [
        {
          start: 10,
          end: 10 + matchText.length,
          match_text: matchText,
          context_before: 'before ',
          context_after: ' after',
        },
      ],
    },
  ],
});

const emptyResponse: SearchResponse = { total_matches: 0, results: [] };

// ─── Tests ───────────────────────────────────────────────────────────────────

let searchSpy: ReturnType<typeof vi.spyOn>;

function setupSearchSpy(): void {
  searchSpy = vi.spyOn(api.search, 'search').mockResolvedValue(emptyResponse);
  vi.useFakeTimers();
}

function teardownSearchSpy(): void {
  vi.restoreAllMocks();
  vi.useRealTimers();
}

describe('useSearchReplace: open / close state', () => {
  beforeEach(setupSearchSpy);
  afterEach(teardownSearchSpy);

  it('starts closed with empty query and no highlights', () => {
    const { result } = renderHook(() => useSearchReplace());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.highlightActive).toBe(false);
    expect(result.current.highlightRanges).toEqual({});
  });

  it('open() shows the dialog', () => {
    const { result } = renderHook(() => useSearchReplace());
    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('close() without keepHighlight clears query, results, and highlights', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(result.current.highlightActive).toBe(true);
    expect(result.current.query).toBe('hello');
    expect(result.current.totalMatches).toBe(1);

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.highlightActive).toBe(false);
    expect(result.current.highlightRanges).toEqual({});
    expect(result.current.highlightTexts).toEqual({});
    expect(result.current.totalMatches).toBe(0);
    expect(result.current.flatMatches).toHaveLength(0);
    expect(result.current.currentMatchIndex).toBeNull();
  });

  it('close(true) preserves highlights, query and results', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(result.current.highlightActive).toBe(true);
    act(() => {
      result.current.close(true);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('hello');
    expect(result.current.highlightActive).toBe(true);
    expect(result.current.totalMatches).toBe(1);
    expect(result.current.flatMatches).toHaveLength(1);
    const key = 'chapter_content:42:content';
    expect(result.current.highlightRanges[key]).toHaveLength(1);
    expect(result.current.highlightRanges[key][0]).toEqual({ start: 10, end: 15 });
  });

  it('re-opening after a normal close has an empty query', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });
    act(() => {
      result.current.close();
    }); // normal close — clears
    act(() => {
      result.current.open();
    }); // re-open

    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('');
    expect(result.current.highlightActive).toBe(false);
  });

  it('re-opening after close(true) still has the previous query', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });
    act(() => {
      result.current.close(true);
    }); // keepHighlight — preserves
    act(() => {
      result.current.open();
    }); // re-open

    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('hello');
    expect(result.current.highlightActive).toBe(true);
  });
});

describe('useSearchReplace: runSearch', () => {
  beforeEach(setupSearchSpy);
  afterEach(teardownSearchSpy);

  it('sets highlightActive and populates ranges', async () => {
    searchSpy.mockResolvedValue(makeResponse('world'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.setQuery('world');
    });
    await act(async () => {
      await result.current.runSearch(null);
    });

    expect(result.current.highlightActive).toBe(true);
    const key = 'chapter_content:42:content';
    expect(result.current.highlightRanges[key]).toBeDefined();
    expect(result.current.highlightTexts[key]).toContain('world');
  });

  it('with empty query clears highlights', async () => {
    searchSpy.mockResolvedValue(makeResponse('world'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.setQuery('world');
    });
    await act(async () => {
      await result.current.runSearch(null);
    });

    expect(result.current.highlightActive).toBe(true);

    act(() => {
      result.current.setQuery('');
    });
    await act(async () => {
      await result.current.runSearch(null);
    });

    expect(result.current.highlightActive).toBe(false);
    expect(result.current.highlightRanges).toEqual({});
  });
});

describe('useSearchReplace: notifyContentChanged', () => {
  beforeEach(setupSearchSpy);
  afterEach(teardownSearchSpy);

  it('does nothing when highlights are not active', async () => {
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.notifyContentChanged(42);
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('triggers a refresh search after debounce', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.notifyContentChanged(42);
    });
    expect(searchSpy).toHaveBeenCalledTimes(1);

    searchSpy.mockResolvedValue(emptyResponse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.highlightRanges).toEqual({});
  });

  it('rapid calls only fire one debounced search', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.notifyContentChanged(42);
      result.current.notifyContentChanged(42);
      result.current.notifyContentChanged(42);
    });

    searchSpy.mockResolvedValue(emptyResponse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(searchSpy).toHaveBeenCalledTimes(2);
  });
});
