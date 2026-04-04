// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use story unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { StoryState, Chapter, Book, WritingUnit } from '../../types';
import { api } from '../../services/api';
import { StoryApiPayload } from '../../services/apiTypes';
import { mapApiChapters, mapSelectStoryToState } from './storyMappers';
import { notifyError } from '../../services/errorNotifier';

/** Maximum number of undo/redo states retained in memory. */
const MAX_HISTORY = 50;

/**
 * Injectable dialog callbacks for useStory.
 * Defaults use window.confirm / window.alert, which can be replaced in tests
 * or by a React-based dialog system in App.tsx.
 */
export interface StoryDialogs {
  confirm: (message: string) => Promise<boolean>;
  alert: (message: string) => void;
}

const defaultDialogs: StoryDialogs = {
  confirm: (message) => Promise.resolve(window.confirm(message)),
  alert: (message) => notifyError(message),
};

const INITIAL_STORY: StoryState = {
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

const areStoriesEqual = (a: StoryState, b: StoryState): boolean => {
  try {
    const aCopy = { ...a, lastUpdated: 0 };
    const bCopy = { ...b, lastUpdated: 0 };
    return JSON.stringify(aCopy) === JSON.stringify(bCopy);
  } catch {
    return false;
  }
};

export interface StoryHistoryOption {
  id: string;
  label: string;
  steps: number;
}

interface StoryHistoryEntry {
  id: string;
  label: string;
  state: StoryState;
  /** True when this entry was created by the user typing in the editor,
   * not by an AI action.  Entries tagged this way do not trigger highlights. */
  isUserEdit?: boolean;
  onUndo?: () => Promise<void> | void;
  onRedo?: () => Promise<void> | void;
}

export const resolveExternalHistorySourceState = (
  explicitState: StoryState | undefined,
  latestState: StoryState,
  fallbackState: StoryState
): StoryState => {
  if (explicitState) return explicitState;
  return latestState || fallbackState;
};

const buildStoryDraft = (
  projectId: string,
  story: StoryApiPayload,
  content: string = ''
): WritingUnit => ({
  id: 'story',
  scope: 'story',
  title: story.project_title || projectId,
  summary: story.story_summary || '',
  content,
  notes: story.notes || '',
  private_notes: story.private_notes || '',
  conflicts: story.conflicts || [],
  filename: 'content.md',
});

export const buildInitialStoryState = (
  projectId: string,
  story: StoryApiPayload,
  chapters: Chapter[]
): StoryState => ({
  id: projectId,
  title: story.project_title || projectId,
  summary: story.story_summary || '',
  notes: story.notes || '',
  private_notes: story.private_notes || '',
  styleTags: story.tags || [],
  image_style: story.image_style || '',
  image_additional_info: story.image_additional_info || '',
  chapters,
  draft:
    story.project_type === 'short-story' ? buildStoryDraft(projectId, story) : null,
  projectType: story.project_type || 'novel',
  language: story.language || 'en',
  books: story.books || [],
  sourcebook: story.sourcebook || [],
  conflicts: story.conflicts || [],
  llm_prefs: story.llm_prefs,
  currentChapterId:
    story.project_type === 'short-story'
      ? null
      : chapters.length > 0
        ? chapters[0].id
        : null,
  lastUpdated: Date.now(),
});

const INITIAL_HISTORY_ENTRY: StoryHistoryEntry = {
  id: `history-${Date.now()}`,
  label: 'Initial story state',
  state: INITIAL_STORY,
};

const createHistoryEntry = (
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

const buildChapterUpdateLabel = (
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

const buildDraftUpdateLabel = (partial: Partial<WritingUnit>): string => {
  if (partial.content !== undefined) return 'Edit story draft';
  if (partial.title !== undefined) return 'Rename story';
  if (partial.summary !== undefined) return 'Update story summary';
  if (partial.conflicts !== undefined) return 'Update story conflicts';
  if (partial.notes !== undefined || partial.private_notes !== undefined) {
    return 'Update story notes';
  }
  return 'Update story draft';
};

export const useStory = (dialogs: StoryDialogs = defaultDialogs) => {
  const [story, setStory] = useState<StoryState>(INITIAL_STORY);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [history, setHistory] = useState<StoryHistoryEntry[]>([INITIAL_HISTORY_ENTRY]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Explicit baseline for diff highlights.  Updated at exactly the right
  // moments: before an AI push (shows what changed), cleared to current state
  // on user edits (no highlight), and set to the state we leave on undo/redo
  // (so inserted/restored text is always highlighted).
  const [baselineState, setBaselineState] = useState<StoryState>(
    () => INITIAL_HISTORY_ENTRY.state
  );
  const hasFetchedRef = useRef(false);
  const latestStoryRef = useRef(story);
  // Hold dialog callbacks in a ref so refreshStory callbacks never go stale.
  const dialogsRef = useRef(dialogs);
  useEffect(() => {
    dialogsRef.current = dialogs;
  });

  useEffect(() => {
    latestStoryRef.current = story;
  }, [story]);

  const pushState = useCallback(
    (newState: StoryState, label: string, isUserEdit: boolean = false) => {
      const updatedState = { ...newState, lastUpdated: Date.now() };
      const currentEntry = history[currentIndex];
      if (
        !isUserEdit &&
        currentEntry &&
        areStoriesEqual(currentEntry.state, updatedState)
      ) {
        // Avoid no-op history entries that cause apparent "double undo".
        setStory(updatedState);
        latestStoryRef.current = updatedState;
        return;
      }

      // Baseline for diff display:
      // - AI/external: capture state BEFORE the push so new text is highlighted
      // - User edits: advance baseline to new state so nothing is highlighted
      setBaselineState(isUserEdit ? updatedState : history[currentIndex].state);

      const trimmed = history.slice(0, currentIndex + 1);
      trimmed.push(createHistoryEntry(updatedState, label, { isUserEdit }));
      const bounded = trimmed.slice(-MAX_HISTORY);
      setHistory(bounded);
      setCurrentIndex(bounded.length - 1);
      setStory(updatedState);
      latestStoryRef.current = updatedState;
    },
    [history, currentIndex]
  );

  const pushExternalHistoryEntry = useCallback(
    (params: {
      label: string;
      state?: StoryState;
      onUndo?: () => Promise<void> | void;
      onRedo?: () => Promise<void> | void;
    }) => {
      const sourceState = resolveExternalHistorySourceState(
        params.state,
        latestStoryRef.current,
        story
      );
      const updatedState = { ...sourceState, lastUpdated: Date.now() };

      const currentEntry = history[currentIndex];
      if (currentEntry && areStoriesEqual(currentEntry.state, updatedState)) {
        // Update the existing entry with the undo/redo handlers if they are missing
        const updatedOnUndo = params.onUndo ?? currentEntry.onUndo;
        const updatedOnRedo = params.onRedo ?? currentEntry.onRedo;

        if (
          updatedOnUndo !== currentEntry.onUndo ||
          updatedOnRedo !== currentEntry.onRedo
        ) {
          const updatedHistory = [...history];
          updatedHistory[currentIndex] = {
            ...currentEntry,
            label: params.label,
            onUndo: updatedOnUndo,
            onRedo: updatedOnRedo,
          };
          setHistory(updatedHistory);
        }
        setStory(updatedState);
        latestStoryRef.current = updatedState;
        return;
      }

      const trimmed = history.slice(0, currentIndex + 1);
      trimmed.push(
        createHistoryEntry(updatedState, params.label, {
          onUndo: params.onUndo,
          onRedo: params.onRedo,
        })
      );
      const bounded = trimmed.slice(-MAX_HISTORY);
      setHistory(bounded);
      setCurrentIndex(bounded.length - 1);
      setStory(updatedState);
      latestStoryRef.current = updatedState;
      setCurrentChapterId(updatedState.currentChapterId ?? null);
    },
    [story, history, currentIndex]
  );

  const lastLoadedChapterId = useRef<string | null>(null);

  const refreshStory = useCallback(
    async (historyLabel?: string) => {
      try {
        const projects = await api.projects.list();
        const currentProject = projects.current || story.id;
        if (!currentProject) return;

        const res = await api.projects.select(currentProject);
        if (res.error === 'invalid_config') {
          dialogsRef.current.alert(`Invalid story config: ${res.error_message}`);
          return;
        } else if (res.ok && res.story) {
          const chapters: Chapter[] =
            res.story.project_type === 'short-story'
              ? []
              : mapApiChapters((await api.chapters.list()).chapters);

          let newStory: StoryState = mapSelectStoryToState(
            currentProject,
            res.story,
            chapters,
            currentChapterId,
            story.chapters
          );

          if (res.story.project_type === 'short-story') {
            const content = (await api.story.getContent()).content;
            newStory = {
              ...newStory,
              draft: buildStoryDraft(currentProject, res.story, content),
              currentChapterId: null,
            };
          }

          lastLoadedChapterId.current = null;
          if (historyLabel) {
            pushState(newStory, historyLabel);
          } else {
            setStory(newStory);
            latestStoryRef.current = newStory;
          }
          setCurrentChapterId(newStory.currentChapterId);
        }
      } catch (e) {
        console.error('Failed to refresh story', e);
      }
    },
    [story.id, currentChapterId, pushState]
  );

  const selectChapter = useCallback(
    (id: string | null) => {
      if (id !== currentChapterId) {
        lastLoadedChapterId.current = null;
        setCurrentChapterId(id);
      }
    },
    [currentChapterId]
  );

  // Load chapter content lazily so list refreshes stay responsive.
  useEffect(() => {
    if (currentChapterId && currentChapterId !== lastLoadedChapterId.current) {
      const loadContent = async () => {
        try {
          const res = await api.chapters.get(Number(currentChapterId));
          lastLoadedChapterId.current = currentChapterId;
          setStory((prev) => {
            const updatedChapters = prev.chapters.map((c) =>
              c.id === currentChapterId
                ? {
                    ...c,
                    content: res.content,
                    notes: res.notes,
                    private_notes: res.private_notes,
                    conflicts: res.conflicts,
                    title: res.title,
                    summary: res.summary,
                  }
                : c
            );
            return { ...prev, chapters: updatedChapters };
          });
        } catch (e) {
          console.error('Failed to load chapter content', e);
        }
      };
      loadContent();
    }
  }, [currentChapterId, story.lastUpdated]);

  const fetchStory = useCallback(async () => {
    if (story.id) return;
    try {
      const projects = await api.projects.list();
      if (projects.current) {
        const res = await api.projects.select(projects.current);
        if (res.ok && res.story) {
          const chapters =
            res.story.project_type === 'short-story'
              ? []
              : mapApiChapters((await api.chapters.list()).chapters);

          let newStory = buildInitialStoryState(projects.current, res.story, chapters);

          if (res.story.project_type === 'short-story') {
            const content = (await api.story.getContent()).content;
            newStory = {
              ...newStory,
              draft: buildStoryDraft(projects.current, res.story, content),
              currentChapterId: null,
            };
          }

          setStory(newStory);
          latestStoryRef.current = newStory;
          setHistory([createHistoryEntry(newStory, 'Load story')]);
          setCurrentIndex(0);

          setCurrentChapterId(newStory.currentChapterId);
        }
      }
    } catch (e) {
      console.error('Failed to fetch story', e);
    }
  }, []);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchStory();
    }
  }, [fetchStory]);

  const updateStoryMetadata = async (
    title: string,
    summary: string,
    tags: string[],
    notes?: string,
    private_notes?: string,
    conflicts?: StoryState['conflicts'],
    language?: string
  ) => {
    const newState = {
      ...story,
      title,
      summary,
      styleTags: tags,
      notes,
      private_notes,
      conflicts: conflicts ?? story.conflicts,
      language,
      draft:
        story.projectType === 'short-story' && story.draft
          ? {
              ...story.draft,
              title,
              summary,
              notes,
              private_notes,
              conflicts: conflicts ?? story.draft.conflicts,
            }
          : story.draft,
    };
    pushState(newState, `Update story metadata: ${title || story.title || 'Untitled'}`);

    try {
      await api.story.updateMetadata({
        title,
        summary,
        tags,
        notes,
        private_notes,
        conflicts,
        language,
      });
    } catch (e) {
      console.error('Failed to update story metadata', e);
    }
  };

  const updateStoryDraft = async (
    partial: Partial<WritingUnit>,
    sync: boolean = true,
    pushHistory: boolean = true,
    isUserEdit: boolean = false
  ) => {
    if (!story.draft) return;

    const newState: StoryState = {
      ...story,
      title: partial.title ?? story.title,
      summary: partial.summary ?? story.summary,
      notes: partial.notes ?? story.notes,
      private_notes: partial.private_notes ?? story.private_notes,
      conflicts: partial.conflicts ?? story.conflicts,
      draft: { ...story.draft, ...partial },
      lastUpdated: Date.now(),
    };

    if (pushHistory) {
      pushState(newState, buildDraftUpdateLabel(partial), isUserEdit);
    } else {
      setStory(newState);
      latestStoryRef.current = newState;
    }

    if (!sync) return;

    try {
      if (partial.content !== undefined) {
        await api.story.updateContent(partial.content);
      }

      if (
        partial.title !== undefined ||
        partial.summary !== undefined ||
        partial.notes !== undefined ||
        partial.private_notes !== undefined
      ) {
        await api.story.updateMetadata({
          title: partial.title ?? story.title,
          summary: partial.summary ?? story.summary,
          tags: story.styleTags,
          notes: partial.notes ?? story.notes,
          private_notes: partial.private_notes ?? story.private_notes,
          conflicts: partial.conflicts ?? story.conflicts,
          language: story.language,
        });
      }
    } catch (e) {
      console.error('Failed to update story draft', e);
    }
  };

  const updateStoryImageSettings = async (style: string, info: string) => {
    const newState = { ...story, image_style: style, image_additional_info: info };
    pushState(newState, 'Update story image settings');
    try {
      await api.story.updateSettings({
        image_style: style,
        image_additional_info: info,
      });
    } catch (e) {
      console.error('Failed to update story image settings', e);
    }
  };

  const updateChapter = async (
    id: string,
    partial: Partial<Chapter>,
    sync: boolean = true,
    pushHistory: boolean = true,
    isUserEdit: boolean = false
  ) => {
    if (story.projectType === 'short-story') {
      await updateStoryDraft(partial, sync, pushHistory, isUserEdit);
      return;
    }

    const chapter = story.chapters.find((ch) => ch.id === id);
    if (!chapter) return;

    const isDifferent = Object.entries(partial).some(([key, value]) => {
      if (value === undefined) return false;
      const old = (chapter as any)[key];
      return value !== old;
    });

    const newChapters = story.chapters.map((ch) =>
      ch.id === id ? { ...ch, ...partial } : ch
    );
    const newState = { ...story, chapters: newChapters, lastUpdated: Date.now() };

    if (pushHistory) {
      pushState(newState, buildChapterUpdateLabel(chapter, partial), isUserEdit);
    } else {
      setStory(newState);
      latestStoryRef.current = newState;
    }

    if (!sync) return;

    if (!isDifferent) return;

    try {
      const numId = Number(id);
      if (partial.content !== undefined)
        await api.chapters.updateContent(numId, partial.content);
      if (partial.title !== undefined)
        await api.chapters.updateTitle(numId, partial.title);
      if (partial.summary !== undefined)
        await api.chapters.updateSummary(numId, partial.summary);
      // Metadata fields are managed through dedicated metadata flows to avoid
      // partial writes racing with dialog autosave.
    } catch (e) {
      console.error('Failed to update chapter', e);
    }
  };

  const updateBook = async (id: string, partial: Partial<Book>) => {
    const newBooks =
      story.books?.map((b) => (b.id === id ? { ...b, ...partial } : b)) || [];
    const newState = { ...story, books: newBooks };
    const bookTitle =
      story.books?.find((book) => book.id === id)?.title || partial.title || 'Untitled';
    pushState(newState, `Update book: ${bookTitle}`);
    // Book persistence stays at call sites that own the surrounding workflow
    // (rename, reorder, metadata edit) to keep this hook narrowly scoped.
  };

  const addChapter = async (
    title: string = 'New Chapter',
    summary: string = '',
    bookId?: string
  ) => {
    try {
      const res = await api.chapters.create(title, '', bookId);
      const chaptersRes = await api.chapters.list();
      const newChapters: Chapter[] = mapApiChapters(chaptersRes.chapters);

      const newChapter = newChapters.find((c) => c.id === String(res.id));
      if (!newChapter) {
        throw new Error('Created chapter not found in refreshed chapter list');
      }

      const newState: StoryState = {
        ...story,
        chapters: newChapters,
        currentChapterId: newChapter.id,
        lastUpdated: Date.now(),
      };
      pushState(newState, `Create chapter: ${newChapter.title || title}`);
    } catch (e) {
      console.error('Failed to add chapter', e);
    }
  };

  const deleteChapter = async (id: string) => {
    try {
      const deletedChapter = story.chapters.find((c) => c.id === id);
      const currentChap = story.chapters.find((c) => c.id === currentChapterId);

      await api.chapters.delete(Number(id));

      // Re-fetch after deletion because positional IDs can shift in series mode.
      const chaptersRes = await api.chapters.list();
      const newChapters: Chapter[] = mapApiChapters(chaptersRes.chapters);

      // Re-anchor via stable file/book coordinates instead of transient numeric IDs.
      let newSelection = null;
      if (currentChapterId !== id && currentChap) {
        const matching = newChapters.find(
          (c) =>
            c.filename === currentChap.filename && c.book_id === currentChap.book_id
        );
        if (matching) {
          newSelection = matching.id;
        }
      }

      // Keep editor continuity by selecting a nearby chapter when possible.
      if (!newSelection && newChapters.length > 0) {
        const oldIndex = story.chapters.findIndex((c) => c.id === id);
        newSelection =
          newChapters[oldIndex]?.id || newChapters[newChapters.length - 1].id;
      }

      const newState: StoryState = {
        ...story,
        chapters: newChapters,
        currentChapterId: newSelection,
        lastUpdated: Date.now(),
      };
      pushState(newState, `Delete chapter: ${deletedChapter?.title || id}`);
    } catch (e) {
      console.error('Failed to delete chapter', e);
    }
  };

  const loadStory = useCallback(
    (newStory: StoryState) => {
      // Keep backend active-project context aligned before local state updates.
      if (newStory.id) {
        api.projects
          .select(newStory.id)
          .then(() => fetchStory())
          .catch((e) => console.error('Failed to select project', e));
      }

      setStory(newStory);
      latestStoryRef.current = newStory;
      setHistory([createHistoryEntry(newStory, 'Load story')]);
      setCurrentIndex(0);
      setBaselineState(newStory); // no highlight after a fresh project load
      if (newStory.currentChapterId) {
        setCurrentChapterId(newStory.currentChapterId);
      } else if (newStory.chapters.length > 0) {
        setCurrentChapterId(newStory.chapters[0].id);
      } else {
        setCurrentChapterId(null);
      }
    },
    [story.id, fetchStory]
  );

  const undoSteps = useCallback(
    async (steps: number) => {
      if (steps <= 0 || currentIndex <= 0) return;
      const targetIndex = Math.max(0, currentIndex - steps);
      const callbacks: Array<() => Promise<void> | void> = [];
      for (let idx = currentIndex; idx > targetIndex; idx -= 1) {
        const handler = history[idx].onUndo;
        if (handler) callbacks.push(handler);
      }

      // Baseline = the state we're leaving so undo-restored text is highlighted.
      setBaselineState(history[currentIndex].state);

      setCurrentIndex(targetIndex);
      const prevState = history[targetIndex].state;
      setStory(prevState);
      latestStoryRef.current = prevState;
      setCurrentChapterId(prevState.currentChapterId ?? null);

      for (const callback of callbacks) {
        await callback();
      }
    },
    [currentIndex, history]
  );

  const redoSteps = useCallback(
    async (steps: number) => {
      if (steps <= 0 || currentIndex >= history.length - 1) return;
      const targetIndex = Math.min(history.length - 1, currentIndex + steps);
      const callbacks: Array<() => Promise<void> | void> = [];
      for (let idx = currentIndex + 1; idx <= targetIndex; idx += 1) {
        const handler = history[idx].onRedo;
        if (handler) callbacks.push(handler);
      }

      // Baseline = the state we're leaving so redo-restored text is highlighted.
      setBaselineState(history[currentIndex].state);

      setCurrentIndex(targetIndex);
      const nextState = history[targetIndex].state;
      setStory(nextState);
      latestStoryRef.current = nextState;
      setCurrentChapterId(nextState.currentChapterId ?? null);

      for (const callback of callbacks) {
        await callback();
      }
    },
    [currentIndex, history]
  );

  const undo = useCallback(async () => {
    await undoSteps(1);
  }, [undoSteps]);

  const redo = useCallback(async () => {
    await redoSteps(1);
  }, [redoSteps]);

  // Baseline is managed explicitly via setBaselineState — see pushState,
  // undoSteps, redoSteps, and loadStory above.

  const undoOptions: StoryHistoryOption[] = [];
  for (let idx = currentIndex; idx > 0 && undoOptions.length < 10; idx -= 1) {
    undoOptions.push({
      id: history[idx].id,
      label: history[idx].label,
      steps: currentIndex - idx + 1,
    });
  }

  const redoOptions: StoryHistoryOption[] = [];
  for (
    let idx = currentIndex + 1;
    idx < history.length && redoOptions.length < 10;
    idx += 1
  ) {
    redoOptions.push({
      id: history[idx].id,
      label: history[idx].label,
      steps: idx - currentIndex,
    });
  }

  return {
    story,
    currentChapterId,
    selectChapter: (id: string) => selectChapter(id),
    updateStoryMetadata,
    updateStoryImageSettings,
    updateChapter,
    addChapter,
    deleteChapter,
    updateBook,
    loadStory,
    refreshStory,
    undo,
    redo,
    undoSteps,
    redoSteps,
    pushExternalHistoryEntry,
    undoOptions,
    redoOptions,
    nextUndoLabel: currentIndex > 0 ? history[currentIndex].label : null,
    nextRedoLabel:
      currentIndex < history.length - 1 ? history[currentIndex + 1].label : null,
    historyIndex: currentIndex,
    historySize: history.length,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    baselineState,
  };
};
