// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Narrative view for scenes.
 *
 * Shows all scenes as a full-width vertical list sorted by their prose
 * position (start_offset within their scope).  Horizontal dividers are
 * inserted at chapter and book boundaries so the writer can see how the
 * scenes map onto the story structure.
 *
 * Scenes without a prose link are collected at the bottom of the list.
 *
 * Selection semantics (single click, Ctrl+click, Shift+click, active scene
 * highlighting, and editor prose-highlight sync) are identical to the
 * Pinboard view, implemented via the shared useSceneSelection hook.
 */

import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useEffect,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../../types';
import type { Chapter, Book } from '../../types/domain';
import type { ProseDropData } from './types';
import { SceneCard } from './SceneCard';
import { CauseArrows } from './ConstraintArrows';
import type { CardLayoutMap } from './ConstraintArrows';
import { useSceneSelection } from './useSceneSelection';
import { useThemeClasses, useTheme } from '../layout/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectType = 'short-story' | 'novel' | 'series';

interface NarrativeViewProps {
  scenes: Scene[];
  projectType: ProjectType;
  chapters: Chapter[];
  books?: Book[];
  primarySelectedSceneId: string | null;
  onSelectScene: (id: string | null) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onEditScene: (sceneId: string) => void;
  onDropProse?: (sceneId: string, data: ProseDropData) => void;
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

/** Build a map from chapter id → display order index, using the correct
 *  sequence for the project type (flat list for novel; books-first for series). */
function buildChapterOrderMap(
  projectType: ProjectType,
  chapters: Chapter[],
  books: Book[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (projectType === 'series' && books.length > 0) {
    let idx = 0;
    for (const book of books) {
      for (const ch of book.chapters) {
        map.set(ch.id, idx++);
      }
    }
  } else {
    chapters.forEach((ch: Chapter, i: number) => map.set(ch.id, i));
  }
  return map;
}

/** Returns a [chapterIndex, startOffset] tuple for sorting.
 *  Scenes without a prose link sort to the very end. */
function sceneSortKey(
  scene: Scene,
  chapterOrderMap: Map<string, number>
): [number, number] {
  const link = scene.prose_link;
  if (!link) return [Infinity, Infinity];
  if (link.scope_type === 'story') return [-1, link.start_offset];
  const chIdx = chapterOrderMap.get(link.chapter_id ?? '') ?? Infinity;
  return [chIdx, link.start_offset];
}

// ---------------------------------------------------------------------------
// Rendering items (dividers + scene rows)
// ---------------------------------------------------------------------------

type NarrativeItem =
  | { kind: 'scene'; scene: Scene; sortIndex: number }
  | { kind: 'book-break'; bookId: string; bookTitle: string }
  | { kind: 'chapter-break'; chapterId: string; chapterTitle: string }
  | { kind: 'unlinked-header' };

interface BreakState {
  prevChapterId: string | null | undefined;
  prevBookId: string | null | undefined;
  unlinkedHeaderShown: boolean;
}

function appendUnlinkedItem(
  items: NarrativeItem[],
  scene: Scene,
  sortIndex: number,
  state: BreakState
): void {
  if (!state.unlinkedHeaderShown) {
    items.push({ kind: 'unlinked-header' });
    state.unlinkedHeaderShown = true;
  }
  items.push({ kind: 'scene', scene, sortIndex });
}

function appendChapterBreakItems(
  items: NarrativeItem[],
  projectType: ProjectType,
  chapterById: Map<string, Chapter>,
  bookById: Map<string, Book>,
  chapterId: string | null,
  state: BreakState
): void {
  const chapter = chapterId ? chapterById.get(chapterId) : undefined;
  const bookId = chapter?.book_id ?? null;

  if (projectType === 'series' && bookId !== state.prevBookId) {
    const book = bookId ? bookById.get(bookId) : undefined;
    items.push({
      kind: 'book-break',
      bookId: bookId ?? '',
      bookTitle: book?.title ?? bookId ?? '',
    });
    state.prevBookId = bookId;
    state.prevChapterId = undefined;
  }

  if (projectType !== 'short-story' && chapterId !== state.prevChapterId) {
    items.push({
      kind: 'chapter-break',
      chapterId: chapterId ?? '',
      chapterTitle: chapter?.title ?? chapterId ?? '',
    });
    state.prevChapterId = chapterId;
  }
}

function buildItems(
  sortedScenes: Scene[],
  projectType: ProjectType,
  chapters: Chapter[],
  books: Book[]
): NarrativeItem[] {
  const chapterById = new Map<string, Chapter>(chapters.map((c: Chapter) => [c.id, c]));
  const bookById = new Map<string, Book>(books.map((b: Book) => [b.id, b]));

  const items: NarrativeItem[] = [];
  const state: BreakState = {
    prevChapterId: undefined,
    prevBookId: undefined,
    unlinkedHeaderShown: false,
  };

  sortedScenes.forEach((scene: Scene, sortIndex: number) => {
    const link = scene.prose_link;

    if (!link) {
      appendUnlinkedItem(items, scene, sortIndex, state);
      return;
    }

    if (link.scope_type === 'chapter') {
      const chapterId = link.chapter_id ?? null;
      appendChapterBreakItems(
        items,
        projectType,
        chapterById,
        bookById,
        chapterId,
        state
      );
    }

    items.push({ kind: 'scene', scene, sortIndex });
  });

  return items;
}

// ---------------------------------------------------------------------------
// Divider sub-components
// ---------------------------------------------------------------------------

interface BookBreakProps {
  title: string;
}

const BookBreak: React.FC<BookBreakProps> = ({ title }: BookBreakProps) => {
  const { t } = useTranslation();
  const tc = useThemeClasses();
  const { isLight } = useTheme();
  return (
    <div
      className={`flex items-center gap-3 py-3 ${isLight ? 'text-brand-gray-700' : 'text-brand-gray-200'}`}
      role="separator"
      aria-label={t('Book: {{title}}', { title })}
    >
      <div
        className={`flex-1 h-px ${isLight ? 'bg-brand-gray-400' : 'bg-brand-gray-500'}`}
      />
      <span className={`text-xs font-bold uppercase tracking-widest px-2 ${tc.muted}`}>
        {t('Book')}
      </span>
      <span className="text-sm font-semibold truncate max-w-xs">{title}</span>
      <div
        className={`flex-1 h-px ${isLight ? 'bg-brand-gray-400' : 'bg-brand-gray-500'}`}
      />
    </div>
  );
};

interface ChapterBreakProps {
  title: string;
}

const ChapterBreak: React.FC<ChapterBreakProps> = ({ title }: ChapterBreakProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();
  return (
    <div
      className={`flex items-center gap-2 py-2 ${isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}`}
      role="separator"
      aria-label={t('Chapter: {{title}}', { title })}
    >
      <div
        className={`flex-1 h-px ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
      />
      <span className="text-xs font-medium truncate max-w-xs">{title}</span>
      <div
        className={`flex-1 h-px ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
      />
    </div>
  );
};

interface UnlinkedHeaderProps {}

const UnlinkedHeader: React.FC<UnlinkedHeaderProps> = () => {
  const { t } = useTranslation();
  const { isLight } = useTheme();
  return (
    <div
      className={`flex items-center gap-2 py-2 mt-2 ${isLight ? 'text-brand-gray-400' : 'text-brand-gray-500'}`}
      role="separator"
      aria-label={t('Scenes not yet linked to prose')}
    >
      <div
        className={`flex-1 h-px border-dashed border-t ${isLight ? 'border-brand-gray-300' : 'border-brand-gray-600'}`}
      />
      <span className="text-xs italic">{t('Not yet linked')}</span>
      <div
        className={`flex-1 h-px border-dashed border-t ${isLight ? 'border-brand-gray-300' : 'border-brand-gray-600'}`}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NarrativeView: React.FC<NarrativeViewProps> = ({
  scenes,
  projectType,
  chapters,
  books = [],
  primarySelectedSceneId,
  onSelectScene,
  onSelectionChange,
  onEditScene,
  onDropProse,
}: NarrativeViewProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();

  // Build chapter order map for sorting (respects series book ordering).
  const chapterOrderMap = useMemo(
    () => buildChapterOrderMap(projectType, chapters, books),
    [projectType, chapters, books]
  );

  // Sort scenes by (chapterIndex, startOffset); unlinked scenes go to the end.
  const sortedScenes = useMemo(
    () =>
      [...scenes].sort((a: Scene, b: Scene) => {
        const [aChIdx, aOff] = sceneSortKey(a, chapterOrderMap);
        const [bChIdx, bOff] = sceneSortKey(b, chapterOrderMap);
        if (aChIdx !== bChIdx) return aChIdx < bChIdx ? -1 : 1;
        return aOff - bOff;
      }),
    [scenes, chapterOrderMap]
  );

  // Multi-select state — identical semantics to PinboardView.
  const { selectedSceneIds, activeSceneId, handleCardSelect } = useSceneSelection({
    displayOrder: sortedScenes,
    primarySelectedSceneId,
    onSelectScene,
    onSelectionChange,
  });

  // Active scene relationship sets (for cause/effect glow on cards).
  // order_after = scenes this scene must come AFTER (predecessors = causes → red)
  // order_before = scenes this scene must come BEFORE (successors = effects → green)
  const activeScene = activeSceneId
    ? (scenes.find((s: Scene) => s.id === activeSceneId) ?? null)
    : null;
  const causeIds = new Set<string>(activeScene?.order_after ?? []);
  const effectIds = new Set<string>(activeScene?.order_before ?? []);

  // Build the ordered list of items (dividers + scenes) to render.
  const items = useMemo(
    () => buildItems(sortedScenes, projectType, chapters, books),
    [sortedScenes, projectType, chapters, books]
  );

  // Build a flat index of scene entries so we can pass the correct 'index' to
  // SceneCard (it's the display position, not the original store index).
  const sceneIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const item of items) {
      if (item.kind === 'scene') {
        map.set(item.scene.id, i++);
      }
    }
    return map;
  }, [items]);

  const bgClass = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';

  // -------------------------------------------------------------------------
  // Card position tracking for SVG arrow overlay
  // -------------------------------------------------------------------------

  /** Refs to each scene card's wrapper div, keyed by scene id. */
  const cardWrapperRefs = useRef(new Map<string, HTMLDivElement>());

  /** DOM-measured card layouts (x, y, w, h) relative to the inner container. */
  const [cardLayouts, setCardLayouts] = useState<CardLayoutMap>(new Map());

  /** Ref to the inner positioned container (SVG coordinate origin). */
  const innerContainerRef = useRef<HTMLDivElement>(null);

  /** Stable empty maps so CauseArrows doesn't recreate objects on every render. */
  const emptyPositions = useMemo(() => new Map<string, { x: number; y: number }>(), []);
  const emptyHeights = useMemo(() => new Map<string, number>(), []);

  /**
   * Ordered relationship keys currently drawn by CauseArrows.
   *
   * We keep the exact cause/effect logic from the pinboard view; this list is
   * only used to assign a fixed x-lane per arrow in Narrative mode.
   */
  const narrativeArrowKeys = useMemo(() => {
    const keys: string[] = [];
    if (!activeSceneId) return keys;

    const active = scenes.find((s: Scene) => s.id === activeSceneId);
    if (!active) return keys;
    for (const causeId of active.order_after) {
      keys.push(`${causeId}->${activeSceneId}`);
    }
    for (const effectId of active.order_before) {
      keys.push(`${activeSceneId}->${effectId}`);
    }
    return keys;
  }, [activeSceneId, scenes]);

  /**
   * Fixed x-lane per relation key, evenly spread over card width.
   *
   * This guarantees x1 === x2 for each arrow, while multiple arrows are still
   * distributed from left to right to avoid overlap.
   */
  const narrativeArrowLaneXByKey = useMemo(() => {
    const map = new Map<string, number>();
    if (narrativeArrowKeys.length === 0) return map;

    let anchorX = 0;
    let anchorW = innerContainerRef.current?.offsetWidth ?? 0;
    for (const scene of sortedScenes) {
      const layout = cardLayouts.get(scene.id);
      if (!layout) continue;
      anchorX = layout.x;
      anchorW = layout.w;
      break;
    }
    if (!anchorW) return map;

    const lanePadding = Math.min(36, Math.max(12, anchorW * 0.08));
    const left = anchorX + lanePadding;
    const right = Math.max(left, anchorX + anchorW - lanePadding);
    const count = narrativeArrowKeys.length;

    narrativeArrowKeys.forEach((key: string, i: number) => {
      const x =
        count === 1 ? (left + right) / 2 : left + (i * (right - left)) / (count - 1);
      map.set(key, x);
    });

    return map;
  }, [narrativeArrowKeys, sortedScenes, cardLayouts]);

  /** Re-measure all tracked card divs and update layout state. */
  const measureLayouts = useCallback(() => {
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    cardWrapperRefs.current.forEach((el: HTMLDivElement, id: string) => {
      next.set(id, {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    });
    setCardLayouts(next);
  }, []);

  // Measure after each render that changes the item list (scenes added/removed
  // or card heights change due to content reflow).
  useLayoutEffect(() => {
    measureLayouts();
  }, [items, measureLayouts]);

  // Also re-measure when the container is resized (window resize, panel drag).
  useEffect(() => {
    const el = innerContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureLayouts);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureLayouts]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={`w-full h-full overflow-y-auto ${bgClass}`}
      role="region"
      aria-label={t('Narrative')}
    >
      {/* Inner container is position:relative so the SVG overlay and card
          wrapper offsetTop values share the same coordinate origin. */}
      <div ref={innerContainerRef} className="relative">
        <div className="flex flex-col gap-2 p-3">
          {items.map((item: NarrativeItem, renderIdx: number) => {
            if (item.kind === 'book-break') {
              return (
                <BookBreak
                  key={`book-${item.bookId}-${renderIdx}`}
                  title={item.bookTitle}
                />
              );
            }
            if (item.kind === 'chapter-break') {
              return (
                <ChapterBreak
                  key={`chapter-${item.chapterId}-${renderIdx}`}
                  title={item.chapterTitle}
                />
              );
            }
            if (item.kind === 'unlinked-header') {
              return <UnlinkedHeader key="unlinked-header" />;
            }
            const { scene } = item;
            const displayIndex = sceneIndexMap.get(scene.id) ?? 0;
            return (
              <div
                key={scene.id}
                ref={(el: HTMLDivElement | null) => {
                  if (el) {
                    cardWrapperRefs.current.set(scene.id, el);
                  } else {
                    cardWrapperRefs.current.delete(scene.id);
                  }
                }}
              >
                <SceneCard
                  scene={scene}
                  index={displayIndex}
                  variant="narrative"
                  onSelect={handleCardSelect}
                  onEdit={onEditScene}
                  isSelected={selectedSceneIds.has(scene.id)}
                  isActive={activeSceneId === scene.id}
                  isCause={causeIds.has(scene.id)}
                  isEffect={effectIds.has(scene.id)}
                  onDropProse={onDropProse}
                />
              </div>
            );
          })}
          {items.length === 0 && (
            <p
              className={`text-sm text-center py-8 ${isLight ? 'text-brand-gray-400' : 'text-brand-gray-500'}`}
            >
              {t('No scenes yet')}
            </p>
          )}
        </div>
        {/* Rendered after the card list so it paints on top of the cards. */}
        <CauseArrows
          scenes={scenes}
          livePositions={emptyPositions}
          cardHeights={emptyHeights}
          cardLayouts={cardLayouts}
          arrowLaneXByKey={narrativeArrowLaneXByKey}
          useVerticalCenterForConnectedOnly
          hideDefaultArrows
          activeSceneId={activeSceneId}
        />
      </div>
    </div>
  );
};
