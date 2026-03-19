// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines plain text editable surface for the editor so content-editable behavior is isolated and reusable.
 */

import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
// @ts-ignore
import { marked } from 'marked';

import { getRangeLength, resolveNodeAndOffset } from './domUtils';
import { useDebounce } from '../../utils/hooks';

export interface PlainTextEditableProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onChange: (value: string) => void;
  showWhitespace?: boolean;
  markdownHighlight?: boolean;
  debounceMs?: number;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

type Decoration = {
  start: number;
  end: number;
  className: string;
  imgSrc?: string;
  imgAlt?: string;
};

const toWhitespaceDisplay = (source: string): { text: string; indexMap: number[] } => {
  let out = '';
  const indexMap: number[] = [0];
  let displayIndex = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === ' ') {
      out += '·\u200b';
      displayIndex += 2;
    } else if (ch === '\t') {
      out += '→\t';
      displayIndex += 2;
    } else if (ch === '\n') {
      out += '¶\n';
      displayIndex += 2;
    } else {
      out += ch;
      displayIndex += 1;
    }
    indexMap.push(displayIndex);
  }

  return { text: out, indexMap };
};

export const fromWhitespaceDisplayText = (displayed: string): string => {
  return displayed
    .replace(/·\u200b?/g, ' ')
    .replace(/→\t/g, '\t')
    .replace(/¶\n/g, '\n');
};

const addDecoration = (
  decorations: Decoration[],
  start: number,
  end: number,
  className: string
) => {
  if (start >= end) return;
  decorations.push({ start, end, className });
};

const findTokenStart = (source: string, raw: string, cursor: number): number => {
  if (!raw) return cursor;
  const found = source.indexOf(raw, cursor);
  return found >= 0 ? found : cursor;
};

const decorateDelimitedToken = (
  token: any,
  start: number,
  end: number,
  decorations: Decoration[]
) => {
  const raw = typeof token.raw === 'string' ? token.raw : '';
  if (!raw) return;

  if (token.type === 'codespan') {
    const match = raw.match(/^(`+)([\s\S]*?)(`+)$/);
    if (match) {
      const openLen = match[1].length;
      const closeLen = match[3].length;
      addDecoration(decorations, start + openLen, end - closeLen, 'font-mono');
      addDecoration(decorations, start, start + openLen, 'opacity-60');
      addDecoration(decorations, end - closeLen, end, 'opacity-60');
    }
    return;
  }

  if (token.type === 'strong' || token.type === 'em' || token.type === 'del') {
    const markLen = token.type === 'em' ? 1 : 2;
    addDecoration(
      decorations,
      start + markLen,
      end - markLen,
      token.type === 'strong'
        ? 'font-bold'
        : token.type === 'em'
          ? 'italic'
          : 'line-through'
    );
    addDecoration(decorations, start, start + markLen, 'opacity-60');
    addDecoration(decorations, end - markLen, end, 'opacity-60');
    return;
  }

  if (token.type === 'link') {
    const rawText = raw;
    const open = rawText.indexOf('[');
    const close = rawText.indexOf('](');
    const endParen = rawText.lastIndexOf(')');
    if (open >= 0 && close > open) {
      addDecoration(decorations, start + open + 1, start + close, 'underline');
      addDecoration(decorations, start + open, start + open + 1, 'opacity-60');
      addDecoration(decorations, start + close, start + close + 2, 'opacity-60');
      if (endParen > close + 2) {
        addDecoration(
          decorations,
          start + close + 2,
          start + endParen,
          'text-brand-gray-500'
        );
      }
      if (endParen >= 0) {
        addDecoration(
          decorations,
          start + endParen,
          start + endParen + 1,
          'opacity-60'
        );
      }
    }
    return;
  }

  if (token.type === 'image') {
    decorations.push({
      start,
      end,
      className: 'text-brand-gray-500',
      imgSrc: token.href,
      imgAlt: token.text,
    });
  }
};

const decorateInlineTokens = (
  source: string,
  tokens: any[] | undefined,
  from: number,
  to: number,
  decorations: Decoration[]
) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return;

  let cursor = from;
  for (const token of tokens) {
    const raw = typeof token?.raw === 'string' ? token.raw : '';
    const tokenStart = Math.min(findTokenStart(source, raw, cursor), to);
    const tokenEnd = Math.min(to, tokenStart + raw.length);

    decorateDelimitedToken(token, tokenStart, tokenEnd, decorations);

    if (Array.isArray(token?.tokens) && token.tokens.length > 0) {
      decorateInlineTokens(source, token.tokens, tokenStart, tokenEnd, decorations);
    }

    cursor = Math.max(cursor, tokenEnd);
  }
};

