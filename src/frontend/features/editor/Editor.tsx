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
  useImperativeHandle,
  useCallback,
  useState,
} from 'react';
import { EditorView } from '@codemirror/view';
import { Chapter, EditorSettings, ViewMode } from '../../types';
import {
  Sparkles,
  Loader2,
  SplitSquareHorizontal,
  RefreshCw,
  PenLine,
  Wand2,
  FileEdit,
  BookOpen,
  Image as ImageIcon,
  Trash2,
  X,
  Upload,
} from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { notifyError } from '../../services/errorNotifier';
// @ts-ignore
import { marked } from 'marked';
// @ts-ignore
import TurndownService from 'turndown';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import {
  applyInlineFormatAtSelection,
  getBlockType,
  getLineAtOffset,
  isInlineFormatActiveAtSelection,
  resolveInlineSelection,
  toggleBlockAtOffset,
  toggleInlineFormatAtSelection,
  InlineFormatType,
  MarkdownBlockType,
  TextSelectionRange,
} from './markdownToolbarUtils';

interface EditorProps {
  chapter: Chapter;
  settings: EditorSettings;
  viewMode: ViewMode;
  showWhitespace?: boolean;
  onToggleShowWhitespace?: () => void;
  onChange: (id: string, updates: Partial<Chapter>) => void;
  suggestionControls: {
    continuations: string[];
    isSuggesting: boolean;
    onTriggerSuggestions: () => void;
    onCancelSuggestion?: () => void;
    onAcceptContinuation: (text: string) => void;
    isSuggestionMode: boolean;
    onKeyboardSuggestionAction: (
      action: 'trigger' | 'chooseLeft' | 'chooseRight' | 'regenerate' | 'undo' | 'exit',
      cursor?: number
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
  };
  onContextChange?: (formats: string[]) => void;
}

interface TurndownServiceLike {
  turndown: (html: string) => string;
}

export interface EditorHandle {
  insertImage: (filename: string, url: string, altText?: string) => void;
  focus: () => void;
  format: (type: string) => void;
  openImageManager?: () => void;
}

// Inject visible whitespace markers into the WYSIWYG contentEditable DOM.
// Replaces space characters in text nodes (skipping code/pre blocks and
// existing marker spans) with a visible middle-dot span.  The injected
// element carries data-ws-marker so turndown can strip it back to a space.
const injectWsMarkersWysiwyg = (root: HTMLElement): void => {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = (node as Text).parentElement;
      // Skip nodes inside existing WS marker spans
      if (parent?.dataset.wsMarker) return NodeFilter.FILTER_SKIP;
      // Skip text inside <code> or <pre>
      let el: Element | null = parent;
      while (el && el !== root) {
        if (el.tagName === 'CODE' || el.tagName === 'PRE')
          return NodeFilter.FILTER_SKIP;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    if (!text.includes(' ')) continue;
    const frag = document.createDocumentFragment();
    let i = 0;
    for (let j = 0; j <= text.length; j++) {
      if (j === text.length || text[j] === ' ') {
        if (j > i) frag.appendChild(document.createTextNode(text.slice(i, j)));
        if (j < text.length) {
          const span = document.createElement('span');
          span.dataset.wsMarker = '1';
          span.setAttribute('aria-hidden', 'true');
          span.textContent = '\u00b7'; // MIDDLE DOT
          span.style.opacity = '0.5';
          span.style.pointerEvents = 'none';
          span.style.userSelect = 'none';
          frag.appendChild(span);
        }
        i = j + 1;
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
};

export const Editor = React.forwardRef<EditorHandle, EditorProps>(
  (
    {
      chapter,
      settings,
      viewMode,
      showWhitespace,
      onToggleShowWhitespace,
      onChange,
      suggestionControls,
      aiControls,
      onContextChange,
    },
    ref
  ) => {
    // CodeMirror EditorView for Raw / Markdown modes
    const editorViewRef = useRef<EditorView | null>(null);
    const lastRawSelectionRef = useRef<TextSelectionRange | null>(null);
    const lastWysiwygSelectionRef = useRef<Range | null>(null);
    const wysiwygRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef<boolean>(true);
    // Debounce timers for API-level persistence so every keystroke does not
    // trigger a network request.  Display updates remain synchronous.
    const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DEBOUNCE_MS = 300;

    // Local content/title state so the editor div always gets the latest
    // typed value immediately, while the parent onChange (API call) is debounced.
    const [localContent, setLocalContent] = useState(chapter.content);
    const [localTitle, setLocalTitle] = useState(chapter.title);

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
      if (isChapterSwitch || !editorFocused) {
        setLocalContent(chapter.content);
      }
    }, [chapter.id, chapter.content]);

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
    } = aiControls;

    // Detect if we are at the bottom of the scroll container
    const handleScroll = useCallback(() => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // Use a small buffer (5px) for "at bottom" detection
      const atBottom = scrollHeight - scrollTop - clientHeight < 5;
      isAtBottomRef.current = atBottom;
    }, []);

    // Effect to scroll to bottom if we were at the bottom when content changed or AI is loading
    useEffect(() => {
      if (isAiLoading && isAtBottomRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, [chapter.content, isAiLoading]);
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
      onTriggerSuggestions();
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
      if (viewMode === 'wysiwyg') {
        const html = `<img src="${url}" alt="${alt}" />`;
        if (wysiwygRef.current && wysiwygRef.current.contains(document.activeElement)) {
          document.execCommand('insertHTML', false, html);
          wysiwygRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (lastWysiwygSelectionRef.current) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(lastWysiwygSelectionRef.current);
          document.execCommand('insertHTML', false, html);
          wysiwygRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const markdown = `\n![${alt}](${url})`;
          onChange(chapter.id, { content: chapter.content + markdown });
        }
      } else {
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

    const turndownService = useRef<TurndownServiceLike | null>(null);
    if (!turndownService.current) {
      const td = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
      });
      // Preserve soft line-breaks: a bare <br> (not inside a pre block)
      // round-trips as '\n' so that switching modes does not collapse newlines
      // into nothing.  With marked `breaks: true` both bare '\n' and '  \n'
      // render as <br> in WYSIWYG, so the visual result is always lossless.
      td.addRule('softBreak', {
        filter: (node: any) =>
          node.nodeName === 'BR' && node.parentNode?.nodeName !== 'PRE',
        replacement: () => '\n',
      });
      // Strip WS marker spans back to a plain space during roundtrip
      td.addRule('wsMarker', {
        filter: (node: any) =>
          node.nodeName === 'SPAN' && node.getAttribute('data-ws-marker') === '1',
        replacement: () => ' ',
      });
      turndownService.current = td;
    }

    // Keep WYSIWYG DOM synchronized when content changes externally.
    // Use `breaks: true` so single newlines in the markdown source are
    // rendered as <br> rather than being collapsed — this makes the
    // marked → turndown round-trip lossless for soft line-breaks.
    useEffect(() => {
      if (viewMode === 'wysiwyg' && wysiwygRef.current) {
        if (document.activeElement !== wysiwygRef.current) {
          wysiwygRef.current.innerHTML = marked.parse(chapter.content, {
            breaks: true,
          }) as string;
          if (showWhitespace) {
            injectWsMarkersWysiwyg(wysiwygRef.current);
          }
        }
      }
    }, [chapter.content, viewMode, chapter.id, showWhitespace]);

    const handleWysiwygInput = () => {
      if (wysiwygRef.current) {
        const html = wysiwygRef.current.innerHTML;
        const md = turndownService.current.turndown(html);
        if (md !== chapter.content) {
          onChange(chapter.id, { content: md });
        }
        checkContext();
      }
    };

    // Re-inject WS markers after the user finishes editing.
    // While the element is focused, markers are absent so typing isn't
    // disrupted; on blur we re-render and re-inject for a clean view.
    const handleWysiwygBlur = () => {
      if (!showWhitespace || !wysiwygRef.current) return;
      const currentMd =
        turndownService.current?.turndown(wysiwygRef.current.innerHTML) ?? '';
      wysiwygRef.current.innerHTML = marked.parse(currentMd, {
        breaks: true,
      }) as string;
      injectWsMarkersWysiwyg(wysiwygRef.current);
    };

    // Update active formatting state for toolbar affordances.
    const checkContext = () => {
      if (!onContextChange) return;

      const formats: string[] = [];
      const isWysiwyg = viewMode === 'wysiwyg';

      if (isWysiwyg) {
        if (document.queryCommandState('bold')) formats.push('bold');
        if (document.queryCommandState('italic')) formats.push('italic');
        if (document.queryCommandState('insertUnorderedList')) formats.push('ul');
        if (document.queryCommandState('insertOrderedList')) formats.push('ol');
        const formatBlock = document.queryCommandValue('formatBlock');
        if (formatBlock === 'h1') formats.push('h1');
        if (formatBlock === 'h2') formats.push('h2');
        if (formatBlock === 'h3') formats.push('h3');
        if (formatBlock === 'blockquote') formats.push('quote');
      } else {
        const view = editorViewRef.current;
        if (view) {
          const rawText = view.state.doc.toString();
          const { anchor, head } = view.state.selection.main;
          const rawCaret = head;
          const rawStart = Math.min(anchor, head);
          const rawEnd = Math.max(anchor, head);

          const line = getLineAtOffset(rawText, rawCaret);
          const blockType = getBlockType(line);
          if (blockType) formats.push(blockType);

          if (isInlineFormatActiveAtSelection(rawText, rawStart, rawEnd, 'bold'))
            formats.push('bold');
          if (isInlineFormatActiveAtSelection(rawText, rawStart, rawEnd, 'italic'))
            formats.push('italic');

          lastRawSelectionRef.current = { start: rawStart, end: rawEnd };
        }
      }
      onContextChange(formats);
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
      if (viewMode === 'raw' || viewMode === 'markdown') {
        return editorViewRef.current?.state.selection.main.head ?? null;
      }
      if (viewMode === 'wysiwyg') {
        // DOM-to-markdown offset mapping is ambiguous in WYSIWYG mode;
        // use content-end fallback while still requiring in-editor selection.
        const inside =
          !!wysiwygRef.current &&
          !!window.getSelection()?.anchorNode &&
          wysiwygRef.current.contains(window.getSelection()!.anchorNode);
        return inside ? chapter.content.length : null;
      }
      return null;
    }, [viewMode, chapter.content.length]);

    const maybeHandleSuggestionHotkey = useCallback(
      (e: KeyboardEvent | React.KeyboardEvent) => {
        const key = 'key' in e ? e.key : '';
        const ctrlKey = 'ctrlKey' in e ? e.ctrlKey : false;
        const metaKey = 'metaKey' in e ? e.metaKey : false;

        const suggestionActive =
          isSuggestionMode || continuations.length > 0 || isSuggesting;

        // Trigger: Ctrl+Enter / Cmd+Enter
        if (key === 'Enter' && (ctrlKey || metaKey)) {
          const cursor = getEditorCaretOffset() ?? chapter.content.length;
          e.preventDefault();
          // @ts-ignore - stopPropagation exists on both KeyboardEvent and React synthetic events
          e.stopPropagation?.();
          onKeyboardSuggestionAction('trigger', cursor);
          return true;
        }

        if (!suggestionActive) return false;

        if (key === 'ArrowLeft') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseLeft');
          return true;
        }
        if (key === 'ArrowRight') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseRight');
          return true;
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('regenerate');
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
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('exit');
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

    useEffect(() => {
      if (viewMode !== 'wysiwyg') return;
      const onSelectionChange = () => {
        if (wysiwygRef.current) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (wysiwygRef.current.contains(range.commonAncestorContainer)) {
              lastWysiwygSelectionRef.current = range.cloneRange();
            }
          }
        }
      };
      document.addEventListener('selectionchange', onSelectionChange);
      return () => document.removeEventListener('selectionchange', onSelectionChange);
    }, [viewMode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (maybeHandleSuggestionHotkey(e)) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setTimeout(checkContext, 0);
      }

      // Visual mode: intercept Enter to implement the soft-break / paragraph
      // semantics that match MD mode:
      //  • Plain Enter  → soft line-break (inserts <br>, stored as '\n')
      //  • Shift+Enter  → new paragraph   (stored as '\n\n')
      // We leave the browser default Enter-in-paragraph behaviour alone;
      // instead we always insert a <br> and let turndown (with its softBreak
      // rule) convert it back to a single '\n'.  A second Enter therefore
      // inserts another <br> which becomes a second '\n' — markdown '\n\n' —
      // which is a paragraph in readback.
      if (viewMode === 'wysiwyg' && e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        handleWysiwygInput();
      }
    };

