// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: CodeMirror 6 decoration plugins that provide visual rendering of
 * markdown content.  In MD mode, formatting markers stay visible and inline
 * widgets (images, links) are appended.  In Visual mode, formatting markers
 * are hidden via Decoration.replace and content is styled to look like
 * rendered prose.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import type { Extension, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DecorationViewMode = 'raw' | 'markdown' | 'visual';

// ─── Widgets ─────────────────────────────────────────────────────────────────

/** Renders nothing — used to hide syntax markers in visual mode. */
class HiddenWidget extends WidgetType {
  /** Convert dom. */
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.style.display = 'none';
    return span;
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

const hiddenWidget = new HiddenWidget();

/** Inline image preview widget. */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super();
  }

  /** Helper for the requested value. */
  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image-widget';
    wrap.contentEditable = 'false';

    const img = document.createElement('img');
    img.src = this.resolveUrl(this.src);
    img.alt = this.alt || '';
    img.title = this.alt || '';
    img.className = 'max-w-full h-auto rounded shadow-lg my-2';
    img.style.maxHeight = '400px';
    img.style.display = 'block';
    img.draggable = false;
    img.loading = 'lazy';

    img.onerror = () => {
      img.style.display = 'none';
      const fallback = document.createElement('span');
      fallback.className = 'cm-image-error';
      fallback.textContent = `[Image not found: ${this.alt || this.src}]`;
      wrap.appendChild(fallback);
    };

    wrap.appendChild(img);
    return wrap;
  }

  /** Resolve url. */
  private resolveUrl(url: string): string {
    if (url.startsWith('http') || url.startsWith('/')) return url;
    return `/api/v1/projects/images/${url}`;
  }

  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Styled bullet/number glyph for list items in visual mode. */
class ListBulletWidget extends WidgetType {
  constructor(
    readonly marker: string,
    readonly ordered: boolean
  ) {
    super();
  }

