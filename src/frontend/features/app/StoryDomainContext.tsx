// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Isolates all story-state access and mutations inside a single React
 * context provider so unrelated domains (chat, editor, projects) do not
 * re-render when story content changes.
 *
 * Architecture contract
 * ─────────────────────
 * • StoryDomainProvider hosts useStory(), useCurrentWritingUnit() and
 *   useBrowserHistory() so those hooks live in their own component tree node.
 * • Consumers that only need stable mutation callbacks (updateChapter,
 *   refreshStory …) will not re-render when story DATA changes because the
 *   mutation objects are stable useCallback references.
 * • Consumers that need reactive story DATA subscribe to useStoryStore
 *   directly with granular Zustand selectors rather than reading the whole
 *   story object from this context.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

import { useStory, StoryDialogs } from '../story/useStory';
import { useCurrentWritingUnit } from '../story/useCurrentWritingUnit';
import { useBrowserHistory } from './useBrowserHistory';
import type { Chapter, StoryState, WritingUnit, SourcebookEntry } from '../../types';

// ---------------------------------------------------------------------------
// Context shape — split into two sub-contexts to minimise re-render surface:
//   StoryMutationsContext — stable callbacks only; never changes reference
//   StoryStateContext     — reactive data; changes when story changes
// ---------------------------------------------------------------------------

/** Stable mutation callbacks. Components that only dispatch mutations subscribe
 *  here and are NOT re-rendered when story data changes. */
