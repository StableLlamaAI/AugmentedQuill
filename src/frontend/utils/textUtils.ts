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
type SmartQuoteChars = {
  doubleOpen: string;
  doubleClose: string;
  singleOpen: string;
  singleClose: string;
};

// Default to English quotation marks.
let smartQuoteChars: SmartQuoteChars = {
  doubleOpen: '“',
  doubleClose: '”',
  singleOpen: '‘',
  singleClose: '’',
};

export function setSmartQuoteChars(chars: Partial<SmartQuoteChars>) {
  smartQuoteChars = {
    doubleOpen: chars.doubleOpen ?? smartQuoteChars.doubleOpen,
    doubleClose: chars.doubleClose ?? smartQuoteChars.doubleClose,
    singleOpen: chars.singleOpen ?? smartQuoteChars.singleOpen,
    singleClose: chars.singleClose ?? smartQuoteChars.singleClose,
  };
}

export function resetSmartQuoteChars() {
  smartQuoteChars = {
    doubleOpen: '“',
    doubleClose: '”',
    singleOpen: '‘',
    singleClose: '’',
  };
}

export function applySmartQuotes(
  text: string,
  overrideChars?: Partial<SmartQuoteChars>
): string {
  if (!text) return text;

  const { doubleOpen, doubleClose, singleOpen, singleClose } = {
    ...smartQuoteChars,
    ...overrideChars,
  };

  // Replace double quotes
  let result = text.replace(/(^|[\s(\[{<—\-\*_])"/g, `$1${doubleOpen}`);
  result = result.replace(/"/g, doubleClose);

  // Replace single quotes
  result = result.replace(/(^|[\s(\[{<—\-\*_])'/g, `$1${singleOpen}`);
  result = result.replace(/'/g, singleClose);

  return result;
}

export function convertContentEditableQuotes(root: HTMLElement) {
  const selection = window.getSelection();
  const savedRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const value = node.nodeValue || '';
      return /["']/.test(value) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  } as unknown as NodeFilter);

  let textNode = walker.nextNode() as Text | null;
  while (textNode) {
    const oldVal = textNode.nodeValue || '';
    const newVal = applySmartQuotes(oldVal);
    if (newVal !== oldVal) {
      textNode.nodeValue = newVal;
    }
    textNode = walker.nextNode() as Text | null;
  }

  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }
}

/**
 * Installs a global capture-phase event listener to auto-convert
 * straight quotes into typographic quotation marks across all
 * textinputs, textareas and contenteditable roots.
 */
function findContentEditableRoot(node: Node | null): HTMLElement | null {
  let cur = node;
  while (cur) {
    if (cur instanceof HTMLElement && cur.isContentEditable) {
      return cur;
    }
    cur = cur.parentNode;
  }
  return null;
}

function getTextOffset(root: Node, target: Node, offset: number): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current = walker.nextNode() as Text | null;
  let runningOffset = 0;

  while (current) {
    if (current === target) {
      return runningOffset + offset;
    }
    runningOffset += current.nodeValue?.length ?? 0;
    current = walker.nextNode() as Text | null;
  }

  return null;
}

function isOpeningDoubleQuoteContext(prevChar: string | undefined): boolean {
  return !prevChar || /[\s(\[{<—\-\*_]/.test(prevChar);
}

function isOpeningSingleQuoteContext(
  prevChar: string | undefined,
  nextChar: string | undefined
): boolean {
  const isBeforeWord = !!prevChar && /[A-Za-z0-9]/.test(prevChar);
  const isAfterWord = !!nextChar && /[A-Za-z0-9]/.test(nextChar);
  if (isBeforeWord && isAfterWord) {
    return false; // contraction/apostrophe closing by default
  }

  return !prevChar || /[\s(\[{<—\-\*_]/.test(prevChar);
}

function getSmartQuoteForInsertion(
  quote: '"' | "'",
  leftText: string,
  rightText: string
): string {
  const prevChar = leftText.slice(-1);
  const nextChar = rightText[0];

  if (quote === '"') {
    return isOpeningDoubleQuoteContext(prevChar)
      ? smartQuoteChars.doubleOpen
      : smartQuoteChars.doubleClose;
  }

  return isOpeningSingleQuoteContext(prevChar, nextChar)
    ? smartQuoteChars.singleOpen
    : smartQuoteChars.singleClose;
}

export function maybeReplaceInsertedQuoteInContentEditable(
  e: InputEvent,
  root: HTMLElement
): boolean {
  const quoteChar = e.data;
  if (quoteChar !== '"' && quoteChar !== "'") return false;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;

  // At this point the inserted quote is already in the DOM and the caret is after it.
  const anchorNode = range.startContainer;
  const anchorOffset = range.startOffset;

  const absoluteCursorOffset = getTextOffset(root, anchorNode, anchorOffset);
  if (absoluteCursorOffset === null || absoluteCursorOffset < 1) return false;

  const fullText = root.textContent ?? '';
  const left = fullText.slice(0, absoluteCursorOffset - 1);
  const right = fullText.slice(absoluteCursorOffset);
  const replacement = getSmartQuoteForInsertion(quoteChar, left, right);

  if (!(anchorNode instanceof Text)) {
    return false;
  }

  const textValue = anchorNode.nodeValue ?? '';
  const relativeIndex = anchorOffset - 1;

  if (relativeIndex < 0 || relativeIndex >= textValue.length) {
    return false;
  }

  if (textValue.charAt(relativeIndex) !== quoteChar) {
    return false;
  }

  anchorNode.nodeValue =
    textValue.slice(0, relativeIndex) +
    replacement +
    textValue.slice(relativeIndex + 1);

  // Reposition caret after inserted smart quote
  const caretRange = document.createRange();
  caretRange.setStart(anchorNode, anchorOffset);
  caretRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caretRange);

  return true;
}

export function setupSmartQuotesProxy() {
  if (typeof window === 'undefined') return;
  document.addEventListener(
    'input',
    (e) => {
      const targetNode = e.target as Node | null;
      if (!targetNode) return;

      if (
        targetNode instanceof HTMLTextAreaElement ||
        (targetNode instanceof HTMLInputElement && targetNode.type === 'text')
      ) {
        const input = targetNode as HTMLInputElement | HTMLTextAreaElement;
        if (input.dataset.noSmartQuotes === 'true') return;

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

          if (input instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
            nativeTextareaValueSetter.call(input, newVal);
          } else if (input instanceof HTMLInputElement && nativeInputValueSetter) {
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

        return;
      }

      const editableRoot = findContentEditableRoot(targetNode);
      if (!editableRoot || editableRoot.dataset.noSmartQuotes === 'true') return;

      const inputEvent = e as InputEvent;
      if (inputEvent.inputType === 'insertText' && inputEvent.data) {
        const replaced = maybeReplaceInsertedQuoteInContentEditable(
          inputEvent,
          editableRoot
        );
        if (replaced) return;
      }

      convertContentEditableQuotes(editableRoot);
    },
    { capture: true }
  );
}
