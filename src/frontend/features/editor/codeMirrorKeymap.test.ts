// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Unit tests for the buildEnterExtension keymap covering the
 * softbreak Enter/Backspace/Delete behaviour:
 *   - Enter inserts "  \n" (markdown soft-break / line-break)
 *   - Second Enter anywhere in "  \n" zone upgrades it to "\n\n" (paragraph)
 *   - Enter inside "\n\n" zone inserts a plain "\n"
 *   - Backspace inside "  \n" zone removes the whole sequence and joins with
 *     a single space
 *   - Backspace at "\n\n" (pb+1 or pb+2) downgrades paragraph to "  \n"
 *   - Delete inside "  \n" zone (lb+0, lb+1, lb+2) removes it and joins with
 *     a single space
 *   - Delete at "\n\n" (pb+0 or pb+1) downgrades paragraph to "  \n"
 */

// @vitest-environment jsdom

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { buildEnterExtension } from './codeMirrorKeymap';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeView(content: string, cursor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: content,
    selection: { anchor: cursor },
    extensions: [buildEnterExtension('softbreak')],
  });
  return new EditorView({ state, parent });
}

function pressKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
}

function docAndCursor(view: EditorView): { doc: string; cursor: number } {
  return {
    doc: view.state.doc.toString(),
    cursor: view.state.selection.main.from,
  };
}

const views: EditorView[] = [];
function tracked(content: string, cursor: number): EditorView {
  const v = makeView(content, cursor);
  views.push(v);
  return v;
}

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

// ─── Enter: insert "  \n" ─────────────────────────────────────────────────────

describe('Enter — inserts soft-break "  \\n"', () => {
  it('inserts "  \\n" at end of line', () => {
    const view = tracked('hello', 5);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \n', cursor: 8 });
  });

  it('inserts "  \\n" mid-line', () => {
    const view = tracked('hello world', 5);
    pressKey(view, 'Enter');
    // existing space after cursor is stripped so it becomes "  \n"
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });

  it('strips a trailing space before cursor when inserting', () => {
    // e.g. the user typed a trailing space: "hello " — cursor at 6
    const view = tracked('hello world', 6);
    pressKey(view, 'Enter');
    // ch(5)=' ', stripBefore=1, ch(6)='w', stripAfter=0 → removes from 5..6
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });
});

// ─── Enter: upgrade "  \n" → "\n\n" ──────────────────────────────────────────

describe('Enter — upgrades "  \\n" to paragraph break "\\n\\n"', () => {
  // doc = "hello  \nworld", lb = 5
  it('upgrades when cursor is at lb+0 (before first space)', () => {
    const view = tracked('hello  \nworld', 5);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\nworld', cursor: 7 });
  });

  it('upgrades when cursor is at lb+1 (between spaces)', () => {
    const view = tracked('hello  \nworld', 6);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\nworld', cursor: 7 });
  });

  it('upgrades when cursor is at lb+2 (between 2nd space and \\n)', () => {
    const view = tracked('hello  \nworld', 7);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\nworld', cursor: 7 });
  });

  it('upgrades when cursor is at lb+3 (just after \\n)', () => {
    const view = tracked('hello  \nworld', 8);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\nworld', cursor: 7 });
  });
});

// ─── Enter: in "\n\n" zone inserts plain "\n" ─────────────────────────────────

describe('Enter — inserts plain "\\n" when cursor is in "\\n\\n" zone', () => {
  // doc = "hello\n\nworld", pb = 5
  it('inserts \\n when cursor is at pb (first \\n)', () => {
    const view = tracked('hello\n\nworld', 5);
    pressKey(view, 'Enter');
    // paraBreakAt(doc, 5) → 5; insert '\n' at 5 → "hello\n\n\nworld"
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\n\nworld', cursor: 6 });
  });

  it('inserts \\n when cursor is at pb+1 (second \\n)', () => {
    const view = tracked('hello\n\nworld', 6);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\n\nworld', cursor: 7 });
  });

  it('inserts \\n when cursor is at pb+2 (after \\n\\n)', () => {
    const view = tracked('hello\n\nworld', 7);
    pressKey(view, 'Enter');
    expect(docAndCursor(view)).toEqual({ doc: 'hello\n\n\nworld', cursor: 8 });
  });
});

// ─── Backspace: inside "  \n" zone → join with single space ──────────────────

describe('Backspace — removes "  \\n" and joins lines with a single space', () => {
  // doc = "hello  \nworld", lb = 5
  it('joins with single space when cursor is at lb+1', () => {
    const view = tracked('hello  \nworld', 6);
    pressKey(view, 'Backspace');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });

  it('joins with single space when cursor is at lb+2', () => {
    const view = tracked('hello  \nworld', 7);
    pressKey(view, 'Backspace');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });

  it('joins with single space when cursor is at lb+3 (after \\n)', () => {
    const view = tracked('hello  \nworld', 8);
    pressKey(view, 'Backspace');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });
});

// ─── Backspace: on "\n\n" → downgrade to "  \n" ───────────────────────────────

describe('Backspace — downgrades "\\n\\n" to "  \\n"', () => {
  // doc = "hello\n\nworld", pb = 5
  it('downgrades when cursor is at pb+1', () => {
    const view = tracked('hello\n\nworld', 6);
    pressKey(view, 'Backspace');
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });

  it('downgrades when cursor is at pb+2', () => {
    const view = tracked('hello\n\nworld', 7);
    pressKey(view, 'Backspace');
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });
});

// ─── Delete: inside "  \n" zone → join with single space ─────────────────────

describe('Delete — removes "  \\n" and joins lines with a single space', () => {
  // doc = "hello  \nworld", lb = 5
  it('joins with single space when cursor is at lb+0', () => {
    const view = tracked('hello  \nworld', 5);
    pressKey(view, 'Delete');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });

  it('joins with single space when cursor is at lb+1', () => {
    const view = tracked('hello  \nworld', 6);
    pressKey(view, 'Delete');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });

  it('joins with single space when cursor is at lb+2', () => {
    const view = tracked('hello  \nworld', 7);
    pressKey(view, 'Delete');
    expect(docAndCursor(view)).toEqual({ doc: 'hello world', cursor: 6 });
  });
});

// ─── Delete: on "\n\n" → downgrade to "  \n" ─────────────────────────────────

describe('Delete — downgrades "\\n\\n" to "  \\n"', () => {
  // doc = "hello\n\nworld", pb = 5
  it('downgrades when cursor is at pb (first \\n)', () => {
    const view = tracked('hello\n\nworld', 5);
    pressKey(view, 'Delete');
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });

  it('downgrades when cursor is at pb+1 (second \\n)', () => {
    const view = tracked('hello\n\nworld', 6);
    pressKey(view, 'Delete');
    expect(docAndCursor(view)).toEqual({ doc: 'hello  \nworld', cursor: 8 });
  });
});

// ─── 'ignore' and 'newline' modes ────────────────────────────────────────────

describe('buildEnterExtension — "ignore" mode', () => {
  it('does not change the document when Enter is pressed', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: 'hello',
      selection: { anchor: 5 },
      extensions: [buildEnterExtension('ignore')],
    });
    const view = new EditorView({ state, parent });
    views.push(view);
    pressKey(view, 'Enter');
    expect(view.state.doc.toString()).toBe('hello');
  });
});