  /** Helper for the requested value. */
  eq(other: ListBulletWidget): boolean {
    return other.marker === this.marker;
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet';
    span.contentEditable = 'false';
    span.textContent = this.ordered ? this.marker : '•';
    span.style.opacity = '0.6';
    span.style.marginRight = '0.4em';
    span.style.userSelect = 'none';
    return span;
  }

  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Horizontal rule widget for visual mode. */
class HrWidget extends WidgetType {
  /** Convert dom. */
  toDOM(): HTMLElement {
    const hr = document.createElement('hr');
    hr.className = 'cm-hr-widget';
    hr.style.border = 'none';
    hr.style.borderTop = '1px solid currentColor';
    hr.style.opacity = '0.3';
    hr.style.margin = '1em 0';
    return hr;
  }
  /** Helper for the requested value. */
  eq(): boolean {
    return true;
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

const hrWidget = new HrWidget();

// ─── Node helpers ────────────────────────────────────────────────────────────

/** Find a direct child node by name. */
function childByName(node: SyntaxNode, name: string): SyntaxNode | null {
  let child = node.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

/** Extract text from a node range in the document. */
function nodeText(
  doc: { sliceString: (from: number, to: number) => string },
  node: SyntaxNode
): string {
  return doc.sliceString(node.from, node.to);
}

// ─── Marker names that should be hidden in visual mode ───────────────────────

const HIDDEN_MARKER_NAMES = new Set([
  'EmphasisMark',
  'HeaderMark',
  'QuoteMark',
  'CodeMark',
  'StrikethroughMark',
  'SubscriptMark',
  'SuperscriptMark',
]);

// ─── Decoration builder ─────────────────────────────────────────────────────

/** Build decorations. */
function buildDecorations(view: EditorView, mode: DecorationViewMode): DecorationSet {
  if (mode === 'raw') return Decoration.none;

  const isVisual = mode === 'visual';
  const decs: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      /** Helper for the requested value. */
      enter(node: import('@lezer/common').SyntaxNodeRef): false | undefined {
        const { name } = node;

        // ── Hide syntax markers in visual mode ──────────────────────
        if (isVisual && HIDDEN_MARKER_NAMES.has(name)) {
          decs.push(
            Decoration.replace({ widget: hiddenWidget }).range(node.from, node.to)
          );
          return;
        }

        // ── Hide ListMark in visual, replace with bullet widget ─────
        if (isVisual && name === 'ListMark') {
          // Determine if ordered or unordered from parent
          let parent = node.node.parent;
          while (
            parent &&
            parent.name !== 'OrderedList' &&
            parent.name !== 'BulletList'
          ) {
            parent = parent.parent;
          }
          const ordered = parent?.name === 'OrderedList';
          const markerText = doc.sliceString(node.from, node.to).trim();
          decs.push(
            Decoration.replace({
              widget: new ListBulletWidget(markerText, ordered),
            }).range(node.from, node.to)
          );
          return;
        }

        // ── Link marks: hide [ ]( ) in visual mode ─────────────────
        if (isVisual && name === 'LinkMark') {
          decs.push(
            Decoration.replace({ widget: hiddenWidget }).range(node.from, node.to)
          );
          return;
        }

        // ── Links: hide URL portion in visual ───────────────────────
        if (name === 'Link') {
          const urlNode = childByName(node.node, 'URL');
          const titleNode = childByName(node.node, 'LinkTitle');

          if (isVisual) {
            // Hide URL and LinkTitle nodes
            if (urlNode) {
              decs.push(
                Decoration.replace({ widget: hiddenWidget }).range(
                  urlNode.from,
                  urlNode.to
                )
              );
            }
            if (titleNode) {
              decs.push(
                Decoration.replace({ widget: hiddenWidget }).range(
                  titleNode.from,
                  titleNode.to
                )
              );
            }
          }

          // In both modes: add underline decoration to link text content
          // The link text is between first LinkMark and second LinkMark
          const linkMarks: SyntaxNode[] = [];
          let child = node.node.firstChild;
          while (child) {
            if (child.name === 'LinkMark') linkMarks.push(child);
            child = child.nextSibling;
          }
          if (linkMarks.length >= 2) {
            const textFrom = linkMarks[0].to;
            const textTo = linkMarks[1].from;
            if (textFrom < textTo) {
              decs.push(
                Decoration.mark({ class: 'cm-link-text' }).range(textFrom, textTo)
              );
            }
          }

          // In MD mode: dim the URL portion
          if (!isVisual && urlNode) {
            decs.push(
              Decoration.mark({ class: 'cm-link-url' }).range(urlNode.from, urlNode.to)
            );
          }
          return false; // don't recurse into link children (we handled them)
        }

        // ── Images ──────────────────────────────────────────────────
        if (name === 'Image') {
          const urlNode = childByName(node.node, 'URL');
          const src = urlNode ? nodeText(doc, urlNode) : '';

          // Extract alt text: text between first ! and LinkMark pair
          let altText = '';
          const fullText = doc.sliceString(node.from, node.to);
          const altMatch = fullText.match(/^!\[([^\]]*)\]/);
          if (altMatch) altText = altMatch[1];

          if (src) {
            if (isVisual) {
              // Replace entire image syntax with rendered image.
              // The widget DOM is block-level, so block semantics are preserved
              // without using a block decoration via a plugin.
              decs.push(
                Decoration.replace({
                  widget: new ImageWidget(src, altText),
                }).range(node.from, node.to)
              );
            } else {
              // MD mode: append image preview after the markdown text.
              decs.push(
                Decoration.widget({
                  widget: new ImageWidget(src, altText),
                  side: 1,
                }).range(node.to)
              );
            }
          }
          return false;
        }

        // ── Horizontal rule: replace with <hr> in visual ────────────
        if (isVisual && name === 'HorizontalRule') {
          decs.push(
            Decoration.replace({
              widget: hrWidget,
            }).range(node.from, node.to)
          );
          return false;
        }

        // ── FencedCode: visual mode styling ─────────────────────────
        if (isVisual && name === 'FencedCode') {
          // Hide the opening ``` line and closing ``` line
          const firstChild = node.node.firstChild;
          const lastChild = node.node.lastChild;
          if (firstChild && firstChild.name === 'CodeMark') {
            // Hide opening code mark line (including CodeInfo if present)
            const line = doc.lineAt(firstChild.from);
            decs.push(
              Decoration.replace({ widget: hiddenWidget }).range(
                line.from,
                Math.min(line.to + 1, doc.length)
              )
            );
          }
          if (lastChild && lastChild.name === 'CodeMark' && lastChild !== firstChild) {
            const line = doc.lineAt(lastChild.from);
            // If closing mark is on its own line, hide it
            if (line.from >= lastChild.from) {
              const hideFrom = Math.max(node.from, line.from - 1);
              decs.push(
                Decoration.replace({ widget: hiddenWidget }).range(
                  hideFrom,
                  lastChild.to
                )
              );
            }
          }
          return false;
        }

        // ── Block-level line decorations (visual mode) ──────────────
        if (isVisual) {
          if (
            name === 'ATXHeading1' ||
            name === 'ATXHeading2' ||
            name === 'ATXHeading3' ||
            name === 'ATXHeading4' ||
            name === 'ATXHeading5' ||
            name === 'ATXHeading6' ||
            name === 'SetextHeading1' ||
            name === 'SetextHeading2'
          ) {
            const headingLevel = name.match(/(\d)/)?.[1] || '1';
            const line = doc.lineAt(node.from);
            decs.push(
              Decoration.line({ class: `cm-visual-h${headingLevel}` }).range(line.from)
            );
          }

          if (name === 'Blockquote') {
            // Add left-border styling to all lines in the blockquote
            const startLine = doc.lineAt(node.from).number;
            const endLine = doc.lineAt(Math.min(node.to, doc.length)).number;
            for (let n = startLine; n <= endLine; n++) {
              decs.push(
                Decoration.line({ class: 'cm-visual-blockquote' }).range(
                  doc.line(n).from
                )
              );
            }
          }
        }

        // ── Inline formatting marks in visual mode ──────────────────
        if (isVisual) {
          if (name === 'Emphasis') {
            // Apply italic to content (excluding marks)
            decs.push(
              Decoration.mark({ class: 'cm-visual-emphasis' }).range(node.from, node.to)
            );
          }
          if (name === 'StrongEmphasis') {
            decs.push(
              Decoration.mark({ class: 'cm-visual-strong' }).range(node.from, node.to)
            );
          }
          if (name === 'Strikethrough') {
            decs.push(
              Decoration.mark({ class: 'cm-visual-strikethrough' }).range(
                node.from,
                node.to
              )
            );
          }
          if (name === 'InlineCode') {
            decs.push(
              Decoration.mark({ class: 'cm-visual-code' }).range(node.from, node.to)
            );
          }
          if (name === 'Subscript') {
            decs.push(
              Decoration.mark({ class: 'cm-visual-sub' }).range(node.from, node.to)
            );
          }
          if (name === 'Superscript') {
            decs.push(
              Decoration.mark({ class: 'cm-visual-sup' }).range(node.from, node.to)
            );
          }
        }

        return undefined; // continue traversal
      },
    });
  }

