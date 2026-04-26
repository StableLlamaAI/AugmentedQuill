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

describe('useSearchReplace', () => {
  let searchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    searchSpy = vi.spyOn(api.search, 'search').mockResolvedValue(emptyResponse);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── open / close state ────────────────────────────────────────────────────

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

  // ── normal close clears everything ───────────────────────────────────────

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

  // ── close with keepHighlight preserves state ──────────────────────────────

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
    // Highlight ranges should still contain the section key with the match
    const key = 'chapter_content:42:content';
    expect(result.current.highlightRanges[key]).toHaveLength(1);
    expect(result.current.highlightRanges[key][0]).toEqual({ start: 10, end: 15 });
  });

  // ── opening after normal close gives empty state ──────────────────────────

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

  // ── opening after keepHighlight close preserves the old query ─────────────

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

  // ── runSearch activates highlights ────────────────────────────────────────

  it('runSearch sets highlightActive and populates ranges', async () => {
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

  it('runSearch with empty query clears highlights', async () => {
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

  // ── notifyContentChanged debounces and refreshes highlights ───────────────

  it('notifyContentChanged does nothing when highlights are not active', async () => {
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.notifyContentChanged(42);
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('notifyContentChanged triggers a refresh search after debounce', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    // Activate highlights first
    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);

    // Simulate a content change
    act(() => {
      result.current.notifyContentChanged(42);
    });

    // Debounce has not fired yet — no second call
    expect(searchSpy).toHaveBeenCalledTimes(1);

    // Advance past the 800ms debounce; advanceTimersByTimeAsync also flushes
    // the async IIFE that fires inside the setTimeout callback.
    searchSpy.mockResolvedValue(emptyResponse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // After refresh with no matches, highlight ranges should be cleared
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.highlightRanges).toEqual({});
  });

  it('notifyContentChanged rapid calls only fire one debounced search', async () => {
    searchSpy.mockResolvedValue(makeResponse('hello'));
    const { result } = renderHook(() => useSearchReplace());

    act(() => {
      result.current.setQuery('hello');
    });
    await act(async () => {
      await result.current.runSearch(42);
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);

    // Fire multiple content changes in quick succession
    act(() => {
      result.current.notifyContentChanged(42);
      result.current.notifyContentChanged(42);
      result.current.notifyContentChanged(42);
    });

    searchSpy.mockResolvedValue(emptyResponse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // Despite three calls, only one search should have been triggered
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });
});
