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
import type { Extension, Range, Text } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

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

    img.onerror = (): void => {
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

/** CSS classes applied per inline format node name in visual mode. */
const INLINE_FORMAT_CLASSES: Readonly<Record<string, string>> = {
  Emphasis: 'cm-visual-emphasis',
  StrongEmphasis: 'cm-visual-strong',
  Strikethrough: 'cm-visual-strikethrough',
  InlineCode: 'cm-visual-code',
  Subscript: 'cm-visual-sub',
  Superscript: 'cm-visual-sup',
};

/** Apply list-mark decoration: hide marker and insert a bullet/number widget. */
function applyListMarkDecoration(
  node: SyntaxNodeRef,
  doc: Text,
  decs: Range<Decoration>[]
): void {
  let parent = node.node.parent;
  while (parent && parent.name !== 'OrderedList' && parent.name !== 'BulletList') {
    parent = parent.parent;
  }
  const ordered = parent?.name === 'OrderedList';
  const markerText = doc.sliceString(node.from, node.to).trim();
  decs.push(
    Decoration.replace({ widget: new ListBulletWidget(markerText, ordered) }).range(
      node.from,
      node.to
    )
  );
}

/** Apply link decorations: hide URL/title in visual mode, underline text, dim URL in MD mode. */
function applyLinkDecorations(
  node: SyntaxNodeRef,
  doc: Text,
  decs: Range<Decoration>[],
  isVisual: boolean
): false {
  const urlNode = childByName(node.node, 'URL');
  const titleNode = childByName(node.node, 'LinkTitle');
  if (isVisual) {
    if (urlNode)
      decs.push(
        Decoration.replace({ widget: hiddenWidget }).range(urlNode.from, urlNode.to)
      );
    if (titleNode)
      decs.push(
        Decoration.replace({ widget: hiddenWidget }).range(titleNode.from, titleNode.to)
      );
  }
  const linkMarks: SyntaxNode[] = [];
  let child = node.node.firstChild;
  while (child) {
    if (child.name === 'LinkMark') linkMarks.push(child);
    child = child.nextSibling;
  }
  if (linkMarks.length >= 2) {
    const textFrom = linkMarks[0].to;
    const textTo = linkMarks[1].from;
    if (textFrom < textTo)
      decs.push(Decoration.mark({ class: 'cm-link-text' }).range(textFrom, textTo));
  }
  if (!isVisual && urlNode)
    decs.push(
      Decoration.mark({ class: 'cm-link-url' }).range(urlNode.from, urlNode.to)
    );
  return false;
}

/** Apply image decorations: render widget or append preview. */
function applyImageDecorations(
  node: SyntaxNodeRef,
  doc: Text,
  decs: Range<Decoration>[],
  isVisual: boolean
): false {
  const urlNode = childByName(node.node, 'URL');
  const src = urlNode ? nodeText(doc, urlNode) : '';
  const fullText = doc.sliceString(node.from, node.to);
  const altMatch = fullText.match(/^!\[([^\]]*)\]/);
  const altText = altMatch ? altMatch[1] : '';
  if (src) {
    if (isVisual) {
      decs.push(
        Decoration.replace({ widget: new ImageWidget(src, altText) }).range(
          node.from,
          node.to
        )
      );
    } else {
      decs.push(
        Decoration.widget({ widget: new ImageWidget(src, altText), side: 1 }).range(
          node.to
        )
      );
    }
  }
  return false;
}

/** Apply fenced-code decorations: hide opening/closing ``` lines in visual mode. */
function applyFencedCodeDecorations(
  node: SyntaxNodeRef,
  doc: Text,
  decs: Range<Decoration>[]
): false {
  const firstChild = node.node.firstChild;
  const lastChild = node.node.lastChild;
  if (firstChild && firstChild.name === 'CodeMark') {
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
    if (line.from >= lastChild.from) {
      decs.push(
        Decoration.replace({ widget: hiddenWidget }).range(
          Math.max(node.from, line.from - 1),
          lastChild.to
        )
      );
    }
  }
  return false;
}

/** Apply block-level line decorations for headings and blockquotes in visual mode. */
function applyBlockLevelDecorations(
  node: SyntaxNodeRef,
  doc: Text,
  decs: Range<Decoration>[]
): void {
  const headingMatch = /^(?:ATXHeading|SetextHeading)(\d)$/.exec(node.name);
  if (headingMatch) {
    const line = doc.lineAt(node.from);
    decs.push(
      Decoration.line({ class: `cm-visual-h${headingMatch[1]}` }).range(line.from)
    );
  }
  if (node.name === 'Blockquote') {
    const startLine = doc.lineAt(node.from).number;
    const endLine = doc.lineAt(Math.min(node.to, doc.length)).number;
    for (let n = startLine; n <= endLine; n++) {
      decs.push(
        Decoration.line({ class: 'cm-visual-blockquote' }).range(doc.line(n).from)
      );
    }
  }
}

/** Apply inline formatting decoration for the node if its name maps to a CSS class. */
function applyInlineFormatDecoration(
  node: SyntaxNodeRef,
  decs: Range<Decoration>[]
): void {
  const cls = INLINE_FORMAT_CLASSES[node.name];
  if (cls) decs.push(Decoration.mark({ class: cls }).range(node.from, node.to));
}

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
      enter(node: SyntaxNodeRef): false | undefined {
        const { name } = node;
        if (isVisual && HIDDEN_MARKER_NAMES.has(name)) {
          decs.push(
            Decoration.replace({ widget: hiddenWidget }).range(node.from, node.to)
          );
          return;
        }
        if (isVisual && name === 'ListMark') {
          applyListMarkDecoration(node, doc, decs);
          return;
        }
        if (isVisual && name === 'LinkMark') {
          decs.push(
            Decoration.replace({ widget: hiddenWidget }).range(node.from, node.to)
          );
          return;
        }
        if (name === 'Link') return applyLinkDecorations(node, doc, decs, isVisual);
        if (name === 'Image') return applyImageDecorations(node, doc, decs, isVisual);
        if (isVisual && name === 'HorizontalRule') {
          decs.push(Decoration.replace({ widget: hrWidget }).range(node.from, node.to));
          return false;
        }
        if (isVisual && name === 'FencedCode')
          return applyFencedCodeDecorations(node, doc, decs);
        if (isVisual) {
          applyBlockLevelDecorations(node, doc, decs);
          applyInlineFormatDecoration(node, decs);
        }
        return undefined;
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
          ): void => {
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
    { decorations: (v: { decorations: DecorationSet }): DecorationSet => v.decorations }
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
