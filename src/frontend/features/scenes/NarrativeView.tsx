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
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { Scene } from '../../types';
import type { Chapter, Book, SourcebookEntry } from '../../types/domain';
import type { ProjectImage } from '../../services/apiTypes';
import type { ProseDropData } from './types';
import { listProjectImages } from '../sourcebook/sourcebookApi';
import { SceneCard } from './SceneCard';
import { CauseArrows } from './ConstraintArrows';
import type { CardLayoutMap } from './ConstraintArrows';
import { useSceneSelection } from './useSceneSelection';
import { useThemeClasses, useTheme } from '../layout/ThemeContext';
import { parseZonedDateTime } from '../../utils/temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectType = 'short-story' | 'novel' | 'series';

interface NarrativeViewProps {
  scenes: Scene[];
  sourcebookEntries?: SourcebookEntry[];
  projectType: ProjectType;
  chapters: Chapter[];
  books?: Book[];
  sortMode?: 'narrative' | 'chronological';
  primarySelectedSceneId: string | null;
  onSelectScene: (id: string | null) => void;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onEditScene: (sceneId: string) => void;
  onDropProse?: (sceneId: string, data: ProseDropData) => void;
  onReorderScene?: (
    sourceSceneId: string,
    targetSceneId: string,
    placeBefore: boolean
  ) => Promise<void>;
}

type LaneMarkerStyle = 'solid' | 'hollow';

const CHARACTER_CATEGORY = 'character';
const LANE_DRAG_MIME = 'application/x-augmentedquill-sourcebook-lane-id';

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeCategory(value: string | null | undefined): string {
  return normalizeToken(value);
}

function arraysEqual(valuesA: string[], valuesB: string[]): boolean {
  return (
    valuesA.length === valuesB.length &&
    valuesA.every((value: string, index: number): boolean => value === valuesB[index])
  );
}

function reorderValues(
  values: string[],
  sourceId: string,
  targetId: string,
  placeBefore: boolean
): string[] {
  if (sourceId === targetId) return values;
  const next = [...values];
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return values;

  next.splice(sourceIndex, 1);
  const adjustedTargetIndex = next.indexOf(targetId);
  const insertIndex = placeBefore ? adjustedTargetIndex : adjustedTargetIndex + 1;
  next.splice(insertIndex, 0, sourceId);
  return next;
}

function mergeMarkerStyle(
  current: LaneMarkerStyle | undefined,
  incoming: LaneMarkerStyle
): LaneMarkerStyle {
  if (current === 'solid' || incoming === 'solid') {
    return 'solid';
  }
  return 'hollow';
}

function getHorizontalDropBoundary(element: HTMLElement): {
  left: number;
  width: number;
} {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0) {
    return { left: rect.left, width: rect.width };
  }

  const button = element.querySelector('button');
  if (button instanceof HTMLButtonElement) {
    const buttonRect = button.getBoundingClientRect();
    return { left: buttonRect.left, width: buttonRect.width };
  }

  return { left: rect.left, width: rect.width };
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
  const normalizeId = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };

  if (projectType === 'series' && books.length > 0) {
    const assignedChapterIds = new Set<string>();
    let idx = 0;

    const chaptersByBookId = new Map<string, Chapter[]>();
    for (const chapter of chapters) {
      const chapterBookId = normalizeId(chapter.book_id);
      if (!chapterBookId) continue;
      const current = chaptersByBookId.get(chapterBookId) ?? [];
      current.push(chapter);
      chaptersByBookId.set(chapterBookId, current);
    }

    for (const book of books) {
      const seenInBook = new Set<string>();
      for (const ch of book.chapters) {
        const chapterId = normalizeId(ch.id);
        if (
          !chapterId ||
          seenInBook.has(chapterId) ||
          assignedChapterIds.has(chapterId)
        ) {
          continue;
        }
        map.set(chapterId, idx++);
        seenInBook.add(chapterId);
        assignedChapterIds.add(chapterId);
      }

      const bookId = normalizeId(book.id);
      const chaptersForBook = bookId ? (chaptersByBookId.get(bookId) ?? []) : [];
      for (const chapter of chaptersForBook) {
        const chapterId = normalizeId(chapter.id);
        if (
          !chapterId ||
          seenInBook.has(chapterId) ||
          assignedChapterIds.has(chapterId)
        ) {
          continue;
        }
        map.set(chapterId, idx++);
        seenInBook.add(chapterId);
        assignedChapterIds.add(chapterId);
      }
    }

    for (const chapter of chapters) {
      const chapterId = normalizeId(chapter.id);
      if (!chapterId || assignedChapterIds.has(chapterId)) continue;
      map.set(chapterId, idx++);
      assignedChapterIds.add(chapterId);
    }
  } else {
    let idx = 0;
    for (const ch of chapters) {
      const chapterId = normalizeId(ch.id);
      if (!chapterId || map.has(chapterId)) continue;
      map.set(chapterId, idx++);
    }
  }

  return map;
}

function normalizeChapterId(chapterId: unknown): string {
  if (typeof chapterId === 'string') return chapterId;
  if (typeof chapterId === 'number' && Number.isFinite(chapterId))
    return String(chapterId);
  return '';
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
  const chapterId = normalizeChapterId(link.chapter_id);
  const chIdx = chapterOrderMap.get(chapterId) ?? Infinity;
  return [chIdx, link.start_offset];
}