const buildMarkdownDecorations = (source: string): Decoration[] => {
  const text = source || '';
  const decorations: Decoration[] = [];
  const tokens = marked.lexer(text) as any[];
  let cursor = 0;

  for (const token of tokens) {
    const raw = typeof token?.raw === 'string' ? token.raw : '';
    const start = findTokenStart(text, raw, cursor);
    const end = start + raw.length;

    if (token.type === 'heading') {
      const markerMatch = raw.match(/^(#{1,6}\s+)/);
      const markerLen = markerMatch ? markerMatch[1].length : 0;
      const trailingNewlineLen = /\n$/.test(raw) ? 1 : 0;
      const headingClass =
        token.depth === 1
          ? 'font-bold text-[1.2em]'
          : token.depth === 2
            ? 'font-bold text-[1.15em]'
            : token.depth === 3
              ? 'font-semibold text-[1.1em]'
              : 'font-semibold';

      addDecoration(decorations, start, start + markerLen, 'opacity-60');
      addDecoration(
        decorations,
        start + markerLen,
        end - trailingNewlineLen,
        headingClass
      );
      decorateInlineTokens(text, token.tokens, start, end, decorations);
    }

    if (token.type === 'blockquote') {
      addDecoration(decorations, start, end, 'text-brand-gray-500 italic');
    }

    if (token.type === 'code') {
      addDecoration(
        decorations,
        start,
        end,
        'font-mono text-[0.95em] bg-brand-gray-800/20'
      );
    }

    if (token.type === 'hr') {
      addDecoration(decorations, start, end, 'opacity-60');
    }

    if (token.type === 'list') {
      addDecoration(decorations, start, end, 'text-brand-gray-400');
    }

    if (token.type === 'table') {
      addDecoration(decorations, start, end, 'text-brand-gray-300');
    }

    if (Array.isArray(token.tokens) && token.tokens.length > 0) {
      decorateInlineTokens(text, token.tokens, start, end, decorations);
    }

    if (Array.isArray(token.items)) {
      for (const item of token.items) {
        if (Array.isArray(item?.tokens)) {
          decorateInlineTokens(text, item.tokens, start, end, decorations);
        }
      }
    }

    cursor = Math.max(cursor, end);
  }

  return decorations;
};

const renderDecoratedMarkdown = (text: string, decorations: Decoration[]): string => {
  if (!text) return '';

  const starts = new Map<number, Decoration[]>();
  const ends = new Map<number, Decoration[]>();

  for (const decoration of decorations) {
    if (!starts.has(decoration.start)) starts.set(decoration.start, []);
    if (!ends.has(decoration.end)) ends.set(decoration.end, []);
    starts.get(decoration.start)!.push(decoration);
    ends.get(decoration.end)!.push(decoration);
  }

  const active = new Set<string>();
  let html = '';

  for (let i = 0; i < text.length; i += 1) {
    const startDecs = starts.get(i) || [];
    for (const dec of startDecs) {
      if (dec.className) active.add(dec.className);
    }

    if (text[i] === '\n') {
      html += '<br/>';
    } else {
      const escapedChar = escapeHtml(text[i]);
      if (active.size === 0) {
        html += escapedChar;
      } else {
        html += `<span class="${Array.from(active).join(' ')}">${escapedChar}</span>`;
      }
    }

    const endDecs = ends.get(i + 1) || [];
    for (const dec of endDecs) {
      if (dec.className) active.delete(dec.className);

      // Render image preview at the end of the markdown tag
      if (dec.imgSrc) {
        let src = dec.imgSrc;
        if (src && !src.startsWith('http') && !src.startsWith('/')) {
          src = `/api/v1/projects/images/${src}`;
        }

        // We use display: inline-block with font-size: 0 so it doesn't create extra newlines in innerText!
        html += `<span contenteditable="false" class="md-image-preview select-none" style="display: inline-block; width: 100%; font-size: 0; text-align: center; margin: 1rem 0;"><img src="${escapeHtml(src)}" alt="${escapeHtml(dec.imgAlt || '')}" style="max-width: 100%; height: auto; border-radius: 0.5rem; display: inline-block;" /></span>`;
      }
    }
  }

  if (text === '' || text.endsWith('\n')) {
    html += '<br class="empty-line-hack" tabindex="-1" />';
  }
  return html;
};

const highlightMarkdownForEditable = (
  text: string,
  showWhitespace: boolean
): string => {
  const source = text || '';
  const sourceDecorations = buildMarkdownDecorations(source);

  if (!showWhitespace) {
    return renderDecoratedMarkdown(source, sourceDecorations);
  }

  const { text: displayText, indexMap } = toWhitespaceDisplay(source);
  const mappedDecorations = sourceDecorations
    .map((decoration) => ({
      ...decoration,
      start: indexMap[decoration.start] ?? 0,
      end: indexMap[decoration.end] ?? 0,
    }))
    .filter((decoration) => decoration.end > decoration.start);

  return renderDecoratedMarkdown(displayText, mappedDecorations);
};

const getCaretOffset = (root: HTMLElement): number | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return getRangeLength(pre);
};

const setCaretOffset = (root: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;
  const { node, nodeOffset } = resolveNodeAndOffset(root, offset);
  const range = document.createRange();
  range.setStart(node, nodeOffset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const insertPlainTextAtCaret = (text: string) => {
  if (document.execCommand('insertText', false, text)) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);

  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);

  const nextRange = document.createRange();
  nextRange.setStart(textNode, textNode.textContent?.length ?? 0);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
};

const getEditablePlainText = (root: HTMLElement): string => {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node: Node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as HTMLElement).classList.contains('md-image-preview')
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as HTMLElement).classList.contains('empty-line-hack')
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let out = '';
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
    } else if (node.nodeName === 'BR') {
      out += '\n';
    }
    node = walker.nextNode();
  }
  return out;
};

