// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the story mappers unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Book, Chapter, Conflict, SourcebookEntry, StoryState } from '../../types';
import {
  ChapterListItem,
  StoryApiPayload,
  mapChapterListItemToChapter,
} from '../../services/apiTypes';
import { components } from '../../types/api.generated';

type StoryBook = components['schemas']['StoryBook'];
type StorySourcebookEntry = components['schemas']['StorySourcebookEntry'];

const VALID_PROJECT_TYPES = ['short-story', 'novel', 'series'] as const;

export const normalizeProjectType = (
  t: string | undefined
): 'short-story' | 'novel' | 'series' => {
  if (VALID_PROJECT_TYPES.includes(t as 'short-story' | 'novel' | 'series')) {
    return t as 'short-story' | 'novel' | 'series';
  }
  return 'novel';
};

const mapStoryBook = (b: StoryBook): Book => ({
  id: b.id ?? '',
  title: b.title ?? '',
  chapters: [],
});

const mapStorySourcebookEntry = (e: StorySourcebookEntry): SourcebookEntry => ({
  id: e.id ?? '',
  name: e.name ?? '',
  synonyms: e.synonyms ?? [],
  category: e.category ?? undefined,
  description: e.description ?? '',
  images: e.images ?? [],
  keywords: e.keywords ?? undefined,
});

export const mapStoryBooks = (books: StoryBook[] | null | undefined): Book[] =>
  (books ?? []).map(mapStoryBook);

export const mapStorySourcebook = (
  entries: StorySourcebookEntry[] | null | undefined
): SourcebookEntry[] => (entries ?? []).map(mapStorySourcebookEntry);

export const mapApiChapters = (chapters: ChapterListItem[]): Chapter[] =>
  chapters.map(mapChapterListItemToChapter);

export const reanchorChapterSelection = (
  previousSelection: string | null,
  previousChapters: Chapter[],
  nextChapters: Chapter[]
): string | null => {
  if (!previousSelection) {
    return null;
  }

  // First try to find the exact same ID.
  const exactMatch = nextChapters.find(
    (c: Chapter): boolean => c.id === previousSelection
  );
  if (exactMatch) return exactMatch.id;

  const oldChapter = previousChapters.find(
    (chapter: Chapter): boolean => chapter.id === previousSelection
  );
  if (!oldChapter) return null;

  const matching = nextChapters.find(
    (chapter: Chapter): boolean | '' | undefined =>
      chapter.filename &&
      chapter.book_id &&
      chapter.filename === oldChapter.filename &&
      chapter.book_id === oldChapter.book_id
  );
  return matching ? matching.id : null;
};

export const mapSelectStoryToState = (
  projectId: string,
  story: StoryApiPayload,
  chapters: Chapter[],
  currentChapterId: string | null,
  previousChapters: Chapter[],
  previousProjectId?: string
): StoryState => {
  const newSelection = reanchorChapterSelection(
    currentChapterId,
    previousChapters,
    chapters
  );

  const shouldPreserveChapterContent = previousProjectId === projectId;
  const chaptersWithPreservedState = shouldPreserveChapterContent
    ? chapters.map((c: Chapter): Chapter => {
        const prev = previousChapters.find((pc: Chapter): boolean => pc.id === c.id);
        if (prev) {
          return { ...c, content: prev.content };
        }
        return c;
      })
    : chapters;

  return {
    id: projectId,
    title: story.project_title || projectId,
    summary: story.story_summary || '',
    notes: story.notes || '',
    private_notes: story.private_notes || '',
    styleTags: story.tags || [],
    image_style: story.image_style || '',
    image_additional_info: story.image_additional_info || '',
    chapters: chaptersWithPreservedState,
    draft: null,
    projectType: normalizeProjectType(story.project_type ?? undefined),
    language: story.language || 'en',
    books: mapStoryBooks(story.books),
    sourcebook: mapStorySourcebook(story.sourcebook),
    conflicts: (story.conflicts ?? []) as Conflict[],
    llm_prefs: story.llm_prefs
      ? { prompt_overrides: story.llm_prefs.prompt_overrides ?? undefined }
      : undefined,
    currentChapterId: newSelection,
    lastUpdated: Date.now(),
  };
};
