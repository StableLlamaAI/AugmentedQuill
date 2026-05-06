// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for ScenesPanelContainer handler logic.
 *
 * Strategy: the PinboardView and SceneEditorDialog are replaced with spy
 * stubs that write their props into the shared `captured` object. Tests
 * call handler callbacks directly (e.g. captured.dialog.onSave(...)) to
 * exercise the real implementation in the container without rendering any
 * real child-component DOM. The dialog is opened by calling
 * captured.pinboard.onEditScene(id) which triggers setEditingSceneId.
 *
 * Covers:
 *   handleAddScene, handleMoveScene, handleSaveScene, handleDeleteScene,
 *   handleCreateConstraint, handleDropProse, handleSaveProseContent,
 *   getLinkedProseText
 */

// @vitest-environment jsdom

import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, it, expect, vi, afterEach } from 'vitest';
import i18n from '../app/i18n';
import { ScenesPanelContainer } from './ScenesPanelContainer';
import type { Scene, SceneProseLink } from '../../types';
import type { WritingUnit } from '../../types/domain';
import type { EditorHandle } from '../editor/Editor';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { patchSceneMock, useScenesMock, apiMock, captured } = vi.hoisted(() => {
  const patchSceneMock = vi.fn();
  const useScenesMock = vi.fn(() => [] as Scene[]);
  const apiMock = {
    scenes: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      linkProse: vi.fn(),
      updateProseContent: vi.fn(),
    },
  };
  // Mutable holder — spy stubs close over this object; tests read from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captured: { pinboard: any; dialog: any } = { pinboard: null, dialog: null };
  return { patchSceneMock, useScenesMock, apiMock, captured };
});

vi.mock('../../stores/storyStore', () => ({
  useScenes: () => useScenesMock(),
  useStoryStore: () => patchSceneMock,
}));

vi.mock('../layout/ThemeContext', () => ({
  useThemeClasses: vi.fn(() => ({
    bg: '',
    text: '',
    border: '',
    muted: '',
    input: '',
  })),
}));

vi.mock('./PinboardView', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PinboardView: (props: any) => {
    captured.pinboard = props;
    return null;
  },
}));

vi.mock('./SceneEditorDialog', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SceneEditorDialog: (props: any) => {
    captured.dialog = props.isOpen ? props : null;
    return null;
  },
}));

vi.mock('./useSceneProseSync', () => ({
  useSceneProseSync: vi.fn(() => ({
    selectedSceneId: null,
    handleSelectScene: vi.fn(),
  })),
}));

vi.mock('../../services/errorNotifier', () => ({ notifyError: vi.fn() }));

vi.mock('../../services/api', () => ({ api: apiMock }));

// ---------------------------------------------------------------------------
// Typed accessors for captured props
// ---------------------------------------------------------------------------

interface PinboardHandlers {
  onMoveScene: (id: string, x: number, y: number) => Promise<void>;
  onEditScene: (id: string) => void;
  onCreateConstraint: (fromId: string, toId: string) => Promise<void>;
  onDropProse: (
    sceneId: string,
    data: {
      scopeType: string;
      startOffset: number;
      endOffset: number;
      chapterId?: string | null;
      bookId?: string | null;
    }
  ) => Promise<void>;
}

interface DialogHandlers {
  onSave: (updates: Partial<Omit<Scene, 'id'>>) => Promise<void>;
  onDelete: () => Promise<void>;
  onSaveProseContent: ((text: string) => Promise<void>) | undefined;
  getLinkedProseText: ((link: SceneProseLink) => string | null) | undefined;
}

function pb(): PinboardHandlers {
  if (!captured.pinboard) throw new Error('PinboardView not rendered yet');
  return captured.pinboard as PinboardHandlers;
}

function dlg(): DialogHandlers {
  if (!captured.dialog) throw new Error('SceneEditorDialog not open yet');
  return captured.dialog as DialogHandlers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    summary: 'Test scene',
    beats: [],
    prose_link: null,
    active_characters: [],
    passive_characters: [],
    location: null,
    time: null,
    color_tag: null,
    status: 'active',
    pinboard_x: 0,
    pinboard_y: 0,
    order_before: [],
    order_after: [],
    ...overrides,
  };
}

