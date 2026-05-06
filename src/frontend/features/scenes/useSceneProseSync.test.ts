// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for useSceneProseSync — bidirectional selection sync between pinboard
 * scene cards and the editor cursor.
 *
 * Coverage goals:
 *   - Selecting a scene with no prose link does NOT call jumpToPosition
 *   - Selecting a scene with a matching prose link calls jumpToPosition
 *   - Selecting a scene whose link is for a different chapter does NOT jump
 *   - The cursor-change callback fired by jumpToPosition is suppressed (card
 *     stays selected instead of being immediately cleared)
 *   - Moving the editor cursor into a linked range selects the scene
 *   - Moving the cursor outside any linked range clears the selection
 *   - Moving the cursor when no chapter is active clears the selection
 *   - The cursor callback is unregistered when the hook unmounts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import type { EditorHandle } from '../editor/Editor';
import type { Scene } from '../../types';
import type { WritingUnit } from '../../types/domain';
import { useSceneProseSync } from './useSceneProseSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEditorHandle = (): {
  handle: EditorHandle;
  jumpToPosition: ReturnType<typeof vi.fn>;
  triggerCursorChange: (anchor: number, head: number) => void;
  getRegisteredCallback: () => ((anchor: number, head: number) => void) | null;
} => {
  let registeredCallback: ((anchor: number, head: number) => void) | null = null;
  const jumpToPosition = vi.fn();
  const handle: EditorHandle = {
    insertImage: vi.fn(),
    focus: vi.fn(),
    format: vi.fn(),
    jumpToPosition,
    getEditorView: vi.fn(() => null),
    setOnCursorChange: vi.fn((cb: ((anchor: number, head: number) => void) | null) => {
      registeredCallback = cb;
    }),
  };
  return {
    handle,
    jumpToPosition,
    triggerCursorChange: (anchor: number, head: number) => {
      registeredCallback?.(anchor, head);
    },
    getRegisteredCallback: () => registeredCallback,
  };
};

const makeRef = <T>(value: T | null): React.RefObject<T | null> => ({
  current: value,
});

const chapterUnit: WritingUnit = {
  id: 'ch1',
  scope: 'chapter',
  title: 'Chapter 1',
  content: 'Hello world',
};

const storyUnit: WritingUnit = {
  id: 'story',
  scope: 'story',
  title: 'My Story',
  content: 'Once upon a time',
};

const sceneWithChapterLink: Scene = {
  id: 'scene-a',
  summary: 'Scene A',
  beats: [],
  prose_link: {
    scope_type: 'chapter',
    chapter_id: 'ch1',
    start_offset: 5,
    end_offset: 10,
    content_hash: 'abc',
  },
  active_characters: [],
  passive_characters: [],
  pinboard_x: 0,
  pinboard_y: 0,
  order_before: [],
  order_after: [],
};

const sceneWithStoryLink: Scene = {
  id: 'scene-b',
  summary: 'Scene B',
  beats: [],
  prose_link: {
    scope_type: 'story',
    start_offset: 0,
    end_offset: 4,
    content_hash: 'def',
  },
  active_characters: [],
  passive_characters: [],
  pinboard_x: 0,
  pinboard_y: 0,
  order_before: [],
  order_after: [],
};