export interface StoryMutations {
  selectChapter: (id: string | null) => void;
  updateChapter: (
    id: string,
    partial: Record<string, unknown>,
    sync?: boolean,
    pushHistory?: boolean,
    forceNewHistory?: boolean
  ) => Promise<void>;
  updateBook: (id: string, partial: Record<string, unknown>) => Promise<void>;
  addChapter: (title: string, content?: string, bookId?: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  loadStory: (story: StoryState) => void;
  refreshStory: (historyLabel?: string, resetHistory?: boolean) => Promise<void>;
  updateStoryMetadata: (
    title: string,
    summary: string,
    tags: string[],
    notes?: string,
    private_notes?: string,
    conflicts?: StoryState['conflicts'],
    language?: string
  ) => Promise<void>;
  updateStoryImageSettings: (
    imageStyle: string,
    imageAdditionalInfo: string
  ) => Promise<void>;
  undo: () => void;
  redo: () => void;
  undoSteps: (steps: number) => void;
  redoSteps: (steps: number) => void;
  pushExternalHistoryEntry: (params: {
    label: string;
    state?: StoryState;
    onUndo?: () => Promise<void> | void;
    onRedo?: () => Promise<void> | void;
    forceNewHistory?: boolean;
  }) => void;
  patchSourcebook: (entry: SourcebookEntry | null, entryId?: string) => boolean;
  advanceBaselineToCurrentStory: () => void;
  /** Stable ref to the latest story state — safe to read in async callbacks. */
  storyRef: React.MutableRefObject<StoryState>;
  /** Ref to a refreshProjects callback — populated by ProjectDomainProvider. */
  refreshProjectsRef: React.MutableRefObject<null | (() => Promise<void>)>;
}

/** Reactive story data. Components that display story content subscribe here. */
export interface StoryReactiveState {
  story: StoryState;
  currentChapterId: string | null;
  baselineState: StoryState;
  isChapterLoading: boolean;
  currentChapter: WritingUnit | null;
  currentChapterContext: {
    id: string;
    title: string;
    is_empty: boolean;
  } | null;
  isCurrentChapterEmpty: boolean;
  editorBaselineContent: string | undefined;
  activeChapter: Chapter | undefined;
  canUndo: boolean;
  canRedo: boolean;
  historyIndex: number;
  undoOptions: Array<{ id: string; label: string; steps: number }>;
  redoOptions: Array<{ id: string; label: string; steps: number }>;
  nextUndoLabel: string | null | undefined;
  nextRedoLabel: string | null | undefined;
  confirmDialog: ReturnType<
    (typeof import('../layout/useConfirmDialog'))['useConfirmDialog']
  >['confirm'];
  alertDialog: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Two separate contexts to avoid re-rendering mutation consumers on state changes
// ---------------------------------------------------------------------------

const StoryMutationsContext = createContext<StoryMutations | null>(null);
const StoryStateContext = createContext<StoryReactiveState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface StoryDomainProviderProps {
  confirm: ReturnType<
    (typeof import('../layout/useConfirmDialog'))['useConfirmDialog']
  >['confirm'];
  alert: (msg: string) => void;
  children: React.ReactNode;
}

export function StoryDomainProvider({
  confirm,
  alert: alertFn,
  children,
}: StoryDomainProviderProps): React.ReactElement {
  const dialogs: StoryDialogs = useMemo(
    () => ({ confirm, alert: alertFn }),
    [confirm, alertFn]
  );

  const {
    story,
    currentChapterId,
    selectChapter,
    updateStoryMetadata,
    updateStoryImageSettings,
    updateChapter,
    updateBook,
    addChapter,
    deleteChapter,
    loadStory,
    refreshStory,
    undo,
    redo,
    undoSteps,
    redoSteps,
    pushExternalHistoryEntry,
    undoOptions,
    redoOptions,
    nextUndoLabel,
    nextRedoLabel,
    historyIndex,
    canUndo,
    canRedo,
    baselineState,
    advanceBaselineToCurrentStory,
    patchSourcebook,
    isChapterLoading,
  } = useStory(dialogs);

  // Stable ref to the latest story — safe to read in async callbacks.
  const storyRef = useRef(story);
  storyRef.current = story;

  // Populated by ProjectDomainProvider after it mounts.
  const refreshProjectsRef = useRef<null | (() => Promise<void>)>(null);

  useBrowserHistory({
    historyIndex,
    canUndo,
    canRedo,
    undoSteps,
    redoSteps,
    undo,
    redo,
  });

  const {
    activeChapter,
    currentChapter,
    currentChapterContext,
    isCurrentChapterEmpty,
    editorBaselineContent,
  } = useCurrentWritingUnit({ story, currentChapterId, baselineState });

  // Stable mutations object — references only change when the underlying
  // useCallback values change (which is rare / intentional).
  const mutations = useMemo<StoryMutations>(
    () => ({
      selectChapter,
      updateChapter,
      updateBook,
      addChapter,
      deleteChapter,
      loadStory,
      refreshStory,
      updateStoryMetadata,
      updateStoryImageSettings,
      undo,
      redo,
      undoSteps,
      redoSteps,
      pushExternalHistoryEntry,
      patchSourcebook,
      advanceBaselineToCurrentStory,
      storyRef,
      refreshProjectsRef,
    }),
    [
      selectChapter,
      updateChapter,
      updateBook,
      addChapter,
      deleteChapter,
      loadStory,
      refreshStory,
      updateStoryMetadata,
      updateStoryImageSettings,
      undo,
      redo,
      undoSteps,
      redoSteps,
      pushExternalHistoryEntry,
      patchSourcebook,
      advanceBaselineToCurrentStory,
    ]
  );

  // Reactive state — changes whenever story data changes.
  const state = useMemo<StoryReactiveState>(
    () => ({
      story,
      currentChapterId,
      baselineState,
      isChapterLoading,
      currentChapter,
      currentChapterContext,
      isCurrentChapterEmpty,
      editorBaselineContent,
      activeChapter,
      canUndo,
      canRedo,
      historyIndex,
      undoOptions,
      redoOptions,
      nextUndoLabel,
      nextRedoLabel,
      confirmDialog: confirm,
      alertDialog: alertFn,
    }),
    [
      story,
      currentChapterId,
      baselineState,
      isChapterLoading,
      currentChapter,
      currentChapterContext,
      isCurrentChapterEmpty,
      editorBaselineContent,
      activeChapter,
      canUndo,
      canRedo,
      historyIndex,
      undoOptions,
      redoOptions,
      nextUndoLabel,
      nextRedoLabel,
      confirm,
      alertFn,
    ]
  );

  return (
    <StoryMutationsContext.Provider value={mutations}>
      <StoryStateContext.Provider value={state}>{children}</StoryStateContext.Provider>
    </StoryMutationsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/** Returns stable mutation callbacks. Safe to call in any component without
 *  causing re-renders on story data changes. */
export function useStoryMutations(): StoryMutations {
  const ctx = useContext(StoryMutationsContext);
  if (!ctx)
    throw new Error('useStoryMutations must be used inside StoryDomainProvider');
  return ctx;
}

/** Returns reactive story state. The component re-renders whenever story data
 *  changes. Prefer useStoryMutations() for write-only consumers. */
export function useStoryState(): StoryReactiveState {
  const ctx = useContext(StoryStateContext);
  if (!ctx) throw new Error('useStoryState must be used inside StoryDomainProvider');
  return ctx;
}

/** Convenience hook: returns both. */
export function useStoryDomain(): StoryMutations & StoryReactiveState {
  const mutations = useStoryMutations();
  const state = useStoryState();
  return useMemo(() => ({ ...mutations, ...state }), [mutations, state]);
}

/** Returns a stable callback to update a chapter's content from the
 *  sidebar's wrapping update call (sync + history + force). */
export function useSidebarUpdateChapter(): (
  id: string,
  partial: Record<string, unknown>
) => Promise<void> {
  const { updateChapter } = useStoryMutations();
  return useCallback(
    (id: string, partial: Record<string, unknown>): Promise<void> =>
      updateChapter(id, partial, true, true, true),
    [updateChapter]
  );
}
