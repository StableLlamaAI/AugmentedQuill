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
  draft: null,
});

const buildChapter = (id: string, content: string) => ({
  id,
  title: `Chapter ${id}`,
  summary: '',
  content,
  filename: `ch${id}.md`,
  book_id: undefined as string | undefined,
  notes: '',
  private_notes: '',
  conflicts: [] as { id: string; description: string; resolution: string }[],
});

const baseHook = () => useStory({ confirm: async () => true, alert: () => {} });

/** Render the hook and perform the initial loadStory so history starts clean. */
const hookWithStory = async (
  summary: string = 'initial',
  chapters: ReturnType<typeof buildChapter>[] = []
) => {
  // The lazy-load useEffect inside useStory calls api.chapters.get whenever
  // currentChapterId changes.  A previous test in this file may have left a
  // mock that returns {content: ''}, which would silently overwrite the
  // content we just loaded.  Wire the mock to return the real content so the
  // overwrite is a no-op and baseline tests stay deterministic.
  vi.mocked(api.chapters.get).mockImplementation(async (id: number) => {
    const ch = chapters.find((c) => c.id === String(id));
    return {
      content: ch?.content ?? '',
      notes: ch?.notes ?? '',
      private_notes: ch?.private_notes ?? '',
      conflicts: ch?.conflicts ?? [],
      title: ch?.title ?? '',
      summary: ch?.summary ?? '',
    } as any;
  });

  const hook = renderHook(baseHook);
  // Use async act so React flushes both the synchronous loadStory state
  // updates AND the async lazy-load useEffect (api.chapters.get) that fires
  // when currentChapterId changes.  Without this, the lazy-load may complete
  // after updateChapter and overwrite chapter content with a stale value.
  await act(async () => {
    hook.result.current.loadStory({
      ...buildStory(summary),
      id: '',
      chapters,
      currentChapterId: chapters[0]?.id ?? null,
    });
  });
  return hook;
};

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

// ─── baselineState diff highlighting ─────────────────────────────────────────
//
// Rules:
//  - AI/external push  → baseline = state BEFORE the push (shows new text)
//  - User-edit push    → baseline = state AFTER  the push (no highlight)
//  - undo              → baseline = state we left (shows restored text)
//  - redo              → baseline = state we left (shows re-inserted text)
//  - loadStory         → baseline = the loaded state (no highlight)