  // Decoration.set requires sorted ranges
  return Decoration.set(decs, true);
}

// ─── Plugin factory ──────────────────────────────────────────────────────────

/** Build markdown decoration plugin. */
export function buildMarkdownDecorationPlugin(mode: DecorationViewMode): Extension {
  if (mode === 'raw') return [];

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, mode);
      }
      /** Update the requested value. */
      update(u: ViewUpdate): void {
        if (u.viewportChanged) {
          // Viewport scroll/resize: always rebuild to cover newly visible lines.
          this.decorations = buildDecorations(u.view, mode);
          return;
        }
        if (!u.docChanged) return;

        // Fast path: if the only change is a single "structurally inert"
        // character insertion (plain letters, digits, common punctuation)
        // we can just remap existing decoration positions without re-traversing
        // the syntax tree.  Markdown structure cannot change from such chars.
        // Any deletion, multi-char change, or markdown-significant character
        // falls through to a full rebuild.
        let isSafeInsert = true;
        u.changes.iterChanges(
          (
            fromA: number,
            toA: number,
            _fromB: number,
            _toB: number,
            inserted: import('@codemirror/state').Text
          ) => {
            if (toA !== fromA) {
              isSafeInsert = false; // deletion present
              return;
            }
            if (inserted.length !== 1) {
              isSafeInsert = false; // multi-char or empty
              return;
            }
            // Characters that can begin or alter markdown structure
            const c = inserted.sliceString(0, 1);
            if (/[*_#[\]()~`>!\\\-\n\r\t ]/.test(c)) {
              isSafeInsert = false;
            }
          }
        );

        if (isSafeInsert) {
          // Positions shift by the inserted character; map without rebuild.
          this.decorations = this.decorations.map(u.changes);
        } else {
          this.decorations = buildDecorations(u.view, mode);
        }
      }
    },
    { decorations: (v: { decorations: DecorationSet }) => v.decorations }
  );
}

