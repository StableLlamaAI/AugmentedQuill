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
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  cleanup,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MetadataEditorDialog } from './MetadataEditorDialog';

afterEach(cleanup);
afterEach(() => vi.useRealTimers());

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

    // Switch to sidebar view so the dialog renders outside a portal,
    // which ensures reliable cleanup between tests.
    const toggleBtn = screen.getByRole('button', { name: /Switch to Sidebar View/i });
    fireEvent.click(toggleBtn);

    // Title is a regular <input> — use it to assert the sync-from-initialData path.
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Chapter 1');

    rerender(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, title: 'Updated Title from external call' }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    expect(titleInput.value).toBe('Updated Title from external call');
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
    // Summary is now a CodeMirrorEditor which does not expose an HTML lang attribute;
    // spellchecking language is passed via the `language` prop to the editor.
  });

  it('supports undo and redo via metadata dialog header buttons', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={baseData}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    const dialog = screen
      .getAllByRole('dialog')
      .find((node) => within(node).queryByText('Edit Chapter Metadata'));
    expect(dialog).toBeTruthy();

    const titleInput = within(dialog!).getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Chapter 1 Revised' } });
    expect(titleInput.value).toBe('Chapter 1 Revised');

    // Advance past the 600 ms debounce so the history entry is committed.
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    fireEvent.click(
      within(dialog!).getByRole('button', { name: /Undo metadata editor changes/i })
    );
    expect((within(dialog!).getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Chapter 1'
    );

    fireEvent.click(
      within(dialog!).getByRole('button', { name: /Redo metadata editor changes/i })
    );
    expect((within(dialog!).getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Chapter 1 Revised'
    );
  });

  it('preserves undo history when autosave updates initialData', async () => {
    vi.useFakeTimers();
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

    const dialog = screen
      .getAllByRole('dialog')
      .find((node) => within(node).queryByText('Edit Chapter Metadata'));
    expect(dialog).toBeTruthy();

    const titleInput = within(dialog!).getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Chapter 1 Revised' } });
    expect(titleInput.value).toBe('Chapter 1 Revised');

    // Advance past the 600 ms debounce so the history entry is committed.
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    rerender(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, title: 'Chapter 1 Revised' }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    fireEvent.click(
      within(dialog!).getByRole('button', { name: /Undo metadata editor changes/i })
    );
    expect((within(dialog!).getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Chapter 1'
    );
  });

  it('reuses existing history entries when external edits revert to an earlier state', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={baseData}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    const dialog = screen
      .getAllByRole('dialog')
      .find((node) => within(node).queryByText('Edit Chapter Metadata'));
    expect(dialog).toBeTruthy();

    const titleInput = within(dialog!).getByLabelText('Title') as HTMLInputElement;
    // Type three distinct values with debounce pauses so each becomes an entry.
    fireEvent.change(titleInput, { target: { value: 'Chapter 1 Revised' } });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.change(titleInput, { target: { value: 'Chapter 1 Final' } });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(titleInput.value).toBe('Chapter 1 Final');

    // Typing back to the original value should reuse the existing entry.
    fireEvent.change(titleInput, { target: { value: 'Chapter 1' } });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    const undoButton = within(dialog!).getByRole('button', {
      name: /Undo metadata editor changes/i,
    }) as HTMLButtonElement;
    const redoButton = within(dialog!).getByRole('button', {
      name: /Redo metadata editor changes/i,
    }) as HTMLButtonElement;

    // After settling we should be back at the original entry (no undo available,
    // redo available to go forward again).
    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(false);
  });

  it('keeps diff highlights when explicit baseline advances to the current data', () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    // Start with data already diverged from baseline (simulates an AI write)
    // so the "Clear highlights" button is visible immediately.
    const { rerender } = render(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, summary: 'Updated summary' }}
        baseline={baseData}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    const dialog = screen
      .getAllByRole('dialog')
      .find((node) => within(node).queryByText('Edit Chapter Metadata'));
    expect(dialog).toBeTruthy();

    // Diff should be active: baseline.summary='Initial summary', data.summary='Updated summary'
    expect(
      within(dialog!).getByRole('button', { name: /Clear highlights/i })
    ).toBeTruthy();

    // Simulate a save round-trip: baseline advances to match current data.
    // isSaveRoundTrip guard must keep the previous baseline so the diff stays visible.
    rerender(
      <MetadataEditorDialog
        type="chapter"
        title="Edit Chapter Metadata"
        initialData={{ ...baseData, summary: 'Updated summary' }}
        baseline={{
          ...baseData,
          title: 'Updated Title',
          summary: 'Updated summary',
        }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={undefined}
      />
    );

    expect(
      within(dialog!).getByRole('button', { name: /Clear highlights/i })
    ).toBeTruthy();
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

  it('activates the notes source label when chapter source is unavailable', () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <MetadataEditorDialog
        type="story"
        title="Edit Story Metadata"
        initialData={{
          ...baseData,
          summary: 'Existing summary',
          notes: 'Story notes available',
        }}
        onSave={onSave}
        onClose={onClose}
        onAiGenerate={vi.fn(async () => undefined)}
        primarySourceLabel="Chapter"
        primarySourceAvailable={false}
      />
    );

    const chapterGroups = screen.getAllByRole('group', {
      name: 'Chapter summary actions',
    });
    const notesGroups = screen.getAllByRole('group', {
      name: 'Notes summary actions',
    });

    const chapterLabelActive = chapterGroups.some((group) => {
      const label = within(group).getByText('from Chapter');
      return label.className.includes('text-brand-gray-500');
    });
    const notesLabelActive = notesGroups.some((group) => {
      const label = within(group).getByText('from Notes');
      return label.className.includes('bg-primary/20');
    });

    expect(chapterLabelActive).toBe(true);
    expect(notesLabelActive).toBe(true);
  });
});
