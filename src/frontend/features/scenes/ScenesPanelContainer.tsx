// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Container for the Scenes workspace panel.
 * Handles API calls, store updates, and renders the toolbar + active view.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import type { EditorHandle } from '../editor/Editor';
import type { Scene, SceneProseLink } from '../../types';
import type { WritingUnit } from '../../types/domain';
import { useScenes } from '../../stores/storyStore';
import { useStoryStore } from '../../stores/storyStore';
import type { StoryStoreState } from '../../stores/storyStore';
import {
  useStoryMeta,
  useStoryChaptersListMeta,
  useStoryBooks,
} from '../../stores/storyStore';
import { api } from '../../services/api';
import { notifyError } from '../../services/errorNotifier';
import { useThemeClasses } from '../layout/ThemeContext';
import { PinboardView } from './PinboardView';
import { NarrativeView } from './NarrativeView';
import { SceneEditorDialog } from './SceneEditorDialog';
import type { SceneUpdatePayload } from '../../services/apiClients/scenes';
import type { ProseDropData } from './types';
import { useSceneProseSync } from './useSceneProseSync';

type ViewMode = 'pinboard' | 'narrative';

interface ScenesPanelContainerProps {
  editorRef?: React.RefObject<EditorHandle | null>;
  currentChapter?: WritingUnit | null;
}

type BoundaryAdjustment = {
  id: string;
  link: SceneProseLink;
  newStart: number;
  newEnd: number;
};

function collectBoundaryAdjustments(
  scenes: Scene[],
  sceneId: string,
  link: SceneProseLink,
  edge: 'start' | 'end',
  startOffset: number,
  endOffset: number
): BoundaryAdjustment[] {
  const toAdjust: BoundaryAdjustment[] = [];
  for (const other of scenes) {
    if (other.id === sceneId || !other.prose_link) continue;
    const ol = other.prose_link;
    if (ol.scope_type !== link.scope_type) continue;
    if (link.scope_type === 'chapter' && ol.chapter_id !== link.chapter_id) continue;

    const otherStart = ol.start_offset;
    const otherEnd = ol.end_offset ?? otherStart;
    if (otherEnd <= startOffset || otherStart >= endOffset) continue;

    const newOtherStart = edge === 'end' ? endOffset : otherStart;
    const newOtherEnd = edge === 'start' ? startOffset : otherEnd;
    if (newOtherStart < newOtherEnd) {
      toAdjust.push({
        id: other.id,
        link: ol,
        newStart: newOtherStart,
        newEnd: newOtherEnd,
      });
    }
  }
  return toAdjust;
}

