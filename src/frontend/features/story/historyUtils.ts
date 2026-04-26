// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Pure helper functions and types for story undo/redo history management.
 *
 * Extracted from useStory to keep the hook focused on orchestration and make
 * these small utilities independently testable.
 */

import type { StoryState, Chapter, WritingUnit } from '../../types';

export interface StoryHistoryEntry {
  id: string;
  label: string;
  state: StoryState;
  /** True when this entry was created by the user typing in the editor,
   * not by an AI action. Entries tagged this way do not trigger highlights. */
  isUserEdit?: boolean;
  onUndo?: () => Promise<void> | void;
  onRedo?: () => Promise<void> | void;
}

/**
 * Compares two StoryState objects for equality, ignoring `lastUpdated`.
 */
export const areStoriesEqual = (a: StoryState, b: StoryState): boolean => {
  try {
    const aCopy = { ...a, lastUpdated: 0 };
    const bCopy = { ...b, lastUpdated: 0 };
    return JSON.stringify(aCopy) === JSON.stringify(bCopy);
  } catch {
    return false;
  }
};

/**
 * Creates a new history entry with a stable unique id.
 */
export const createHistoryEntry = (
  state: StoryState,
  label: string,
  handlers?: Pick<StoryHistoryEntry, 'onUndo' | 'onRedo' | 'isUserEdit'>
): StoryHistoryEntry => ({
  id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label,
  state,
  isUserEdit: handlers?.isUserEdit ?? false,
  onUndo: handlers?.onUndo,
  onRedo: handlers?.onRedo,
});

/**
 * Builds a human-readable undo/redo label for a chapter update.
 */
export const buildChapterUpdateLabel = (
  chapter: Chapter | undefined,
  partial: Partial<Chapter>
): string => {
  const chapterName = chapter?.title?.trim() || `Chapter ${chapter?.id || ''}`.trim();
  if (partial.content !== undefined) return `Edit chapter content: ${chapterName}`;
  if (partial.title !== undefined) return `Rename chapter: ${chapterName}`;
  if (partial.summary !== undefined) return `Update chapter summary: ${chapterName}`;
  if (partial.notes !== undefined || partial.private_notes !== undefined) {
    return `Update chapter notes: ${chapterName}`;
  }
  return `Update chapter: ${chapterName}`;
};

/**
 * Builds a human-readable undo/redo label for a story draft update.
 */
export const buildDraftUpdateLabel = (partial: Partial<WritingUnit>): string => {
  if (partial.content !== undefined) return 'Edit story draft';
  if (partial.title !== undefined) return 'Rename story';
  if (partial.summary !== undefined) return 'Update story summary';
  if (partial.conflicts !== undefined) return 'Update story conflicts';
  if (partial.notes !== undefined || partial.private_notes !== undefined) {
    return 'Update story notes';
  }
  return 'Update story draft';
};
