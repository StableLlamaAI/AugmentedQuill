// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Zustand store for story state. Provides granular subscriptions so
 * individual components only re-render when the specific slice they consume
 * actually changes – eliminating the cascade re-renders caused by the old
 * monolithic React useState approach in useStory / App.tsx.
 */

import { create, StoreApi } from 'zustand';
import type { StoryState, SourcebookEntry } from '../types';
import type { StoryHistoryEntry } from '../features/story/historyUtils';

// ---------------------------------------------------------------------------
// Shared initial state
// ---------------------------------------------------------------------------

export const INITIAL_STORY: StoryState = {
  id: '',
  title: '',
  summary: '',
  styleTags: [],
  image_style: '',
  image_additional_info: '',
  chapters: [],
  draft: null,
  projectType: 'novel',
  books: [],
  sourcebook: [],
  conflicts: [],
  currentChapterId: null,
  lastUpdated: Date.now(),
};

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface StoryStoreState {
  story: StoryState;
  currentChapterId: string | null;
  history: StoryHistoryEntry[];
  currentIndex: number;
  baselineState: StoryState;
  loadChapterSignal: number;
  isChapterLoading: boolean;

  // --- Actions ---
  setStory: (storyOrUpdater: StoryState | ((prev: StoryState) => StoryState)) => void;
  setCurrentChapterId: (id: string | null) => void;
  setHistory: (
    historyOrUpdater:
      | StoryHistoryEntry[]
      | ((prev: StoryHistoryEntry[]) => StoryHistoryEntry[])
  ) => void;
  setCurrentIndex: (index: number) => void;
  setBaselineState: (state: StoryState) => void;
  incrementLoadChapterSignal: () => void;
  setIsChapterLoading: (loading: boolean) => void;
  patchSourcebookEntry: (entry: SourcebookEntry | null, entryId?: string) => boolean;

  /** Atomically update story + history + baseline in a single state write. */
  pushHistoryState: (params: {
    story: StoryState;
    history: StoryHistoryEntry[];
    currentIndex: number;
    baselineState: StoryState;
  }) => void;

  /** Atomically apply an undo/redo jump. */
  jumpHistory: (params: {
    story: StoryState;
    currentChapterId: string | null;
    currentIndex: number;
    baselineState: StoryState;
  }) => void;
}

// ---------------------------------------------------------------------------
// Factory so tests can create a fresh initial snapshot each time
// ---------------------------------------------------------------------------

export function createInitialStoryEntry(): StoryHistoryEntry {
  return {
    id: `history-${Date.now()}`,
    label: 'Initial story state',
    state: INITIAL_STORY,
  };
}

function buildInitialState(): Omit<
  StoryStoreState,
  | 'setStory'
  | 'setCurrentChapterId'
  | 'setHistory'
  | 'setCurrentIndex'
  | 'setBaselineState'
  | 'incrementLoadChapterSignal'
  | 'setIsChapterLoading'
  | 'patchSourcebookEntry'
  | 'pushHistoryState'
  | 'jumpHistory'
