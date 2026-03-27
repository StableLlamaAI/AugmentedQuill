// Copyright (C) 2026 StableLlama

// @vitest-environment jsdom
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the useStory.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { StoryState } from '../../types';
import { api } from '../../services/api';
import {
  buildInitialStoryState,
  resolveExternalHistorySourceState,
  useStory,
} from './useStory';

vi.mock('../../services/api', () => ({
  api: {
    projects: {
      list: vi.fn(),
      select: vi.fn(),
    },
    chapters: {
      list: vi.fn(),
      get: vi.fn(),
    },
    story: {
      updateMetadata: vi.fn(),
      updateContent: vi.fn(),
      getContent: vi.fn(),
    },
  },
}));

const buildStory = (summary: string): StoryState => ({
  id: 'demo',
  title: 'Demo',
  summary,
  styleTags: [],
  image_style: '',
  image_additional_info: '',
  chapters: [],
  projectType: 'novel',
  books: [],
  sourcebook: [],
  conflicts: [],
  currentChapterId: null,
  lastUpdated: 1,
});

describe('resolveExternalHistorySourceState', () => {
  it('prefers latest in-memory story when explicit state is omitted', () => {
    const staleClosureState = buildStory('old summary');
    const latestLoadedState = buildStory('new summary from tool mutation');

    const selected = resolveExternalHistorySourceState(
      undefined,
      latestLoadedState,
      staleClosureState
    );

    expect(selected.summary).toBe('new summary from tool mutation');
  });

  it('uses explicit provided state when available', () => {
    const staleClosureState = buildStory('old summary');
    const latestLoadedState = buildStory('new summary');
    const explicitState = buildStory('explicit summary snapshot');

    const selected = resolveExternalHistorySourceState(
      explicitState,
      latestLoadedState,
      staleClosureState
    );

    expect(selected.summary).toBe('explicit summary snapshot');
  });
});

