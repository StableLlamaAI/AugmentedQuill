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

import { useCallback, useRef } from 'react';
import { create, StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { Chapter, StoryState, SourcebookEntry } from '../types';
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

  /**
   * Ephemeral streaming slot: holds the chapter content currently being
   * streamed by an LLM so the preview reaches the editor WITHOUT touching
   * story.chapters and triggering a full-app re-render cascade every chunk.
   * Cleared to null when streaming ends (success, cancel, or error).
   */
  streamingContent: { chapterId: string; content: string } | null;
  setStreamingContent: (data: { chapterId: string; content: string } | null) => void;
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
  | 'setStreamingContent'
> {
  return {
    story: INITIAL_STORY,
    currentChapterId: null,
    history: [createInitialStoryEntry()],
    currentIndex: 0,
    baselineState: INITIAL_STORY,
    loadChapterSignal: 0,
    isChapterLoading: false,
    streamingContent: null,
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

    setStreamingContent: (
      streamingContent: { chapterId: string; content: string } | null
    ) => set({ streamingContent }),

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

export type StoryMetadataSnapshot = Pick<
  StoryState,
  | 'id'
  | 'title'
  | 'summary'
  | 'notes'
  | 'private_notes'
  | 'styleTags'
  | 'projectType'
  | 'language'
  | 'conflicts'
> & {
  /** True when the short-story draft has no content.  Replaces the full
   *  `draft` object so that typing in short-story mode does not cause the
   *  sidebar to re-render on every debounced keystroke. */
  draftIsEmpty: boolean;
};

type StoryHistorySnapshot = {
  canUndo: boolean;
  canRedo: boolean;
  historyIndex: number;
  historySize: number;
  nextUndoLabel: string | null;
  nextRedoLabel: string | null;
  undoOptions: Array<{
    id: string;
    label: string;
    steps: number;
  }>;
  redoOptions: Array<{
    id: string;
    label: string;
    steps: number;
  }>;
};

/** Subscribe to story metadata only (title, summary, tags, notes, language, etc.). */
export function useStoryMeta(): StoryMetadataSnapshot {
  return useStoryStore(
    useShallow(
      (s: StoryStoreState): StoryMetadataSnapshot => ({
        id: s.story.id,
        title: s.story.title,
        summary: s.story.summary,
        notes: s.story.notes,
        private_notes: s.story.private_notes,
        styleTags: s.story.styleTags,
        draftIsEmpty: !s.story.draft?.content?.trim(),
        projectType: s.story.projectType,
        language: s.story.language,
        conflicts: s.story.conflicts,
      })
    )
  );
}

/** Subscribe only to the current project language. */
export function useStoryLanguage(): StoryState['language'] {
  return useStoryStore((s: StoryStoreState) => s.story.language);
}

/** Subscribe to the chapter list. */
export function useStoryChaptersMeta(): StoryState['chapters'] {
  return useStoryStore((s: StoryStoreState) => s.story.chapters);
}

/** Structural equality for chapter list: ignores content-only changes. */
function chaptersStructuralEqual(
  a: StoryState['chapters'],
  b: StoryState['chapters']
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (ch: Chapter, i: number) =>
      ch.id === b[i].id && ch.title === b[i].title && ch.book_id === b[i].book_id
  );
}

/** Subscribe to the chapter list — only re-renders when structure changes
 *  (add / remove / rename / reorder / book assignment).  Content-only
 *  changes (typing) do NOT trigger a re-render.
 *
 *  Caches the previous array reference inside the selector (same technique
 *  as useShallow) so React 18's useSyncExternalStore consistency checks
 *  always receive the same reference when nothing structural changed. */
export function useStoryChaptersListMeta(): StoryState['chapters'] {
  const prevRef = useRef<StoryState['chapters'] | undefined>(undefined);
  const stableSelector = useCallback(
    (s: StoryStoreState): StoryState['chapters'] => {
      const next = s.story.chapters;
      if (
        prevRef.current !== undefined &&
        chaptersStructuralEqual(prevRef.current, next)
      ) {
        return prevRef.current;
      }
      prevRef.current = next;
      return next;
    },
    [] // prevRef is captured once; selector identity is stable
  );
  return useStoryStore(stableSelector);
}

/** Subscribe to the books list. */
export function useStoryBooks(): StoryState['books'] {
  return useStoryStore((s: StoryStoreState) => s.story.books);
}

/** Subscribe to the sourcebook entries list. */
export function useStorySourcebook(): StoryState['sourcebook'] {
  return useStoryStore((s: StoryStoreState) => s.story.sourcebook);
}

/** Subscribe to the baseline state (for diff highlighting). */
export function useStoryBaseline(): StoryState {
  return useStoryStore((s: StoryStoreState) => s.baselineState);
}

/** Subscribe to undo/redo availability. */
export function useStoryHistoryState(): StoryHistorySnapshot {
  return useStoryStore(
    useShallow((s: StoryStoreState) => ({
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
    }))
  );
}

/** Subscribe only to whether undo is available. */
export function useStoryCanUndo(): boolean {
  return useStoryStore((s: StoryStoreState) => s.currentIndex > 0);
}

/** Subscribe only to whether redo is available. */
export function useStoryCanRedo(): boolean {
  return useStoryStore((s: StoryStoreState) => s.currentIndex < s.history.length - 1);
}

function buildHistoryOptions(
  history: StoryHistoryEntry[],
  currentIndex: number,
  direction: 'undo' | 'redo'
): Array<{ id: string; label: string; steps: number }> {
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
export function resetStoryStore(): void {
  useStoryStore.setState(buildInitialState());
}
