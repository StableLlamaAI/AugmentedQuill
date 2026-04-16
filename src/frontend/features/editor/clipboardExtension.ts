// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: CodeMirror 6 extension that intercepts copy/cut/paste events to
 * transparently convert between markdown (the document format) and HTML (the
 * clipboard format).  Copy/cut writes both text/plain (raw markdown) and
 * text/html (rendered) to the clipboard.  Paste detects text/html and runs it
 * through turndown to produce clean markdown before inserting.
 */

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
// @ts-ignore
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createEditorTurndownService } from './turndown';
import { configureMarked } from './configureMarked';

// Ensure marked extensions are configured.
configureMarked();

// Lazily create a single turndown instance for clipboard paste.
let turndown: { turndown: (html: string) => string } | null = null;
function getTurndown() {
  if (!turndown) turndown = createEditorTurndownService();
  return turndown;
}

/**
 * Build the clipboard-handling extension for the CodeMirror editor.
 */
export function buildClipboardExtension(): Extension {
  return EditorView.domEventHandlers({
    copy(event, view) {
      return handleCopyOrCut(event, view, false);
    },
    cut(event, view) {
      return handleCopyOrCut(event, view, true);
    },
    paste(event, view) {
      return handlePaste(event, view);
    },
  });
}

// ─── Copy / Cut ──────────────────────────────────────────────────────────────

function handleCopyOrCut(
  event: ClipboardEvent,
  view: EditorView,
  isCut: boolean
): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false; // nothing selected

  const selectedMd = view.state.doc.sliceString(from, to);

  // Render markdown → HTML for rich-text consumers.
  let html: string;
  try {
    html = marked.parse(selectedMd) as string;
  } catch {
    html = selectedMd;
  }

  const dt = event.clipboardData;
  if (dt) {
    event.preventDefault();
    dt.clearData();
    dt.setData('text/plain', selectedMd);
    dt.setData('text/html', html);
  }

  if (isCut) {
    view.dispatch({
      changes: { from, to, insert: '' },
      selection: { anchor: from },
    });
  }

  return true;
}

// ─── Paste ───────────────────────────────────────────────────────────────────

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const dt = event.clipboardData;
  if (!dt) return false;

  const htmlContent = dt.getData('text/html');
  const plainContent = dt.getData('text/plain');

  // If we have HTML, convert it to markdown via turndown.
  // But if the HTML is just a wrapper for plain text (some browsers wrap plain
  // text in <meta>+<body><p>), prefer the plain-text version when available
  // and the HTML contains no meaningful formatting tags.
  let textToInsert: string;

  if (htmlContent && hasFormattingTags(htmlContent)) {
    try {
      const sanitized = DOMPurify.sanitize(htmlContent, {
        ADD_TAGS: ['img', 'sub', 'sup', 'del', 's', 'strike', 'pre', 'code', 'span'],
        ADD_ATTR: ['src', 'alt', 'title', 'class', 'id', 'href'],
      });
      textToInsert = getTurndown().turndown(sanitized);
    } catch {
      textToInsert = plainContent || '';
    }
  } else {
    textToInsert = plainContent || '';
  }

  if (!textToInsert) return false;

  event.preventDefault();
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: textToInsert },
    selection: { anchor: from + textToInsert.length },
  });

  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check whether the HTML contains formatting beyond bare plain-text wrappers. */
function hasFormattingTags(html: string): boolean {
  // Strip common plain-text wrappers that browsers add.
  const stripped = html.replace(/<\/?(?:html|head|body|meta|span)[^>]*>/gi, '').trim();
  // If nothing tag-like remains, it's plain text wrapped in boilerplate.
  return /<[a-z][a-z0-9]*[\s>]/i.test(stripped);
}