    const withRestoredWysiwygSelection = (action: () => void) => {
      const root = wysiwygRef.current;
      if (!root) return;

      const selection = window.getSelection();
      const savedRange =
        selection && selection.rangeCount > 0
          ? selection.getRangeAt(0).cloneRange()
          : null;
      const hasEditorSelection =
        !!savedRange && root.contains(savedRange.startContainer);

      root.focus();

      if (hasEditorSelection && savedRange) {
        selection?.removeAllRanges();
        selection?.addRange(savedRange);
      }

      action();
    };

    const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

    const selectWordAtCollapsedCaret = (): boolean => {
      const root = wysiwygRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      if (!range.collapsed || !root.contains(range.startContainer)) return false;
      if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;

      const textNode = range.startContainer as Text;
      const text = textNode.textContent || '';
      const offset = range.startOffset;
      if (!isWordChar(text[offset])) return false;

      let start = offset;
      let end = offset;

      while (start > 0 && isWordChar(text[start - 1])) start -= 1;
      while (end < text.length && isWordChar(text[end])) end += 1;
      if (start === end) return false;

      const wordRange = document.createRange();
      wordRange.setStart(textNode, start);
      wordRange.setEnd(textNode, end);
      selection.removeAllRanges();
      selection.addRange(wordRange);
      return true;
    };

