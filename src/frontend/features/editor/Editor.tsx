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
import { useSearchHighlight } from '../search/SearchHighlightContext';
// @ts-ignore
import { marked } from 'marked';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { createEditorTurndownService } from './turndown';
import { configureMarked } from './configureMarked';
import { diff_match_patch } from 'diff-match-patch';
import {
  applyInlineFormatAtSelection,
  getBlockType,
  getLineAtOffset,
  insertFencedCodeBlock,
  insertFootnote,
  isInlineFormatActiveAtSelection,
  resolveInlineSelection,
  toggleBlockAtOffset,
  toggleInlineFormatAtSelection,
  InlineFormatType,
  MarkdownBlockType,
  TextSelectionRange,
} from './markdownToolbarUtils';

// URL sanitizer helpers for createLink/insertImage to avoid passing
// unsafe protocols directly into document.execCommand.
export const isSafeLinkUrl = (url: string): boolean => {
  const value = url?.trim();
  if (!value) return false;

  // Block known dangerous protocols early.
  if (/^(?:javascript|data|vbscript):/i.test(value)) return false;

  // Allow http(s), ftp, mailto, and path-based links.
  if (/^(?:https?:\/\/|ftp:\/\/|mailto:)/i.test(value)) {
    if (/^(?:https?:\/\/|ftp:\/\/)/i.test(value)) {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
    return true;
  }

  return (
    (value.startsWith('/') && !value.startsWith('//')) ||
    value.startsWith('./') ||
    value.startsWith('../')
  );
};

export const isSafeImageUrl = (src: string): boolean => {
  const value = src?.trim();
  if (!value) return false;

  if (/^(?:javascript|data|vbscript):/i.test(value)) return false;

  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
    } catch {
      return false;
    }
    return true;
  }

  return (
    (value.startsWith('/') && !value.startsWith('//')) ||
    value.startsWith('./') ||
    value.startsWith('../')
  );
};

export const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const TAB_PLACEHOLDER = '\uF000';

// Configure marked extensions once (subscript, superscript, footnotes).
configureMarked();

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

interface TurndownServiceLike {
  turndown: (html: string) => string;
}

