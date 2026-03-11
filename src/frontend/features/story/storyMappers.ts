// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the story mappers unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Chapter, StoryState } from '../../types';
import {
  ChapterListItem,
  StoryApiPayload,
  mapChapterListItemToChapter,
} from '../../services/apiTypes';

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
  const exactMatch = nextChapters.find((c) => c.id === previousSelection);
  if (exactMatch) return exactMatch.id;

  const oldChapter = previousChapters.find(
    (chapter) => chapter.id === previousSelection
  );
  if (!oldChapter) return null;

  const matching = nextChapters.find(
    (chapter) =>
      chapter.filename === oldChapter.filename && chapter.book_id === oldChapter.book_id
  );
  return matching ? matching.id : null;
};

export const mapSelectStoryToState = (
  projectId: string,
  story: StoryApiPayload,
  chapters: Chapter[],
  currentChapterId: string | null,
  previousChapters: Chapter[]
): StoryState => {
  const newSelection = reanchorChapterSelection(
    currentChapterId,
    previousChapters,
    chapters
  );

  const chaptersWithPreservedState = chapters.map((c) => {
    const prev = previousChapters.find((pc) => pc.id === c.id);
    if (prev) {
      return { ...c, content: prev.content };
    }
    return c;
  });

  return {
    id: projectId,
    title: story.project_title || projectId,
    summary: story.story_summary || '',
    styleTags: story.tags || [],
    image_style: story.image_style || '',
    image_additional_info: story.image_additional_info || '',
    chapters: chaptersWithPreservedState,
    projectType: story.project_type || 'novel',
    language: story.language || 'en',
    books: story.books || [],
    sourcebook: story.sourcebook || [],
    conflicts: story.conflicts || [],
    llm_prefs: story.llm_prefs,
    currentChapterId: newSelection,
    lastUpdated: Date.now(),
  };
};