    const applyInlineWysiwygFormat = (command: 'bold' | 'italic') => {
      withRestoredWysiwygSelection(() => {
        const selection = window.getSelection();
        const hasSelection = !!selection && selection.rangeCount > 0;
        const isCollapsed = hasSelection ? selection!.getRangeAt(0).collapsed : true;

        if (isCollapsed) {
          // Match expected MD-like ergonomics in visual mode:
          // if caret is inside a word, format that word; otherwise insert empty style toggle.
          selectWordAtCollapsedCaret();
        }

        document.execCommand(command);
      });
    };

    const format = (type: string) => {
      if (viewMode === 'wysiwyg') {
        switch (type) {
          case 'bold':
            applyInlineWysiwygFormat('bold');
            break;
          case 'italic':
            applyInlineWysiwygFormat('italic');
            break;
          case 'h1':
            withRestoredWysiwygSelection(() =>
              document.execCommand('formatBlock', false, 'H1')
            );
            break;
          case 'h2':
            withRestoredWysiwygSelection(() =>
              document.execCommand('formatBlock', false, 'H2')
            );
            break;
          case 'h3':
            withRestoredWysiwygSelection(() =>
              document.execCommand('formatBlock', false, 'H3')
            );
            break;
          case 'quote':
            withRestoredWysiwygSelection(() =>
              document.execCommand('formatBlock', false, 'BLOCKQUOTE')
            );
            break;
          case 'ul':
            withRestoredWysiwygSelection(() =>
              document.execCommand('insertUnorderedList')
            );
            break;
          case 'ol':
            withRestoredWysiwygSelection(() =>
              document.execCommand('insertOrderedList')
            );
            break;
          case 'link': {
            const url = prompt('Enter URL:');
            if (url !== null)
              withRestoredWysiwygSelection(() =>
                document.execCommand('createLink', false, url)
              );
            break;
          }
          case 'image': {
            const src = prompt('Enter Image URL:');
            if (src !== null)
              withRestoredWysiwygSelection(() =>
                document.execCommand('insertImage', false, src)
              );
            break;
          }
        }
        handleWysiwygInput();
        checkContext();
      } else {
        // Raw / Markdown mode formatting via CodeMirror dispatch
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

        if (type === 'bold' || type === 'italic') {
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
        }
      }
    };

