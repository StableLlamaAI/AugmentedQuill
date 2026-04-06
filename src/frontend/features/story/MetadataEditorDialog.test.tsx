// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for MetadataEditorDialog so metadata sync behavior remains stable
 * while editor is open in sidebar view and external updates arrive.
 */

// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MetadataEditorDialog } from './MetadataEditorDialog';

const baseData = {
  title: 'Chapter 1',
  summary: 'Initial summary',
  notes: 'Initial notes',
  private_notes: 'Initial private notes',
  tags: ['tag1'],
};

describe('MetadataEditorDialog', () => {
  it('syncs external initialData updates into local state when not dirty', () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    const { rerender } = render(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={baseData}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    // Start in fullscreen, switch to sidebar to replicate reported setup
    const toggleBtn = screen.getByRole('button', { name: /Switch to Sidebar View/i });
    fireEvent.click(toggleBtn);

    const summaryTextarea = screen.getByPlaceholderText('Write a public summary...');
    expect((summaryTextarea as HTMLTextAreaElement).value).toBe('Initial summary');

    rerender(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, summary: 'Updated summary from function call' }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    expect((summaryTextarea as HTMLTextAreaElement).value).toBe(
      'Updated summary from function call'
    );
  });

  it('shows story-draft labels and conflicts tab for short-story metadata editing', () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <MetadataEditorDialog
        type="story"
        title="Edit Story Metadata"
        initialData={{ ...baseData, conflicts: [] }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={vi.fn(async () => undefined)}
        allowConflicts
        primarySourceLabel="Story Draft"
      />
    );

    expect(screen.getAllByRole('button', { name: 'Conflicts' }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('from Story Draft')).toBeTruthy();
  });

  it('sets the story language on editable metadata text inputs', () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <MetadataEditorDialog
        type="story"
        title="Edit Story Metadata"
        initialData={{ ...baseData, language: 'de' }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    const titleInputs = screen.getAllByDisplayValue('Chapter 1');
    const tagsInputs = screen.getAllByDisplayValue('tag1');

    expect(titleInputs.some((input) => input.getAttribute('lang') === 'de')).toBe(true);
    expect(tagsInputs.some((input) => input.getAttribute('lang') === 'de')).toBe(true);
    const summaryTextareas = screen.getAllByPlaceholderText(
      'Write a public summary...'
    );
    expect(
      summaryTextareas.some((textarea) => textarea.getAttribute('lang') === 'de')
    ).toBe(true);
  });

  it('shows actionable source buttons for empty summaries and selects notes when available', async () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const onAiGenerate = vi.fn(async () => 'Generated summary');

    render(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, summary: '', notes: 'Chapter notes' }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={onAiGenerate}
        primarySourceLabel="Chapter"
        primarySourceAvailable={false}
      />
    );

    const chapterButton = screen.getByRole('button', {
      name: 'Generate summary from Chapter',
    });
    const notesButton = screen.getByRole('button', {
      name: 'Generate summary from Notes',
    });

    expect((chapterButton as HTMLButtonElement).disabled).toBe(true);
    expect((notesButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(notesButton);
    expect(onAiGenerate).toHaveBeenCalledWith(
      'write',
      expect.any(Function),
      'Chapter notes',
      expect.any(Function),
      'notes'
    );
  });
});