> {
  return {
    story: INITIAL_STORY,
    currentChapterId: null,
    history: [createInitialStoryEntry()],
    currentIndex: 0,
    baselineState: INITIAL_STORY,
    loadChapterSignal: 0,
    isChapterLoading: false,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStoryStore = create<StoryStoreState>()(
  (
    set: StoreApi<StoryStoreState>['setState'],
    get: StoreApi<StoryStoreState>['getState']
  ) => ({
    ...buildInitialState(),

    setStory: (storyOrUpdater: StoryState | ((prev: StoryState) => StoryState)) =>
      set((state: StoryStoreState) => ({
        story:
          typeof storyOrUpdater === 'function'
            ? storyOrUpdater(state.story)
            : storyOrUpdater,
      })),

    setCurrentChapterId: (id: string | null) => set({ currentChapterId: id }),

    setHistory: (
      historyOrUpdater:
        | StoryHistoryEntry[]
        | ((prev: StoryHistoryEntry[]) => StoryHistoryEntry[])
    ) =>
      set((state: StoryStoreState) => ({
        history:
          typeof historyOrUpdater === 'function'
            ? historyOrUpdater(state.history)
            : historyOrUpdater,
      })),

    setCurrentIndex: (index: number) => set({ currentIndex: index }),

    setBaselineState: (baselineState: StoryState) => set({ baselineState }),

    incrementLoadChapterSignal: () =>
      set((state: StoryStoreState) => ({
        loadChapterSignal: state.loadChapterSignal + 1,
      })),

    setIsChapterLoading: (isChapterLoading: boolean) => set({ isChapterLoading }),

    patchSourcebookEntry: (entry: SourcebookEntry | null, entryId?: string) => {
      const prev = get().story.sourcebook ?? [];
      let next: SourcebookEntry[];
      if (entry === null) {
        next = prev.filter((e: SourcebookEntry) => e.id !== entryId);
        if (next.length === prev.length) return false;
      } else {
        const idx = prev.findIndex((e: SourcebookEntry) => e.id === entry.id);
        if (idx >= 0) {
          const sig = (e: SourcebookEntry) =>
            JSON.stringify({
              name: e.name,
              description: e.description,
              category: e.category,
              synonyms: e.synonyms,
              images: e.images,
              relations: e.relations,
            });
          if (sig(prev[idx]) === sig(entry)) return false;
          next = [...prev];
          next[idx] = entry;
        } else {
          next = [...prev, entry];
        }
      }
      set((state: StoryStoreState) => ({
        story: { ...state.story, sourcebook: next },
      }));
      return true;
    },

    pushHistoryState: ({
      story,
      history,
      currentIndex,
      baselineState,
    }: {
      story: StoryState;
      history: StoryHistoryEntry[];
      currentIndex: number;
      baselineState: StoryState;
    }) => set({ story, history, currentIndex, baselineState }),

    jumpHistory: ({
      story,
      currentChapterId,
      currentIndex,
      baselineState,
    }: {
      story: StoryState;
      currentChapterId: string | null;
      currentIndex: number;
      baselineState: StoryState;
    }) => set({ story, currentChapterId, currentIndex, baselineState }),
  })
);

// ---------------------------------------------------------------------------
// Granular selector hooks – components import these to subscribe only to the
// slice they need, avoiding re-renders when unrelated story data changes.
// ---------------------------------------------------------------------------

/** Subscribe to story metadata only (title, summary, tags, notes, language, etc.). */
export function useStoryMeta() {
  return useStoryStore((s: StoryStoreState) => s.story);
}

/** Subscribe to the chapter list. */
export function useStoryChaptersMeta() {
  return useStoryStore((s: StoryStoreState) => s.story.chapters);
}

/** Subscribe to the books list. */
export function useStoryBooks() {
  return useStoryStore((s: StoryStoreState) => s.story.books);
}

/** Subscribe to the sourcebook entries list. */
export function useStorySourcebook() {
  return useStoryStore((s: StoryStoreState) => s.story.sourcebook);
}

/** Subscribe to the baseline state (for diff highlighting). */
export function useStoryBaseline() {
  return useStoryStore((s: StoryStoreState) => s.baselineState);
}

/** Subscribe to undo/redo availability. */
export function useStoryHistoryState() {
  return useStoryStore((s: StoryStoreState) => ({
    canUndo: s.currentIndex > 0,
    canRedo: s.currentIndex < s.history.length - 1,
    historyIndex: s.currentIndex,
    historySize: s.history.length,
    nextUndoLabel: s.currentIndex > 0 ? s.history[s.currentIndex].label : null,
    nextRedoLabel:
      s.currentIndex < s.history.length - 1
        ? s.history[s.currentIndex + 1].label
        : null,
    undoOptions: buildHistoryOptions(s.history, s.currentIndex, 'undo'),
    redoOptions: buildHistoryOptions(s.history, s.currentIndex, 'redo'),
  }));
}

function buildHistoryOptions(
  history: StoryHistoryEntry[],
  currentIndex: number,
  direction: 'undo' | 'redo'
) {
  const options: Array<{ id: string; label: string; steps: number }> = [];
  if (direction === 'undo') {
    for (let idx = currentIndex; idx > 0 && options.length < 10; idx -= 1) {
      options.push({
        id: history[idx].id,
        label: history[idx].label,
        steps: currentIndex - idx + 1,
      });
    }
  } else {
    for (
      let idx = currentIndex + 1;
      idx < history.length && options.length < 10;
      idx += 1
    ) {
      options.push({
        id: history[idx].id,
        label: history[idx].label,
        steps: idx - currentIndex,
      });
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset the store to initial state. Use in beforeEach in unit tests. */
export function resetStoryStore() {
  useStoryStore.setState(buildInitialState());
}