describe('baselineState diff highlighting', () => {
  it('starts with baseline equal to current state (no highlight on load)', async () => {
    const ch = buildChapter('1', 'Hello world');
    const { result } = await hookWithStory('initial', [ch]);

    expect(result.current.baselineState.chapters[0]?.content).toBe('Hello world');
    expect(result.current.story.chapters[0]?.content).toBe('Hello world');
  });

  it('sets baseline to pre-push state when AI pushes new chapter content', async () => {
    const ch = buildChapter('1', 'Hello world');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Hello world with AI paragraph' },
        false, // no server sync in tests
        true, // push history
        false // NOT a user edit → AI
      );
    });

    // Baseline should still hold the pre-AI content
    expect(result.current.baselineState.chapters[0]?.content).toBe('Hello world');
    // Current story has the new content
    expect(result.current.story.chapters[0]?.content).toBe(
      'Hello world with AI paragraph'
    );
  });

  it('sets baseline to new state when user types (no highlight)', async () => {
    const ch = buildChapter('1', 'Hello world');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Hello world edited by user' },
        false,
        true,
        true // IS a user edit
      );
    });

    // Baseline == current state: nothing would be highlighted
    expect(result.current.baselineState.chapters[0]?.content).toBe(
      'Hello world edited by user'
    );
    expect(result.current.story.chapters[0]?.content).toBe(
      'Hello world edited by user'
    );
  });

  it('highlights only the second AI addition after two sequential AI pushes', async () => {
    const ch = buildChapter('1', 'Para 1');
    const { result } = await hookWithStory('initial', [ch]);

    // First AI push
    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Para 1\nPara 2' },
        false,
        true,
        false
      );
    });
    // Second AI push
    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Para 1\nPara 2\nPara 3' },
        false,
        true,
        false
      );
    });

    // Baseline should be the state after the FIRST push
    expect(result.current.baselineState.chapters[0]?.content).toBe('Para 1\nPara 2');
    expect(result.current.story.chapters[0]?.content).toBe('Para 1\nPara 2\nPara 3');
  });

  it('sets baseline to the left-behind state when undoing an AI change', async () => {
    const ch = buildChapter('1', 'Original');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Original + AI' },
        false,
        true,
        false
      );
    });

    // Undo — baseline should become the AI state we just left
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.story.chapters[0]?.content).toBe('Original');
    expect(result.current.baselineState.chapters[0]?.content).toBe('Original + AI');
  });

  it('sets baseline to the left-behind state when undoing a user edit', async () => {
    const ch = buildChapter('1', 'Original');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'User typed this' },
        false,
        true,
        true
      );
    });

    await act(async () => {
      await result.current.undo();
    });

    // After undo, current = Original; baseline = what we left = user-typed text
    expect(result.current.story.chapters[0]?.content).toBe('Original');
    expect(result.current.baselineState.chapters[0]?.content).toBe('User typed this');
  });

  it('sets baseline to the left-behind state when redoing an AI change', async () => {
    const ch = buildChapter('1', 'Original');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Original + AI' },
        false,
        true,
        false
      );
    });
    await act(async () => {
      await result.current.undo();
    });
    // Now redo
    await act(async () => {
      await result.current.redo();
    });

    // After redo, current = 'Original + AI'; baseline = what we left = 'Original'
    expect(result.current.story.chapters[0]?.content).toBe('Original + AI');
    expect(result.current.baselineState.chapters[0]?.content).toBe('Original');
  });

  it('sets baseline to the left-behind state when redoing a user edit', async () => {
    const ch = buildChapter('1', 'Original');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'User edit' },
        false,
        true,
        true
      );
    });
    await act(async () => {
      await result.current.undo();
    });
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.story.chapters[0]?.content).toBe('User edit');
    expect(result.current.baselineState.chapters[0]?.content).toBe('Original');
  });

  it('resets baseline to loaded state (no highlight) when loadStory is called', async () => {
    const ch = buildChapter('1', 'Before load');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'AI change' },
        false,
        true,
        false
      );
    });

    // Load a completely fresh story
    const freshCh = buildChapter('1', 'Fresh content');
    act(() => {
      result.current.loadStory({
        ...buildStory('fresh'),
        chapters: [freshCh],
        currentChapterId: '1',
      });
    });

    expect(result.current.story.chapters[0]?.content).toBe('Fresh content');
    expect(result.current.baselineState.chapters[0]?.content).toBe('Fresh content');
  });

  it('after undo then new AI push, shows baseline relative to the undo target', async () => {
    const ch = buildChapter('1', 'v1');
    const { result } = await hookWithStory('initial', [ch]);

    // AI writes v2
    await act(async () => {
      await result.current.updateChapter('1', { content: 'v2' }, false, true, false);
    });
    // User undoes back to v1
    await act(async () => {
      await result.current.undo();
    });
    // AI writes v3 from v1
    await act(async () => {
      await result.current.updateChapter('1', { content: 'v3' }, false, true, false);
    });

    // Baseline should be v1 (state before the new AI push)
    expect(result.current.story.chapters[0]?.content).toBe('v3');
    expect(result.current.baselineState.chapters[0]?.content).toBe('v1');
  });

  it('multi-step undo highlights each intermediate state correctly', async () => {
    const ch = buildChapter('1', 'v1');
    const { result } = await hookWithStory('initial', [ch]);

    await act(async () => {
      await result.current.updateChapter('1', { content: 'v2' }, false, true, false);
    });
    await act(async () => {
      await result.current.updateChapter('1', { content: 'v3' }, false, true, false);
    });

    // Jump back 2 steps at once
    await act(async () => {
      await result.current.undoSteps(2);
    });

    // We left 'v3' (the most recent state before jumping), so baseline = v3
    expect(result.current.story.chapters[0]?.content).toBe('v1');
    expect(result.current.baselineState.chapters[0]?.content).toBe('v3');
  });

  it('user edit after AI change clears the highlight (baseline advances)', async () => {
    const ch = buildChapter('1', 'Original');
    const { result } = await hookWithStory('initial', [ch]);

    // AI adds content
    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Original + AI' },
        false,
        true,
        false
      );
    });

    expect(result.current.baselineState.chapters[0]?.content).toBe('Original');

    // User edits: highlight should disappear (baseline = new state)
    await act(async () => {
      await result.current.updateChapter(
        '1',
        { content: 'Original + AI + user' },
        false,
        true,
        true
      );
    });

    expect(result.current.baselineState.chapters[0]?.content).toBe(
      'Original + AI + user'
    );
  });
});
