// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Shared scene sorting utilities used by NarrativeView and
 * ConvergenceMapView. Extracted to avoid duplication.
 */

import type { Scene } from '../../types';
import type { Chapter, Book } from '../../types/domain';
import { parseZonedDateTime } from '../../utils/temporal';

export type ProjectType = 'short-story' | 'novel' | 'series';

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Build a map from chapter id → display order index, using the correct
 *  sequence for the project type (flat list for novel; books-first for series). */
// eslint-disable-next-line complexity
export function buildChapterOrderMap(
  projectType: ProjectType,
  chapters: Chapter[],
  books: Book[]
): Map<string, number> {
  const map = new Map<string, number>();

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

export function normalizeChapterId(chapterId: unknown): string {
  if (typeof chapterId === 'string') return chapterId;
  if (typeof chapterId === 'number' && Number.isFinite(chapterId))
    return String(chapterId);
  return '';
}

/** Returns a [chapterIndex, startOffset] tuple for sorting.
 *  Scenes without a prose link sort to the very end. */
export function sceneSortKey(
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

export function proseSort(
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

export function getSceneEpochNanoseconds(scene: Scene): bigint | null {
  const temporalString = scene.scene_time?.temporal_zoned_datetime;
  const parsed = parseZonedDateTime(temporalString);
  return parsed?.epochNanoseconds ?? null;
}

export function chronologicalSort(
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
