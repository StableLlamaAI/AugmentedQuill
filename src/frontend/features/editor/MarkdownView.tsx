// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the markdown view unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
// @ts-ignore
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { diff_match_patch } from 'diff-match-patch';
import { configureMarked } from './configureMarked';

// Configure marked extensions (subscript, superscript, footnotes) once.
configureMarked();

const dmp = new diff_match_patch();

interface MarkdownViewProps {
  content?: string | null;
  className?: string;
  simple?: boolean;
  baseline?: string;
  language?: string;
  searchHighlightRanges?: Array<{ start: number; end: number }>;
}

// Configure markdown rendering once to keep parsing behavior stable.
const renderer = new marked.Renderer();
// @ts-ignore
renderer.image = function (token) {
  let href = typeof token === 'object' && token !== null ? token.href : arguments[0];
  let title = typeof token === 'object' && token !== null ? token.title : arguments[1];
  let text = typeof token === 'object' && token !== null ? token.text : arguments[2];

  if (
    typeof href === 'string' &&
    href &&
    !href.startsWith('http') &&
    !href.startsWith('/')
  ) {
    href = `/api/v1/projects/images/${href}`;
  }
  return `<img src="${href}" alt="${text || ''}" title="${title || ''}" class="max-w-full h-auto rounded shadow-lg my-4" />`;
};
marked.use({ renderer });

const MarkdownViewComponent: React.FC<MarkdownViewProps> = ({
  content,
  className = '',
  simple = false,
  baseline = '',
  language,
  searchHighlightRanges,
}) => {
  const safeContent = typeof content === 'string' ? content : '';

  const cleanHtml = useMemo(() => {
    if (simple) return '';

    let contentToParse = safeContent;

    if (baseline && baseline !== safeContent) {
      const diffs = dmp.diff_main(baseline, safeContent);
      dmp.diff_cleanupSemantic(diffs);

      // We need to be careful with HTML injection inside Markdown.
      // We use a custom escaping strategy for the diff segments.
      let highlightedMd = '';
      for (const [op, text] of diffs) {
        // Escape standard HTML characters within the diff segment text
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        if (op === 0) {
          highlightedMd += text; // Unchanged text remains raw Markdown
        } else if (op === 1) {
          highlightedMd += `<span class="diff-inserted">${escaped}</span>`;
        } else if (op === -1) {
          highlightedMd += `<span class="diff-deleted">${escaped}</span>`;
        }
      }
      contentToParse = highlightedMd;
    }

    // Since we've already injected HTML spans, we need to ensure marked
    // doesn't double-escape them if they are at the top level.
    const rawHtml = marked.parse(contentToParse) as string;
    return DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ['img', 'sub', 'sup', 'del', 's', 'strike', 'pre', 'code', 'span'],
      ADD_ATTR: ['src', 'alt', 'title', 'class', 'id', 'href'],
    });
  }, [safeContent, simple, baseline]);

  // Diff pairs for simple (inline) rendering — computed only when needed.
  const simpleDiff = useMemo(() => {
    if (!simple || !baseline || baseline === safeContent) return null;
    const diffs = dmp.diff_main(baseline, safeContent);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
  }, [simple, baseline, safeContent]);

  if (!simple) {
    return (
      <div
        className={`prose-editor whitespace-normal ${className}`}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
        lang={language}
      />
    );
  }

  const splitLineWithHighlights = (
    line: string,
    lineStart: number,
    ranges?: Array<{ start: number; end: number }>
  ) => {
    if (!ranges || ranges.length === 0) return [{ text: line, highlight: false }];

    const normalized = ranges
      .map((range) => ({
        start: Math.max(0, range.start - lineStart),
        end: Math.max(0, range.end - lineStart),
      }))
      .filter((range) => range.start < range.end)
      .sort((a, b) => a.start - b.start);

    const fragments: Array<{ text: string; highlight: boolean }> = [];
    let cursor = 0;

    for (const range of normalized) {
      if (range.start > cursor) {
        fragments.push({ text: line.slice(cursor, range.start), highlight: false });
      }
      fragments.push({
        text: line.slice(range.start, Math.min(range.end, line.length)),
        highlight: true,
      });
      cursor = Math.min(range.end, line.length);
      if (cursor >= line.length) break;
    }

    if (cursor < line.length) {
      fragments.push({ text: line.slice(cursor), highlight: false });
    }

    return fragments;
  };

  const renderLine = (line: string, i: number, la?: string, lineStart = 0) => {
    // Simple mode preserves source for complex markdown to avoid misleading preview fidelity.
    if (!searchHighlightRanges?.length) {
      return (
        <div key={i} className="min-h-[1.5em]" lang={la}>
          {renderInline(line)}
        </div>
      );
    }

    const fragments = splitLineWithHighlights(line, lineStart, searchHighlightRanges);

    return (
      <div key={i} className="min-h-[1.5em]" lang={la}>
        {fragments.map((fragment, idx) => {
          const inline = renderInline(fragment.text);
          return fragment.highlight ? (
            <mark
              key={idx}
              className="search-highlight rounded"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)' }}
            >
              {inline}
            </mark>
          ) : (
            <React.Fragment key={idx}>{inline}</React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderInline = (text: string) => {
    if (!text) return null;

    // Tokenize minimal inline markdown for lightweight summary previews.
    const regex = /(`.*?`|\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_)/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Bold
      if (
        (part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))
      ) {
        return (
          <span key={index} className="font-bold">
            {part.slice(2, -2)}
          </span>
        );
      }

      // Italic
      if (
        (part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))
      ) {
        return (
          <span key={index} className="italic">
            {part.slice(1, -1)}
          </span>
        );
      }

      // Code
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <span
            key={index}
            className="font-mono text-brand-gray-400 bg-brand-gray-800 rounded px-1 text-sm"
          >
            {part.slice(1, -1)}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={className} lang={language}>
      {simpleDiff
        ? simpleDiff.map(([op, text], i) => {
            if (op === 0) return <React.Fragment key={i}>{text}</React.Fragment>;
            if (op === 1)
              return (
                <span key={i} className="diff-inserted">
                  {text}
                </span>
              );
            return null; // deletions: not shown
          })
        : safeContent.split('\n').map((line, i, all) => {
            const lineStart = safeContent
              .split('\n')
              .slice(0, i)
              .reduce((sum, current) => sum + current.length + 1, 0);
            return renderLine(line, i, language, lineStart);
          })}
    </div>
  );
};

export const MarkdownView = React.memo(MarkdownViewComponent);

export const hasUnsupportedSummaryMarkdown = (text: string): boolean => {
  const lines = text.split('\n');
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) return true;
    if (/^>\s/.test(line)) return true;
    if (/^[-*+]\s/.test(line)) return true;
    if (/^\d+\.\s/.test(line)) return true;
  }
  if (/`[^`]+`/.test(text)) return true;
  if (/\[.*?\]\(.*?\)/.test(text)) return true;
  return false;
};

export const SummaryWarning: React.FC = () => (
  <div
    className="inline-flex items-center space-x-1 text-brand-500 bg-brand-950/30 px-2 py-1 rounded text-[10px] border border-brand-500/20 ml-2"
    title="Summaries should mostly use Bold and Italic. Other formatting might distract."
  >
    <AlertTriangle size={10} />
    <span>Complex formatting detected</span>
  </div>
);