export const ScenesPanelContainer: React.FC<ScenesPanelContainerProps> = ({
  editorRef,
  currentChapter,
}: ScenesPanelContainerProps) => {
  const { t } = useTranslation();
  const tc = useThemeClasses();
  const scenes = useScenes();
  const patchScene = useStoryStore((s: StoryStoreState) => s.patchScene);
  const { projectType } = useStoryMeta();
  const chapters = useStoryChaptersListMeta();
  const books = useStoryBooks();

  const [viewMode, setViewMode] = useState<ViewMode>('pinboard');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  // ---- Scene selection + bidirectional prose-link sync ----
  const { selectedSceneId, handleSelectScene, handleMultipleSelectScenes } =
    useSceneProseSync(scenes, currentChapter, editorRef);

  const editingScene = editingSceneId
    ? (scenes.find((s: Scene) => s.id === editingSceneId) ?? null)
    : null;

  // ---- Create ----
  const handleAddScene = useCallback(async (): Promise<void> => {
    try {
      const created = await api.scenes.create({
        summary: '',
        pinboard_x: 40 + Math.random() * 200,
        pinboard_y: 40 + Math.random() * 200,
      });
      patchScene(created as Scene);
      setEditingSceneId(created.id);
    } catch (err) {
      notifyError(t('Add Scene'), err);
    }
  }, [patchScene, t]);

  // ---- Create scene from prose drop on the Add Scene button ----
  const handleAddSceneDragOver = useCallback((e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('application/aq-prose-selection')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
    }
  }, []);

  const handleAddSceneDrop = useCallback(
    async (e: React.DragEvent): Promise<void> => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/aq-prose-selection');
      if (!raw) return;
      let data: ProseDropData;
      try {
        data = JSON.parse(raw) as ProseDropData;
      } catch {
        return;
      }
      try {
        const created = await api.scenes.create({
          summary: '',
          pinboard_x: 40 + Math.random() * 200,
          pinboard_y: 40 + Math.random() * 200,
        });
        patchScene(created as Scene);
        const modified = await api.scenes.linkProse(created.id, {
          scope_type: data.scopeType,
          chapter_id: data.chapterId ?? null,
          book_id: data.bookId ?? null,
          start_offset: data.startOffset,
          end_offset: data.endOffset,
        });
        modified.forEach((s: Scene) => patchScene(s));
        setEditingSceneId(created.id);
      } catch (err) {
        notifyError(t('Add Scene'), err);
      }
    },
    [patchScene, t]
  );

  // ---- Move (position update from drag) ----
  const handleMoveScene = useCallback(
    async (sceneId: string, x: number, y: number): Promise<void> => {
      // Optimistic store update
      const prev = scenes.find((s: Scene) => s.id === sceneId);
      if (!prev) return;
      patchScene({ ...prev, pinboard_x: x, pinboard_y: y });
      try {
        const updated = await api.scenes.update(sceneId, {
          pinboard_x: x,
          pinboard_y: y,
        });
        patchScene(updated as Scene);
      } catch (err) {
        // Revert on failure
        patchScene(prev);
        notifyError(t('Save'), err);
      }
    },
    [scenes, patchScene, t]
  );

  // ---- Save from editor ----
  const handleSaveScene = useCallback(
    async (updates: Partial<Omit<Scene, 'id'>>): Promise<void> => {
      if (!editingSceneId) return;
      const updated = await api.scenes.update(
        editingSceneId,
        updates as SceneUpdatePayload
      );
      patchScene(updated as Scene);
    },
    [editingSceneId, patchScene]
  );

  // ---- Delete from editor ----
  const handleDeleteScene = useCallback(async (): Promise<void> => {
    if (!editingSceneId) return;
    await api.scenes.delete(editingSceneId);
    patchScene(null, editingSceneId);
    setEditingSceneId(null);
  }, [editingSceneId, patchScene]);

  // ---- Delete cause ----
  const handleDeleteCause = useCallback(
    async (fromId: string, toId: string): Promise<void> => {
      const fromScene = scenes.find((s: Scene) => s.id === fromId);
      const toScene = scenes.find((s: Scene) => s.id === toId);
      if (!fromScene || !toScene) return;

      const newBefore = fromScene.order_before.filter((id: string) => id !== toId);
      const newAfter = toScene.order_after.filter((id: string) => id !== fromId);

      // Optimistic update
      patchScene({ ...fromScene, order_before: newBefore });
      patchScene({ ...toScene, order_after: newAfter });

      try {
        const [updatedFrom, updatedTo] = await Promise.all([
          api.scenes.update(fromId, { order_before: newBefore } as SceneUpdatePayload),
          api.scenes.update(toId, { order_after: newAfter } as SceneUpdatePayload),
        ]);
        patchScene(updatedFrom as Scene);
        patchScene(updatedTo as Scene);
      } catch (err) {
        // Revert
        patchScene(fromScene);
        patchScene(toScene);
        notifyError(t('Save'), err);
      }
    },
    [scenes, patchScene, t]
  );

  // ---- Create cause (Alt+drag on pinboard) ----
  const handleCreateCause = useCallback(
    async (fromId: string, toId: string): Promise<void> => {
      const fromScene = scenes.find((s: Scene) => s.id === fromId);
      const toScene = scenes.find((s: Scene) => s.id === toId);
      if (!fromScene || !toScene) return;
      if (fromScene.order_before.includes(toId)) return; // already set

      const newBefore = [...fromScene.order_before, toId];
      const newAfter = [...toScene.order_after, fromId];

      // Optimistic update
      patchScene({ ...fromScene, order_before: newBefore });
      patchScene({ ...toScene, order_after: newAfter });

      try {
        const [updatedFrom, updatedTo] = await Promise.all([
          api.scenes.update(fromId, { order_before: newBefore } as SceneUpdatePayload),
          api.scenes.update(toId, { order_after: newAfter } as SceneUpdatePayload),
        ]);
        patchScene(updatedFrom as Scene);
        patchScene(updatedTo as Scene);
      } catch (err) {
        // Revert
        patchScene(fromScene);
        patchScene(toScene);
        notifyError(t('Save'), err);
      }
    },
    [scenes, patchScene, t]
  );

  // ---- Prose drop (drag from editor to scene card) ----
  const handleDropProse = useCallback(
    async (sceneId: string, data: ProseDropData): Promise<void> => {
      try {
        const modified = await api.scenes.linkProse(sceneId, {
          scope_type: data.scopeType,
          chapter_id: data.chapterId ?? null,
          book_id: data.bookId ?? null,
          start_offset: data.startOffset,
          end_offset: data.endOffset,
        });
        modified.forEach((s: Scene) => patchScene(s));
      } catch (err) {
        notifyError(t('Link Prose'), err);
      }
    },
    [patchScene, t]
  );

  // ---- Narrative reorder (drag in list + move linked prose text) ----
  const handleNarrativeReorder = useCallback(
    async (
      sourceSceneId: string,
      targetSceneId: string,
      placeBefore: boolean
    ): Promise<void> => {
      if (sourceSceneId === targetSceneId) return;

      const sourceScene = scenes.find((s: Scene) => s.id === sourceSceneId);
      const targetScene = scenes.find((s: Scene) => s.id === targetSceneId);
      if (!sourceScene?.prose_link || !targetScene?.prose_link) return;
      try {
        const reorderResult = await api.scenes.reorderProse({
          source_scene_id: sourceSceneId,
          target_scene_id: targetSceneId,
          place_before: placeBefore,
        });
        reorderResult.scenes.forEach((scene: Scene) => patchScene(scene));

        if (reorderResult.scenes.length === 0) return;

        const view: EditorView | null = editorRef?.current?.getEditorView() ?? null;
        if (!view || !currentChapter) return;

        const scopeMatchesCurrentChapter =
          reorderResult.scope_type === 'story'
            ? currentChapter.scope === 'story'
            : reorderResult.scope_type === 'chapter' &&
              reorderResult.chapter_id === currentChapter.id;

        if (!scopeMatchesCurrentChapter) return;

        view.dispatch({
          changes: {
            from: reorderResult.scope_start,
            to: reorderResult.scope_end,
            insert: reorderResult.rebuilt_text,
          },
        });
      } catch (err) {
        notifyError(t('Save'), err);
      }
    },
    [scenes, patchScene, editorRef, currentChapter, t]
  );

  // ---- Prose-link boundary drag (update start/end offset) ----
  const handleProseBoundaryChange = useCallback(
    async (sceneId: string, edge: 'start' | 'end', offset: number): Promise<void> => {
      const scene = scenes.find((s: Scene): boolean => s.id === sceneId);
      if (!scene?.prose_link) return;
      const link = scene.prose_link;
      const startOffset = edge === 'start' ? offset : link.start_offset;
      const endOffset = edge === 'end' ? offset : (link.end_offset ?? offset);
      if (startOffset >= endOffset) return;

      const toAdjust = collectBoundaryAdjustments(
        scenes,
        sceneId,
        link,
        edge,
        startOffset,
        endOffset
      );

      try {
        // Adjust neighbours first so the backend does not see transient overlaps.
        for (const adj of toAdjust) {
          const modified = await api.scenes.linkProse(adj.id, {
            scope_type: adj.link.scope_type,
            chapter_id: adj.link.chapter_id ?? null,
            book_id: adj.link.book_id ?? null,
            start_offset: adj.newStart,
            end_offset: adj.newEnd,
          });
          modified.forEach((s: Scene) => patchScene(s));
        }
        const modified = await api.scenes.linkProse(sceneId, {
          scope_type: link.scope_type,
          chapter_id: link.chapter_id ?? null,
          book_id: link.book_id ?? null,
          start_offset: startOffset,
          end_offset: endOffset,
        });
        modified.forEach((s: Scene) => patchScene(s));
      } catch (err) {
        notifyError(t('Update prose link'), err);
      }
    },
    [scenes, patchScene, t]
  );

  // Register the boundary-change handler on the editor handle so the callback
  // is always current without re-running the mount effect.
  useEffect((): (() => void) => {
    editorRef?.current?.setOnProseBoundaryChange(handleProseBoundaryChange);
    return (): void => {
      editorRef?.current?.setOnProseBoundaryChange(null);
    };
  }, [editorRef, handleProseBoundaryChange]);

  // ---- Get linked prose text from editor content ----
  const getLinkedProseText = useCallback(
    (link: SceneProseLink): string | null => {
      const view: EditorView | null = editorRef?.current?.getEditorView() ?? null;
      if (!view || !currentChapter) return null;
      const isScopeMatch =
        link.scope_type === 'story'
          ? currentChapter.scope === 'story'
          : link.scope_type === 'chapter' && link.chapter_id === currentChapter.id;
      if (!isScopeMatch) return null;
      const doc = view.state.doc;
      const end = link.end_offset ?? doc.length;
      return doc.sliceString(
        Math.min(link.start_offset, doc.length),
        Math.min(end, doc.length)
      );
    },
    [editorRef, currentChapter]
  );

  const handleSaveProseContent = useCallback(
    async (text: string): Promise<void> => {
      if (!editingSceneId) return;
      // Capture the prose link before the API call so we know which range to
      // replace in the editor (the backend may return a different end_offset).
      const proseLink =
        scenes.find((s: Scene) => s.id === editingSceneId)?.prose_link ?? null;
      const updated = await api.scenes.updateProseContent(editingSceneId, text);
      patchScene(updated as Scene);
      // Reflect the change immediately in the editor so the writer sees the
      // updated text without having to close and reopen the chapter.
      if (proseLink && editorRef?.current) {
        const view: EditorView | null = editorRef.current.getEditorView();
        if (view) {
          const docLen = view.state.doc.length;
          const from = Math.min(proseLink.start_offset, docLen);
          const to = Math.min(proseLink.end_offset ?? docLen, docLen);
          view.dispatch({ changes: { from, to, insert: text } });
        }
      }
    },
    [editingSceneId, patchScene, scenes, editorRef]
  );

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b ${tc.border} flex-shrink-0`}
      >
        <div className="flex items-center gap-1">
          {/* View mode buttons */}
          <button
            type="button"
            aria-pressed={viewMode === 'pinboard'}
            onClick={() => setViewMode('pinboard')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'pinboard'
                ? 'bg-brand-500 text-white'
                : `${tc.text} hover:bg-brand-gray-100 dark:hover:bg-brand-gray-800`
            }`}
          >
            {t('Pinboard')}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'narrative'}
            onClick={() => setViewMode('narrative')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'narrative'
                ? 'bg-brand-500 text-white'
                : `${tc.text} hover:bg-brand-gray-100 dark:hover:bg-brand-gray-800`
            }`}
          >
            {t('Narrative')}
          </button>
        </div>
        <button
          type="button"
          aria-label={t('Add Scene')}
          onClick={handleAddScene}
          onDragOver={handleAddSceneDragOver}
          onDrop={handleAddSceneDrop}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium bg-brand-500 text-white hover:bg-brand-600"
        >
          <Plus size={14} aria-hidden="true" />
          {t('Add Scene')}
        </button>
      </div>

      {/* View area */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'pinboard' && (
          <PinboardView
            scenes={scenes}
            primarySelectedSceneId={selectedSceneId}
            onSelectScene={handleSelectScene}
            onSelectionChange={handleMultipleSelectScenes}
            onMoveScene={handleMoveScene}
            onEditScene={setEditingSceneId}
            onCreateCause={handleCreateCause}
            onDropProse={handleDropProse}
          />
        )}
        {viewMode === 'narrative' && (
          <NarrativeView
            scenes={scenes}
            projectType={projectType}
            chapters={chapters}
            books={books}
            primarySelectedSceneId={selectedSceneId}
            onSelectScene={handleSelectScene}
            onSelectionChange={handleMultipleSelectScenes}
            onEditScene={setEditingSceneId}
            onDropProse={handleDropProse}
            onReorderScene={handleNarrativeReorder}
          />
        )}
      </div>

      {/* Scene editor dialog */}
      {editingScene && (
        <SceneEditorDialog
          scene={editingScene}
          isOpen={true}
          onClose={() => setEditingSceneId(null)}
          onSave={handleSaveScene}
          onDelete={handleDeleteScene}
          onDeleteCause={handleDeleteCause}
          getLinkedProseText={editorRef ? getLinkedProseText : undefined}
          onSaveProseContent={editorRef ? handleSaveProseContent : undefined}
        />
      )}
    </div>
  );
};
