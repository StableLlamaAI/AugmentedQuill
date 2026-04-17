// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for markdown round-trip conversion via turndown.
 */

import { describe, expect, it } from 'vitest';
// @ts-ignore
import { marked } from 'marked';
import { createEditorTurndownService } from './turndown';

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
});
