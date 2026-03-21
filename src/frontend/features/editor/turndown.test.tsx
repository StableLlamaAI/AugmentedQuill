// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
//
// @vitest-environment jsdom
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for WYSIWYG <-> markdown round-trip conversion.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup, act } from '@testing-library/react';
// @ts-ignore
import { marked } from 'marked';
import { createEditorTurndownService } from './turndown';
import { Editor } from './Editor';
import { Chapter, EditorSettings } from '../../types';

describe('createEditorTurndownService', () => {
  it('preserves table markdown when converting from HTML back to markdown', () => {
    const rawMd = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = marked.parse(rawMd, { breaks: true }) as string;
    const td = createEditorTurndownService();
    const output = td.turndown(html).trim();

    expect(output).toContain('| A | B |');
    expect(output).toContain('| --- | --- |');
    expect(output).toContain('| 1 | 2 |');
    expect(output).not.toContain('A\n\nB');
  });

  it('keeps table structure when a cell is edited in HTML before conversion', () => {
    const rawMd = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = marked.parse(rawMd, { breaks: true }) as string;

    // Simulate visual edit where a row cell value is changed
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html).window.document;
    const table = dom.querySelector('table');
    expect(table).toBeTruthy();
    const firstCell = table!.querySelector('tbody tr td');
    expect(firstCell).toBeTruthy();
    firstCell!.textContent = '7';

    const td = createEditorTurndownService();
    const output = td.turndown(table!.outerHTML).trim();

    expect(output).toContain('| A | B |');
    expect(output).toContain('| --- | --- |');
    expect(output).toContain('| 7 | 2 |');
    expect(output).not.toContain('A\n\nB');
  });

  it('flushes WYSIWYG table edits through onChange and preserves markdown when switching mode', async () => {
    const initialMd = '| A | B |\n|---|---|\n| 1 | 2 |';
    const chapter: Chapter = {
      id: '1',
      title: 'Test',
      summary: 'summary',
      content: initialMd,
    };

    const settings: EditorSettings = {
      fontSize: 14,
      maxWidth: 80,
      brightness: 1,
      contrast: 1,
      theme: 'light',
      sidebarWidth: 240,
    };

    const onChange = vi.fn();
    const suggestionControls = {
      continuations: [] as string[],
      isSuggesting: false,
      onTriggerSuggestions: () => {},
      onCancelSuggestion: () => {},
      onAcceptContinuation: () => {},
      isSuggestionMode: false,
      onKeyboardSuggestionAction: () => {},
    };
    const aiControls = {
      onAiAction: () => {},
      isAiLoading: false,
      isWritingAvailable: true,
    };

    const { container, rerender } = render(
      <Editor
        chapter={chapter}
        settings={settings}
        viewMode="wysiwyg"
        onChange={onChange}
        suggestionControls={suggestionControls}
        aiControls={aiControls}
      />
    );

    const wysiwyg = container.querySelector('#wysiwyg-editor');
    expect(wysiwyg).not.toBeNull();
    const firstCell = wysiwyg!.querySelector('tbody tr td');
    expect(firstCell).not.toBeNull();

    firstCell!.textContent = '7';

    await act(async () => {
      fireEvent.input(wysiwyg!);
      fireEvent.blur(wysiwyg!);
    });

    const lastChange = onChange.mock.calls[onChange.mock.calls.length - 1][1];
    expect(lastChange.content).toContain('| A | B |');
    expect(lastChange.content).toContain('| 7 | 2 |');

    await act(async () => {
      rerender(
        <Editor
          chapter={{ ...chapter, content: lastChange.content }}
          settings={settings}
          viewMode="raw"
          onChange={onChange}
          suggestionControls={suggestionControls}
          aiControls={aiControls}
        />
      );
    });

    const finalChange = onChange.mock.calls[onChange.mock.calls.length - 1][1];
    expect(finalChange.content).toContain('| A | B |');
    expect(finalChange.content).toContain('| 7 | 2 |');
  });
});
