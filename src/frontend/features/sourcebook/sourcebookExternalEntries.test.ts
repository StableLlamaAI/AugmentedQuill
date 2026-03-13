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
import { resolveExternalSourcebookEntries } from './SourcebookList';

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
});
