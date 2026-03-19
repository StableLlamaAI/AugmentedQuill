// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the useStory.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { describe, expect, it } from 'vitest';

import { StoryState } from '../../types';
import { buildInitialStoryState, resolveExternalHistorySourceState } from './useStory';

const buildStory = (summary: string): StoryState => ({
  id: 'demo',
  title: 'Demo',
  summary,
  styleTags: [],
  image_style: '',
  image_additional_info: '',
  chapters: [],
  projectType: 'novel',
  books: [],
  sourcebook: [],
  conflicts: [],
  currentChapterId: null,
  lastUpdated: 1,
});

describe('resolveExternalHistorySourceState', () => {
  it('prefers latest in-memory story when explicit state is omitted', () => {
    const staleClosureState = buildStory('old summary');
    const latestLoadedState = buildStory('new summary from tool mutation');

    const selected = resolveExternalHistorySourceState(
      undefined,
      latestLoadedState,
      staleClosureState
    );

    expect(selected.summary).toBe('new summary from tool mutation');
  });

  it('uses explicit provided state when available', () => {
    const staleClosureState = buildStory('old summary');
    const latestLoadedState = buildStory('new summary');
    const explicitState = buildStory('explicit summary snapshot');

    const selected = resolveExternalHistorySourceState(
      explicitState,
      latestLoadedState,
      staleClosureState
    );

    expect(selected.summary).toBe('explicit summary snapshot');
  });
});

describe('buildInitialStoryState', () => {
  it('hydrates story-level notes fields from selected project payload', () => {
    const state = buildInitialStoryState(
      'demo',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
        notes: 'Story notes',
        private_notes: 'Private story notes',
      },
      []
    );

    expect(state.notes).toBe('Story notes');
    expect(state.private_notes).toBe('Private story notes');
  });

  it('defaults missing story-level notes fields to empty strings', () => {
    const state = buildInitialStoryState(
      'demo',
      {
        project_title: 'Demo',
        story_summary: 'Summary',
      },
      []
    );

    expect(state.notes).toBe('');
    expect(state.private_notes).toBe('');
  });
});