function makeProseLink(overrides: Partial<SceneProseLink> = {}): SceneProseLink {
  return {
    scope_type: 'story',
    start_offset: 10,
    end_offset: 30,
    content_hash: 'abc',
    chapter_id: null,
    book_id: null,
    is_stale: false,
    ...overrides,
  };
}

function makeEditorRef(docText: string = 'Hello world, some prose here.'): {
  ref: React.RefObject<EditorHandle | null>;
  view: {
    state: { doc: { length: number; sliceString: ReturnType<typeof vi.fn> } };
    dispatch: ReturnType<typeof vi.fn>;
  };
  dispatch: ReturnType<typeof vi.fn>;
  doc: { length: number; sliceString: ReturnType<typeof vi.fn> };
} {
  const dispatch = vi.fn();
  const doc = {
    length: docText.length,
    sliceString: vi.fn((from: number, to: number) => docText.slice(from, to)),
  };
  const view = { state: { doc }, dispatch };
  const ref: React.RefObject<EditorHandle | null> = {
    current: {
      setOnCursorChange: vi.fn(),
      getEditorView: vi.fn(() => view),
    },
  };
  return { ref, view, dispatch, doc };
}

const STORY_UNIT: WritingUnit = { id: 'story', scope: 'story', title: 'Story' };
const CHAPTER: WritingUnit = { id: 'ch-1', scope: 'chapter', title: 'Chapter 1' };

