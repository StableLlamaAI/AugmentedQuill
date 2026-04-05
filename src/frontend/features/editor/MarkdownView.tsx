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
}) => {
  const safeContent = typeof content === 'string' ? content : '';

  const cleanHtml = useMemo(() => {
    if (simple) return '';

    let contentToParse = safeContent;

    if (baseline && baseline !== safeContent) {
      const diffs = dmp.diff_main(baseline, safeContent);
      dmp.diff_cleanupSemantic(diffs);

      let highlightedMd = '';
      for (const [op, text] of diffs) {
        if (op === 0) {
          highlightedMd += text;
        } else if (op === 1) {
          // Wrap inserted text in a span with a class that can be styled.
          // Since marked parses MD, we should ensure the HTML is valid.
          highlightedMd += `<span class="diff-inserted">${text}</span>`;
        }
      }
      contentToParse = highlightedMd;
    }

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

  const renderLine = (line: string, i: number, la?: string) => {
    // Simple mode preserves source for complex markdown to avoid misleading preview fidelity.
    return (
      <div key={i} className="min-h-[1.5em]" lang={la}>
        {renderInline(line)}
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
        : safeContent.split('\n').map((line, i) => renderLine(line, i, language))}
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
