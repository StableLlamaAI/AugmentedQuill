// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate editor formatting context detection and block/inline format toggling.
 */

import { useRef } from 'react';
import { EditorView } from '@codemirror/view';
import {
  getBlockType,
  getLineAtOffset,
  isInlineFormatActiveAtSelection,
  toggleBlockAtOffset,
  MarkdownBlockType,
  TextSelectionRange,
} from '../markdownToolbarUtils';

interface UseEditorFormattingOptions {
  editorViewRef: React.RefObject<EditorView | null>;
  onContextChange?: (formats: string[]) => void;
  contextDebounceMs?: number;
}

export interface UseEditorFormattingResult {
  lastRawSelectionRef: React.MutableRefObject<TextSelectionRange | null>;
  checkContext: () => void;
  scheduleCheckContext: () => void;
  toggleBlockAtCaret: (type: MarkdownBlockType) => void;
}

/** Custom React hook that manages editor formatting. */
export function useEditorFormatting({
  editorViewRef,
  onContextChange,
  contextDebounceMs = 150,
}: UseEditorFormattingOptions): UseEditorFormattingResult {
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawSelectionRef = useRef<TextSelectionRange | null>(null);
  const lastReportedFormatsRef = useRef<string[]>([]);

  const checkContext = (): void => {
    if (!onContextChange) return;

    const formats: string[] = [];
    const view = editorViewRef.current;
    if (view) {
      const { anchor, head } = view.state.selection.main;
      const rawCaret = head;
      const rawStart = Math.min(anchor, head);
      const rawEnd = Math.max(anchor, head);

      // Extract a small window around the cursor instead of converting the
      // entire document to a string.  Format markers are always adjacent to
      // the selection so 200 chars of context is more than sufficient.
      const WINDOW = 200;
      const winStart = Math.max(0, rawStart - WINDOW);
      const winEnd = Math.min(view.state.doc.length, rawEnd + WINDOW);
      const localText = view.state.doc.sliceString(winStart, winEnd);
      const localCaret = rawCaret - winStart;
      const localStart = rawStart - winStart;
      const localEnd = rawEnd - winStart;

      const line = getLineAtOffset(localText, localCaret);
      const blockType = getBlockType(line);
      if (blockType) formats.push(blockType);

      if (isInlineFormatActiveAtSelection(localText, localStart, localEnd, 'bold'))
        formats.push('bold');
      if (isInlineFormatActiveAtSelection(localText, localStart, localEnd, 'italic'))
        formats.push('italic');
      if (
        isInlineFormatActiveAtSelection(
          localText,
          localStart,
          localEnd,
          'strikethrough'
        )
      )
        formats.push('strikethrough');
      if (isInlineFormatActiveAtSelection(localText, localStart, localEnd, 'subscript'))
        formats.push('subscript');
      if (
        isInlineFormatActiveAtSelection(localText, localStart, localEnd, 'superscript')
      )
        formats.push('superscript');

      lastRawSelectionRef.current = { start: rawStart, end: rawEnd };
    }
    // Only notify parent when the set of active formats actually changes, so
    // App.tsx doesn't re-render on every cursor move within plain text.
    const prev = lastReportedFormatsRef.current;
    const changed =
      prev.length !== formats.length ||
      formats.some((f: string, i: number): boolean => f !== prev[i]);
    if (changed) {
      lastReportedFormatsRef.current = formats;
      onContextChange(formats);
    }
  };

  const scheduleCheckContext = (): void => {
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current);
    contextDebounceRef.current = setTimeout(checkContext, contextDebounceMs);
  };

  const toggleBlockAtCaret = (type: MarkdownBlockType): void => {
    const view = editorViewRef.current;
    if (!view) return;
    const rawText = view.state.doc.toString();
    const rawCaret = view.state.selection.main.head;
    const { nextRawText, nextRawCaret } = toggleBlockAtOffset(rawText, rawCaret, type);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: nextRawText },
      selection: { anchor: nextRawCaret },
    });
    view.focus();
  };

  return {
    lastRawSelectionRef,
    checkContext,
    scheduleCheckContext,
    toggleBlockAtCaret,
  };
}