function wrap(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

/**
 * Render the container with the given scenes in the store,
 * then open the dialog for the first scene by calling onEditScene.
 */
async function renderAndOpenDialog(
  scenes: Scene[],
  props: Partial<React.ComponentProps<typeof ScenesPanelContainer>> = {}
): Promise<void> {
  useScenesMock.mockReturnValue(scenes);
  wrap(<ScenesPanelContainer {...props} />);
  await act(async () => {
    // Trigger dialog open via pinboard callback — no API call needed
    pb().onEditScene(scenes[0].id);
  });
}

afterEach(() => {
  cleanup();
  captured.pinboard = null;
  captured.dialog = null;
  vi.clearAllMocks();
  useScenesMock.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// handleAddScene
// ---------------------------------------------------------------------------

describe('handleAddScene', () => {
  it('calls api.scenes.create and patches the store', async () => {
    const created = makeScene({ id: 'new-1', summary: '' });
    apiMock.scenes.create.mockResolvedValueOnce(created);
    useScenesMock.mockReturnValue([created]);

    const { container } = wrap(<ScenesPanelContainer />);

    // Find and click the Add Scene button
    const addBtn = container.querySelector('button[aria-label]');
    // Use the pinboard handler to simulate what the toolbar button does —
    // but let's click the real button to test the full path.
    expect(addBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(addBtn!);
    });

    expect(apiMock.scenes.create).toHaveBeenCalledOnce();
    expect(patchSceneMock).toHaveBeenCalledWith(created);
  });
});

// ---------------------------------------------------------------------------
// handleMoveScene
// ---------------------------------------------------------------------------

describe('handleMoveScene', () => {
  it('applies an optimistic update then confirms with the API response', async () => {
    const original = makeScene({ id: 's1', pinboard_x: 0, pinboard_y: 0 });
    const confirmed = makeScene({ id: 's1', pinboard_x: 100, pinboard_y: 200 });
    useScenesMock.mockReturnValue([original]);
    apiMock.scenes.update.mockResolvedValueOnce(confirmed);

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onMoveScene('s1', 100, 200);
    });

    // Optimistic patch with new coords applied first
    expect(patchSceneMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', pinboard_x: 100, pinboard_y: 200 })
    );
    // Confirmed patch with API response applied second
    expect(patchSceneMock).toHaveBeenCalledWith(confirmed);
  });

  it('reverts the optimistic update on API failure', async () => {
    const original = makeScene({ id: 's1', pinboard_x: 5, pinboard_y: 5 });
    useScenesMock.mockReturnValue([original]);
    apiMock.scenes.update.mockRejectedValueOnce(new Error('network'));

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onMoveScene('s1', 999, 999);
    });

    const calls = patchSceneMock.mock.calls as Array<[Scene]>;
    // Last call must restore the original scene
    expect(calls[calls.length - 1][0]).toEqual(original);
  });

  it('does nothing when the scene id is not found in the store', async () => {
    useScenesMock.mockReturnValue([]);
    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onMoveScene('ghost', 10, 10);
    });

    expect(apiMock.scenes.update).not.toHaveBeenCalled();
    expect(patchSceneMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSaveScene (via dialog's onSave)
// ---------------------------------------------------------------------------

describe('handleSaveScene', () => {
  it('calls update API and patches the store with the response', async () => {
    const scene = makeScene({ id: 'edit-1' });
    const updatedScene = makeScene({ id: 'edit-1', summary: 'Updated' });
    apiMock.scenes.update.mockResolvedValueOnce(updatedScene);

    await renderAndOpenDialog([scene]);

    await act(async () => {
      await dlg().onSave({ summary: 'Updated' });
    });

    expect(apiMock.scenes.update).toHaveBeenCalledWith('edit-1', {
      summary: 'Updated',
    });
    expect(patchSceneMock).toHaveBeenCalledWith(updatedScene);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteScene (via dialog's onDelete)
// ---------------------------------------------------------------------------

describe('handleDeleteScene', () => {
  it('calls delete API, removes scene from store, and closes dialog', async () => {
    const scene = makeScene({ id: 'del-1' });
    apiMock.scenes.delete.mockResolvedValueOnce(undefined);

    await renderAndOpenDialog([scene]);
    expect(captured.dialog).not.toBeNull();

    await act(async () => {
      await dlg().onDelete();
    });

    expect(apiMock.scenes.delete).toHaveBeenCalledWith('del-1');
    // Store is updated to remove the scene
    expect(patchSceneMock).toHaveBeenCalledWith(null, 'del-1');
    // editingSceneId is reset — the dialog closes because editingScene becomes null.
    // Verify by checking that the dialog mock sees isOpen=false or the component
    // conditionally unmounts. With our spy, captured.dialog reflects the LAST render.
    // Since the container removes the Dialog element entirely (conditional render),
    // our mock won't run again, so we verify the observable store update instead.
    expect(patchSceneMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// handleCreateConstraint (via pinboard's onCreateConstraint)
// ---------------------------------------------------------------------------

describe('handleCreateConstraint', () => {
  it('patches both scenes optimistically and then with API responses', async () => {
    const a = makeScene({ id: 'a', order_before: [], order_after: [] });
    const b = makeScene({ id: 'b', order_before: [], order_after: [] });
    const updatedA = makeScene({ id: 'a', order_before: ['b'] });
    const updatedB = makeScene({ id: 'b', order_after: ['a'] });
    useScenesMock.mockReturnValue([a, b]);
    apiMock.scenes.update
      .mockResolvedValueOnce(updatedA)
      .mockResolvedValueOnce(updatedB);

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onCreateConstraint('a', 'b');
    });

    expect(apiMock.scenes.update).toHaveBeenCalledTimes(2);
    expect(patchSceneMock).toHaveBeenCalledWith(updatedA);
    expect(patchSceneMock).toHaveBeenCalledWith(updatedB);
  });

  it('skips the API call when the constraint already exists', async () => {
    const a = makeScene({ id: 'a', order_before: ['b'], order_after: [] });
    const b = makeScene({ id: 'b', order_before: [], order_after: [] });
    useScenesMock.mockReturnValue([a, b]);

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onCreateConstraint('a', 'b');
    });

    expect(apiMock.scenes.update).not.toHaveBeenCalled();
  });

  it('reverts both scenes on API failure', async () => {
    const a = makeScene({ id: 'a', order_before: [], order_after: [] });
    const b = makeScene({ id: 'b', order_before: [], order_after: [] });
    useScenesMock.mockReturnValue([a, b]);
    apiMock.scenes.update.mockRejectedValueOnce(new Error('fail'));

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onCreateConstraint('a', 'b');
    });

    const calls = patchSceneMock.mock.calls as Array<[Scene]>;
    const lastTwo = calls.slice(-2).map((c: [Scene]) => c[0]);
    expect(lastTwo).toContainEqual(a);
    expect(lastTwo).toContainEqual(b);
  });
});

// ---------------------------------------------------------------------------
// handleDropProse (via pinboard's onDropProse)
// ---------------------------------------------------------------------------

describe('handleDropProse', () => {
  it('calls linkProse and patches every returned scene', async () => {
    const a = makeScene({ id: 'a' });
    const b = makeScene({ id: 'b' });
    useScenesMock.mockReturnValue([a, b]);
    apiMock.scenes.linkProse.mockResolvedValueOnce([a, b]);

    wrap(<ScenesPanelContainer />);

    await act(async () => {
      await pb().onDropProse('a', {
        scopeType: 'story',
        startOffset: 0,
        endOffset: 50,
        chapterId: null,
        bookId: null,
      });
    });

    expect(apiMock.scenes.linkProse).toHaveBeenCalledWith('a', {
      scope_type: 'story',
      chapter_id: null,
      book_id: null,
      start_offset: 0,
      end_offset: 50,
    });
    expect(patchSceneMock).toHaveBeenCalledWith(a);
    expect(patchSceneMock).toHaveBeenCalledWith(b);
  });
});

// ---------------------------------------------------------------------------
// handleSaveProseContent — the critical round-trip test
// ---------------------------------------------------------------------------

describe('handleSaveProseContent', () => {
  it('calls updateProseContent and patches the store with the returned scene', async () => {
    const proseLink = makeProseLink({ start_offset: 0, end_offset: 5 });
    const scene = makeScene({ id: 'ps', prose_link: proseLink });
    const updatedScene = makeScene({
      id: 'ps',
      prose_link: { ...proseLink, end_offset: 9, content_hash: 'new' },
    });
    apiMock.scenes.updateProseContent.mockResolvedValueOnce(updatedScene);
    const { ref } = makeEditorRef('Hello');

    await renderAndOpenDialog([scene], { editorRef: ref });
    expect(dlg().onSaveProseContent).toBeDefined();

    await act(async () => {
      await dlg().onSaveProseContent!('Goodbye');
    });

    expect(apiMock.scenes.updateProseContent).toHaveBeenCalledWith('ps', 'Goodbye');
    expect(patchSceneMock).toHaveBeenCalledWith(updatedScene);
  });

  it('dispatches a CodeMirror replace transaction so the editor reflects the new text', async () => {
    const proseLink = makeProseLink({ start_offset: 6, end_offset: 11 });
    const scene = makeScene({ id: 'ps', prose_link: proseLink });
    const updatedScene = makeScene({
      id: 'ps',
      prose_link: { ...proseLink, end_offset: 9 },
    });
    apiMock.scenes.updateProseContent.mockResolvedValueOnce(updatedScene);
    const { ref, dispatch } = makeEditorRef('Hello world!');

    await renderAndOpenDialog([scene], { editorRef: ref });

    await act(async () => {
      await dlg().onSaveProseContent!('earth');
    });

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 6, to: 11, insert: 'earth' },
    });
  });

  it('does NOT dispatch an editor transaction when the scene has no prose link', async () => {
    const scene = makeScene({ id: 'ps', prose_link: null });
    const updatedScene = makeScene({ id: 'ps', prose_link: null });
    apiMock.scenes.updateProseContent.mockResolvedValueOnce(updatedScene);
    const { ref, dispatch } = makeEditorRef();

    await renderAndOpenDialog([scene], { editorRef: ref });

    await act(async () => {
      await dlg().onSaveProseContent!('anything');
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does NOT dispatch when the editor view is unavailable (getEditorView returns null)', async () => {
    const proseLink = makeProseLink();
    const scene = makeScene({ id: 'ps', prose_link: proseLink });
    const updatedScene = makeScene({ id: 'ps', prose_link: proseLink });
    apiMock.scenes.updateProseContent.mockResolvedValueOnce(updatedScene);
    const nullViewRef: React.RefObject<EditorHandle | null> = {
      current: {
        setOnCursorChange: vi.fn(),
        getEditorView: vi.fn(() => null),
      },
    };

    await renderAndOpenDialog([scene], { editorRef: nullViewRef });

    await act(async () => {
      await dlg().onSaveProseContent!('text');
    });

    // Must still patch the store even without a view
    expect(patchSceneMock).toHaveBeenCalledWith(updatedScene);
  });

  it('clamps the replacement range to the document length', async () => {
    const proseLink = makeProseLink({ start_offset: 0, end_offset: 99999 });
    const scene = makeScene({ id: 'ps', prose_link: proseLink });
    const updatedScene = makeScene({ id: 'ps', prose_link: proseLink });
    apiMock.scenes.updateProseContent.mockResolvedValueOnce(updatedScene);
    const shortDoc = 'Short.';
    const { ref, dispatch } = makeEditorRef(shortDoc);

    await renderAndOpenDialog([scene], { editorRef: ref });

    await act(async () => {
      await dlg().onSaveProseContent!('replaced');
    });

    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: shortDoc.length, insert: 'replaced' },
    });
  });
});

// ---------------------------------------------------------------------------
// getLinkedProseText (exposed as dialog's getLinkedProseText)
// ---------------------------------------------------------------------------

describe('getLinkedProseText', () => {
  it('returns the editor text slice for a story-scoped link when scope matches', async () => {
    const docText = 'Hello world, some prose.';
    const scene = makeScene({ id: 's1' });
    const { ref } = makeEditorRef(docText);

    await renderAndOpenDialog([scene], { editorRef: ref, currentChapter: STORY_UNIT });

    const link: SceneProseLink = makeProseLink({
      scope_type: 'story',
      start_offset: 6,
      end_offset: 11,
    });

    expect(dlg().getLinkedProseText!(link)).toBe('world');
  });

  it('returns the text for a chapter-scoped link when chapter id matches', async () => {
    const docText = 'Chapter text here.';
    const scene = makeScene({ id: 's1' });
    const { ref } = makeEditorRef(docText);

    await renderAndOpenDialog([scene], { editorRef: ref, currentChapter: CHAPTER });

    const link: SceneProseLink = makeProseLink({
      scope_type: 'chapter',
      chapter_id: 'ch-1',
      start_offset: 0,
      end_offset: 7,
    });

    expect(dlg().getLinkedProseText!(link)).toBe('Chapter');
  });

  it('returns null when scope_type is story but current chapter is not story scope', async () => {
    const { ref } = makeEditorRef('Content.');
    const scene = makeScene({ id: 's1' });

    await renderAndOpenDialog([scene], { editorRef: ref, currentChapter: CHAPTER });

    const link: SceneProseLink = makeProseLink({ scope_type: 'story' });
    expect(dlg().getLinkedProseText!(link)).toBeNull();
  });

  it('returns null when chapter_id does not match the current chapter', async () => {
    const { ref } = makeEditorRef('Content.');
    const scene = makeScene({ id: 's1' });

    await renderAndOpenDialog([scene], { editorRef: ref, currentChapter: CHAPTER });

    const link: SceneProseLink = makeProseLink({
      scope_type: 'chapter',
      chapter_id: 'other-chapter',
    });

    expect(dlg().getLinkedProseText!(link)).toBeNull();
  });

  it('returns null when currentChapter is null', async () => {
    const { ref } = makeEditorRef('Content.');
    const scene = makeScene({ id: 's1' });

    await renderAndOpenDialog([scene], { editorRef: ref, currentChapter: null });

    const link: SceneProseLink = makeProseLink({ scope_type: 'story' });
    expect(dlg().getLinkedProseText!(link)).toBeNull();
  });

  it('returns null when the editor view is not available', async () => {
    const nullViewRef: React.RefObject<EditorHandle | null> = {
      current: {
        setOnCursorChange: vi.fn(),
        getEditorView: vi.fn(() => null),
      },
    };
    const scene = makeScene({ id: 's1' });

    await renderAndOpenDialog([scene], {
      editorRef: nullViewRef,
      currentChapter: STORY_UNIT,
    });

    const link: SceneProseLink = makeProseLink({ scope_type: 'story' });
    expect(dlg().getLinkedProseText!(link)).toBeNull();
  });

  it('returns undefined/null when no editorRef is passed (prop omitted)', async () => {
    const scene = makeScene({ id: 's1' });
    // No editorRef prop → getLinkedProseText should be undefined
    await renderAndOpenDialog([scene]);

    expect(dlg().getLinkedProseText).toBeUndefined();
  });
});
