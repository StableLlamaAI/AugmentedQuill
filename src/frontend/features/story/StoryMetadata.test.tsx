// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Verifies short-story metadata presentation so title-adjacent conflict counts
 * remain visible after the short-story single-draft refactor.
 */

// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StoryMetadata } from './StoryMetadata';

describe('StoryMetadata', () => {
  it('shows the story conflict count badge when conflicts exist', () => {
    render(
      <StoryMetadata
        title="Short Story"
        summary="Summary"
        tags={[]}
        conflicts={[
          { id: '1', description: 'Conflict A', resolution: 'TBD' },
          { id: '2', description: 'Conflict B', resolution: 'TBD' },
        ]}
        projectType="short-story"
        onUpdate={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByLabelText('2 active conflicts')).toBeTruthy();
  });

  it('shows note diffs when baselineNotes differs from current notes', () => {
    const { container } = render(
      <StoryMetadata
        title="Short Story"
        summary="Summary"
        tags={[]}
        notes="New story notes"
        baselineNotes="Old story notes"
        projectType="novel"
        onUpdate={vi.fn(async () => undefined)}
      />
    );

    expect(container.querySelector('.diff-inserted')).toBeTruthy();
  });
});
