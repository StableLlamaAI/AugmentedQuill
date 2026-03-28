// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the story mappers.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, it, expect } from 'vitest';
import { mapSelectStoryToState, reanchorChapterSelection } from './storyMappers';
import { Chapter } from '../../types';

describe('storyMappers reanchorChapterSelection', () => {
  it('should preserve selection when ID matches exactly', () => {
    const chapters: Chapter[] = [
      { id: '1', title: 'Chapter 1', summary: '', content: '' },
      { id: '2', title: 'Chapter 2', summary: '', content: '' },
    ];
    const nextChapters: Chapter[] = [
      { id: '1', title: 'Chapter 1 edited', summary: '', content: '' },
      { id: '2', title: 'Chapter 2', summary: '', content: '' },
    ];

    expect(reanchorChapterSelection('1', chapters, nextChapters)).toBe('1');
  });

  it('should fall back to filename/book_id if ID changes', () => {
    const chapters: Chapter[] = [
      {
        id: 'old-1',
        title: 'Chapter 1',
        summary: '',
        content: '',
        filename: '0001.txt',
        book_id: 'book1',
      },
    ];
    const nextChapters: Chapter[] = [
      {
        id: 'new-1',
        title: 'Chapter 1',
        summary: '',
        content: '',
        filename: '0001.txt',
        book_id: 'book1',
      },
    ];

    expect(reanchorChapterSelection('old-1', chapters, nextChapters)).toBe('new-1');
  });

  it('should return null if no match is found', () => {
    const chapters: Chapter[] = [
      { id: '1', title: 'Chapter 1', summary: '', content: '' },
    ];
    const nextChapters: Chapter[] = [
      { id: '2', title: 'Chapter 2', summary: '', content: '' },
    ];

    expect(reanchorChapterSelection('1', chapters, nextChapters)).toBe(null);
  });
});

describe('storyMappers mapSelectStoryToState', () => {
  it('maps story-level notes and private notes from API payload', () => {
    const mapped = mapSelectStoryToState(
      'demo-project',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
        notes: 'Visible notes',
        private_notes: 'Hidden notes',
      },
      [],
      null,
      []
    );

    expect(mapped.notes).toBe('Visible notes');
    expect(mapped.private_notes).toBe('Hidden notes');
  });

  it('defaults missing story-level notes/private notes to empty strings', () => {
    const mapped = mapSelectStoryToState(
      'demo-project',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
      },
      [],
      null,
      []
    );

    expect(mapped.notes).toBe('');
    expect(mapped.private_notes).toBe('');
  });
});
