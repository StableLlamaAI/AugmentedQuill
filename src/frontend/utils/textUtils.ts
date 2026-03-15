// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Text manipulation utilities.
 */

import { ViewMode } from '../types';

export function computeContentWithSeparator(
  prefix: string,
  text: string,
  suffix: string,
  viewMode: ViewMode
): { newContent: string; separator: string } {
  const startsWithWhitespace = text.length > 0 && /^\s/.test(text);
  const endsWithWhitespace = prefix.length > 0 && /\s$/.test(prefix);

  const needsTokenBoundary =
    prefix.length > 0 && !endsWithWhitespace && !startsWithWhitespace;

  const countTrailingNewlines = (value: string) => {
    let index = value.length - 1;
    let count = 0;
    while (index >= 0 && value[index] === '\n') {
      count++;
      index--;
    }
    return count;
  };
  const countLeadingNewlines = (value: string) => {
    let index = 0;
    let count = 0;
    while (index < value.length && value[index] === '\n') {
      count++;
      index++;
    }
    return count;
  };

  let separator = '';

  if (prefix.length === 0) {
    separator = '';
  } else if (viewMode === 'raw') {
    separator = needsTokenBoundary ? ' ' : '';
  } else {
    // markdown or wysiwyg
    const preNewlines = countTrailingNewlines(prefix);
    const textNewlines = countLeadingNewlines(text);
    const totalBoundaryNewlines = preNewlines + textNewlines;

    if (totalBoundaryNewlines >= 2) {
      separator = '';
    } else if (preNewlines > 0 || textNewlines > 0) {
      separator = '\n'.repeat(Math.max(0, 2 - totalBoundaryNewlines));
    } else {
      separator = needsTokenBoundary ? ' ' : '\n\n';
    }
  }

  return {
    newContent: prefix + separator + text + suffix,
    separator,
  };
}

/**
 * Automatically adjusts straight quotes to typographic quotation marks.
 * Handles both double (") and single (') quotes.
 */
export function applySmartQuotes(text: string): string {
  if (!text) return text;

  // Replace double quotes
  let result = text.replace(/(^|[\s(\[{<—\-\*_])"/g, '$1“');
  result = result.replace(/"/g, '”');

  // Replace single quotes
  result = result.replace(/(^|[\s(\[{<—\-\*_])'/g, '$1‘');
  result = result.replace(/'/g, '’');

  return result;
}

/**
 * Installs a global capture-phase event listener to auto-convert
 * straight quotes into typographic quotation marks across all
 * textinputs and textareas.
 */
export function setupSmartQuotesProxy() {
  if (typeof window === 'undefined') return;
  document.addEventListener(
    'input',
    (e) => {
      const target = e.target as HTMLElement;
      if (
        (target.tagName === 'TEXTAREA' ||
          (target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type === 'text')) &&
        target.dataset.noSmartQuotes !== 'true'
      ) {
        const input = target as HTMLInputElement | HTMLTextAreaElement;
        const oldVal = input.value;
        const newVal = applySmartQuotes(oldVal);
        if (newVal !== oldVal) {
          const start = input.selectionStart;
          const end = input.selectionEnd;

          // Bypassing React's `_valueTracker` to ensure the controlled value
          // observes the mutate correctly down the tree natively.
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;

          if (target.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
            nativeTextareaValueSetter.call(input, newVal);
          } else if (target.tagName === 'INPUT' && nativeInputValueSetter) {
            nativeInputValueSetter.call(input, newVal);
          } else {
            input.value = newVal;
          }

          if (start !== null && end !== null) {
            input.setSelectionRange(start, end);
          }

          // Stop the original event to replace it cleanly if required,
          // though `input` is not cancelable, React handles subsequent event.
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    },
    { capture: true }
  );
}
