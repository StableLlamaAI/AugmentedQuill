// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for markdown toolbar utilities to keep Raw/MD formatting behavior stable.
 */

import { describe, expect, it } from 'vitest';

import {
  applyInlineFormatAtSelection,
  getBlockPrefix,
  getBlockType,
  getLineBoundsAtOffset,
  getLineAtOffset,
  isInlineFormatActiveAtSelection,
  resolveInlineSelection,
  toggleBlockAtOffset,
  toggleInlineFormatAtSelection,
} from './markdownToolbarUtils';

describe('markdownToolbarUtils', () => {
  it('detects block type from line prefixes', () => {
    expect(getBlockType('# Title')).toBe('h1');
    expect(getBlockType('## Title')).toBe('h2');
    expect(getBlockType('### Title')).toBe('h3');
    expect(getBlockType('> Quote')).toBe('quote');
    expect(getBlockType('- Item')).toBe('ul');
    expect(getBlockType('1. Item')).toBe('ol');
    expect(getBlockType('plain text')).toBeNull();
  });

  it('returns current line at caret offset', () => {
    const text = 'alpha\nbeta line\ngamma';
    expect(getLineAtOffset(text, 2)).toBe('alpha');
    expect(getLineAtOffset(text, 8)).toBe('beta line');
    expect(getLineAtOffset(text, text.length)).toBe('gamma');
  });

  it('toggles heading prefix at line start when caret is mid-line', () => {
    const raw = 'hello world';
    const caret = 6;
    const { nextRawText } = toggleBlockAtOffset(raw, caret, 'h1');
    expect(nextRawText).toBe('# hello world');
  });

  it('removes same block format when toggled again', () => {
    const raw = '# hello world';
    const caret = 6;
    const { nextRawText } = toggleBlockAtOffset(raw, caret, 'h1');
    expect(nextRawText).toBe('hello world');
  });

  it('replaces existing block type with requested one', () => {
    const raw = '> quoted text';
    const caret = 5;
    const { nextRawText } = toggleBlockAtOffset(raw, caret, 'h2');
    expect(nextRawText).toBe('## quoted text');
  });

  it('wraps selected text for bold formatting', () => {
    const raw = 'alpha beta gamma';
    const start = 6;
    const end = 10;
    const { nextRawText, nextStart, nextEnd } = applyInlineFormatAtSelection(
      raw,
      start,
      end,
      'bold'
    );

    expect(nextRawText).toBe('alpha **beta** gamma');
    expect(nextStart).toBe(8);
    expect(nextEnd).toBe(12);
  });

  it('formats whole word when caret is inside word', () => {
    const raw = 'alpha beta gamma';
    const { nextRawText, nextStart, nextEnd } = applyInlineFormatAtSelection(
      raw,
      7,
      7,
      'italic'
    );

    expect(nextRawText).toBe('alpha _beta_ gamma');
    expect(nextStart).toBe(7);
    expect(nextEnd).toBe(11);
  });

  it('inserts empty markers when caret is at whitespace', () => {
    const raw = 'alpha beta';
    const { nextRawText, nextStart, nextEnd } = applyInlineFormatAtSelection(
      raw,
      5,
      5,
      'bold'
    );

    expect(nextRawText).toBe('alpha**** beta');
    expect(nextStart).toBe(7);
    expect(nextEnd).toBe(7);
  });

  it('inserts empty markers when caret is at end of text', () => {
    const raw = 'alpha';
    const { nextRawText, nextStart, nextEnd } = applyInlineFormatAtSelection(
      raw,
      raw.length,
      raw.length,
      'italic'
    );

    expect(nextRawText).toBe('alpha__');
    expect(nextStart).toBe(raw.length + 1);
    expect(nextEnd).toBe(raw.length + 1);
  });

  it('detects bold active when caret is inside wrapped word', () => {
    const raw = 'alpha **beta** gamma';
    const caret = raw.indexOf('beta') + 1;
    expect(isInlineFormatActiveAtSelection(raw, caret, caret, 'bold')).toBe(true);
  });

  it('does not detect italic active inside bold-only formatting', () => {
    const raw = 'alpha **beta** gamma';
    const caret = raw.indexOf('beta') + 1;
    expect(isInlineFormatActiveAtSelection(raw, caret, caret, 'italic')).toBe(false);
  });

  it('detects italic active for wrapped selection', () => {
    const raw = 'alpha _beta_ gamma';
    const start = raw.indexOf('beta');
    const end = start + 4;
    expect(isInlineFormatActiveAtSelection(raw, start, end, 'italic')).toBe(true);
  });

  it('toggles bold off when caret is inside bold word', () => {
    const raw = 'alpha **beta** gamma';
    const caret = raw.indexOf('beta') + 1;
    const { nextRawText } = toggleInlineFormatAtSelection(raw, caret, caret, 'bold');
    expect(nextRawText).toBe('alpha beta gamma');
  });

  it('toggles italic off when selected text is already italic', () => {
    const raw = 'alpha _beta_ gamma';
    const start = raw.indexOf('beta');
    const end = start + 4;
    const { nextRawText } = toggleInlineFormatAtSelection(raw, start, end, 'italic');
    expect(nextRawText).toBe('alpha beta gamma');
  });

  it('uses last selection when current selection is unavailable', () => {
    const resolved = resolveInlineSelection(null, { start: 4, end: 8 }, 20);
    expect(resolved).toEqual({ start: 4, end: 8 });
  });

  it('clamps fallback selection to text bounds', () => {
    const resolved = resolveInlineSelection(null, { start: 2, end: 99 }, 10);
    expect(resolved).toEqual({ start: 2, end: 10 });
  });

  it('prefers current selection over fallback', () => {
    const resolved = resolveInlineSelection(
      { start: 1, end: 3 },
      { start: 5, end: 9 },
      20
    );
    expect(resolved).toEqual({ start: 1, end: 3 });
  });

  it('prefers expanded fallback when current selection collapses', () => {
    const resolved = resolveInlineSelection(
      { start: 1, end: 1 },
      { start: 3, end: 8 },
      20
    );
    expect(resolved).toEqual({ start: 3, end: 8 });
  });

  it('formats selected boots correctly in reported sentence', () => {
    const raw = 'my boots on';
    const start = raw.indexOf('boots');
    const end = start + 'boots'.length;
    const { nextRawText } = toggleInlineFormatAtSelection(raw, start, end, 'bold');
    expect(nextRawText).toBe('my **boots** on');
  });

  it('formats boots correctly when current selection collapses but fallback selection exists', () => {
    const raw = 'my boots on';
    const fallbackStart = raw.indexOf('boots');
    const fallbackEnd = fallbackStart + 'boots'.length;
    const resolved = resolveInlineSelection(
      { start: 1, end: 1 },
      { start: fallbackStart, end: fallbackEnd },
      raw.length
    );
    const { nextRawText } = toggleInlineFormatAtSelection(
      raw,
      resolved.start,
      resolved.end,
      'bold'
    );
    expect(nextRawText).toBe('my **boots** on');
  });

  // ── getLineBoundsAtOffset ──────────────────────────────────────────────────

  it('getLineBoundsAtOffset returns correct bounds for the first line', () => {
    const text = 'alpha\nbeta\ngamma';
    expect(getLineBoundsAtOffset(text, 2)).toEqual({ lineStart: 0, lineEnd: 5 });
  });

  it('getLineBoundsAtOffset returns correct bounds for a middle line', () => {
    const text = 'alpha\nbeta\ngamma';
    expect(getLineBoundsAtOffset(text, 7)).toEqual({ lineStart: 6, lineEnd: 10 });
  });

  it('getLineBoundsAtOffset returns correct bounds for the last line', () => {
    const text = 'alpha\nbeta\ngamma';
    expect(getLineBoundsAtOffset(text, text.length)).toEqual({
      lineStart: 11,
      lineEnd: text.length,
    });
  });

  it('getLineBoundsAtOffset handles a single-line document', () => {
    const text = 'only line';
    expect(getLineBoundsAtOffset(text, 4)).toEqual({ lineStart: 0, lineEnd: 9 });
  });

  // ── getBlockPrefix ─────────────────────────────────────────────────────────

  it('getBlockPrefix returns correct prefix for all six block types', () => {
    expect(getBlockPrefix('h1')).toBe('# ');
    expect(getBlockPrefix('h2')).toBe('## ');
    expect(getBlockPrefix('h3')).toBe('### ');
    expect(getBlockPrefix('quote')).toBe('> ');
    expect(getBlockPrefix('ul')).toBe('- ');
    expect(getBlockPrefix('ol')).toBe('1. ');
  });

  // ── toggleBlockAtOffset: additional block types ────────────────────────────

  it('toggleBlockAtOffset adds ul prefix', () => {
    const { nextRawText } = toggleBlockAtOffset('list item', 4, 'ul');
    expect(nextRawText).toBe('- list item');
  });

  it('toggleBlockAtOffset removes ul prefix when toggled again', () => {
    const { nextRawText } = toggleBlockAtOffset('- list item', 5, 'ul');
    expect(nextRawText).toBe('list item');
  });

  it('toggleBlockAtOffset adds ol prefix', () => {
    const { nextRawText } = toggleBlockAtOffset('numbered item', 4, 'ol');
    expect(nextRawText).toBe('1. numbered item');
  });

  it('toggleBlockAtOffset removes ol prefix when toggled again', () => {
    const { nextRawText } = toggleBlockAtOffset('1. numbered item', 5, 'ol');
    expect(nextRawText).toBe('numbered item');
  });

  it('toggleBlockAtOffset adds h3 prefix', () => {
    const { nextRawText } = toggleBlockAtOffset('sub heading', 4, 'h3');
    expect(nextRawText).toBe('### sub heading');
  });

  it('toggleBlockAtOffset removes h3 prefix when toggled again', () => {
    const { nextRawText } = toggleBlockAtOffset('### sub heading', 8, 'h3');
    expect(nextRawText).toBe('sub heading');
  });

  // ── toggleBlockAtOffset: nextRawCaret positioning ─────────────────────────

  it('toggleBlockAtOffset caret advances by prefix length when block is added', () => {
    const raw = 'plain text';
    const caret = 3;
    const { nextRawCaret } = toggleBlockAtOffset(raw, caret, 'h1');
    // '# ' is 2 chars; caret 3 + 2 = 5
    expect(nextRawCaret).toBe(5);
  });

  it('toggleBlockAtOffset caret retreats by prefix length when block is removed', () => {
    const raw = '# plain text';
    const caret = 5; // inside '# plain text' after the '# '
    const { nextRawCaret } = toggleBlockAtOffset(raw, caret, 'h1');
    // removing '# ' (2 chars): 5 - 2 = 3
    expect(nextRawCaret).toBe(3);
  });

  it('toggleBlockAtOffset caret is never placed before the line start', () => {
    const raw = '# x';
    // Caret at 1 — inside the prefix itself; after removal lineStart = 0, delta = -2 → clamp to 0
    const { nextRawCaret } = toggleBlockAtOffset(raw, 1, 'h1');
    expect(nextRawCaret).toBe(0);
  });

  // ── isInlineFormatActiveAtSelection: alternate markers ────────────────────

  it('detects bold active when wrapped with double-underscore markers', () => {
    const raw = 'alpha __beta__ gamma';
    const caret = raw.indexOf('beta') + 1;
    expect(isInlineFormatActiveAtSelection(raw, caret, caret, 'bold')).toBe(true);
  });

  it('detects italic active when wrapped with star markers', () => {
    const raw = 'alpha *beta* gamma';
    const start = raw.indexOf('beta');
    const end = start + 4;
    expect(isInlineFormatActiveAtSelection(raw, start, end, 'italic')).toBe(true);
  });

  // ── toggleInlineFormatAtSelection: remove alternate markers ───────────────

  it('removes double-underscore bold markers when toggled off', () => {
    const raw = 'alpha __beta__ gamma';
    const caret = raw.indexOf('beta') + 1;
    const { nextRawText } = toggleInlineFormatAtSelection(raw, caret, caret, 'bold');
    expect(nextRawText).toBe('alpha beta gamma');
  });

  it('removes star italic markers when toggled off', () => {
    const raw = 'alpha *beta* gamma';
    const start = raw.indexOf('beta');
    const end = start + 4;
    const { nextRawText } = toggleInlineFormatAtSelection(raw, start, end, 'italic');
    expect(nextRawText).toBe('alpha beta gamma');
  });

  // ── resolveInlineSelection: both arguments null ────────────────────────────

  it('resolveInlineSelection returns caret-at-end when both args are null', () => {
    const resolved = resolveInlineSelection(null, null, 15);
    expect(resolved).toEqual({ start: 15, end: 15 });
  });
});