export interface EditorHandle {
  insertImage: (filename: string, url: string, altText?: string) => void;
  focus: () => void;
  format: (type: string) => void;
  openImageManager?: () => void;
  jumpToPosition: (start: number, end: number) => void;
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
    if (!text.includes(' ') && !text.includes('\t')) continue;
    const frag = document.createDocumentFragment();
    let i = 0;
    for (let j = 0; j <= text.length; j++) {
      if (j === text.length || text[j] === ' ' || text[j] === '\t') {
        if (j > i) frag.appendChild(document.createTextNode(text.slice(i, j)));
        if (j < text.length) {
          const span = document.createElement('span');
          span.dataset.wsMarker = '1';
          const isTab = text[j] === '\t';
          if (isTab) {
            span.dataset.wsTab = '1';
          }
          span.setAttribute('aria-hidden', 'true');
          span.className = 'cm-ws-marker';
          span.textContent = isTab ? '→' : '\u00b7';
          span.style.display = 'inline-block';
          span.style.minWidth = '1ch';
          span.style.width = '1ch';
          span.style.textAlign = 'center';
          span.style.verticalAlign = 'baseline';
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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightTextNode = (textNode: Text, regex: RegExp, className: string): void => {
  const text = textNode.nodeValue;
  if (!text) return;
  const match = regex.exec(text);
  if (!match) return;

  const before = document.createTextNode(text.slice(0, match.index));
  const mark = document.createElement('span');
  mark.className = className;
  mark.textContent = match[0];
  const after = document.createTextNode(text.slice(match.index + match[0].length));

  const parent = textNode.parentNode;
  if (!parent) return;
  parent.insertBefore(before, textNode);
  parent.insertBefore(mark, textNode);
  parent.insertBefore(after, textNode);
  parent.removeChild(textNode);

  regex.lastIndex = 0;
  highlightTextNode(after, regex, className);
};

const highlightWysiwygSearchMatches = (root: HTMLElement, terms: string[]): void => {
  if (terms.length === 0) return;

  const uniqueTerms = Array.from(new Set(terms.filter((t) => t.trim() !== '')));
  if (uniqueTerms.length === 0) return;

  const regex = new RegExp(uniqueTerms.map(escapeRegExp).join('|'), 'g');

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.search-highlight')) continue;
    highlightTextNode(node as Text, regex, 'search-highlight');
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
    // CodeMirror EditorView for Raw / Markdown modes
    const editorViewRef = useRef<EditorView | null>(null);
    const lastRawSelectionRef = useRef<TextSelectionRange | null>(null);
    const lastWysiwygSelectionRef = useRef<Range | null>(null);
    const wysiwygRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
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
    const { getRanges, getMatchTexts } = useSearchHighlight();
    const chapterSearchHighlightRanges = getRanges(
      'chapter_content',
      String(chapter.id),
      'content'
    );
    const chapterSearchHighlightTexts = getMatchTexts(
      'chapter_content',
      String(chapter.id),
      'content'
    );
    // Debounce timers for API-level persistence so every keystroke does not
    // trigger a network request.  Display updates remain synchronous.
    const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DEBOUNCE_MS = 300;

    // Local content/title state so the editor div always gets the latest
    // typed value immediately, while the parent onChange (API call) is debounced.
    const [localContent, setLocalContent] = useState(chapter.content);
    const [localTitle, setLocalTitle] = useState(chapter.title);

    const [localBaseline, setLocalBaseline] = useState<string | undefined>(
      baselineContent
    );

    useEffect(() => {
      setLocalBaseline(baselineContent);
    }, [baselineContent]);

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
    // "useLatest" refs so effect cleanup functions always call current values
    // without needing unstable props in their dependency arrays.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const chapterContentRef = useRef(chapter.content);
    chapterContentRef.current = chapter.content;
    const chapterIdRef = useRef(chapter.id);
    chapterIdRef.current = chapter.id;
    const baselineContentRef = useRef(baselineContent);
    baselineContentRef.current = baselineContent;
    const localContentRef = useRef(localContent);
    localContentRef.current = localContent;

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

    const handleScroll = useCallback(() => {
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
    }, []);

    // Follow stream at bottom only.
    useLayoutEffect(() => {
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
    }, [chapter.content]);

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
      const cursor = getEditorCaretOffset() ?? localContent.length;
      onTriggerSuggestions(cursor, localContent);
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
        if (!isSafeImageUrl(url)) {
          // Avoid inserting malicious URI contents into execCommand.
          return;
        }

        const safeUrl = escapeHtmlAttribute(url);
        const safeAlt = escapeHtmlAttribute(alt);
        const html = `<img src="${safeUrl}" alt="${safeAlt}" />`;

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
      turndownService.current = createEditorTurndownService();
    }

    // Keep WYSIWYG DOM synchronized when content changes externally.
    // Use `breaks: true` so single newlines in the markdown source are
    // rendered as <br> rather than being collapsed — this makes the
    // marked → turndown round-trip lossless for soft line-breaks.
    useEffect(() => {
      if (viewMode === 'wysiwyg' && wysiwygRef.current) {
        // Don't interrupt the user's view when streaming and they've scrolled up.
        if (isProseStreaming && !isAtBottomRef.current) {
          return;
        }

        // We sync if not focused OR if we are actively streaming from AI
        if (document.activeElement !== wysiwygRef.current || proseStreamingActive) {
          let contentToRender = chapter.content;
          if (
            settings.showDiff &&
            localBaseline != null &&
            localBaseline !== chapter.content
          ) {
            const diffs = new diff_match_patch().diff_main(
              localBaseline,
              chapter.content
            );
            new diff_match_patch().diff_cleanupSemantic(diffs);
            let highlightedMd = '';
            for (const [op, text] of diffs) {
              if (op === 0) {
                highlightedMd += text;
              } else if (op === 1) {
                highlightedMd += `<span class="diff-inserted">${text}</span>`;
              } else if (op === -1) {
                highlightedMd += `<span class="diff-deleted">${text}</span>`;
              }
            }
            contentToRender = highlightedMd;
          }

          const parsedHtml = marked.parse(
            contentToRender.replace(/\t/g, TAB_PLACEHOLDER),
            {
              breaks: true,
            }
          ) as string;
          wysiwygRef.current.innerHTML = parsedHtml.replaceAll(TAB_PLACEHOLDER, '&#9;');
          if (showWhitespace) {
            injectWsMarkersWysiwyg(wysiwygRef.current);
          }

          if (chapterSearchHighlightTexts.length > 0) {
            highlightWysiwygSearchMatches(
              wysiwygRef.current,
              chapterSearchHighlightTexts
            );
          }

          // Apply diff background styles to the injected spans.
          const diffSpans = wysiwygRef.current.querySelectorAll('.diff-inserted');
          diffSpans.forEach((span) => {
            const htmlSpan = span as HTMLElement;
            htmlSpan.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
            htmlSpan.style.borderBottom = '1px solid rgba(34, 197, 94, 0.4)';
          });

          const deletedSpans = wysiwygRef.current.querySelectorAll('.diff-deleted');
          deletedSpans.forEach((span) => {
            const htmlSpan = span as HTMLElement;
            htmlSpan.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            htmlSpan.style.borderBottom = '1px solid rgba(239, 68, 68, 0.4)';
            htmlSpan.style.textDecoration = 'line-through';
            htmlSpan.style.opacity = '0.7';
          });
        }
      }
    }, [
      chapter.content,
      viewMode,
      chapter.id,
      showWhitespace,
      isProseStreaming,
      localBaseline,
    ]);

    const handleWysiwygInput = (e?: React.FormEvent<HTMLDivElement>) => {
      if (e && !e.nativeEvent.isTrusted) return;
      setLocalBaseline(undefined); // clear diff immediately on user input
      if (wysiwygRef.current) {
        const html = wysiwygRef.current.innerHTML;
        const turndown = turndownService.current;
        if (!turndown) return;
        const md = turndown.turndown(html);
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
      if (!wysiwygRef.current) return;

      const currentMd =
        turndownService.current?.turndown(wysiwygRef.current.innerHTML) ?? '';

      if (currentMd !== chapter.content) {
        onChange(chapter.id, { content: currentMd });
      }

      if (!showWhitespace) return;

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
        // Walk the DOM from the selection anchor to detect formatting applied
        // either via execCommand or via markdown→HTML rendering.  queryCommandState
        // is unreliable for elements that were not inserted by execCommand itself
        // (e.g. <sub>/<sup>/<del> coming from marked).
        const selAnchor = window.getSelection()?.anchorNode ?? null;
        const isInsideTag = (tags: string[]): boolean => {
          let node: Node | null = selAnchor;
          while (node && node !== wysiwygRef.current) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              tags.includes((node as Element).tagName)
            )
              return true;
            node = node.parentNode;
          }
          return false;
        };

        if (document.queryCommandState('bold')) formats.push('bold');
        if (document.queryCommandState('italic')) formats.push('italic');
        // strikeThrough: prefer DOM walk so <del> from markdown is detected.
        if (isInsideTag(['DEL', 'S', 'STRIKE'])) formats.push('strikethrough');
        // subscript/superscript: queryCommandState is unreliable for <sub>/<sup>
        // rendered from markdown; always use DOM walk.
        if (isInsideTag(['SUB'])) formats.push('subscript');
        // Superscript: exclude footnote-ref <sup> (class="footnote-ref")
        const insideNonFootnoteSup = (() => {
          let node: Node | null = selAnchor;
          while (node && node !== wysiwygRef.current) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              (node as Element).tagName === 'SUP'
            ) {
              return !(node as Element).classList.contains('footnote-ref');
            }
            node = node.parentNode;
          }
          return false;
        })();
        if (insideNonFootnoteSup) formats.push('superscript');
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
          if (
            isInlineFormatActiveAtSelection(rawText, rawStart, rawEnd, 'strikethrough')
          )
            formats.push('strikethrough');
          if (isInlineFormatActiveAtSelection(rawText, rawStart, rawEnd, 'subscript'))
            formats.push('subscript');
          if (isInlineFormatActiveAtSelection(rawText, rawStart, rawEnd, 'superscript'))
            formats.push('superscript');

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

    const isEditorFocused = useCallback(() => {
      if (viewMode === 'raw' || viewMode === 'markdown') {
        return editorViewRef.current?.hasFocus ?? false;
      }
      if (viewMode === 'wysiwyg') {
        return (
          !!wysiwygRef.current &&
          document.activeElement &&
          wysiwygRef.current.contains(document.activeElement)
        );
      }
      return false;
    }, [viewMode]);

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
          onKeyboardSuggestionAction('trigger', cursor, localContent);
          return true;
        }

