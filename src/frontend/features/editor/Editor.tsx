// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the editor unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useCallback,
  useState,
} from 'react';
import { EditorView } from '@codemirror/view';
import { EditorSettings, ViewMode, WritingUnit } from '../../types';
import { Upload } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { notifyError } from '../../services/errorNotifier';
import { useSearchHighlight } from '../search/SearchHighlightContext';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { EditorSuggestionPanel } from './EditorSuggestionPanel';
import { EditorMobileToolbar } from './EditorMobileToolbar';
import { EditorProvider } from './EditorContext';
import {
  getBlockType,
  getLineAtOffset,
  insertFencedCodeBlock,
  insertFootnote,
  isInlineFormatActiveAtSelection,
  toggleBlockAtOffset,
  toggleInlineFormatAtSelection,
  InlineFormatType,
  MarkdownBlockType,
  TextSelectionRange,
} from './markdownToolbarUtils';

// URL sanitizer — re-exported for backward compat with Editor.url.test.ts
export { isSafeImageUrl } from './editorUtils';
import { isSafeImageUrl } from './editorUtils';

interface EditorProps {
  chapter: WritingUnit;
  settings: EditorSettings;
  viewMode: ViewMode;
  showWhitespace?: boolean;
  onToggleShowWhitespace?: () => void;
  onChange: (id: string, updates: Partial<WritingUnit>) => void;
  baselineContent?: string;
  language?: string;
  spellCheck?: boolean;
  suggestionControls: {
    continuations: string[];
    isSuggesting: boolean;
    onTriggerSuggestions: (cursor?: number, contentOverride?: string) => void;
    onCancelSuggestion?: () => void;
    onAcceptContinuation: (text: string, contentOverride?: string) => void;
    isSuggestionMode: boolean;
    onKeyboardSuggestionAction: (
      action: 'trigger' | 'chooseLeft' | 'chooseRight' | 'regenerate' | 'undo' | 'exit',
      cursor?: number,
      contentOverride?: string
    ) => void;
  };
  aiControls: {
    onAiAction: (
      target: 'summary' | 'chapter',
      action: 'update' | 'rewrite' | 'extend'
    ) => void;
    isAiLoading: boolean;
    isWritingAvailable?: boolean;
    onCancelAiAction?: () => void;
    /** True whenever any LLM is writing prose into the editor. */
    isProseStreaming?: boolean;
  };
  onContextChange?: (formats: string[]) => void;
  onOpenSearch?: () => void;
}

export interface EditorHandle {
  insertImage: (filename: string, url: string, altText?: string) => void;
  focus: () => void;
  format: (type: string) => void;
  openImageManager?: () => void;
  jumpToPosition: (start: number, end: number) => void;
}