describe('buildInitialStoryState', () => {
  it('hydrates story-level notes fields from selected project payload', () => {
    const state = buildInitialStoryState(
      'demo',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
        notes: 'Story notes',
        private_notes: 'Private story notes',
      },
      []
    );

    expect(state.notes).toBe('Story notes');
    expect(state.private_notes).toBe('Private story notes');
  });

  it('defaults missing story-level notes fields to empty strings', () => {
    const state = buildInitialStoryState(
      'demo',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
      },
      []
    );

    expect(state.notes).toBe('');
    expect(state.private_notes).toBe('');
  });

  it('supports multi-step undo/redo from external history entries', async () => {
    vi.mocked(api.projects.list).mockResolvedValue({
      available: [],
      current: null,
    } as any);
    vi.mocked(api.projects.select).mockResolvedValue({ ok: false } as any);
    vi.mocked(api.chapters.list).mockResolvedValue([] as any);
    vi.mocked(api.chapters.get).mockResolvedValue({
      content: '',
      notes: '',
      private_notes: '',
      conflicts: [],
      title: 'Intro',
      summary: 'initial',
    } as any);

    const { result } = renderHook(() =>
      useStory({
        confirm: async () => true,
        alert: () => {},
      })
    );

    act(() => {
      result.current.loadStory({
        ...buildStory('original'),
        id: 'demo',
        title: 'Demo',
      });
    });

    const onUndo1 = vi.fn(async () => {});
    const onRedo1 = vi.fn(async () => {});
    const onUndo2 = vi.fn(async () => {});
    const onRedo2 = vi.fn(async () => {});

    act(() => {
      result.current.pushExternalHistoryEntry({
        label: 'LLM change 1',
        state: { ...buildStory('first'), id: 'demo', title: 'Demo' },
        onUndo: onUndo1,
        onRedo: onRedo1,
      });
    });

    act(() => {
      result.current.pushExternalHistoryEntry({
        label: 'LLM change 2',
        state: { ...buildStory('second'), id: 'demo', title: 'Demo' },
        onUndo: onUndo2,
        onRedo: onRedo2,
      });
    });

    expect(result.current.story.summary).toBe('second');

    await act(async () => {
      await result.current.undoSteps(2);
    });

    expect(result.current.story.summary).toBe('original');
    expect(onUndo2).toHaveBeenCalledTimes(1);
    expect(onUndo1).toHaveBeenCalledTimes(1);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redoSteps(2);
    });

    expect(result.current.story.summary).toBe('second');
    expect(onRedo1).toHaveBeenCalledTimes(1);
    expect(onRedo2).toHaveBeenCalledTimes(1);
  });

  it('does not create history entries for repeated metadata autosaves but creates one final history entry on commit', async () => {
    const initialChapter = {
      id: '1',
      title: 'Intro',
      summary: 'initial',
      content: '',
      notes: '',
      private_notes: '',
      conflicts: [],
      path: '',
    };

    const { result } = renderHook(() =>
      useStory({
        confirm: async () => true,
        alert: () => {},
      })
    );

    act(() => {
      result.current.loadStory({
        ...buildStory('initial'),
        chapters: [initialChapter],
        currentChapterId: null,
      });
    });

    expect(result.current.historySize).toBe(1);

    // simulated autosave calls while metadata dialog is open
    await act(async () => {
      await result.current.updateChapter('1', { summary: 'interim' }, false, false);
      await result.current.updateChapter('1', { summary: 'final' }, false, false);
    });

    expect(result.current.historySize).toBe(1);
    expect(result.current.story.chapters[0].summary).toBe('final');

    // final commit on close should create one history entry, but no-op repetition should be ignored
    await act(async () => {
      await result.current.updateChapter('1', { summary: 'final' }, false, true);
    });

    expect(result.current.historySize).toBe(2);

    await act(async () => {
      await result.current.undoSteps(1);
    });

    expect(result.current.story.chapters[0].summary).toBe('initial');
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redoSteps(1);
    });

    expect(result.current.story.chapters[0].summary).toBe('final');
  });

  it('does not add duplicate no-op history entries when same state is re-applied', async () => {
    const initialChapter = {
      id: '1',
      title: 'Intro',
      summary: 'a',
      content: '',
      notes: '',
      private_notes: '',
      conflicts: [],
      path: '',
    };

    const { result } = renderHook(() =>
      useStory({
        confirm: async () => true,
        alert: () => {},
      })
    );

    act(() => {
      result.current.loadStory({
        ...buildStory('a'),
        chapters: [initialChapter],
        currentChapterId: '1',
      });
    });

    await act(async () => {
      await result.current.updateChapter('1', { summary: 'b' }, false, true);
    });

    expect(result.current.historySize).toBe(2);

    await act(async () => {
      await result.current.updateChapter('1', { summary: 'b' }, false, true);
    });

    expect(result.current.historySize).toBe(2); // no-op duplicate suppressed
  });

  it('merges undo/redo handlers into current history entry if state is unchanged', async () => {
    const { result } = renderHook(() =>
      useStory({
        confirm: async () => true,
        alert: () => {},
      })
    );

    act(() => {
      result.current.loadStory({
        ...buildStory('initial'),
        id: 'demo',
        title: 'Demo',
      });
    });

    expect(result.current.historySize).toBe(1);

    act(() => {
      result.current.pushExternalHistoryEntry({
        label: 'Second state',
        state: { ...buildStory('second'), id: 'demo' },
      });
    });

    expect(result.current.historySize).toBe(2);
    expect(result.current.historyIndex).toBe(1);

    const onUndo2 = vi.fn();
    // We have index 1 (second state). Now push same state with onUndo2.
    act(() => {
      result.current.pushExternalHistoryEntry({
        label: 'Third state (merged)',
        state: result.current.story,
        onUndo: onUndo2,
      });
    });

    // Verify it didn't grow
    expect(result.current.historySize).toBe(2);
    expect(result.current.historyIndex).toBe(1);

    await act(async () => {
      await result.current.undo();
    });

    // When undoing from index 1 -> 0, it calls history[1].onUndo.
    // Since we merged onUndo2 into history[1], it should be called.
    expect(onUndo2).toHaveBeenCalledTimes(1);
    expect(result.current.historyIndex).toBe(0);
  });

  it('persists short-story conflicts through story metadata updates', async () => {
    vi.mocked(api.story.updateMetadata).mockResolvedValue({ ok: true } as any);

    const { result } = renderHook(() =>
      useStory({
        confirm: async () => true,
        alert: () => {},
      })
    );

    act(() => {
      result.current.loadStory({
        ...buildStory('Short summary'),
        id: 'shorty',
        title: 'Shorty',
        projectType: 'short-story',
        notes: 'Draft notes',
        private_notes: 'Private draft notes',
        conflicts: [],
        draft: {
          id: 'story',
          scope: 'story',
          title: 'Shorty',
          summary: 'Short summary',
          content: 'Draft body',
          notes: 'Draft notes',
          private_notes: 'Private draft notes',
          conflicts: [],
          filename: 'content.md',
        },
      });
    });

    const conflicts = [
      { id: 'conf-1', description: 'Storm hits the village', resolution: 'TBD' },
    ];

    await act(async () => {
      await result.current.updateStoryMetadata(
        'Shorty',
        'Short summary',
        [],
        'Draft notes',
        'Private draft notes',
        conflicts,
        'en'
      );
    });

    expect(result.current.story.conflicts).toEqual(conflicts);
    expect(result.current.story.draft?.conflicts).toEqual(conflicts);
    expect(api.story.updateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ conflicts })
    );
  });
});
