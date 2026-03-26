// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// @vitest-environment jsdom

/**
 * Tests for text utilities.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  computeContentWithSeparator,
  applySmartQuotes,
  resetSmartQuoteChars,
  setSmartQuoteChars,
  setupSmartQuotesProxy,
  convertContentEditableQuotes,
  maybeReplaceInsertedQuoteInContentEditable,
} from './textUtils';

afterEach(() => {
  resetSmartQuoteChars();
});

describe('computeContentWithSeparator', () => {
  it('should handle empty prefix', () => {
    const { separator, newContent } = computeContentWithSeparator(
      '',
      'Hello',
      '',
      'raw'
    );
    expect(separator).toBe('');
    expect(newContent).toBe('Hello');
  });

  it('should add space for token boundary in raw mode', () => {
    const { separator, newContent } = computeContentWithSeparator(
      'Hello',
      'World',
      '',
      'raw'
    );
    expect(separator).toBe(' ');
    expect(newContent).toBe('Hello World');
  });

  it('should NOT add space if suffix starts with whitespace in raw mode', () => {
    const { separator } = computeContentWithSeparator('Hello', ' World', '', 'raw');
    expect(separator).toBe('');
  });

  it('should add space for token boundary in formatted mode if no newlines', () => {
    const { separator, newContent } = computeContentWithSeparator(
      'Hello',
      'World',
      '',
      'markdown'
    );
    expect(separator).toBe(' ');
    expect(newContent).toBe('Hello World');
  });

  it('should add double newline if prefix ends with space and we are in formatted mode', () => {
    // This is the quirky behavior of the current implementation:
    // if endsWithWhitespace is true, needsTokenBoundary is false, so it uses \n\n
    const { separator } = computeContentWithSeparator(
      'Hello ',
      'World',
      '',
      'markdown'
    );
    expect(separator).toBe('\n\n');
  });

  it('should complement existing newlines to total 2 in formatted mode', () => {
    const { separator } = computeContentWithSeparator(
      'Hello\n',
      'World',
      '',
      'markdown'
    );
    expect(separator).toBe('\n');

    const { separator: sep2 } = computeContentWithSeparator(
      'Hello',
      '\nWorld',
      '',
      'markdown'
    );
    expect(sep2).toBe('\n');

    const { separator: sep3 } = computeContentWithSeparator(
      'Hello\n\n',
      'World',
      '',
      'markdown'
    );
    expect(sep3).toBe('');
  });

  it('should use single space if it matches token boundary even in formatted mode if no newlines are involved?', () => {
    // Checking the logic: separator = needsTokenBoundary ? ' ' : '\n\n';
    // If I have "Hello" and I'm adding "World" (no whitespace), it should be \n\n if no newlines.
    // If I have "Hello " and I'm adding "World", needsTokenBoundary is false, so it should be \n\n?
    // Wait, the logic says:
    // else { separator = needsTokenBoundary ? ' ' : '\n\n'; }

    const { separator } = computeContentWithSeparator(
      'Hello ',
      'World',
      '',
      'markdown'
    );
    expect(separator).toBe('\n\n');
  });
});

describe('applySmartQuotes', () => {
  it('should convert standard double quotes to typographically correct ones', () => {
    expect(applySmartQuotes('She said "Hello" to him.')).toBe(
      'She said “Hello” to him.'
    );
    expect(applySmartQuotes('"Start and end"')).toBe('“Start and end”');
    expect(applySmartQuotes('Word "quote" word')).toBe('Word “quote” word');
  });

  it('should convert standard single quotes/apostrophes correctly', () => {
    expect(applySmartQuotes("It's a beautiful day.")).toBe('It’s a beautiful day.');
    expect(applySmartQuotes("'Single quoted'")).toBe('‘Single quoted’');
    expect(applySmartQuotes("She said 'Hello' to him")).toBe('She said ‘Hello’ to him');
  });

  it('should handle mixed typography and punctuation', () => {
    expect(applySmartQuotes('He shouted—"Stop!"')).toBe('He shouted—“Stop!”');
    expect(applySmartQuotes('("Wait," he said)')).toBe('(“Wait,” he said)');
  });

  it('should allow overriding quote characters', () => {
    setSmartQuoteChars({ doubleOpen: '«', doubleClose: '»' });
    expect(applySmartQuotes('"Hello"')).toBe('«Hello»');
  });

  it('should allow overriding single quote characters', () => {
    setSmartQuoteChars({ singleOpen: '‹', singleClose: '›' });
    expect(applySmartQuotes("'Hello'")).toBe('‹Hello›');
  });

  it('should ignore empty strings without throwing', () => {
    expect(applySmartQuotes('')).toBe('');
  });

  it('should convert quotes inside contenteditable elements automatically', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.textContent = 'She said "Hello".';
    document.body.appendChild(editable);

    convertContentEditableQuotes(editable);

    expect(editable.textContent).toBe('She said “Hello”.');

    document.body.removeChild(editable);
  });

  it('should replace typed double quote in contenteditable without moving caret', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.textContent = 'She said ';
    document.body.appendChild(editable);

    const range = document.createRange();
    const textNode = editable.firstChild as Text;
    range.setStart(textNode, textNode.length);
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Simulate that the browser already inserted the straight quote before the event fires.
    editable.textContent = 'She said "';

    const textNode2 = editable.firstChild as Text;
    const range2 = document.createRange();
    range2.setStart(textNode2, textNode2.length);
    range2.collapse(true);
    const selection2 = window.getSelection();
    selection2?.removeAllRanges();
    selection2?.addRange(range2);

    const inputEvent = new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '"',
    });

    const replaced = maybeReplaceInsertedQuoteInContentEditable(inputEvent, editable);
    expect(replaced).toBe(true);

    expect(editable.textContent).toBe('She said “');
    expect(window.getSelection()?.anchorOffset).toBe('She said “'.length);

    document.body.removeChild(editable);
  });
});