export const Editor = React.memo(
  React.forwardRef<EditorHandle, EditorProps>(
    (
      {
        chapter,
        settings,
        viewMode,
        showWhitespace,
        onToggleShowWhitespace,
        onChange,
        baselineContent = undefined,
        suggestionControls,
        aiControls,
        language,
        spellCheck,
        onContextChange,
        onOpenSearch,
      },
      ref
    ) => {
      // CodeMirror EditorView — persists across all view modes
      const editorViewRef = useRef<EditorView | null>(null);
      const lastRawSelectionRef = useRef<TextSelectionRange | null>(null);
      const scrollContainerRef = useRef<HTMLDivElement>(null);
      const paperDivRef = useRef<HTMLDivElement>(null);
      const showInlineTitle = true;
      const conflictCount = chapter.conflicts?.length ?? 0;
      const isAtBottomRef = useRef<boolean>(true);
      const isDetachedFromBottomRef = useRef<boolean>(false);
      const distanceFromBottomRef = useRef<number>(0);
      const prevScrollTopRef = useRef<number>(0);
      const autoScrollRafRef = useRef<number | null>(null);
      const autoScrollSettleRafRef = useRef<number | null>(null);
      const { getRanges } = useSearchHighlight();
      const chapterSearchHighlightRanges = getRanges(
        'chapter_content',
        String(chapter.id),
        'content'
      );
      // Debounce timers for API-level persistence so every keystroke does not
      // trigger a network request.  Display updates remain synchronous.
      const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const contextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const DEBOUNCE_MS = 300;
      const CONTEXT_DEBOUNCE_MS = 150;

      // Local content/title state so the editor div always gets the latest
      // typed value immediately, while the parent onChange (API call) is debounced.
      const [localContent, setLocalContent] = useState(chapter.content);
      // Ref that always holds the current content without triggering re-renders.
      // Used in callbacks that need the latest value at call time (e.g. suggestion
      // hotkeys) so those callbacks don't need localContent in their deps arrays.
      const localContentRef = useRef(chapter.content);
      const [localTitle, setLocalTitle] = useState(chapter.title);

      // Track the diff baseline locally so we can clear it immediately when the
      // user types — preventing newly typed text from appearing as diff insertions.
      // Re-adopt the prop whenever a new non-undefined baseline arrives (AI write).
      const [localBaseline, setLocalBaseline] = useState<string | undefined>(
        baselineContent
      );
      const prevBaselineRef = useRef<string | undefined>(baselineContent);
      // Keep the last non-undefined baseline so undo can restore the diff view.
      const savedBaselineRef = useRef<string | undefined>(baselineContent);
      if (baselineContent !== prevBaselineRef.current) {
        prevBaselineRef.current = baselineContent;
        setLocalBaseline(baselineContent);
        // Only preserve as the real AI baseline when baselineContent differs from
        // chapter.content. When isUserEdit=true, pushState sets baselineContent
        // equal to chapter.content (no diff), so we must not overwrite the saved
        // AI baseline with the user-edited value — otherwise Ctrl+Z would restore
        // that wrong baseline instead of the original AI-written baseline.
        if (baselineContent !== undefined && baselineContent !== chapter.content) {
          savedBaselineRef.current = baselineContent;
        }
      }

      const proseStreamingActive = aiControls.isProseStreaming ?? false;

      // Keep local state in sync when the chapter changes externally (chapter
      // switch, AI update, undo/redo).  Use chapter.id as the primary trigger
      // for chapter switches; also watch chapter.content so AI insertions and
      // undo/redo (which can change content without changing id) are reflected.
      const lastChapterIdRef = useRef(chapter.id);
      useEffect(() => {
        const isChapterSwitch = chapter.id !== lastChapterIdRef.current;
        lastChapterIdRef.current = chapter.id;

        // On chapter switch always reset.  For in-place content changes (AI,
        // undo/redo) only sync when the editor is not focused — when it IS
        // focused CodeMirror already has the correct document state.
        const editorFocused = editorViewRef.current?.hasFocus ?? false;
        const shouldDeferStreamingSync =
          proseStreamingActive &&
          isDetachedFromBottomRef.current &&
          distanceFromBottomRef.current > 120 &&
          !isChapterSwitch;

        // Always update local content when streaming so AI changes flow in
        // even while the editor is focused.
        if (
          isChapterSwitch ||
          proseStreamingActive ||
          (!editorFocused && !shouldDeferStreamingSync)
        ) {
          localContentRef.current = chapter.content;
          setLocalContent(chapter.content);
        }
      }, [chapter.id, chapter.content, proseStreamingActive]);

      useEffect(() => {
        setLocalTitle(chapter.title);
      }, [chapter.id, chapter.title]);

      const {
        continuations,
        isSuggesting,
        onTriggerSuggestions,
        onAcceptContinuation,
        isSuggestionMode,
        onKeyboardSuggestionAction,
      } = suggestionControls;
      const {
        onAiAction,
        isAiLoading,
        isWritingAvailable = true,
        onCancelAiAction,
        isProseStreaming = false,
      } = aiControls;

      // Keep a stable ref to isProseStreaming so handleScroll (which has [] deps
      // and cannot close over changing props) can read the current value.
      // Assigning to a ref during render is safe — it is the canonical
      // "useLatest" pattern recommended by the React team.
      const isProseStreamingRef = useRef(isProseStreaming);
      isProseStreamingRef.current = isProseStreaming;
      // ── Scroll management ─────────────────────────────────────────────────────
      //
      // Design goals:
      //   1. At bottom → auto-scroll to follow new content.
      //   2. Not at bottom → never programmatically move the user's viewport.
      //   3. No synthetic min-height locks (they create temporary blank space).
      //
      // While prose streams and the user is NOT at bottom, we freeze editor text
      // syncing (see localContent sync effect above). This keeps scroll geometry
      // stable and avoids jump-to-top/clamp artifacts.

      const scrollRafRef = useRef<number | null>(null);

      const handleScroll = useCallback(() => {
        if (scrollRafRef.current !== null) return;
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null;
          if (!scrollContainerRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
          const scrollDelta = scrollTop - prevScrollTopRef.current;
          prevScrollTopRef.current = scrollTop;
          distanceFromBottomRef.current = distanceFromBottom;
          const atBottom = distanceFromBottom < 24;
          isAtBottomRef.current = atBottom;

          // Hysteresis prevents accidental detachment caused by tiny geometry
          // fluctuations while streaming. Only a clear manual scroll-away should
          // pause live content sync.
          if (atBottom) {
            isDetachedFromBottomRef.current = false;
          } else if (scrollDelta < -2 && distanceFromBottom > 96) {
            isDetachedFromBottomRef.current = true;
          } else if (scrollDelta > 2 && distanceFromBottom < 240) {
            // Reattach early when user scrolls back down near the end so
            // streaming resumes before reaching exact bottom.
            isDetachedFromBottomRef.current = false;
          }
        });
      }, []);

      // Follow stream at bottom only.
      useLayoutEffect(() => {
        // Only auto-scroll during streaming — not on every user keystroke.
        if (!isProseStreamingRef.current) return;

        const container = scrollContainerRef.current;
        if (!container) return;

        if (isDetachedFromBottomRef.current) return; // user intentionally scrolled away

        // At bottom: follow new content, but coalesce writes to one per frame.
        if (autoScrollRafRef.current === null) {
          autoScrollRafRef.current = window.requestAnimationFrame(() => {
            autoScrollRafRef.current = null;
            const activeContainer = scrollContainerRef.current;
            if (!activeContainer || isDetachedFromBottomRef.current) return;

            const pinToBottom = () => {
              const maxScrollTop = Math.max(
                0,
                activeContainer.scrollHeight - activeContainer.clientHeight
              );
              if (Math.abs(maxScrollTop - activeContainer.scrollTop) > 1) {
                activeContainer.scrollTop = maxScrollTop;
              }
            };

            pinToBottom();

            // Paragraph boundaries can change final line-wrapping/height one
            // frame later; repin once more to avoid visible down/up jitter.
            if (autoScrollSettleRafRef.current !== null) {
              window.cancelAnimationFrame(autoScrollSettleRafRef.current);
            }
            autoScrollSettleRafRef.current = window.requestAnimationFrame(() => {
              autoScrollSettleRafRef.current = null;
              const settledContainer = scrollContainerRef.current;
              if (!settledContainer || isDetachedFromBottomRef.current) return;
              const maxScrollTop = Math.max(
                0,
                settledContainer.scrollHeight - settledContainer.clientHeight
              );
              if (Math.abs(maxScrollTop - settledContainer.scrollTop) > 1) {
                settledContainer.scrollTop = maxScrollTop;
              }
              distanceFromBottomRef.current =
                settledContainer.scrollHeight -
                settledContainer.scrollTop -
                settledContainer.clientHeight;
              prevScrollTopRef.current = settledContainer.scrollTop;
            });

            isAtBottomRef.current = true;
            isDetachedFromBottomRef.current = false;
          });
        }
      }, [localContent]);

      // Chapter switch: reset scroll so the new chapter starts at the top.
      useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (autoScrollRafRef.current !== null) {
          window.cancelAnimationFrame(autoScrollRafRef.current);
          autoScrollRafRef.current = null;
        }
        if (autoScrollSettleRafRef.current !== null) {
          window.cancelAnimationFrame(autoScrollSettleRafRef.current);
          autoScrollSettleRafRef.current = null;
        }
        container.scrollTop = 0;
        isAtBottomRef.current = true;
        isDetachedFromBottomRef.current = false;
        prevScrollTopRef.current = 0;
        distanceFromBottomRef.current = 0;
      }, [chapter.id]);

      useEffect(() => {
        return () => {
          if (autoScrollRafRef.current !== null) {
            window.cancelAnimationFrame(autoScrollRafRef.current);
            autoScrollRafRef.current = null;
          }
          if (autoScrollSettleRafRef.current !== null) {
            window.cancelAnimationFrame(autoScrollSettleRafRef.current);
            autoScrollSettleRafRef.current = null;
          }
          if (scrollRafRef.current !== null) {
            cancelAnimationFrame(scrollRafRef.current);
            scrollRafRef.current = null;
          }
        };
      }, []);

      // ──────────────────────────────────────────────────────────────────────────

      const writingUnavailableReason =
        'This action is unavailable because no working WRITING model is configured.';

      const handleSuggestionButtonClick = () => {
        if (isSuggesting || isAiLoading) {
          if (isSuggesting) {
            suggestionControls.onCancelSuggestion?.();
          } else if (isAiLoading) {
            onCancelAiAction?.();
          }
          return;
        }
        const cursor = getEditorCaretOffset() ?? localContentRef.current.length;
        onTriggerSuggestions(cursor, localContentRef.current);
      };

      const [isDragging, setIsDragging] = useState(false);

      const handleImageUpload = async (file: File) => {
        try {
          const res = await api.projects.uploadImage(file);
          if (res.ok) {
            insertImageMarkdown(res.filename, res.url);
          }
        } catch (e) {
          notifyError('Failed to upload image', e);
        }
      };

      const insertImageMarkdown = (filename: string, url: string, altText?: string) => {
        const alt = altText || filename;
        if (!isSafeImageUrl(url)) return;
        const md = `![${alt}](${url})`;
        const view = editorViewRef.current;
        if (view) {
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: md },
            selection: { anchor: from + md.length },
          });
          view.focus();
        } else {
          onChange(chapter.id, { content: chapter.content + '\n' + md });
        }
      };

      const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
      };

      const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
      };

      const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            await handleImageUpload(file);
          }
        }
      };

      // Update active formatting state for toolbar affordances.
      // Debounced to avoid expensive format detection on every keystroke.
      const scheduleCheckContext = () => {
        if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current);
        contextDebounceRef.current = setTimeout(checkContext, CONTEXT_DEBOUNCE_MS);
      };

      // Track the last reported formats so we can skip calling onContextChange
      // when the cursor moves but the active format context hasn't changed.
      const lastReportedFormatsRef = useRef<string[]>([]);

      const checkContext = () => {
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
          if (
            isInlineFormatActiveAtSelection(localText, localStart, localEnd, 'italic')
          )
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
          if (
            isInlineFormatActiveAtSelection(
              localText,
              localStart,
              localEnd,
              'subscript'
            )
          )
            formats.push('subscript');
          if (
            isInlineFormatActiveAtSelection(
              localText,
              localStart,
              localEnd,
              'superscript'
            )
          )
            formats.push('superscript');

          lastRawSelectionRef.current = { start: rawStart, end: rawEnd };
        }
        // Only notify parent when the set of active formats actually changes, so
        // App.tsx doesn't re-render on every cursor move within plain text.
        const prev = lastReportedFormatsRef.current;
        const changed =
          prev.length !== formats.length || formats.some((f, i) => f !== prev[i]);
        if (changed) {
          lastReportedFormatsRef.current = formats;
          onContextChange(formats);
        }
      };

      const toggleBlockAtCaret = (type: MarkdownBlockType) => {
        const view = editorViewRef.current;
        if (!view) return;
        const rawText = view.state.doc.toString();
        const rawCaret = view.state.selection.main.head;
        const { nextRawText, nextRawCaret } = toggleBlockAtOffset(
          rawText,
          rawCaret,
          type
        );
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextRawText },
          selection: { anchor: nextRawCaret },
        });
        view.focus();
      };

      const getEditorCaretOffset = useCallback((): number | null => {
        return editorViewRef.current?.state.selection.main.head ?? null;
      }, []);

      const isEditorFocused = useCallback(() => {
        return editorViewRef.current?.hasFocus ?? false;
      }, []);

      const maybeHandleSuggestionHotkey = useCallback(
        (e: KeyboardEvent | React.KeyboardEvent) => {
          const key = 'key' in e ? e.key : '';
          const ctrlKey = 'ctrlKey' in e ? e.ctrlKey : false;
          const metaKey = 'metaKey' in e ? e.metaKey : false;

          const suggestionActive =
            isSuggestionMode || continuations.length > 0 || isSuggesting;

          const editingFocus = isEditorFocused();
          const isArrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            key
          );

          if (isArrow && editingFocus) {
            return false;
          }

          // Trigger: Ctrl+Enter / Cmd+Enter
          if (key === 'Enter' && (ctrlKey || metaKey)) {
            const cursor = getEditorCaretOffset() ?? chapter.content.length;
            e.preventDefault();
            // @ts-ignore - stopPropagation exists on both KeyboardEvent and React synthetic events
            e.stopPropagation?.();
            onKeyboardSuggestionAction('trigger', cursor, localContentRef.current);
            return true;
          }

          if (!suggestionActive) return false;

          if (key === 'ArrowLeft') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction(
              'chooseLeft',
              undefined,
              localContentRef.current
            );
            return true;
          }
          if (key === 'ArrowRight') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction(
              'chooseRight',
              undefined,
              localContentRef.current
            );
            return true;
          }
          if (key === 'ArrowDown') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            const cursor = getEditorCaretOffset() ?? localContentRef.current.length;
            onKeyboardSuggestionAction('regenerate', cursor, localContentRef.current);
            return true;
          }
          if (key === 'ArrowUp') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction('undo');
            return true;
          }
          if (key === 'Escape') {
            if (suggestionActive) {
              e.preventDefault();
              // @ts-ignore
              e.stopPropagation?.();
              onKeyboardSuggestionAction('exit', undefined, localContentRef.current);
              return true;
            }
            return false;
          }

          if (!suggestionActive) return false;

          if (key === 'ArrowLeft') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction(
              'chooseLeft',
              undefined,
              localContentRef.current
            );
            return true;
          }
          if (key === 'ArrowRight') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction(
              'chooseRight',
              undefined,
              localContentRef.current
            );
            return true;
          }
          if (key === 'ArrowDown') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            const cursor = getEditorCaretOffset() ?? localContentRef.current.length;
            onKeyboardSuggestionAction('regenerate', cursor, localContentRef.current);
            return true;
          }
          if (key === 'ArrowUp') {
            e.preventDefault();
            // @ts-ignore
            e.stopPropagation?.();
            onKeyboardSuggestionAction('undo');
            return true;
          }
          return false;
        },
        [
          isSuggestionMode,
          continuations.length,
          isSuggesting,
          onKeyboardSuggestionAction,
          getEditorCaretOffset,
          isEditorFocused,
          // localContentRef is a stable ref; reading .current inside the callback
          // always gives the latest value without requiring it in deps.
        ]
      );

      useEffect(() => {
        // Capture shortcuts globally so suggestion controls remain reachable
        // while focus moves across editor-adjacent UI.
        const onKeyDown = (e: KeyboardEvent) => {
          maybeHandleSuggestionHotkey(e);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [maybeHandleSuggestionHotkey]);

      const format = (type: string) => {
        const view = editorViewRef.current;
        if (!view) return;

        const rawText = view.state.doc.toString();
        const { anchor, head } = view.state.selection.main;
        const rawStart = Math.min(anchor, head);
        const rawEnd = Math.max(anchor, head);

        if (
          type === 'h1' ||
          type === 'h2' ||
          type === 'h3' ||
          type === 'quote' ||
          type === 'ul' ||
          type === 'ol'
        ) {
          toggleBlockAtCaret(type as MarkdownBlockType);
          checkContext();
          return;
        }

        if (
          type === 'bold' ||
          type === 'italic' ||
          type === 'strikethrough' ||
          type === 'subscript' ||
          type === 'superscript'
        ) {
          const { nextRawText, nextStart, nextEnd } = toggleInlineFormatAtSelection(
            rawText,
            rawStart,
            rawEnd,
            type as InlineFormatType
          );
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: nextRawText },
            selection: { anchor: nextStart, head: nextEnd },
          });
          view.focus();
          checkContext();
          return;
        }

        if (type === 'link' || type === 'image') {
          const selectedText = rawText.slice(rawStart, rawEnd);
          const prefix = type === 'image' ? '![' : '[';
          const suffix = `](${selectedText ? '' : 'url'})`;
          const insert = prefix + selectedText + suffix;
          view.dispatch({
            changes: { from: rawStart, to: rawEnd, insert },
            selection: { anchor: rawStart + insert.length },
          });
          view.focus();
          return;
        }

        if (type === 'codeblock') {
          const { nextRawText, nextStart, nextEnd } = insertFencedCodeBlock(
            rawText,
            rawStart,
            rawEnd
          );
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: nextRawText },
            selection: { anchor: nextStart, head: nextEnd },
          });
          view.focus();
          return;
        }

        if (type === 'footnote') {
          const { nextRawText, nextCaret } = insertFootnote(rawText, rawStart);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: nextRawText },
            selection: { anchor: nextCaret },
          });
          view.focus();
          return;
        }
      };

      useImperativeHandle(ref, () => ({
        insertImage: (filename: string, url: string, altText?: string) =>
          insertImageMarkdown(filename, url, altText),
        focus: () => {
          editorViewRef.current?.focus();
        },
        format: (type: string) => format(type),
        jumpToPosition: (start: number, end: number) => {
          const view = editorViewRef.current;
          if (!view) return;
          view.dispatch({
            selection: { anchor: start, head: end },
            scrollIntoView: true,
          });
          view.focus();
        },
      }));

      // Styles & Theme Logic
      let pageBackgroundColor: string;
      let textColor: string;
      let editorContainerBg: string;

      if (settings.theme === 'dark') {
        const b = settings.brightness * 20; // range 10-20% lightness
        pageBackgroundColor = `hsl(24, 10%, ${b}%)`;
        textColor = `rgba(231, 229, 228, ${settings.contrast})`;
        editorContainerBg = 'bg-brand-gray-950';
      } else {
        pageBackgroundColor = `hsl(38, 25%, ${settings.brightness * 100}%)`;
        textColor = `rgba(20, 15, 10, ${settings.contrast})`;
        editorContainerBg =
          settings.theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-950';
      }

      const isMonospace = viewMode === 'raw';
      const fontFamily = isMonospace
        ? '"JetBrains Mono", "Fira Code", monospace'
        : 'Merriweather, serif';
      const titleFontFamily = 'Merriweather, serif'; // Always serif for title

      const commonTextStyle: React.CSSProperties = {
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: '1.75',
        padding: '0px',
        margin: '0',
        border: 'none',
        width: '100%',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      };

      const toolbarBg =
        settings.theme === 'light'
          ? 'bg-brand-gray-50 border-b border-brand-gray-200 shadow-sm'
          : 'bg-brand-gray-900 border-b border-brand-gray-800 shadow-sm';
      const summaryBg =
        settings.theme === 'light'
          ? 'bg-brand-gray-50 border-b border-brand-gray-200'
          : 'bg-brand-gray-900 border-b border-brand-gray-800';
      const inputBg =
        settings.theme === 'light'
          ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-900'
          : 'bg-brand-gray-950 border-brand-gray-800 text-brand-gray-300';
      const textMuted =
        settings.theme === 'light' ? 'text-brand-gray-500' : 'text-brand-gray-500';
      const footerBg =
        settings.theme === 'light'
          ? 'bg-brand-gray-50 border-t border-brand-gray-200'
          : 'bg-brand-gray-900 border-t border-brand-gray-800';
      const hasContinuationOptions = continuations.some(
        (option) => option && option.trim().length > 0
      );
      const shouldShowContinuationPanel = isSuggestionMode || hasContinuationOptions;
      const displayedContinuations =
        continuations.length > 0 ? continuations : Array.from({ length: 2 }, () => '');
      const isChapterEmpty = !chapter.content || chapter.content.trim().length === 0;

      const scrollMainContentToBottom = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
      }, []);

      // We need to scroll in a few scenarios:
      //   * suggestion generation is active and options are changing,
      //   * the continuation panel just became visible.
      //
      // IMPORTANT: prose streaming has its own dedicated bottom-follow logic in
      // the layout effect above. Running this effect at the same time causes two
      // competing scroll writers and can produce up/down flicker at bottom.
      //   * the continuation panel first becomes visible
      //     (`hasContinuationOptions` transitions from false to true), because
      //     its appearance can push the editor content upward and may hide the
      //     current viewport.
      //
      // We deliberately *do not* auto-scroll when the user is editing while the
      // panel is already present; the guard below prevents scrolling unless an
      // LLM action is active or the panel just opened.
      const prevHasContinuationRef = useRef<boolean>(hasContinuationOptions);
      useEffect(() => {
        const justOpened = !prevHasContinuationRef.current && hasContinuationOptions;
        prevHasContinuationRef.current = hasContinuationOptions;

        if (isProseStreaming) return undefined;
        if (!(isAiLoading || isSuggesting || justOpened)) return undefined;

        const raf = window.requestAnimationFrame(() => {
          if (isAtBottomRef.current) {
            scrollMainContentToBottom();
          }
        });
        return () => {
          window.cancelAnimationFrame(raf);
        };
      }, [
        continuations,
        isAiLoading,
        isSuggesting,
        isProseStreaming,
        hasContinuationOptions,
        scrollMainContentToBottom,
      ]);

      return (
        <EditorProvider
          value={{
            theme: settings.theme,
            toolbarBg,
            footerBg,
            textMuted,
            chapterScope: chapter.scope,
            isAiLoading,
            isWritingAvailable,
            writingUnavailableReason,
            isChapterEmpty,
            onAiAction,
            shouldShowContinuationPanel,
            displayedContinuations,
            isSuggesting,
            localContentRef,
            onSuggestionButtonClick: handleSuggestionButtonClick,
            onAcceptContinuation,
            onRegenerate: (cursor, content) =>
              suggestionControls.onKeyboardSuggestionAction?.(
                'regenerate',
                cursor,
                content
              ),
          }}
        >
          <div
            className={`flex flex-col h-full w-full overflow-hidden relative ${editorContainerBg}`}
          >
            <EditorMobileToolbar />

            {/* Main Scrollable Content Area */}
            <div
              ref={scrollContainerRef}
              data-testid="editor-scroll-container"
              className="flex-1 overflow-y-auto px-4 py-6 md:py-8 flex flex-col items-center relative"
              style={{ overflowAnchor: 'none' }}
              onScroll={handleScroll}
            >
              {isDragging && (
                <div className="absolute inset-0 bg-blue-500/10 z-50 flex items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-xl pointer-events-none">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded shadow-lg flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-blue-500" />
                    <span className="font-bold text-blue-500">
                      Drop image to upload
                    </span>
                  </div>
                </div>
              )}
              {/* The Paper - Grows infinitely */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <div
                ref={paperDivRef}
                role="group"
                aria-label="Editor workspace"
                className="relative w-full shadow-2xl transition-colors duration-300 ease-in-out px-4 py-8 md:px-12 md:py-16 mx-auto flex flex-col flex-none min-h-full"
                style={{
                  maxWidth: `${settings.maxWidth}ch`,
                  backgroundColor: pageBackgroundColor,
                  color: textColor,
                  fontSize: `${settings.fontSize}px`,
                  fontFamily: fontFamily,
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Toolbar - Removed Image Icon here */}
                {showInlineTitle && (
                  <div className="flex items-start gap-3 mb-8">
                    <textarea
                      value={localTitle}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\n/g, '');
                        setLocalTitle(val);
                        if (titleDebounceRef.current)
                          clearTimeout(titleDebounceRef.current);
                        titleDebounceRef.current = setTimeout(() => {
                          onChange(chapter.id, { title: val });
                        }, DEBOUNCE_MS);
                      }}
                      rows={1}
                      className="flex-1 bg-transparent font-serif font-bold border-b-2 border-transparent focus:border-brand-gray-400/50 transition-colors outline-none resize-none overflow-hidden"
                      placeholder={
                        chapter.scope === 'story' ? 'Story Title' : 'Chapter Title'
                      }
                      lang={language || 'en'}
                      spellCheck={spellCheck}
                      style={{
                        ...commonTextStyle,
                        fontSize: '1.8em',
                        lineHeight: '1.3',
                        fontFamily: titleFontFamily,
                      }}
                    />
                  </div>
                )}

                {/* Editor Area */}
                <div id="editor-area" className="flex flex-col relative w-full">
                  <div id="codemirror-editor" className="relative w-full flex flex-col">
                    <CodeMirrorEditor
                      ref={editorViewRef}
                      value={localContent}
                      language={language}
                      spellCheck={spellCheck}
                      onOpenSearch={onOpenSearch}
                      onChange={(val: string, isUndoRedo?: boolean) => {
                        setLocalContent(val);
                        localContentRef.current = val;
                        // Clear diff immediately on user input so typed text is
                        // never highlighted as a diff insertion. Keep the baseline
                        // active when undo/redo is used so the diff view works.
                        if (isUndoRedo) {
                          // Undo/redo: always restore the real AI baseline so the
                          // diff view activates, even if localBaseline was already
                          // set to a user-edit baseline by the debounce firing.
                          if (savedBaselineRef.current !== undefined) {
                            setLocalBaseline(savedBaselineRef.current);
                          }
                        } else if (localBaseline !== undefined) {
                          setLocalBaseline(undefined);
                        }
                        scheduleCheckContext();
                        if (contentDebounceRef.current)
                          clearTimeout(contentDebounceRef.current);
                        contentDebounceRef.current = setTimeout(() => {
                          onChange(chapter.id, { content: val });
                        }, DEBOUNCE_MS);
                      }}
                      onSelectionChange={scheduleCheckContext}
                      viewMode={
                        viewMode === 'wysiwyg'
                          ? 'visual'
                          : viewMode === 'markdown'
                            ? 'markdown'
                            : 'plain'
                      }
                      showWhitespace={showWhitespace}
                      showDiff={settings.showDiff}
                      baselineValue={localBaseline}
                      searchHighlightRanges={chapterSearchHighlightRanges}
                      enterBehavior={viewMode === 'raw' ? 'newline' : 'softbreak'}
                      placeholder={
                        chapter.scope === 'story'
                          ? 'Start writing your story here...'
                          : 'Start writing your chapter here...'
                      }
                      className="w-full"
                      style={{
                        ...commonTextStyle,
                        caretColor: textColor,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 h-16 w-full"></div>
            </div>

            {/* Persistent Footer */}
            <EditorSuggestionPanel />
          </div>
        </EditorProvider>
      );
    }
  )
);

Editor.displayName = 'Editor';