function proseSort(
  sceneA: Scene,
  sceneB: Scene,
  chapterOrderMap: Map<string, number>
): number {
  const [aChIdx, aOff] = sceneSortKey(sceneA, chapterOrderMap);
  const [bChIdx, bOff] = sceneSortKey(sceneB, chapterOrderMap);
  if (aChIdx !== bChIdx) return aChIdx < bChIdx ? -1 : 1;
  if (aOff !== bOff) return aOff - bOff;
  return sceneA.id.localeCompare(sceneB.id);
}

function getSceneEpochNanoseconds(scene: Scene): bigint | null {
  const temporalString = scene.scene_time?.temporal_zoned_datetime;
  const parsed = parseZonedDateTime(temporalString);
  return parsed?.epochNanoseconds ?? null;
}

function chronologicalSort(
  sceneA: Scene,
  sceneB: Scene,
  chapterOrderMap: Map<string, number>,
  sceneEpochNanosecondsById: Map<string, bigint>
): number {
  const epochA = sceneEpochNanosecondsById.get(sceneA.id);
  const epochB = sceneEpochNanosecondsById.get(sceneB.id);
  const hasTimeA = epochA !== undefined;
  const hasTimeB = epochB !== undefined;
  const hasLinkA = Boolean(sceneA.prose_link);
  const hasLinkB = Boolean(sceneB.prose_link);
  const isExtraA = !hasLinkA && !hasTimeA;
  const isExtraB = !hasLinkB && !hasTimeB;

  // "Not yet linked" extras (no prose link and no valid time) must always
  // stay at the very end in Chronological mode.
  if (isExtraA !== isExtraB) return isExtraA ? 1 : -1;

  if (hasTimeA && hasTimeB) {
    if (epochA < epochB) return -1;
    if (epochA > epochB) return 1;
    return proseSort(sceneA, sceneB, chapterOrderMap);
  }

  // When one or both scenes have no valid time, keep chronology stable by
  // falling back to prose order so untimed scenes can interleave naturally.
  return proseSort(sceneA, sceneB, chapterOrderMap);
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

function isUnlinkedWithoutChronology(
  scene: Scene,
  sortMode: 'narrative' | 'chronological',
  sceneEpochNanosecondsById: Map<string, bigint>
): boolean {
  if (scene.prose_link) return false;
  if (sortMode !== 'chronological') return true;
  return !sceneEpochNanosecondsById.has(scene.id);
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
  sortMode: 'narrative' | 'chronological',
  sceneEpochNanosecondsById: Map<string, bigint>,
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

    if (isUnlinkedWithoutChronology(scene, sortMode, sceneEpochNanosecondsById)) {
      appendUnlinkedItem(items, scene, sortIndex, state);
      return;
    }

    if (!link) {
      items.push({ kind: 'scene', scene, sortIndex });
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
  sourcebookEntries = [],
  projectType,
  chapters,
  books = [],
  sortMode = 'narrative',
  primarySelectedSceneId,
  onSelectScene,
  onSelectionChange,
  onEditScene,
  onDropProse,
  onReorderScene,
}: NarrativeViewProps) => {
  const DRAG_SCENE_MIME = 'application/x-augmentedquill-scene-id';
  const { t } = useTranslation();
  const { isLight } = useTheme();

  const sourcebookEntriesById = useMemo(
    () => new Map(sourcebookEntries.map((entry: SourcebookEntry) => [entry.id, entry])),
    [sourcebookEntries]
  );

  const entryIdsByToken = useMemo(() => {
    const map = new Map<string, string[]>();
    sourcebookEntries.forEach((entry: SourcebookEntry): void => {
      [entry.name, ...(entry.synonyms ?? [])].forEach((label: string): void => {
        const normalized = normalizeToken(label);
        if (!normalized) return;
        const current = map.get(normalized) ?? [];
        if (!current.includes(entry.id)) {
          current.push(entry.id);
          map.set(normalized, current);
        }
      });
    });
    return map;
  }, [sourcebookEntries]);

  const sceneEntryMarkerStyles = useMemo(() => {
    const stylesBySceneId = new Map<string, Map<string, LaneMarkerStyle>>();

    const register = (
      sceneId: string,
      entryId: string,
      style: LaneMarkerStyle
    ): void => {
      const sceneStyles =
        stylesBySceneId.get(sceneId) ?? new Map<string, LaneMarkerStyle>();
      sceneStyles.set(entryId, mergeMarkerStyle(sceneStyles.get(entryId), style));
      stylesBySceneId.set(sceneId, sceneStyles);
    };

    scenes.forEach((scene: Scene): void => {
      scene.active_characters.forEach((name: string): void => {
        (entryIdsByToken.get(normalizeToken(name)) ?? []).forEach(
          (entryId: string): void => {
            register(scene.id, entryId, 'solid');
          }
        );
      });

      scene.passive_characters.forEach((name: string): void => {
        (entryIdsByToken.get(normalizeToken(name)) ?? []).forEach(
          (entryId: string): void => {
            register(scene.id, entryId, 'hollow');
          }
        );
      });

      (scene.sourcebook_entry_ids ?? []).forEach((entryId: string): void => {
        if (sourcebookEntriesById.has(entryId)) {
          register(scene.id, entryId, 'solid');
        }
      });

      [scene.location, scene.time].forEach((label: string | null | undefined): void => {
        (entryIdsByToken.get(normalizeToken(label)) ?? []).forEach(
          (entryId: string): void => {
            register(scene.id, entryId, 'solid');
          }
        );
      });
    });

    return stylesBySceneId;
  }, [entryIdsByToken, scenes, sourcebookEntriesById]);

  const linkedSceneIdsByEntry = useMemo(() => {
    const sceneIdsByEntry = new Map<string, Set<string>>();
    sceneEntryMarkerStyles.forEach(
      (stylesByEntryId: Map<string, LaneMarkerStyle>, sceneId: string): void => {
        stylesByEntryId.forEach((_style: LaneMarkerStyle, entryId: string): void => {
          const linkedSceneIds = sceneIdsByEntry.get(entryId) ?? new Set<string>();
          linkedSceneIds.add(sceneId);
          sceneIdsByEntry.set(entryId, linkedSceneIds);
        });
      }
    );
    return sceneIdsByEntry;
  }, [sceneEntryMarkerStyles]);

  const referencedCharacterEntryIds = useMemo(() => {
    const orderedIds: string[] = [];
    const seen = new Set<string>();

    scenes.forEach((scene: Scene): void => {
      const sceneStyles = sceneEntryMarkerStyles.get(scene.id);
      if (!sceneStyles) return;
      sceneStyles.forEach((_style: LaneMarkerStyle, entryId: string): void => {
        const entry = sourcebookEntriesById.get(entryId);
        if (!entry || normalizeCategory(entry.category) !== CHARACTER_CATEGORY) {
          return;
        }
        if (!seen.has(entryId)) {
          seen.add(entryId);
          orderedIds.push(entryId);
        }
      });
    });

    return orderedIds;
  }, [sceneEntryMarkerStyles, scenes, sourcebookEntriesById]);

  const sourcebookEntryIds = useMemo(
    () => new Set(sourcebookEntries.map((entry: SourcebookEntry): string => entry.id)),
    [sourcebookEntries]
  );

  const [visibleLaneEntryIds, setVisibleLaneEntryIds] = useState<string[]>(
    referencedCharacterEntryIds
  );
  const [removedReferencedLaneIds, setRemovedReferencedLaneIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [selectedLaneEntryIds, setSelectedLaneEntryIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerPosition, setPickerPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const [laneScrollLeft, setLaneScrollLeft] = useState(0);
  const [lanePlaneWidth, setLanePlaneWidth] = useState(0);
  const [lastSelectedLaneIndex, setLastSelectedLaneIndex] = useState<number | null>(
    null
  );

  useEffect(() => {
    setRemovedReferencedLaneIds((prev: Set<string>) => {
      const next = new Set<string>();
      prev.forEach((entryId: string): void => {
        if (
          sourcebookEntryIds.has(entryId) &&
          referencedCharacterEntryIds.includes(entryId)
        ) {
          next.add(entryId);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [referencedCharacterEntryIds, sourcebookEntryIds]);

  useEffect(() => {
    setVisibleLaneEntryIds((prev: string[]): string[] => {
      const retained = prev.filter((entryId: string): boolean =>
        sourcebookEntryIds.has(entryId)
      );
      const next = [...retained];
      referencedCharacterEntryIds.forEach((entryId: string): void => {
        if (!removedReferencedLaneIds.has(entryId) && !next.includes(entryId)) {
          next.push(entryId);
        }
      });
      return arraysEqual(prev, next) ? prev : next;
    });
  }, [referencedCharacterEntryIds, removedReferencedLaneIds, sourcebookEntryIds]);

  useEffect(() => {
    setSelectedLaneEntryIds((prev: Set<string>) => {
      const next = new Set<string>();
      prev.forEach((entryId: string): void => {
        if (visibleLaneEntryIds.includes(entryId)) {
          next.add(entryId);
        }
      });
      if (
        next.size === prev.size &&
        [...next].every((entryId: string) => prev.has(entryId))
      ) {
        return prev;
      }
      return next;
    });
  }, [visibleLaneEntryIds]);

  useEffect(() => {
    let isMounted = true;
    void listProjectImages()
      .then((images: ProjectImage[]): void => {
        if (isMounted) {
          setProjectImages(images);
        }
      })
      .catch((): void => {
        // Ignore image-list failures so scene views keep rendering in tests
        // and when project images are unavailable.
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const projectImageByFilename = useMemo(
    () => new Map(projectImages.map((image: ProjectImage) => [image.filename, image])),
    [projectImages]
  );

  const filteredScenes = useMemo(() => {
    if (selectedLaneEntryIds.size === 0) {
      return scenes;
    }
    return scenes.filter((scene: Scene): boolean => {
      const sceneStyles = sceneEntryMarkerStyles.get(scene.id);
      if (!sceneStyles) return false;
      return [...selectedLaneEntryIds].some((entryId: string): boolean =>
        sceneStyles.has(entryId)
      );
    });
  }, [sceneEntryMarkerStyles, scenes, selectedLaneEntryIds]);

  // Build chapter order map for sorting (respects series book ordering).
  const chapterOrderMap = useMemo(
    () => buildChapterOrderMap(projectType, chapters, books),
    [projectType, chapters, books]
  );

  const sceneEpochNanosecondsById = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const scene of scenes) {
      const epochNanoseconds = getSceneEpochNanoseconds(scene);
      if (epochNanoseconds !== null) {
        map.set(scene.id, epochNanoseconds);
      }
    }
    return map;
  }, [scenes]);

  // Sort scenes either by prose order (Narrative) or by scene time (Chronological),
  // using prose order as deterministic fallback for ties and missing times.
  const sortedScenes = useMemo(
    () =>
      [...filteredScenes].sort((a: Scene, b: Scene) => {
        if (sortMode === 'chronological') {
          return chronologicalSort(a, b, chapterOrderMap, sceneEpochNanosecondsById);
        }
        return proseSort(a, b, chapterOrderMap);
      }),
    [filteredScenes, chapterOrderMap, sortMode, sceneEpochNanosecondsById]
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
    () =>
      buildItems(
        sortedScenes,
        sortMode,
        sceneEpochNanosecondsById,
        projectType,
        chapters,
        books
      ),
    [sortedScenes, sortMode, sceneEpochNanosecondsById, projectType, chapters, books]
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
  const lineClass = isLight ? 'bg-brand-gray-300/80' : 'bg-brand-gray-600/80';
  const markerSolidClass = isLight
    ? 'bg-brand-500 border-brand-500'
    : 'bg-brand-300 border-brand-300';
  const markerHollowClass = isLight
    ? 'bg-white border-brand-500'
    : 'bg-brand-gray-950 border-brand-300';

  // -------------------------------------------------------------------------
  // Card position tracking for SVG arrow overlay
  // -------------------------------------------------------------------------

  /** Refs to each scene card's wrapper div, keyed by scene id. */
  const cardWrapperRefs = useRef(new Map<string, HTMLDivElement>());
  const laneButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const narrativeRootRef = useRef<HTMLDivElement>(null);
  const headerLaneViewportRef = useRef<HTMLDivElement>(null);
  const laneTrackRef = useRef<HTMLDivElement>(null);
  const bottomLaneScrollRef = useRef<HTMLDivElement>(null);
  const addLaneButtonRef = useRef<HTMLButtonElement>(null);

  /** DOM-measured card layouts (x, y, w, h) relative to the inner container. */
  const [cardLayouts, setCardLayouts] = useState<CardLayoutMap>(new Map());
  const [laneCenterXById, setLaneCenterXById] = useState<Map<string, number>>(
    new Map()
  );

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

  const markerStyleBySceneId = useMemo(() => {
    const stylesBySceneId = new Map<string, Map<string, LaneMarkerStyle>>();
    sceneEntryMarkerStyles.forEach(
      (styles: Map<string, LaneMarkerStyle>, sceneId: string): void => {
        const filtered = new Map<string, LaneMarkerStyle>();
        visibleLaneEntryIds.forEach((entryId: string): void => {
          const style = styles.get(entryId);
          if (style) {
            filtered.set(entryId, style);
          }
        });
        if (filtered.size > 0) {
          stylesBySceneId.set(sceneId, filtered);
        }
      }
    );
    return stylesBySceneId;
  }, [sceneEntryMarkerStyles, visibleLaneEntryIds]);

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

    const nextLaneCenters = new Map<string, number>();
    const laneTrackRect = laneTrackRef.current?.getBoundingClientRect();
    laneButtonRefs.current.forEach((el: HTMLButtonElement, id: string): void => {
      if (laneTrackRect) {
        const rect = el.getBoundingClientRect();
        nextLaneCenters.set(id, rect.left - laneTrackRect.left + rect.width / 2);
      } else {
        nextLaneCenters.set(id, el.offsetLeft + el.offsetWidth / 2);
      }
    });
    setLaneCenterXById(nextLaneCenters);
    setLanePlaneWidth(
      laneTrackRef.current?.scrollWidth ?? laneTrackRef.current?.offsetWidth ?? 0
    );
  }, []);

  // Measure after each render that changes the item list (scenes added/removed
  // or card heights change due to content reflow).
  useLayoutEffect(() => {
    measureLayouts();
  }, [items, visibleLaneEntryIds, measureLayouts]);

  // Also re-measure when the container is resized (window resize, panel drag).
  useEffect(() => {
    const el = innerContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureLayouts);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureLayouts]);

  // -------------------------------------------------------------------------
  // Narrative drag/reorder interactions
  // -------------------------------------------------------------------------

  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const dragSceneIdRef = useRef<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; placeBefore: boolean } | null>(
    null
  );
  const [dragLaneEntryId, setDragLaneEntryId] = useState<string | null>(null);
  const dragLaneEntryIdRef = useRef<string | null>(null);
  const [laneDropHint, setLaneDropHint] = useState<{
    id: string;
    placeBefore: boolean;
  } | null>(null);

  const handleNarrativeBackgroundMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-scene-card]')) return;
      if (target.closest('[data-sourcebook-lane-item]')) return;
      if (target.closest('button, input, textarea, select, a, [role="button"]')) return;
      setSelectedLaneEntryIds(new Set<string>());
      onSelectScene(null);
      onSelectionChange?.(new Set<string>());
    },
    [onSelectScene, onSelectionChange]
  );

  const applyLaneScrollDelta = useCallback((delta: number): boolean => {
    const scroller = bottomLaneScrollRef.current;
    if (!scroller) return false;

    const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
    if (maxScrollLeft <= 0) return false;

    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, scroller.scrollLeft + delta)
    );
    if (Math.abs(nextScrollLeft - scroller.scrollLeft) < 0.1) return false;

    scroller.scrollLeft = nextScrollLeft;
    setLaneScrollLeft(nextScrollLeft);
    return true;
  }, []);

  const handleLaneWheelEvent = useCallback(
    (event: WheelEvent): void => {
      let delta = event.deltaX;
      if (Math.abs(delta) < 0.1 && event.shiftKey) {
        delta = event.deltaY;
      }
      if (Math.abs(delta) < 0.1) return;

      if (applyLaneScrollDelta(delta)) {
        event.preventDefault();
      }
    },
    [applyLaneScrollDelta]
  );

  useEffect(() => {
    const root = narrativeRootRef.current;
    if (!root) return;

    root.addEventListener('wheel', handleLaneWheelEvent, { passive: false });
    return () => {
      root.removeEventListener('wheel', handleLaneWheelEvent);
    };
  }, [handleLaneWheelEvent]);

  const handleSceneDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, sceneId: string): void => {
      dragSceneIdRef.current = sceneId;
      e.dataTransfer.effectAllowed = 'move';
      // Keep scene id in the drag payload in case React state isn't visible
      // synchronously inside dragover/drop handlers.
      e.dataTransfer.setData(DRAG_SCENE_MIME, sceneId);
      e.dataTransfer.setData('text/plain', sceneId);
      setDragSceneId(sceneId);
      setDropHint(null);
    },
    [DRAG_SCENE_MIME]
  );

  const handleSceneDragEnd = useCallback((): void => {
    dragSceneIdRef.current = null;
    setDragSceneId(null);
    setDropHint(null);
  }, []);

  const handleSceneDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, sceneId: string): void => {
      const sourceId =
        dragSceneIdRef.current ||
        e.dataTransfer.getData(DRAG_SCENE_MIME) ||
        dragSceneId;
      if (!sourceId || sourceId === sceneId) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const placeBefore = e.clientY < rect.top + rect.height / 2;
      setDropHint((prev: { id: string; placeBefore: boolean } | null) => {
        if (prev && prev.id === sceneId && prev.placeBefore === placeBefore)
          return prev;
        return { id: sceneId, placeBefore };
      });
    },
    [DRAG_SCENE_MIME, dragSceneId]
  );

  const handleSceneDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetId: string): Promise<void> => {
      e.preventDefault();
      const sourceId =
        dragSceneIdRef.current ||
        e.dataTransfer.getData(DRAG_SCENE_MIME) ||
        dragSceneId;
      if (!sourceId || sourceId === targetId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const placeBefore = e.clientY < rect.top + rect.height / 2;
      dragSceneIdRef.current = null;
      setDropHint(null);
      setDragSceneId(null);
      await onReorderScene?.(sourceId, targetId, placeBefore);
    },
    [DRAG_SCENE_MIME, dragSceneId, onReorderScene]
  );

  const handleLaneSelect = useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      entryId: string,
      index: number
    ): void => {
      setSelectedLaneEntryIds((prev: Set<string>) => {
        if (event.shiftKey && lastSelectedLaneIndex !== null) {
          const start = Math.min(lastSelectedLaneIndex, index);
          const end = Math.max(lastSelectedLaneIndex, index);
          const range = visibleLaneEntryIds.slice(start, end + 1);
          return new Set<string>(
            event.ctrlKey || event.metaKey ? [...prev, ...range] : range
          );
        }

        if (event.ctrlKey || event.metaKey) {
          const next = new Set<string>(prev);
          if (next.has(entryId)) {
            next.delete(entryId);
          } else {
            next.add(entryId);
          }
          return next;
        }

        if (prev.size === 1 && prev.has(entryId)) {
          return new Set<string>();
        }

        return new Set<string>([entryId]);
      });
      setLastSelectedLaneIndex(index);
    },
    [lastSelectedLaneIndex, visibleLaneEntryIds]
  );

  const handleLaneRemove = useCallback(
    (entryId: string): void => {
      if (referencedCharacterEntryIds.includes(entryId)) {
        setRemovedReferencedLaneIds((prev: Set<string>) => {
          const next = new Set<string>(prev);
          next.add(entryId);
          return next;
        });
      }
      setVisibleLaneEntryIds((prev: string[]): string[] =>
        prev.filter((candidateId: string): boolean => candidateId !== entryId)
      );
      setSelectedLaneEntryIds((prev: Set<string>) => {
        if (!prev.has(entryId)) return prev;
        const next = new Set<string>(prev);
        next.delete(entryId);
        return next;
      });
    },
    [referencedCharacterEntryIds]
  );

  const handleLaneAdd = useCallback((entryId: string): void => {
    setVisibleLaneEntryIds((prev: string[]): string[] => {
      if (prev.includes(entryId)) return prev;
      return [...prev, entryId];
    });
    setRemovedReferencedLaneIds((prev: Set<string>) => {
      if (!prev.has(entryId)) return prev;
      const next = new Set<string>(prev);
      next.delete(entryId);
      return next;
    });
    setPickerOpen(false);
    setPickerQuery('');
  }, []);

  const updatePickerAlignment = useCallback((): void => {
    const rect = addLaneButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setPickerPosition(null);
      return;
    }

    const menuWidth = 288;
    const menuHeight = 320;
    const viewportPadding = 8;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - menuWidth - viewportPadding
    );
    const preferredLeft = rect.left;
    const left = Math.min(maxLeft, Math.max(viewportPadding, preferredLeft));
    const preferredTop = rect.bottom + 8;
    const maxTop = Math.max(
      viewportPadding,
      window.innerHeight - menuHeight - viewportPadding
    );
    const top = Math.min(maxTop, Math.max(viewportPadding, preferredTop));
    setPickerPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;

    const handleViewportChange = (): void => {
      updatePickerAlignment();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [pickerOpen, updatePickerAlignment]);

  useEffect(() => {
    if (!bottomLaneScrollRef.current) return;
    const current = bottomLaneScrollRef.current;
    if (Math.abs(current.scrollLeft - laneScrollLeft) > 1) {
      current.scrollLeft = laneScrollLeft;
    }
  }, [laneScrollLeft]);

  const handleLaneDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, entryId: string): void => {
      dragLaneEntryIdRef.current = entryId;
      setDragLaneEntryId(entryId);
      setLaneDropHint(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(LANE_DRAG_MIME, entryId);
      event.dataTransfer.setData('text/plain', entryId);
    },
    []
  );

  const handleLaneDragEnd = useCallback((): void => {
    dragLaneEntryIdRef.current = null;
    setDragLaneEntryId(null);
    setLaneDropHint(null);
  }, []);

  const handleLaneDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, entryId: string): void => {
      const sourceId =
        dragLaneEntryIdRef.current ||
        event.dataTransfer.getData(LANE_DRAG_MIME) ||
        dragLaneEntryId;
      if (!sourceId || sourceId === entryId) return;
      event.preventDefault();
      const boundary = getHorizontalDropBoundary(event.currentTarget);
      const placeBefore = event.clientX < boundary.left + boundary.width / 2;
      setLaneDropHint((prev: { id: string; placeBefore: boolean } | null) => {
        if (prev && prev.id === entryId && prev.placeBefore === placeBefore) {
          return prev;
        }
        return { id: entryId, placeBefore };
      });
    },
    [dragLaneEntryId]
  );

  const handleLaneDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, targetId: string): void => {
      event.preventDefault();
      const sourceId =
        dragLaneEntryIdRef.current ||
        event.dataTransfer.getData(LANE_DRAG_MIME) ||
        dragLaneEntryId;
      if (!sourceId || sourceId === targetId) return;
      const boundary = getHorizontalDropBoundary(event.currentTarget);
      const placeBefore = event.clientX < boundary.left + boundary.width / 2;
      setVisibleLaneEntryIds((prev: string[]): string[] =>
        reorderValues(prev, sourceId, targetId, placeBefore)
      );
      dragLaneEntryIdRef.current = null;
      setDragLaneEntryId(null);
      setLaneDropHint(null);
    },
    [dragLaneEntryId]
  );

  const availableSourcebookEntries = useMemo(() => {
    const visibleIds = new Set<string>(visibleLaneEntryIds);
    const query = normalizeToken(pickerQuery);
    return sourcebookEntries
      .filter((entry: SourcebookEntry): boolean => !visibleIds.has(entry.id))
      .filter((entry: SourcebookEntry): boolean => {
        if (!query) return true;
        return [entry.name, ...(entry.synonyms ?? []), entry.category ?? ''].some(
          (value: string): boolean => normalizeToken(value).includes(query)
        );
      })
      .sort((entryA: SourcebookEntry, entryB: SourcebookEntry): number =>
        entryA.name.localeCompare(entryB.name)
      );
  }, [pickerQuery, sourcebookEntries, visibleLaneEntryIds]);

  const handleBottomLaneScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>): void => {
      setLaneScrollLeft(event.currentTarget.scrollLeft);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={narrativeRootRef}
      className={`w-full h-full flex flex-col ${bgClass}`}
      role="region"
      aria-label={t(sortMode === 'chronological' ? 'Chronological' : 'Narrative')}
    >
      <div
        className={`sticky top-0 z-30 border-b ${isLight ? 'border-brand-gray-200 bg-brand-gray-50' : 'border-brand-gray-800 bg-brand-gray-950'}`}
      >
        <div ref={headerLaneViewportRef} className="overflow-hidden px-3 pt-2 pb-2">
          <div
            ref={laneTrackRef}
            className="relative flex items-start gap-2 w-max min-w-full"
            style={{ transform: `translateX(${-laneScrollLeft}px)` }}
          >
            {visibleLaneEntryIds.map((entryId: string, index: number) => {
              const entry = sourcebookEntriesById.get(entryId);
              if (!entry) return null;
              const isSelected = selectedLaneEntryIds.has(entryId);
              const dropLeft =
                laneDropHint &&
                laneDropHint.id === entryId &&
                laneDropHint.placeBefore &&
                dragLaneEntryId;
              const dropRight =
                laneDropHint &&
                laneDropHint.id === entryId &&
                !laneDropHint.placeBefore &&
                dragLaneEntryId;

              return (
                <div
                  key={entryId}
                  data-sourcebook-lane-item={entryId}
                  draggable
                  onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
                    handleLaneDragStart(event, entryId)
                  }
                  onDragEnd={handleLaneDragEnd}
                  onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
                    handleLaneDragOver(event, entryId)
                  }
                  onDrop={(event: React.DragEvent<HTMLDivElement>) =>
                    handleLaneDrop(event, entryId)
                  }
                  className={[
                    'relative w-auto',
                    dropLeft
                      ? 'before:absolute before:-left-1 before:top-2 before:bottom-2 before:w-0.5 before:bg-brand-500 before:rounded'
                      : '',
                    dropRight
                      ? 'after:absolute after:-right-1 after:top-2 after:bottom-2 after:w-0.5 after:bg-brand-500 after:rounded'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    draggable
                    ref={(element: HTMLButtonElement | null) => {
                      if (element) {
                        laneButtonRefs.current.set(entryId, element);
                      } else {
                        laneButtonRefs.current.delete(entryId);
                      }
                    }}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={entry.name}
                    onDragStart={(event: React.DragEvent<HTMLButtonElement>) =>
                      handleLaneDragStart(event, entryId)
                    }
                    onDragEnd={handleLaneDragEnd}
                    onDragOver={(event: React.DragEvent<HTMLButtonElement>) =>
                      handleLaneDragOver(event, entryId)
                    }
                    onDrop={(event: React.DragEvent<HTMLButtonElement>) =>
                      handleLaneDrop(event, entryId)
                    }
                    onClick={(event: React.MouseEvent<HTMLButtonElement>): void =>
                      handleLaneSelect(event, entryId, index)
                    }
                    className={[
                      'inline-flex w-36 flex-col items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors',
                      isSelected
                        ? isLight
                          ? 'border-brand-500 bg-brand-100 text-brand-gray-900'
                          : 'border-brand-300 bg-brand-gray-800 text-brand-gray-50'
                        : isLight
                          ? 'border-brand-gray-200 bg-white text-brand-gray-800 hover:border-brand-300'
                          : 'border-brand-gray-700 bg-brand-gray-900 text-brand-gray-100 hover:border-brand-gray-500',
                    ].join(' ')}
                  >
                    <span
                      data-sourcebook-lane-label
                      className="block w-full truncate text-center"
                    >
                      {entry.name}
                    </span>
                    {(() => {
                      const firstImageFilename = entry.images?.[0];
                      const portrait = firstImageFilename
                        ? projectImageByFilename.get(firstImageFilename)
                        : undefined;
                      const portraitUrl = portrait?.url ?? null;
                      if (portraitUrl) {
                        return (
                          <img
                            src={portraitUrl}
                            alt=""
                            className="h-12 w-12 rounded-md object-cover border border-brand-gray-300/60 flex-shrink-0"
                          />
                        );
                      }
                      return (
                        <span className="h-12 w-12 rounded-md border border-brand-gray-300/60 bg-brand-gray-100/60 flex-shrink-0" />
                      );
                    })()}
                  </button>
                  <button
                    type="button"
                    aria-label={t('Remove {{name}}', { name: entry.name })}
                    onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                      event.stopPropagation();
                      handleLaneRemove(entryId);
                    }}
                    className={[
                      'absolute -top-1.5 -right-1.5 rounded-full border p-0.5 shadow-sm',
                      isLight
                        ? 'border-brand-gray-200 bg-white text-brand-gray-500 hover:text-brand-gray-800'
                        : 'border-brand-gray-700 bg-brand-gray-900 text-brand-gray-300 hover:text-brand-gray-50',
                    ].join(' ')}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })}

            <div className="relative w-auto">
              <button
                ref={addLaneButtonRef}
                type="button"
                aria-label={t('Add sourcebook lane')}
                onClick={(): void => {
                  setPickerOpen((open: boolean): boolean => {
                    const nextOpen = !open;
                    if (nextOpen) {
                      updatePickerAlignment();
                    }
                    return nextOpen;
                  });
                }}
                className={[
                  'inline-flex w-36 items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                  isLight
                    ? 'border-brand-gray-300 bg-white text-brand-gray-600 hover:border-brand-500 hover:text-brand-gray-900'
                    : 'border-brand-gray-600 bg-brand-gray-900 text-brand-gray-300 hover:border-brand-300 hover:text-brand-gray-50',
                ].join(' ')}
              >
                <Plus size={14} aria-hidden="true" />
                <span>{t('Add')}</span>
              </button>

              {pickerOpen &&
                pickerPosition &&
                createPortal(
                  <div
                    className={[
                      'fixed z-[120] w-72 rounded-lg border shadow-xl',
                      isLight
                        ? 'border-brand-gray-200 bg-white'
                        : 'border-brand-gray-700 bg-brand-gray-900',
                    ].join(' ')}
                    style={{
                      top: pickerPosition.top,
                      left: pickerPosition.left,
                      maxWidth: 'calc(100vw - 1rem)',
                    }}
                  >
                    <div className="p-3 border-b border-inherit">
                      <input
                        type="text"
                        value={pickerQuery}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                          setPickerQuery(event.target.value)
                        }
                        placeholder={t('Search sourcebook entries...')}
                        className={[
                          'w-full rounded-md border px-3 py-2 text-sm outline-none',
                          isLight
                            ? 'border-brand-gray-200 bg-white text-brand-gray-900'
                            : 'border-brand-gray-700 bg-brand-gray-950 text-brand-gray-100',
                        ].join(' ')}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {availableSourcebookEntries.length > 0 ? (
                        availableSourcebookEntries.map((entry: SourcebookEntry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={(): void => handleLaneAdd(entry.id)}
                            className={[
                              'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                              isLight
                                ? 'hover:bg-brand-gray-100 text-brand-gray-900'
                                : 'hover:bg-brand-gray-800 text-brand-gray-100',
                            ].join(' ')}
                          >
                            <span>{entry.name}</span>
                            <span
                              className={`text-xs ${isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}`}
                            >
                              {t(entry.category || 'Sourcebook')}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p
                          className={`px-3 py-2 text-sm ${isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}`}
                        >
                          {t('No matching sourcebook entries')}
                        </p>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={innerContainerRef}
        className="relative flex-1 overflow-y-auto"
        onMouseDown={handleNarrativeBackgroundMouseDown}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="relative h-full"
            style={{
              width: lanePlaneWidth > 0 ? `${lanePlaneWidth}px` : '100%',
              transform: `translateX(${-laneScrollLeft}px)`,
            }}
          >
            {visibleLaneEntryIds.map((entryId: string) => {
              const centerX = laneCenterXById.get(entryId);
              if (centerX === undefined) return null;
              return (
                <div
                  key={`line-${entryId}`}
                  data-sourcebook-line={entryId}
                  className={`absolute w-px ${lineClass}`}
                  style={{ left: centerX, top: 0, bottom: 0 }}
                />
              );
            })}
            {items.map((item: NarrativeItem) => {
              if (item.kind !== 'scene') return null;
              const laneMarkers = markerStyleBySceneId.get(item.scene.id);
              const cardLayout = cardLayouts.get(item.scene.id);
              if (!laneMarkers || !cardLayout) return null;

              return visibleLaneEntryIds.map((entryId: string) => {
                const markerStyle = laneMarkers.get(entryId);
                const laneCenterX = laneCenterXById.get(entryId);
                if (!markerStyle || laneCenterX === undefined) {
                  return null;
                }

                return (
                  <span
                    key={`marker-${item.scene.id}-${entryId}`}
                    data-scene-link-marker={`${item.scene.id}:${entryId}`}
                    data-link-style={markerStyle}
                    className={[
                      'absolute z-20 h-3 w-3 -translate-x-1/2 rounded-full border-2',
                      markerStyle === 'solid' ? markerSolidClass : markerHollowClass,
                    ].join(' ')}
                    style={{ left: laneCenterX, top: Math.max(cardLayout.y - 6, 0) }}
                  />
                );
              });
            })}
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-2 p-3">
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
            const dropTop =
              dropHint &&
              dropHint.id === scene.id &&
              dropHint.placeBefore &&
              dragSceneId;
            const dropBottom =
              dropHint &&
              dropHint.id === scene.id &&
              !dropHint.placeBefore &&
              dragSceneId;

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
                draggable={Boolean(onReorderScene)}
                onDragStart={(e: React.DragEvent<HTMLDivElement>) =>
                  handleSceneDragStart(e, scene.id)
                }
                onDragEnd={handleSceneDragEnd}
                onDragOver={(e: React.DragEvent<HTMLDivElement>) =>
                  handleSceneDragOver(e, scene.id)
                }
                onDrop={(e: React.DragEvent<HTMLDivElement>) =>
                  void handleSceneDrop(e, scene.id)
                }
                className={[
                  'relative',
                  dropTop
                    ? 'before:absolute before:left-0 before:right-0 before:-top-1 before:h-0.5 before:bg-brand-500 before:rounded'
                    : '',
                  dropBottom
                    ? 'after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-0.5 after:bg-brand-500 after:rounded'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
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
              {selectedLaneEntryIds.size > 0
                ? t('No scenes match the selected entries')
                : t('No scenes yet')}
            </p>
          )}
        </div>

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

      <div
        className={`border-t px-3 py-1 ${isLight ? 'border-brand-gray-200 bg-brand-gray-50' : 'border-brand-gray-800 bg-brand-gray-950'}`}
      >
        <div
          ref={bottomLaneScrollRef}
          className="overflow-x-auto overflow-y-hidden"
          onScroll={handleBottomLaneScroll}
          aria-label={t('Lane horizontal scrollbar')}
        >
          <div
            style={{
              width: Math.max(
                lanePlaneWidth,
                headerLaneViewportRef.current?.clientWidth ?? 0
              ),
              height: 1,
            }}
          />
        </div>
      </div>
    </div>
  );
};
