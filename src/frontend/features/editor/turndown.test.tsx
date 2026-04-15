// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for WYSIWYG <-> markdown round-trip conversion.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, act } from '@testing-library/react';
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

  it('escapes backslashes and pipes in table cells to prevent markdown injection', () => {
    const html =
      '<table><thead><tr><th>h\\\\</th><th>a|b</th></tr></thead><tbody><tr><td>c\\\\</td><td>d|e</td></tr></tbody></table>';
    const td = createEditorTurndownService();
    const output = td.turndown(html).trim();

    expect(output).toContain('h\\\\');
    expect(output).toContain('a\\|b');
    expect(output).toContain('c\\\\');
    expect(output).toContain('d\\|e');
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

// ─────────────────────────────────────────────────────────────────────────────
// checkContext DOM logic: Visual mode DOM-based format detection (unit)
// ─────────────────────────────────────────────────────────────────────────────
// These tests verify the fix for the bug where queryCommandState('subscript')
// and queryCommandState('superscript') returned false for <sub>/<sup> elements
// rendered by marked (as opposed to elements inserted via execCommand).
// The fix walks the DOM from the selection anchor instead.
//
// We test the logic directly in jsdom without mounting the Editor component,
// mirroring the exact logic from Editor.tsx checkContext.
// ─────────────────────────────────────────────────────────────────────────────

describe('checkContext DOM logic: Visual mode DOM-based format detection (unit)', () => {
  // This describe block tests the DOM ancestor-walk logic added in Editor.tsx
  // checkContext to detect <del>/<sub>/<sup> elements regardless of whether
  // they were inserted via execCommand or rendered from marked.
  //
  // We test the logic directly in jsdom without mounting the Editor component.
  // The helpers below mirror Editor.tsx checkContext exactly.

  // Mirrored from Editor.tsx checkContext:
  const isInsideTag = (tags: string[], boundary: HTMLElement): boolean => {
    const selAnchor = window.getSelection()?.anchorNode ?? null;
    let node: Node | null = selAnchor;
    while (node && node !== boundary) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        tags.includes((node as Element).tagName)
      )
        return true;
      node = node.parentNode;
    }
    return false;
  };

  // Mirrored from Editor.tsx checkContext (superscript with footnote exclusion):
  const insideNonFootnoteSup = (boundary: HTMLElement): boolean => {
    const selAnchor = window.getSelection()?.anchorNode ?? null;
    let node: Node | null = selAnchor;
    while (node && node !== boundary) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'SUP') {
        return !(node as Element).classList.contains('footnote-ref');
      }
      node = node.parentNode;
    }
    return false;
  };

  // Recursively find the first non-empty text node inside `node`.
  const findFirstTextNode = (node: Node): Text | null => {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent?.length ?? 0) > 0)
      return node as Text;
    for (const child of Array.from(node.childNodes)) {
      const found = findFirstTextNode(child);
      if (found) return found;
    }
    return null;
  };

  // Place the DOM selection anchor inside `el`.
  const placeCaretInside = (el: Element): void => {
    const textNode = findFirstTextNode(el);
    if (!textNode) return;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  };

  // Create a boundary div (acting as wysiwygRef.current) populated with HTML.
  let boundary: HTMLElement;
  afterEach(() => {
    if (boundary && boundary.parentNode) boundary.parentNode.removeChild(boundary);
    window.getSelection()?.removeAllRanges();
  });

  it('detects DEL ancestor: cursor inside <del> from ~~markdown~~ → strikethrough', () => {
    boundary = document.createElement('div');
    document.body.appendChild(boundary);
    boundary.innerHTML = marked.parse('~~crossed~~', { breaks: true }) as string;

    const del = boundary.querySelector('del, s');
    expect(del).not.toBeNull();

    placeCaretInside(del!);
    expect(isInsideTag(['DEL', 'S', 'STRIKE'], boundary)).toBe(true);
  });

  it('detects SUB ancestor: cursor inside <sub> from ~markdown~ → subscript', () => {
    boundary = document.createElement('div');
    document.body.appendChild(boundary);
    boundary.innerHTML = marked.parse('H~2~O', { breaks: true }) as string;

    const sub = boundary.querySelector('sub');
    expect(sub).not.toBeNull();

    placeCaretInside(sub!);
    expect(isInsideTag(['SUB'], boundary)).toBe(true);
  });

  it('detects SUP ancestor: cursor inside <sup> from ^markdown^ → superscript', () => {
    boundary = document.createElement('div');
    document.body.appendChild(boundary);
    boundary.innerHTML = marked.parse('E=mc^2^', { breaks: true }) as string;

    const sup = boundary.querySelector('sup:not(.footnote-ref)');
    expect(sup).not.toBeNull();

    placeCaretInside(sup!);
    expect(insideNonFootnoteSup(boundary)).toBe(true);
  });

  it('excludes footnote-ref <sup>: cursor inside footnote-ref → NOT superscript', () => {
    boundary = document.createElement('div');
    document.body.appendChild(boundary);
    boundary.innerHTML = marked.parse('text[^1]\n\n[^1]: a note', {
      breaks: true,
    }) as string;

    const footnoteSup = boundary.querySelector('sup.footnote-ref');
    expect(footnoteSup).not.toBeNull();

    placeCaretInside(footnoteSup!);
    expect(insideNonFootnoteSup(boundary)).toBe(false);
  });

  it('returns false for all three formats when cursor is in plain paragraph text', () => {
    boundary = document.createElement('div');
    document.body.appendChild(boundary);
    boundary.innerHTML = marked.parse('plain text here', { breaks: true }) as string;

    const textNode = findFirstTextNode(boundary);
    if (textNode) {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }

    expect(isInsideTag(['DEL', 'S', 'STRIKE'], boundary)).toBe(false);
    expect(isInsideTag(['SUB'], boundary)).toBe(false);
    expect(insideNonFootnoteSup(boundary)).toBe(false);
  });
});
