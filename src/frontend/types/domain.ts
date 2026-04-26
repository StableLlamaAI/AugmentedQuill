// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Core domain types – story, chapter, book, and sourcebook entities.
 */

export interface Conflict {
  id: string;
  description: string;
  resolution: string;
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  filename?: string;
  book_id?: string;
  notes?: string;
  private_notes?: string;
  conflicts?: Conflict[];
}

export interface WritingUnit {
  id: string;
  scope: 'story' | 'chapter';
  title: string;
  summary: string;
  content: string;
  filename?: string;
  book_id?: string;
  notes?: string;
  private_notes?: string;
  conflicts?: Conflict[];
}

export interface Book {
  id: string;
  title: string;
  chapters: Chapter[];
  summary?: string;
  notes?: string;
  private_notes?: string;
}

export interface SourcebookRelation {
  target_id: string;
  direction?: 'forward' | 'reverse';
  relation: string;
  start_chapter?: string;
  start_book?: string;
  end_chapter?: string;
  end_book?: string;
}

export interface SourcebookEntry {
  id: string;
  name: string;
  synonyms: string[];
  category?: string;
  description: string;
  images: string[];
  keywords?: string[];
  relations?: SourcebookRelation[];
}

export interface Story {
  title: string;
  summary: string;
  notes?: string;
  private_notes?: string;
  styleTags: string[];
  image_style?: string;
  image_additional_info?: string;
  chapters: Chapter[];
  draft: WritingUnit | null;
  projectType: 'short-story' | 'novel' | 'series';
  language?: string;
  books?: Book[];
  sourcebook?: SourcebookEntry[];
  llm_prefs?: {
    prompt_overrides?: Record<string, string>;
  };
}

export interface StoryState extends Story {
  id: string;
  currentChapterId: string | null;
  lastUpdated?: number;
  conflicts?: Conflict[];
}