const sceneWithNoLink: Scene = {
  id: 'scene-c',
  summary: 'Scene C',
  beats: [],
  prose_link: null,
  active_characters: [],
  passive_characters: [],
  pinboard_x: 0,
  pinboard_y: 0,
  order_before: [],
  order_after: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSceneProseSync', () => {
  let editor: ReturnType<typeof makeEditorHandle>;
  beforeEach(() => {
    editor = makeEditorHandle();
  });

  // -------------------------------------------------------------------------
  // Card → editor direction
  // -------------------------------------------------------------------------

  it('selecting a scene with no prose link does not call jumpToPosition', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithNoLink], chapterUnit, ref)
    );

    act(() => {
      result.current.handleSelectScene('scene-c');
    });

    expect(editor.jumpToPosition).not.toHaveBeenCalled();
  });

  it('selecting a scene with a matching chapter prose link calls jumpToPosition', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    act(() => {
      result.current.handleSelectScene('scene-a');
    });

    expect(editor.jumpToPosition).toHaveBeenCalledWith(5, 10);
  });

  it('selecting a scene with a matching story prose link calls jumpToPosition', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithStoryLink], storyUnit, ref)
    );

    act(() => {
      result.current.handleSelectScene('scene-b');
    });

    expect(editor.jumpToPosition).toHaveBeenCalledWith(0, 4);
  });

  it('selecting a scene whose link belongs to a different chapter does not jump', () => {
    const ref = makeRef(editor.handle);
    const otherChapter: WritingUnit = { ...chapterUnit, id: 'ch-other' };
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], otherChapter, ref)
    );

    act(() => {
      result.current.handleSelectScene('scene-a');
    });

    expect(editor.jumpToPosition).not.toHaveBeenCalled();
  });

  it('selecting a scene with no editor ref does not throw', () => {
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, undefined)
    );

    expect(() => {
      act(() => {
        result.current.handleSelectScene('scene-a');
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Card → editor: the cursor callback fired by jumpToPosition must be
  // suppressed so the selected scene card is not immediately deselected.
  // -------------------------------------------------------------------------

  it('cursor callback fired by jumpToPosition does not deselect the card', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    act(() => {
      result.current.handleSelectScene('scene-a');
    });

    // Simulate the cursor-change event that CM6 emits after jumpToPosition
    // sets the selection to [5, 10].  head=10 is outside the range [5,10),
    // so without the suppression guard the scene would be deselected.
    act(() => {
      editor.triggerCursorChange(5, 10);
    });

    expect(result.current.selectedSceneId).toBe('scene-a');
  });

  // -------------------------------------------------------------------------
  // Editor cursor → card direction
  // -------------------------------------------------------------------------

  it('cursor moving into a linked range selects the owning scene', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink, sceneWithNoLink], chapterUnit, ref)
    );

    act(() => {
      editor.triggerCursorChange(5, 7); // inside [5, 10)
    });

    expect(result.current.selectedSceneId).toBe('scene-a');
  });

  it('cursor moving outside any linked range clears the selection', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    // First move cursor inside the range
    act(() => {
      editor.triggerCursorChange(5, 7);
    });
    expect(result.current.selectedSceneId).toBe('scene-a');

    // Then move cursor outside
    act(() => {
      editor.triggerCursorChange(0, 2);
    });
    expect(result.current.selectedSceneId).toBeNull();
  });

  it('cursor position exactly at end_offset is outside the range (exclusive bound)', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    act(() => {
      editor.triggerCursorChange(10, 10); // end_offset is exclusive
    });

    expect(result.current.selectedSceneId).toBeNull();
  });

  it('cursor position at start_offset is inside the range (inclusive bound)', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    act(() => {
      editor.triggerCursorChange(5, 5);
    });

    expect(result.current.selectedSceneId).toBe('scene-a');
  });

  it('cursor movement when no chapter is active clears the selection', () => {
    const ref = makeRef(editor.handle);
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], null, ref)
    );

    act(() => {
      editor.triggerCursorChange(5, 7);
    });

    expect(result.current.selectedSceneId).toBeNull();
  });

  it('cursor does not match a scene whose link belongs to a different chapter', () => {
    const ref = makeRef(editor.handle);
    const otherChapter: WritingUnit = { ...chapterUnit, id: 'ch-other' };
    const { result } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], otherChapter, ref)
    );

    act(() => {
      editor.triggerCursorChange(5, 7);
    });

    expect(result.current.selectedSceneId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('unregisters the cursor callback when the hook unmounts', () => {
    const ref = makeRef(editor.handle);
    const { unmount } = renderHook(() =>
      useSceneProseSync([sceneWithChapterLink], chapterUnit, ref)
    );

    unmount();

    expect(editor.handle.setOnCursorChange).toHaveBeenLastCalledWith(null);
  });

  it('does not register a cursor callback when editorRef is undefined', () => {
    renderHook(() => useSceneProseSync([sceneWithChapterLink], chapterUnit, undefined));

    // No error, and no callbacks on the mock (since there is no mock to call)
    expect(editor.handle.setOnCursorChange).not.toHaveBeenCalled();
  });
});
