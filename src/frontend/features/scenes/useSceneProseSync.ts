// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Hook that manages bidirectional selection sync between a scene card on the
 * pinboard and its linked prose range in the editor.
 *
 * - Clicking a scene card (source='card') jumps the editor cursor to the
 *   linked prose range and keeps the scene selected.
 * - Moving the editor cursor into a linked prose range (source='cursor')
 *   highlights the owning scene card.
 * - A jump triggered by source='card' fires a cursor-change callback, but
 *   that callback is suppressed to avoid immediately deselecting the card.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scene, SceneProseLink } from '../../types';
import type { WritingUnit } from '../../types/domain';
import type { EditorHandle } from '../editor/Editor';

export interface SceneProseSyncResult {
  selectedSceneId: string | null;
  handleSelectScene: (id: string | null) => void;
}

export function useSceneProseSync(
  scenes: Scene[],
  currentChapter: WritingUnit | null | undefined,
  editorRef: React.RefObject<EditorHandle | null> | undefined
): SceneProseSyncResult {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Distinguishes whether the last selection change came from the user clicking
  // a card ('card') or from the cursor moving inside the editor ('cursor').
  // Using a ref (not state) avoids extra renders and prevents circular loops.
  const selectionSourceRef = useRef<'card' | 'cursor'>('cursor');

  // Stable refs so the cursor callback closure never goes stale between renders.
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const currentChapterRef = useRef(currentChapter);
  currentChapterRef.current = currentChapter;

  // Subscribe to editor cursor changes.  When the cursor moves into a linked
  // prose range we highlight the owning scene card.
  useEffect((): (() => void) => {
    const editor = editorRef?.current;
    if (!editor) return (): void => {};

    editor.setOnCursorChange((_anchor: number, head: number): void => {
      // A jump triggered by our own jumpToPosition (source='card') fires the
      // cursor callback.  Suppress it so the card stays selected, then reset
      // so future user-driven cursor moves are processed normally.
      if (selectionSourceRef.current === 'card') {
        selectionSourceRef.current = 'cursor';
        return;
      }

      const chapter = currentChapterRef.current;
      if (!chapter) {
        setSelectedSceneId(null);
        return;
      }

      const cursor = head; // head is the active/moving end of the selection
      const found = scenesRef.current.find((s: Scene): boolean => {
        const link: SceneProseLink | null | undefined = s.prose_link;
        if (!link) return false;
        const matchesScope =
          link.scope_type === 'story'
            ? chapter.scope === 'story'
            : link.scope_type === 'chapter' && link.chapter_id === chapter.id;
        return (
          matchesScope &&
          cursor >= link.start_offset &&
          link.end_offset != null &&
          cursor < link.end_offset
        );
      });
      setSelectedSceneId(found?.id ?? null);
    });

    return (): void => {
      editor.setOnCursorChange(null);
    };
  }, [editorRef]);

  // When a scene card is clicked, jump the editor cursor to the linked prose
  // range so the user can see exactly which text the scene describes.
  useEffect((): void => {
    if (selectionSourceRef.current !== 'card') return;
    if (!selectedSceneId || !editorRef?.current || !currentChapter) return;

    const scene = scenesRef.current.find(
      (s: Scene): boolean => s.id === selectedSceneId
    );
    const link: SceneProseLink | null | undefined = scene?.prose_link;
    if (!link) return;

    const matchesScope =
      link.scope_type === 'story'
        ? currentChapter.scope === 'story'
        : link.scope_type === 'chapter' && link.chapter_id === currentChapter.id;
    if (!matchesScope) return;

    editorRef.current.jumpToPosition(
      link.start_offset,
      link.end_offset ?? link.start_offset
    );
  }, [selectedSceneId, currentChapter, editorRef]);

  const handleSelectScene = useCallback((id: string | null): void => {
    selectionSourceRef.current = 'card';
    setSelectedSceneId(id);
  }, []);

  return { selectedSceneId, handleSelectScene };
}