        if (!suggestionActive) return false;

        if (key === 'ArrowLeft') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseLeft', undefined, localContent);
          return true;
        }
        if (key === 'ArrowRight') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseRight', undefined, localContent);
          return true;
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          const cursor = getEditorCaretOffset() ?? localContent.length;
          onKeyboardSuggestionAction('regenerate', cursor, localContent);
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
            onKeyboardSuggestionAction('exit', undefined, localContent);
            return true;
          }
          return false;
        }

        if (!suggestionActive) return false;

        if (key === 'ArrowLeft') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseLeft', undefined, localContent);
          return true;
        }
        if (key === 'ArrowRight') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseRight', undefined, localContent);
          return true;
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          const cursor = getEditorCaretOffset() ?? localContent.length;
          onKeyboardSuggestionAction('regenerate', cursor, localContent);
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
        localContent,
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
      if (viewMode !== 'wysiwyg') return () => {};
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

    useEffect(() => {
      if (viewMode !== 'wysiwyg' || !wysiwygRef.current) return () => {};
      // Always preserve the latest WYSIWYG state when leaving visual mode.
      // Use refs (onChangeRef, chapterContentRef, chapterIdRef) so that this
      // effect only re-runs when viewMode changes — not on every streaming
      // chunk that updates chapter.content or recreates the onChange function.
      // Without refs, the cleanup would fire on every render with a stale DOM
      // (innerHTML not yet updated by the sync effect), writing old content
      // back to state and causing a Maximum Update Depth Exceeded loop.
      return () => {
        if (!wysiwygRef.current) return;
        const currentMd =
          turndownService.current?.turndown(wysiwygRef.current.innerHTML) ?? '';
        if (currentMd !== chapterContentRef.current) {
          onChangeRef.current(chapterIdRef.current, { content: currentMd });
        }
      };
    }, [viewMode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (maybeHandleSuggestionHotkey(e)) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setTimeout(checkContext, 0);
      }

      if (viewMode === 'wysiwyg' && e.key === 'Tab') {
        e.preventDefault();
        const inserted = document.execCommand('insertText', false, '\t');
        if (!inserted) {
          document.execCommand('insertHTML', false, '&#9;');
        }
        handleWysiwygInput();
        return;
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
        // DOM helpers for sub/sup toggle and mutual-exclusion unwrapping.
        const findWysiwygAncestor = (tags: string[]): Element | null => {
          let node: Node | null = window.getSelection()?.anchorNode ?? null;
          while (node && node !== wysiwygRef.current) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              tags.includes((node as Element).tagName)
            )
              return node as Element;
            node = node.parentNode;
          }
          return null;
        };
        const unwrapWysiwygEl = (el: Element): void => {
          const p = el.parentNode!;
          while (el.firstChild) p.insertBefore(el.firstChild, el);
          p.removeChild(el);
        };

        switch (type) {
          case 'bold':
            applyInlineWysiwygFormat('bold');
            break;
          case 'italic':
            applyInlineWysiwygFormat('italic');
            break;
          case 'strikethrough':
            withRestoredWysiwygSelection(() => document.execCommand('strikeThrough'));
            break;
          case 'subscript': {
            withRestoredWysiwygSelection(() => {
              const subEl = findWysiwygAncestor(['SUB']);
              if (subEl) {
                // Already subscript — toggle off by unwrapping.
                unwrapWysiwygEl(subEl);
              } else {
                // Remove any enclosing superscript first (mutual exclusion).
                const supEl = findWysiwygAncestor(['SUP']);
                if (supEl && !supEl.classList.contains('footnote-ref'))
                  unwrapWysiwygEl(supEl);
                document.execCommand('subscript');
              }
            });
            break;
          }
          case 'superscript': {
            withRestoredWysiwygSelection(() => {
              const supEl = findWysiwygAncestor(['SUP']);
              if (supEl && !supEl.classList.contains('footnote-ref')) {
                // Already superscript — toggle off by unwrapping.
                unwrapWysiwygEl(supEl);
              } else {
                // Remove any enclosing subscript first (mutual exclusion).
                const subEl = findWysiwygAncestor(['SUB']);
                if (subEl) unwrapWysiwygEl(subEl);
                document.execCommand('superscript');
              }
            });
            break;
          }
          case 'codeblock': {
            withRestoredWysiwygSelection(() => {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const selectedText = range.toString();
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = selectedText || '';
                pre.appendChild(code);
                range.deleteContents();
                range.insertNode(pre);
              }
            });
            break;
          }
          case 'footnote': {
            // Determine next footnote number from current content.
            const currentMd =
              turndownService.current?.turndown(wysiwygRef.current?.innerHTML ?? '') ??
              '';
            const existing = currentMd.match(/\[\^(\d+)\]/g) ?? [];
            const maxNum = existing.reduce((max, m) => {
              const n = parseInt(m.replace(/\[\^|\]/g, ''), 10);
              return n > max ? n : max;
            }, 0);
            const fn = maxNum + 1;
            withRestoredWysiwygSelection(() => {
              const refHtml = `<sup class="footnote-ref" id="fnref-${fn}"><a href="#fn-${fn}">[${fn}]</a></sup>`;
              document.execCommand('insertHTML', false, refHtml);
            });
            if (wysiwygRef.current) {
              const defHtml = `<p class="footnote-def" id="fn-${fn}"><sup>[${fn}]</sup>\u00a0(footnote text) <a href="#fnref-${fn}" class="footnote-backref">\u21a9</a></p>`;
              wysiwygRef.current.insertAdjacentHTML('beforeend', defHtml);
            }
            break;
          }
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
            if (url !== null) {
              const safe = isSafeLinkUrl(url);
              if (safe)
                withRestoredWysiwygSelection(() =>
                  document.execCommand('createLink', false, url)
                );
            }
            break;
          }
          case 'image': {
            const src = prompt('Enter Image URL:');
            if (src !== null) {
              const safe = isSafeImageUrl(src);
              if (safe)
                withRestoredWysiwygSelection(() =>
                  document.execCommand('insertImage', false, src)
                );
            }
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
                  {chapter.scope === 'story' ? 'Story AI' : 'Chapter AI'}
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
                      : chapter.scope === 'story'
                        ? 'Extend Story Draft (WRITING model)'
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
                  disabled={isAiLoading || !isWritingAvailable || isChapterEmpty}
                  icon={<FileEdit size={12} />}
                  title={
                    !isWritingAvailable
                      ? writingUnavailableReason
                      : isChapterEmpty
                        ? 'Chapter is empty; cannot rewrite existing text.'
                        : chapter.scope === 'story'
                          ? 'Rewrite Story Draft (WRITING model)'
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
          style={{ overflowAnchor: 'none' }}
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
              {/* WYSIWYG View */}
              <div
                id="wysiwyg-editor"
                ref={wysiwygRef}
                contentEditable
                role="textbox"
                tabIndex={0}
                aria-multiline="true"
                aria-label="Story content"
                onInput={handleWysiwygInput}
                onBlur={handleWysiwygBlur}
                onMouseUp={checkContext}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => {
                  checkContext();
                }}
                lang={language || 'en'}
                spellCheck={spellCheck}
                className={`prose-editor outline-none w-full ${
                  viewMode === 'wysiwyg' ? 'block' : 'hidden'
                }${showWhitespace ? ' prose-editor-ws' : ''}`}
                style={{
                  ...commonTextStyle,
                  whiteSpace: showWhitespace ? 'pre-wrap' : 'normal',
                }}
              />

              {/* Raw / Markdown View */}
              {(viewMode === 'raw' || viewMode === 'markdown') && (
                <div id="raw-markdown-editor" className="relative w-full flex flex-col">
                  <CodeMirrorEditor
                    ref={editorViewRef}
                    value={localContent}
                    language={language}
                    spellCheck={spellCheck}
                    onOpenSearch={onOpenSearch}
                    onChange={(val: string) => {
                      setLocalContent(val);
                      setLocalBaseline(undefined); // clear diff immediately on user input
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
                    showDiff={settings.showDiff}
                    baselineValue={localBaseline}
                    searchHighlightRanges={chapterSearchHighlightRanges}
                    enterBehavior={viewMode === 'markdown' ? 'softbreak' : 'newline'}
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
              )}
            </div>
          </div>

          <div className="flex-shrink-0 h-16 w-full"></div>
        </div>

        {/* Persistent Footer */}
        <div
          className={`flex-shrink-0 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${footerBg}`}
        >
          {shouldShowContinuationPanel ? (
            <div className="p-4 animate-in slide-in-from-bottom-2 duration-300">
              <div
                className="flex items-center justify-between mb-3 px-1"
                role="region"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="flex items-center space-x-2 text-brand-500">
                  <SplitSquareHorizontal size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Choose a continuation
                  </span>
                  <button
                    onClick={() => {
                      const cursor =
                        (typeof getEditorCaretOffset === 'function'
                          ? getEditorCaretOffset()
                          : null) ?? localContent.length;
                      suggestionControls.onKeyboardSuggestionAction?.(
                        'regenerate',
                        cursor,
                        localContent
                      );
                    }}
                    className="inline-flex items-center justify-center p-1 rounded-md transition-colors text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-400 dark:hover:text-brand-gray-200 hover:bg-brand-gray-100 dark:hover:bg-brand-gray-750"
                    title="Reload suggestions (same as arrow-down)"
                    aria-label="Reload continuation suggestions"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <button
                  onClick={() => onAcceptContinuation('', localContent)}
                  className={`${textMuted} hover:text-brand-gray-800 text-xs`}
                >
                  Dismiss
                </button>
              </div>

              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar"
                role="list"
              >
                {displayedContinuations.map((option, idx) => {
                  const isEmpty = !option || option.trim().length === 0;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isEmpty}
                      onClick={
                        isEmpty
                          ? undefined
                          : () => onAcceptContinuation(option, localContent)
                      }
                      className={`group relative p-5 rounded-lg border transition-all text-left ${
                        isEmpty
                          ? 'cursor-default opacity-60'
                          : 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5'
                      } ${
                        settings.theme === 'light'
                          ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 hover:border-brand-300'
                          : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-750 hover:border-brand-gray-500/50'
                      }`}
                      role="listitem"
                      aria-label={
                        isEmpty
                          ? 'Waiting for suggestion'
                          : `Accept suggestion: ${option.substring(0, 50)}...`
                      }
                    >
                      <div
                        className={`font-serif text-sm leading-relaxed ${
                          settings.theme === 'light'
                            ? isEmpty
                              ? 'text-brand-gray-400 italic'
                              : 'text-brand-gray-800'
                            : isEmpty
                              ? 'text-brand-gray-500 italic'
                              : 'text-brand-gray-300 group-hover:text-brand-gray-200'
                        }`}
                      >
                        {isEmpty ? 'Waiting for suggestion...' : option}
                      </div>
                    </button>
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