// ─── CSS theme for visual mode decorations ───────────────────────────────────

export const markdownDecorationTheme = EditorView.theme({
  '.cm-visual-h1': {
    fontSize: '2rem',
    fontWeight: '700',
    lineHeight: '1.2',
    marginTop: '1.6em',
    marginBottom: '0.7em',
  },
  '.cm-visual-h2': {
    fontSize: '1.75rem',
    fontWeight: '700',
    lineHeight: '1.2',
    marginTop: '1.6em',
    marginBottom: '0.7em',
  },
  '.cm-visual-h3': {
    fontSize: '1.5rem',
    fontWeight: '600',
    lineHeight: '1.2',
    marginTop: '1.6em',
    marginBottom: '0.7em',
  },
  '.cm-visual-h4': {
    fontSize: '1.25rem',
    fontWeight: '600',
  },
  '.cm-visual-h5': {
    fontSize: '1.1rem',
    fontWeight: '600',
  },
  '.cm-visual-h6': {
    fontSize: '1rem',
    fontWeight: '600',
  },
  '.cm-visual-blockquote': {
    borderLeft: '3px solid currentColor',
    paddingLeft: '1em',
    opacity: '0.85',
    fontStyle: 'italic',
  },
  '.cm-visual-emphasis': {
    fontStyle: 'italic',
  },
  '.cm-visual-strong': {
    fontWeight: 'bold',
  },
  '.cm-visual-strikethrough': {
    textDecoration: 'line-through',
  },
  '.cm-visual-code': {
    fontFamily: 'monospace',
    fontSize: '0.9em',
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    borderRadius: '3px',
    padding: '0.1em 0.3em',
  },
  '.cm-visual-sub': {
    verticalAlign: 'sub',
    fontSize: '0.8em',
  },
  '.cm-visual-sup': {
    verticalAlign: 'super',
    fontSize: '0.8em',
  },
  '.cm-link-text': {
    textDecoration: 'underline',
    textDecorationColor: 'rgba(99, 102, 241, 0.5)',
    cursor: 'pointer',
  },
  '.cm-link-url': {
    opacity: '0.55',
  },
  '.cm-image-widget': {
    display: 'block',
    lineHeight: '0',
  },
  '.cm-image-error': {
    display: 'inline-block',
    padding: '0.5em 1em',
    opacity: '0.5',
    fontStyle: 'italic',
    fontSize: '0.9em',
  },
  '.cm-list-bullet': {
    display: 'inline',
  },
  '.cm-hr-widget': {
    display: 'block',
  },
});