const supportsBeforeInputEvent = () => {
  return typeof InputEvent !== 'undefined';
};

export const PlainTextEditable = React.forwardRef<
  HTMLDivElement,
  PlainTextEditableProps
>(
  (
    {
      value,
      onChange,
      className,
      onKeyDown,
      onFocus,
      onBlur,
      onSelect,
      placeholder,
      style,
      showWhitespace = false,
      markdownHighlight = false,
      debounceMs = 0,
      ...props
    },
    ref
  ) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const [localValue, setLocalValue] = useState(value);
    const isUserEditingRef = useRef(false);
    const pendingCaretRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => elementRef.current as HTMLDivElement);

    // Debounced onChange for external updates
    const debouncedOnChange = useDebounce((val: string) => {
      onChange(val);
    }, debounceMs);

    // Keep local value in sync with external value only when the user is not
    // actively editing to prevent stale echo updates during debounced saves.
    useEffect(() => {
      if (isUserEditingRef.current) return;
      setLocalValue((prev) => (value === prev ? prev : value));
    }, [value]);

    useEffect(() => {
      const root = elementRef.current;
      if (!root) return;

      const display = showWhitespace
        ? (localValue || '')
            .replace(/\t/g, '→\t')
            .replace(/ /g, '·\u200b')
            .replace(/\r?\n/g, '¶\n')
        : localValue || '';

      if (markdownHighlight) {
        const caret =
          document.activeElement === root
            ? (pendingCaretRef.current ?? getCaretOffset(root))
            : null;
        const nextHtml = highlightMarkdownForEditable(localValue || '', showWhitespace);

        if (root.innerHTML !== nextHtml) {
          root.innerHTML = nextHtml;
        }

        if (caret !== null) {
          setCaretOffset(root, caret);
        }
        pendingCaretRef.current = null;
      } else {
        // Always normalize back to plain text when markdown highlighting is off.
        // This prevents leftover span markup from previous MD mode renders.
        const hasRichMarkup = root.childElementCount > 0;
        if (hasRichMarkup || root.innerText !== display) {
          const caret = document.activeElement === root ? getCaretOffset(root) : null;
          root.innerText = display;
          if (caret !== null) {
            setCaretOffset(root, Math.min(caret, display.length));
          }
        }
        pendingCaretRef.current = null;
      }
    }, [localValue, showWhitespace, markdownHighlight]);

    const onPaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      insertPlainTextAtCaret(text);
    };

    const onBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
      const nativeEvent = e.nativeEvent as InputEvent;
      if (
        nativeEvent.inputType === 'insertParagraph' ||
        nativeEvent.inputType === 'insertLineBreak'
      ) {
        e.preventDefault();
        insertPlainTextAtCaret('\n');
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Primary Enter handling is done in beforeinput to avoid contenteditable
      // paragraph node insertion and keep caret mapping stable.
      // Fallback to keydown only when beforeinput is not available.
      if (e.key === 'Enter' && !supportsBeforeInputEvent()) {
        e.preventDefault();
        insertPlainTextAtCaret('\n');
        if (elementRef.current) {
          pendingCaretRef.current = getCaretOffset(elementRef.current);
        }
      }
      onKeyDown?.(e);
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      pendingCaretRef.current = getCaretOffset(e.currentTarget);
      const displayed = getEditablePlainText(e.currentTarget).replace(/\r\n/g, '\n');
      const raw = showWhitespace ? fromWhitespaceDisplayText(displayed) : displayed;

      // Update local state immediately for fast feedback
      setLocalValue(raw);

      // Debounce the external onChange to prevent lag in parent components
      if (debounceMs > 0) {
        debouncedOnChange(raw);
      } else {
        onChange(raw);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
      isUserEditingRef.current = true;
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      isUserEditingRef.current = false;
      onBlur?.(e);
    };

    return (
      <div
        ref={elementRef}
        contentEditable
        className={`whitespace-pre-wrap ${className} empty:before:content-[attr(data-placeholder)] empty:before:text-inherit empty:before:opacity-40 outline-none`}
        onInput={handleInput}
        onBeforeInput={onBeforeInput}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSelect={onSelect}
        onMouseUp={onSelect}
        onKeyUp={onSelect}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        spellCheck={false}
        style={style}
        {...props}
      />
    );
  }
);