    useImperativeHandle(ref, () => ({
      insertImage: (filename: string, url: string, altText?: string) =>
        insertImageMarkdown(filename, url, altText),
      focus: () => {
        if (viewMode === 'wysiwyg') wysiwygRef.current?.focus();
        else editorViewRef.current?.focus();
      },
      format: (type: string) => format(type),
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

    const scrollMainContentToBottom = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    }, []);

    // We need to scroll in a few scenarios:
    //   * the LLM is in the middle of loading or suggesting content, since
    //     new text streaming at the bottom should always be visible.  By
    //     including `continuations` in the dependency list we rerun the effect
    //     each time the options array is updated; while `isSuggesting` is true
    //     this ensures the viewport keeps up with an expanding suggestion.
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
      chapter.content,
      continuations,
      isAiLoading,
      isSuggesting,
      hasContinuationOptions,
      scrollMainContentToBottom,
    ]);

    return (
      <div
        className={`flex flex-col h-full w-full overflow-hidden relative ${editorContainerBg}`}
      >
        <div className={`flex-none z-20 xl:hidden ${toolbarBg}`}>
          <div className="h-14 flex items-center justify-between px-4">
            <div className="flex items-center space-x-3">
              {/* Mobile Toolbar Left Items */}
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`flex items-center rounded-md p-1 space-x-1 ${
                  settings.theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-800'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase px-2 ${textMuted}`}>
                  Chapter AI
                </span>
                <div
                  className={`w-px h-4 ${
                    settings.theme === 'light'
                      ? 'bg-brand-gray-300'
                      : 'bg-brand-gray-700'
                  }`}
                ></div>
                <Button
                  theme={settings.theme}
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => onAiAction('chapter', 'extend')}
                  disabled={isAiLoading || !isWritingAvailable}
                  icon={<Wand2 size={12} />}
                  title={
                    !isWritingAvailable
                      ? writingUnavailableReason
                      : 'Extend Chapter (WRITING model)'
                  }
                >
                  Extend
                </Button>
                <Button
                  theme={settings.theme}
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => onAiAction('chapter', 'rewrite')}
                  disabled={isAiLoading || !isWritingAvailable}
                  icon={<FileEdit size={12} />}
                  title={
                    !isWritingAvailable
                      ? writingUnavailableReason
                      : 'Rewrite Chapter (WRITING model)'
                  }
                >
                  Rewrite
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Scrollable Content Area */}
        <div
          ref={scrollContainerRef}
          data-testid="editor-scroll-container"
          className="flex-1 overflow-y-auto px-4 py-6 md:py-8 flex flex-col items-center relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onScroll={handleScroll}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-blue-500/10 z-50 flex items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-xl pointer-events-none">
              <div className="bg-white dark:bg-gray-800 p-4 rounded shadow-lg flex flex-col items-center">
                <Upload className="w-8 h-8 mb-2 text-blue-500" />
                <span className="font-bold text-blue-500">Drop image to upload</span>
              </div>
            </div>
          )}
          {/* The Paper - Grows infinitely */}
          <div
            className="relative w-full shadow-2xl transition duration-300 ease-in-out px-4 py-8 md:px-12 md:py-16 mx-auto flex flex-col flex-none"
            style={{
              maxWidth: `${settings.maxWidth}ch`,
              backgroundColor: pageBackgroundColor,
              color: textColor,
              fontSize: `${settings.fontSize}px`,
              fontFamily: fontFamily,
              // At least fill the available scroll area height, but always grow with content.
              minHeight: '100%',
            }}
          >
            {/* Toolbar - Removed Image Icon here */}
            {/* Title Input */}
            <textarea
              value={localTitle}
              onChange={(e) => {
                const val = e.target.value.replace(/\n/g, '');
                setLocalTitle(val);
                if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
                titleDebounceRef.current = setTimeout(() => {
                  onChange(chapter.id, { title: val });
                }, DEBOUNCE_MS);
              }}
              rows={1}
              className="w-full bg-transparent font-serif font-bold mb-8 border-b-2 border-transparent focus:border-brand-gray-400/50 transition-colors outline-none resize-none overflow-hidden"
              placeholder="Chapter Title"
              spellCheck={false}
              style={{
                ...commonTextStyle,
                fontSize: '1.8em',
                lineHeight: '1.3',
                fontFamily: titleFontFamily,
              }}
            />

            {/* Editor Area */}
            <div id="editor-area" className="flex flex-col relative w-full">
              {/* WYSIWYG View */}
              <div
                id="wysiwyg-editor"
                ref={wysiwygRef}
                contentEditable
                onInput={handleWysiwygInput}
                onBlur={handleWysiwygBlur}
                onMouseUp={checkContext}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => {
                  checkContext();
                }}
                className={`prose-editor outline-none w-full ${
                  viewMode === 'wysiwyg' ? 'block' : 'hidden'
                }${showWhitespace ? ' prose-editor-ws' : ''}`}
                style={{ ...commonTextStyle, whiteSpace: 'normal' }}
              />

              {/* Raw / Markdown View */}
              {(viewMode === 'raw' || viewMode === 'markdown') && (
                <div id="raw-markdown-editor" className="relative w-full flex flex-col">
                  <CodeMirrorEditor
                    ref={editorViewRef}
                    value={localContent}
                    onChange={(val: string) => {
                      setLocalContent(val);
                      checkContext();
                      if (contentDebounceRef.current)
                        clearTimeout(contentDebounceRef.current);
                      contentDebounceRef.current = setTimeout(() => {
                        onChange(chapter.id, { content: val });
                      }, DEBOUNCE_MS);
                    }}
                    onSelectionChange={checkContext}
                    mode={viewMode === 'markdown' ? 'markdown' : 'plain'}
                    showWhitespace={showWhitespace}
                    enterBehavior={viewMode === 'markdown' ? 'softbreak' : 'newline'}
                    placeholder="Start writing your chapter here..."
                    className="w-full"
                    style={{
                      ...commonTextStyle,
                      caretColor: textColor,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 h-16 w-full"></div>
        </div>

        {/* Persistent Footer */}
        <div
          className={`flex-shrink-0 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${footerBg}`}
        >
          {hasContinuationOptions ? (
            <div className="p-4 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center space-x-2 text-brand-500">
                  <SplitSquareHorizontal size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Choose a continuation
                  </span>
                </div>
                <button
                  onClick={() => onAcceptContinuation('')}
                  className={`${textMuted} hover:text-brand-gray-800 text-xs`}
                >
                  Dismiss
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                {continuations.map((option, idx) => {
                  if (!option || option.trim().length === 0) {
                    return null;
                  }
                  return (
                    <div
                      key={idx}
                      onClick={() => onAcceptContinuation(option)}
                      className={`group relative p-5 rounded-lg border cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                        settings.theme === 'light'
                          ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 hover:border-brand-300'
                          : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-750 hover:border-brand-500/50'
                      }`}
                    >
                      <div
                        className={`font-serif text-sm leading-relaxed ${
                          settings.theme === 'light'
                            ? 'text-brand-gray-800'
                            : 'text-brand-gray-300 group-hover:text-brand-gray-200'
                        }`}
                      >
                        {option}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 flex justify-center items-center space-x-3">
              <button
                onClick={handleSuggestionButtonClick}
                disabled={!isWritingAvailable}
                className={`group flex items-center space-x-3 px-6 py-3 rounded-full border transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  settings.theme === 'light'
                    ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 text-brand-gray-600'
                    : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-700 hover:border-brand-500/30 text-brand-gray-300'
                }`}
                title={
                  !isWritingAvailable
                    ? writingUnavailableReason
                    : isSuggesting || isAiLoading
                      ? 'Stop current AI generation'
                      : 'Get AI Suggestions (WRITING model)'
                }
              >
                {isSuggesting || isAiLoading ? (
                  <>
                    <Loader2 className="animate-spin text-violet-500" size={18} />
                    <span className="font-medium text-sm text-violet-600 dark:text-violet-400">
                      Writing...
                    </span>
                  </>
                ) : (
                  <>
                    <div className="bg-violet-100 dark:bg-violet-900/30 p-1 rounded-md text-violet-600 dark:text-violet-400">
                      <Sparkles size={16} />
                    </div>
                    <span className="font-medium text-sm">Suggest next paragraph</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

Editor.displayName = 'Editor';
