// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebookExternalEntries.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, expect, it } from 'vitest';

import { SourcebookEntry } from '../../types';
import {
  filterSourcebookEntries,
  resolveExternalSourcebookEntries,
} from './SourcebookList';

const entry = (id: string, name: string): SourcebookEntry => ({
  id,
  name,
  description: `${name} description`,
  category: 'character',
  synonyms: [],
  images: [],
});

describe('sourcebook external entry sync', () => {
  it('prefers refreshed story sourcebook entries over stale local list', () => {
    const staleLocal = [entry('a', 'Old Entry')];
    const refreshedStory = [entry('b', 'New Entry From Chat Tool')];

    const resolved = resolveExternalSourcebookEntries(refreshedStory, staleLocal);
    expect(resolved).toEqual(refreshedStory);
  });

  it('keeps current entries when no external sourcebook is provided', () => {
    const current = [entry('a', 'Existing')];
    const resolved = resolveExternalSourcebookEntries(undefined, current);
    expect(resolved).toEqual(current);
  });

  it('filters external entries by case-insensitive name substring', () => {
    const entries = [entry('a', 'Tom'), entry('b', 'Rose Castle')];
    expect(filterSourcebookEntries(entries, 'rose')).toEqual([entries[1]]);
  });

  it('filters external entries by synonym substring', () => {
    const entries: SourcebookEntry[] = [
      {
        ...entry('a', 'Alaric'),
        synonyms: ['Knight of the Rose'],
      },
    ];
    expect(filterSourcebookEntries(entries, 'knight')).toEqual(entries);
  });

  it('filters external entries by keyword substring', () => {
    const entries: SourcebookEntry[] = [
      {
        ...entry('a', 'Daily Schedule'),
        keywords: ['routine', 'calendar'],
      },
      entry('b', 'Rose Castle'),
    ];
    expect(filterSourcebookEntries(entries, 'routi')).toEqual([entries[0]]);
  });

  it('filters external entries by description text', () => {
    const entries: SourcebookEntry[] = [
      {
        ...entry('a', 'Cassandra'),
        description: 'Includes post-operative breast augmentation care.',
      },
      entry('b', 'Rose Castle'),
    ];
    expect(filterSourcebookEntries(entries, 'breast augmentation')).toEqual([
      entries[0],
    ]);
  });

  it('filters external entries with tokenized multi-word fallback', () => {
    const entries: SourcebookEntry[] = [
      {
        ...entry('a', 'Cassandra'),
        synonyms: ['wife'],
        keywords: ['augmentation'],
        description: 'She receives post-operative breast care.',
      },
      entry('b', 'Rose Castle'),
    ];
    expect(filterSourcebookEntries(entries, 'breast augmentation')).toEqual([
      entries[0],
    ]);
  });

  it('returns all entries when query is blank', () => {
    const entries = [entry('a', 'Tom'), entry('b', 'Rose Castle')];
    expect(filterSourcebookEntries(entries, '   ')).toEqual(entries);
  });
});
