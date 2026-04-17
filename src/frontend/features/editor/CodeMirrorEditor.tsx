// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Provides a CodeMirror 6-based editable surface for Raw and Markdown
 * modes, replacing the old contenteditable-based PlainTextEditable.  All
 * selection, caret, and DOM concerns are delegated to CodeMirror; callers
 * interact with the document exclusively through EditorView's state API.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  Decoration,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
  DecorationSet,
} from '@codemirror/view';
import {
  EditorState,
  Compartment,
  Prec,
  Annotation,
  Range,
  Transaction,
  Text,
} from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { diff_match_patch } from 'diff-match-patch';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  buildMarkdownDecorationPlugin,
  markdownDecorationTheme,
  type DecorationViewMode,
} from './markdownDecorations';
import { buildClipboardExtension } from './clipboardExtension';

// ─── Diff Highlight ──────────────────────────────────────────────────────────

const dmp = new diff_match_patch();

const diffMark = Decoration.mark({
  class: 'cm-diff-inserted',
});

const deletedMark = Decoration.mark({
  class: 'cm-diff-deleted',
});

class DeletedWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-diff-deleted';
    wrap.textContent = this.text;
    return wrap;
  }
}

const buildDiffPlugin = (baseline: string) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        // Diff decorations are computed over the whole document and do not
        // depend on the current viewport. Recomputing on scroll is expensive
        // for large documents and can block the UI.
        if (u.docChanged) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const currentText = view.state.doc.toString();
        if (baseline === currentText) return Decoration.none;

        const diffs = dmp.diff_main(baseline, currentText);
        dmp.diff_cleanupSemantic(diffs);

        const decs: Range<Decoration>[] = [];
        let pos = 0;

        for (const [op, text] of diffs) {
          if (op === 0) {
            // UNCHANGED
            pos += text.length;
          } else if (op === 1) {
            // INSERTED — decorate the added range in the current document.
            decs.push(diffMark.range(pos, pos + text.length));
            pos += text.length;
          } else if (op === -1) {
            // DELETED — exists in baseline only, inject as a widget in the current doc.
            decs.push(
              Decoration.widget({
                widget: new DeletedWidget(text),
                side: 0,
              }).range(pos)
            );
          }
        }

        return Decoration.set(decs, true);
      }
    },
    { decorations: (v) => v.decorations }
  );

// ─── Whitespace display ──────────────────────────────────────────────────────
// These widgets replace spaces, tabs and newline-positions with a visible glyph
// while keeping the document content unchanged.  contenteditable="false" on the
// widget containers prevents the caret from landing inside them.

class WsSpaceWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsMarker = '1';
    el.textContent = ' ';
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class WsTabWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsTab = '1';
    el.textContent = '→';
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class WsNlWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsNl = '1';
    el.textContent = '¶';
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const wsSpaceWidget = new WsSpaceWidget();
const wsTabWidget = new WsTabWidget();
const wsNlWidget = new WsNlWidget();

const buildWhitespacePlugin = () =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.viewportChanged || u.geometryChanged) {
          this.decorations = this.build(u.view);
        } else if (u.docChanged) {
          // Fast path: remap positions for single inert-char insertions.
          // Whitespace markers (space/tab/newline) require a full rebuild.
          let safeInsert = true;
          u.changes.iterChanges((fromA, toA, _fB, _tB, ins) => {
            if (toA !== fromA || ins.length !== 1) {
              safeInsert = false;
              return;
            }
            const c = ins.sliceString(0, 1);
            if (c === ' ' || c === '\t' || c === '\n') safeInsert = false;
          });
          this.decorations = safeInsert
            ? this.decorations.map(u.changes)
            : this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const decs: Range<Decoration>[] = [];
        // Fall back to full document if the viewport hasn't been computed yet
        // (can happen synchronously in the plugin constructor before first layout).
        const vpFrom = view.viewport.from;
        const vpTo =
          view.viewport.to > view.viewport.from
            ? view.viewport.to
            : view.state.doc.length;
        const doc = view.state.doc;

        // ¶ widget at the end of every visible line (before the implicit newline)
        const firstLine = doc.lineAt(vpFrom).number;
        const lastLine = doc.lineAt(Math.min(vpTo, doc.length)).number;
        for (let n = firstLine; n <= lastLine; n++) {
          const line = doc.line(n);
          // side: 1 places the widget after the position (at the line end,
          // after the logical caret slot), so the cursor appears before the mark.
          decs.push(Decoration.widget({ widget: wsNlWidget, side: 1 }).range(line.to));
        }

        // Space / tab replacements within the visible range
        const text = doc.sliceString(vpFrom, vpTo);
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === ' ') {
            decs.push(
              Decoration.replace({ widget: wsSpaceWidget }).range(
                vpFrom + i,
                vpFrom + i + 1
              )
            );
          } else if (ch === '\t') {
            decs.push(
              Decoration.replace({ widget: wsTabWidget }).range(
                vpFrom + i,
                vpFrom + i + 1
              )
            );
          }
        }

        // Decoration.set(decs, true) sorts by position automatically
        return Decoration.set(decs, true);
      }
    },
    { decorations: (v) => v.decorations }
  );

// ─── Markdown syntax highlight style ────────────────────────────────────────
// Maps Lezer markdown tokens to CSS properties so prose writers see inline
// formatting cues without colour noise.

const mdHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading2, fontWeight: 'bold', fontSize: '1.15em' },
  { tag: tags.heading3, fontWeight: '600', fontSize: '1.1em' },
  { tag: tags.heading4, fontWeight: '600' },
  { tag: tags.heading5, fontWeight: '600' },
  { tag: tags.heading6, fontWeight: '600' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'monospace', fontSize: '0.9em' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.url, opacity: '0.55' },
  { tag: tags.quote, fontStyle: 'italic', opacity: '0.75' },
  { tag: tags.meta, opacity: '0.5' },
  { tag: tags.punctuation, opacity: '0.5' },
  { tag: tags.processingInstruction, opacity: '0.5' },
  { tag: tags.contentSeparator, opacity: '0.5' },
  { tag: tags.labelName, opacity: '0.55' },
]);

// ─── Base theme ──────────────────────────────────────────────────────────────
// Makes CodeMirror transparent so the host element's styles (font, colour, bg)
// bleed through.  The scroller uses overflow:visible so the parent container
// is responsible for scrolling — this matches how the rest of the editor page
// is laid out.

const baseTheme = EditorView.theme({
  '&': {
    color: 'inherit',
    backgroundColor: 'transparent',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    height: 'auto',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'visible',
  },
  '.cm-content': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'inherit',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    padding: '0',
    caretColor: 'inherit',
  },
  '.cm-line': {
    padding: '0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'inherit',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent !important',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(99,102,241,0.2) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(99,102,241,0.3) !important',
  },
  '.cm-ws-marker': {
    opacity: '0.35',
    pointerEvents: 'none',
    userSelect: 'none',
    fontStyle: 'normal',
    fontWeight: 'normal',
  },
  '.diff-inserted': {
    backgroundColor: 'rgba(34, 197, 94, 0.25) !important', // brand-green-500 @ 0.25
    borderBottomStyle: 'dashed',
    borderBottomWidth: '1px',
    borderBottomColor: 'rgba(34, 197, 94, 0.5)',
    borderRadius: '2px',
    transition: 'background-color 0.2s ease',
  },
  '.cm-search-highlight': {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: '2px',
  },
  // Placeholder styling
  '.cm-placeholder': {
    color: 'inherit',
    opacity: '0.4',
    fontStyle: 'normal',
  },
  '.cm-diff-inserted': {
    backgroundColor: 'rgba(34, 197, 94, 0.15)', // Light green
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    borderBottomColor: 'rgba(34, 197, 94, 0.4)',
  },
  '.cm-diff-deleted': {
    backgroundColor: 'rgba(239, 68, 68, 0.15)', // Light red
    textDecoration: 'line-through',
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    borderBottomColor: 'rgba(239, 68, 68, 0.4)',
    opacity: '0.8',
  },
});

// Marks transactions that mirror external prop updates so updateListener
// can skip emitting onChange for those programmatic document replacements.
const externalValueSyncAnnotation = Annotation.define<boolean>();

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string, isUndoRedo?: boolean) => void;
  /**
   * Editor display mode:
   * 'raw'      — plain text, no syntax highlighting, monospace
   * 'markdown' — Lezer-based markdown highlighting, inline widgets, softbreak Enter
   * 'visual'   — markdown syntax hidden, WYSIWYG-like rendering, softbreak Enter
   *
   * Legacy alias: 'plain' maps to 'raw'.
   */
  viewMode?: 'raw' | 'markdown' | 'visual' | 'plain';
  /**
   * @deprecated Use viewMode instead. Kept for backward compatibility.
   */
  mode?: 'plain' | 'markdown';
  /** Show spaces / tabs / newlines as visible glyphs */
  showWhitespace?: boolean;
  /**
   * Override for Enter key behavior.  When not set, derived from viewMode:
   *   raw → 'newline', markdown/visual → 'softbreak'
   *
   * 'newline'   — Enter inserts a plain newline
   * 'softbreak' — Enter inserts the markdown soft-break '  \n'; a second
   *               Enter on a line already ending with '  ' removes those
   *               spaces and inserts '\n\n' (paragraph break)
   * 'ignore'    — Enter does nothing (useful for single-line title fields)
   */
  enterBehavior?: 'newline' | 'softbreak' | 'ignore';
  /** Placeholder text shown when the document is empty */
  placeholder?: string;
  /** Applied to the outer wrapper <div> */
  className?: string;
  /** Applied to the outer wrapper <div> */
  style?: React.CSSProperties;
  /** Called on every selection / cursor change */
  onSelectionChange?: (anchor: number, head: number) => void;
  /** Text state to compare against for change highlighting (AI additions) */
  baselineValue?: string;
  /** Enable inline diff highlighting in the editor */
  showDiff?: boolean;
  /** Active search highlights in document text offset coordinates */
  searchHighlightRanges?: Array<{ start: number; end: number }>;
  /** BCP 47 language tag for spellcheck and hyphenation */
  language?: string;
  /** Whether to enable browser-native spellcheck */
  spellCheck?: boolean;
  /** Called when the user presses Ctrl+F / Cmd+F inside the editor */
  onOpenSearch?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CodeMirrorEditor = React.forwardRef<
  EditorView | null,
  CodeMirrorEditorProps
>(
  (
    {
      value,
      onChange,
      viewMode: viewModeProp,
      mode: legacyMode,
      showWhitespace = false,
      enterBehavior: enterBehaviorProp,
      placeholder,
      className,
      style,
      onSelectionChange,
      baselineValue,
      showDiff = true,
      searchHighlightRanges,
      language = 'en',
      spellCheck = false,
      onOpenSearch,
    },
    ref
  ) => {
    // Resolve viewMode: new prop takes precedence, then legacy mode, then default
    const viewMode: DecorationViewMode =
      viewModeProp === 'plain'
        ? 'raw'
        : (viewModeProp ?? (legacyMode === 'markdown' ? 'markdown' : 'raw'));

    // Derive enter behavior from viewMode unless explicitly overridden
    const enterBehavior =
      enterBehaviorProp ?? (viewMode === 'raw' ? 'newline' : 'softbreak');

    // Derive CodeMirror language mode from viewMode
    const mode: 'plain' | 'markdown' = viewMode === 'raw' ? 'plain' : 'markdown';
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Stable callback refs so the CodeMirror updateListener closure always
    // calls the latest version without needing the view to be recreated.
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onOpenSearchRef = useRef(onOpenSearch);
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
    onOpenSearchRef.current = onOpenSearch;

    // Track the last value emitted by our own onChange so we can distinguish
    // externally-driven value changes from the echo of our own edits.
    const lastEmittedRef = useRef(value);

    // Compartments allow dynamic extension switching without recreating the view
    const languageCompartment = useRef(new Compartment());
    const wsCompartment = useRef(new Compartment());
    const diffCompartment = useRef(new Compartment());
    const searchHighlightCompartment = useRef(new Compartment());
    const enterCompartment = useRef(new Compartment());
    const placeholderCompartment = useRef(new Compartment());
    const attributesCompartment = useRef(new Compartment());
    const mdDecorationCompartment = useRef(new Compartment());

    // ── Extension builders ──────────────────────────────────────────────────

    const buildAttributesExtension = (
      la: string | undefined,
      sc: boolean,
      ph: string | undefined
    ): Extension => {
      const editorAriaLabel = ph ?? 'Story content';
      return EditorView.contentAttributes.of({
        lang: la || 'en',
        spellcheck: sc ? 'true' : 'false',
        autocomplete: 'off',
        autocorrect: sc ? 'on' : 'off',
        autocapitalize: sc ? 'sentences' : 'off',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': editorAriaLabel,
      });
    };

    const buildLanguageExtension = (m: typeof mode): Extension =>
      m === 'markdown'
        ? [markdown({ addKeymap: false }), syntaxHighlighting(mdHighlightStyle)]
        : [];

    const buildWsExtension = (ws: boolean): Extension =>
      ws ? buildWhitespacePlugin() : [];

    const buildSearchHighlightPlugin = (
      ranges: Array<{ start: number; end: number }>
    ): Extension =>
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;
          constructor(view: EditorView) {
            this.decorations = this.build(view);
          }
          update(u: ViewUpdate) {
            if (u.viewportChanged || u.geometryChanged) {
              this.decorations = this.build(u.view);
            } else if (u.docChanged) {
              let safeInsert = true;
              u.changes.iterChanges((fromA, toA, _fB, _tB, ins) => {
                if (toA !== fromA || ins.length !== 1) {
                  safeInsert = false;
                  return;
                }
                const c = ins.sliceString(0, 1);
                if (c === ' ' || c === '\t' || c === '\n') safeInsert = false;
              });
              this.decorations = safeInsert
                ? this.decorations.map(u.changes)
                : this.build(u.view);
            }
          }
          build(view: EditorView): DecorationSet {
            const decs: Range<Decoration>[] = [];
            const length = view.state.doc.length;
            for (const range of ranges) {
              const from = Math.max(0, Math.min(range.start, length));
              const to = Math.max(0, Math.min(range.end, length));
              if (from < to) {
                decs.push(
                  Decoration.mark({ class: 'cm-search-highlight' }).range(from, to)
                );
              }
            }
            return Decoration.set(decs, true);
          }
        },
        { decorations: (v) => v.decorations }
      );

    const buildSearchHighlightExtension = (
      ranges: Array<{ start: number; end: number }> | undefined
    ): Extension =>
      ranges && ranges.length > 0 ? buildSearchHighlightPlugin(ranges) : [];

    const buildDiffExtension = (bv: string | undefined, enabled: boolean): Extension =>
      enabled && bv != null ? buildDiffPlugin(bv) : [];

    const buildEnterExtension = (eb: typeof enterBehavior): Extension => {
      if (eb === 'ignore') {
        return keymap.of([
          { key: 'Enter', run: () => true }, // swallow silently
          { key: 'Shift-Enter', run: () => true },
        ]);
      }
      if (eb === 'softbreak') {
        // ── O(1) document-character helpers ──────────────────────────────────
        // All position analysis is done with at most a fixed number of character
        // peeks (doc.sliceString over 1–3 chars) so the keymap handlers run in
        // O(1) regardless of document size.  No loops, no offset scanning.

        /** One character at position p, or '' if out of bounds. */
        const ch = (doc: Text, p: number): string =>
          p >= 0 && p < doc.length ? doc.sliceString(p, p + 1) : '';

        /**
         * If the cursor (no selection) at `pos` is inside the "  \n" zone,
         * return the index of the first space.  The zone covers:
         *   pos === lb+0  before first space  (cursor about to Delete the lb)
         *   pos === lb+1  between spaces
         *   pos === lb+2  between 2nd space and \n
         *   pos === lb+3  just after \n        (cursor about to Backspace the lb)
         * Checks each of the four candidate starts in a fixed-length branch:
         *   lb = pos-0: doc[pos..pos+3] === "  \n"
         *   lb = pos-1: doc[pos-1..pos+2] === "  \n"
         *   lb = pos-2: doc[pos-2..pos+1] === "  \n"
         *   lb = pos-3: doc[pos-3..pos] === "  \n"
         */
        const lineBreakAt = (doc: Text, pos: number): number => {
          // lb = pos (cursor before the sequence)
          if (
            ch(doc, pos) === ' ' &&
            ch(doc, pos + 1) === ' ' &&
            ch(doc, pos + 2) === '\n'
          )
            return pos;
          // lb = pos-1 (cursor between the two spaces)
          if (
            pos >= 1 &&
            ch(doc, pos - 1) === ' ' &&
            ch(doc, pos) === ' ' &&
            ch(doc, pos + 1) === '\n'
          )
            return pos - 1;
          // lb = pos-2 (cursor between 2nd space and \n)
          if (
            pos >= 2 &&
            ch(doc, pos - 2) === ' ' &&
            ch(doc, pos - 1) === ' ' &&
            ch(doc, pos) === '\n'
          )
            return pos - 2;
          // lb = pos-3 (cursor just after the \n)
          if (
            pos >= 3 &&
            ch(doc, pos - 3) === ' ' &&
            ch(doc, pos - 2) === ' ' &&
            ch(doc, pos - 1) === '\n'
          )
            return pos - 3;
          return -1;
        };

        /**
         * If the cursor at `pos` is inside the "\n\n" zone, return the index of
         * the first \n.  Zone:
         *   pos === pb+0  before first \n
         *   pos === pb+1  between the two \n's
         *   pos === pb+2  just after second \n
         *
         * NOTE: we only match a *bare* "\n\n" — if the sequence is "  \n\n" the
         * lineBreakAt check above already matches the "  \n" part, so a "\n\n"
         * check that would also match at pb = pos-1 (where "\n\n" starts at pos-1)
         * must not accidentally fire when the \n before pos belongs to a "  \n".
         * We therefore exclude the case where pb-1 and pb-2 are both spaces.
         */
        const paraBreakAt = (doc: Text, pos: number): number => {
          // Helper: is the \n at `nlPos` the newline of a "  \n" sequence?
          const isLineBreakNl = (nlPos: number): boolean =>
            nlPos >= 2 && ch(doc, nlPos - 1) === ' ' && ch(doc, nlPos - 2) === ' ';

          // pb = pos (cursor before first \n)
          if (ch(doc, pos) === '\n' && ch(doc, pos + 1) === '\n' && !isLineBreakNl(pos))
            return pos;
          // pb = pos-1 (cursor between the two \n's)
          if (pos >= 1 && ch(doc, pos - 1) === '\n' && ch(doc, pos) === '\n') {
            // The first \n of the pair is at pos-1; if it belongs to a "  \n" we
            // are actually in a line-break zone, not a paragraph-break zone.
            if (!isLineBreakNl(pos - 1)) return pos - 1;
          }
          // pb = pos-2 (cursor just after second \n)
          if (pos >= 2 && ch(doc, pos - 2) === '\n' && ch(doc, pos - 1) === '\n') {
            if (!isLineBreakNl(pos - 2)) return pos - 2;
          }
          return -1;
        };

        return [
          keymap.of([
            {
              // ── Enter ────────────────────────────────────────────────────
              // • cursor in "  \n" zone   → upgrade to paragraph break "\n\n"
              //   (strip the two leading spaces; cursor lands after second \n)
              // • cursor in "\n\n" zone   → insert plain "\n" (no spaces added)
              // • otherwise               → insert "  \n" as a line-break,
              //   stripping at most the spaces that directly adjoin the cursor
              //   so neither side of the split gets a spurious space.
              key: 'Enter',
              run: (view) => {
                const { from, to } = view.state.selection.main;
                const doc = view.state.doc;

                if (from === to) {
                  const lb = lineBreakAt(doc, from);
                  if (lb !== -1) {
                    view.dispatch({
                      changes: { from: lb, to: lb + 3, insert: '\n\n' },
                      selection: { anchor: lb + 2 },
                    });
                    return true;
                  }

                  const pb = paraBreakAt(doc, from);
                  if (pb !== -1) {
                    // Extra \n inside an existing paragraph break — no spaces
                    view.dispatch({
                      changes: { from, to, insert: '\n' },
                      selection: { anchor: from + 1 },
                    });
                    return true;
                  }
                }

                // Normal split: strip immediately-adjacent spaces (max 1 each side)
                // so the resulting lines have no spurious leading/trailing space.
                // We only strip a single space on each side to avoid clobbering
                // intentional runs of spaces that are not part of a line-break.
                const stripBefore = from > 0 && ch(doc, from - 1) === ' ' ? 1 : 0;
                const stripAfter = to < doc.length && ch(doc, to) === ' ' ? 1 : 0;
                const insertFrom = from - stripBefore;
                const insertTo = to + stripAfter;
                view.dispatch({
                  changes: { from: insertFrom, to: insertTo, insert: '  \n' },
                  selection: { anchor: insertFrom + 3 },
                });
                return true;
              },
            },

            {
              // ── Backspace ────────────────────────────────────────────────
              // Inspect characters directly behind the cursor via fixed peeks.
              //
              // "  \n" — remove whole sequence when cursor at lb+1, lb+2, lb+3.
              //
              // "\n\n" — downgrade to "  \n" when cursor at:
              //   • pb+1: between the two \n's (unconditional)
              //   • pb+2: just after the pair, ONLY when no bare \n immediately
              //     precedes it (ch(from-3)≠'\n') — guards against "\n\n\n" at
              //     end being wrongly downgraded instead of just removing one \n.
              key: 'Backspace',
              run: (view) => {
                const sel = view.state.selection.main;
                if (!sel.empty) return false;
                const from = sel.from;
                if (from === 0) return false;
                const doc = view.state.doc;

                // lb+3: ' '' ''\n' behind cursor
                if (
                  from >= 3 &&
                  ch(doc, from - 3) === ' ' &&
                  ch(doc, from - 2) === ' ' &&
                  ch(doc, from - 1) === '\n'
                ) {
                  view.dispatch({
                    changes: { from: from - 3, to: from, insert: '' },
                    selection: { anchor: from - 3 },
                  });
                  return true;
                }
                // lb+2: ' '' ' behind, '\n' ahead
                if (
                  from >= 2 &&
                  ch(doc, from - 2) === ' ' &&
                  ch(doc, from - 1) === ' ' &&
                  ch(doc, from) === '\n'
                ) {
                  view.dispatch({
                    changes: { from: from - 2, to: from + 1, insert: '' },
                    selection: { anchor: from - 2 },
                  });
                  return true;
                }
                // lb+1: ' ' behind, ' ''\n' ahead
                if (
                  from >= 1 &&
                  ch(doc, from - 1) === ' ' &&
                  ch(doc, from) === ' ' &&
                  ch(doc, from + 1) === '\n'
                ) {
                  view.dispatch({
                    changes: { from: from - 1, to: from + 2, insert: '' },
                    selection: { anchor: from - 1 },
                  });
                  return true;
                }

                // Helper: is the \n at nlPos the trailing \n of a "  \n" sequence?
                const isSoftNl = (nlPos: number): boolean =>
                  nlPos >= 2 &&
                  ch(doc, nlPos - 1) === ' ' &&
                  ch(doc, nlPos - 2) === ' ';

                // pb+1: cursor between the two \n's — downgrade only when the
                // pair is isolated (no bare \n immediately before or after it).
                if (
                  from >= 1 &&
                  ch(doc, from - 1) === '\n' &&
                  ch(doc, from) === '\n' &&
                  !isSoftNl(from - 1) &&
                  ch(doc, from - 2) !== '\n' &&
                  ch(doc, from + 1) !== '\n'
                ) {
                  const pb = from - 1;
                  view.dispatch({
                    changes: { from: pb, to: pb + 2, insert: '  \n' },
                    selection: { anchor: pb + 3 },
                  });
                  return true;
                }
                // pb+2: cursor just after both \n's — guard against \n on either side
                if (
                  from >= 2 &&
                  ch(doc, from - 2) === '\n' &&
                  ch(doc, from - 1) === '\n' &&
                  !isSoftNl(from - 2) &&
                  ch(doc, from - 3) !== '\n' &&
                  ch(doc, from) !== '\n'
                ) {
                  const pb = from - 2;
                  view.dispatch({
                    changes: { from: pb, to: pb + 2, insert: '  \n' },
                    selection: { anchor: pb + 3 },
                  });
                  return true;
                }

                return false;
              },
            },

            {
              // ── Delete ───────────────────────────────────────────────────
              // Mirror of Backspace — inspect characters directly ahead.
              //
              // "  \n" — remove whole sequence when cursor at lb+0, lb+1, lb+2.
              //
              // "\n\n" — downgrade to "  \n" when cursor at:
              //   • pb+1: between the two \n's (unconditional)
              //   • pb+0: before the first \n, ONLY when no bare \n immediately
              //     follows the pair (ch(from+2)≠'\n').
              key: 'Delete',
              run: (view) => {
                const sel = view.state.selection.main;
                if (!sel.empty) return false;
                const from = sel.from;
                const doc = view.state.doc;
                if (from >= doc.length) return false;

                // lb+0: ' '' ''\n' ahead
                if (
                  ch(doc, from) === ' ' &&
                  ch(doc, from + 1) === ' ' &&
                  ch(doc, from + 2) === '\n'
                ) {
                  view.dispatch({
                    changes: { from, to: from + 3, insert: '' },
                    selection: { anchor: from },
                  });
                  return true;
                }
                // lb+1: ' ' behind, ' ''\n' ahead
                if (
                  from >= 1 &&
                  ch(doc, from - 1) === ' ' &&
                  ch(doc, from) === ' ' &&
                  ch(doc, from + 1) === '\n'
                ) {
                  view.dispatch({
                    changes: { from: from - 1, to: from + 2, insert: '' },
                    selection: { anchor: from - 1 },
                  });
                  return true;
                }
                // lb+2: ' '' ' behind, '\n' ahead
                if (
                  from >= 2 &&
                  ch(doc, from - 2) === ' ' &&
                  ch(doc, from - 1) === ' ' &&
                  ch(doc, from) === '\n'
                ) {
                  view.dispatch({
                    changes: { from: from - 2, to: from + 1, insert: '' },
                    selection: { anchor: from - 2 },
                  });
                  return true;
                }

                const isSoftNl = (nlPos: number): boolean =>
                  nlPos >= 2 &&
                  ch(doc, nlPos - 1) === ' ' &&
                  ch(doc, nlPos - 2) === ' ';

                // pb+1: cursor between the two \n's — downgrade only when the
                // pair is isolated (no bare \n immediately before or after it).
                if (
                  from >= 1 &&
                  ch(doc, from - 1) === '\n' &&
                  ch(doc, from) === '\n' &&
                  !isSoftNl(from - 1) &&
                  ch(doc, from - 2) !== '\n' &&
                  ch(doc, from + 1) !== '\n'
                ) {
                  const pb = from - 1;
                  view.dispatch({
                    changes: { from: pb, to: pb + 2, insert: '  \n' },
                    selection: { anchor: pb + 3 },
                  });
                  return true;
                }
                // pb+0: cursor before the first \n — guard against \n on either side
                if (
                  ch(doc, from) === '\n' &&
                  ch(doc, from + 1) === '\n' &&
                  !isSoftNl(from) &&
                  ch(doc, from - 1) !== '\n' &&
                  ch(doc, from + 2) !== '\n'
                ) {
                  view.dispatch({
                    changes: { from, to: from + 2, insert: '  \n' },
                    selection: { anchor: from + 3 },
                  });
                  return true;
                }

                return false;
              },
            },
          ]),

          // ── Typing / pasting inside "  \n" spaces ──────────────────────
          // When the cursor sits between the two spaces (lb+1) or between the
          // second space and the \n (lb+2) and the user types or pastes,
          // redirect the insertion to just before the "  \n" so the line-break
          // is preserved after the new text.
          // This transaction filter is intentionally cheap: it performs at most
          // three single-character peeks regardless of document size.
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged) return tr;
            if (!tr.isUserEvent('input.type') && !tr.isUserEvent('input.paste'))
              return tr;
            const sel = tr.startState.selection.main;
            if (!sel.empty) return tr;
            const from = sel.from;
            if (from < 1) return tr;
            const doc = tr.startState.doc;

            // Only redirect for positions lb+1 and lb+2 (inside the spaces),
            // not lb+0 (before the line-break) or lb+3 (after it).
            // lb+1: doc[from-1]==' ', doc[from]==' ', doc[from+1]=='\n'
            // lb+2: doc[from-2]==' ', doc[from-1]==' ', doc[from]=='\n'
            let lb = -1;
            if (
              from >= 1 &&
              ch(doc, from - 1) === ' ' &&
              ch(doc, from) === ' ' &&
              ch(doc, from + 1) === '\n'
            ) {
              lb = from - 1; // cursor is at lb+1
            } else if (
              from >= 2 &&
              ch(doc, from - 2) === ' ' &&
              ch(doc, from - 1) === ' ' &&
              ch(doc, from) === '\n'
            ) {
              lb = from - 2; // cursor is at lb+2
            }
            if (lb === -1) return tr;

            let insertedText = '';
            tr.changes.iterChanges((_fA, _tA, _fB, _tB, inserted) => {
              insertedText += inserted.toString();
            });
            if (!insertedText) return tr;

            return {
              changes: { from: lb, to: lb, insert: insertedText },
              selection: { anchor: lb + insertedText.length },
              userEvent: 'input.type',
            };
          }),
        ];
      }
      // 'newline' — let defaultKeymap handle Enter (inserts a single '\n')
      return [];
    };

    const buildTabExtension = (): Extension =>
      keymap.of([
        {
          key: 'Tab',
          run: (view) => {
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: '\t' },
              selection: { anchor: from + 1 },
              userEvent: 'input.type',
            });
            return true;
          },
        },
        {
          key: 'Shift-Tab',
          run: (view) => {
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: '\t' },
              selection: { anchor: from + 1 },
              userEvent: 'input.type',
            });
            return true;
          },
        },
      ]);

    const buildPlaceholderExtension = (ph: string | undefined): Extension =>
      ph ? cmPlaceholder(ph) : [];

    const buildMdDecorationExtension = (vm: DecorationViewMode): Extension =>
      buildMarkdownDecorationPlugin(vm);

    // ── Mount / unmount ─────────────────────────────────────────────────────

    useEffect(() => {
      if (!containerRef.current) return undefined;

      const editorAriaLabel = placeholder ?? 'Story content';

      const extensions: Extension[] = [
        baseTheme,
        markdownDecorationTheme,
        EditorView.lineWrapping,
        buildClipboardExtension(),
        // Spellcheck / autocorrect / platform-native behavior in its own compartment
        attributesCompartment.current.of(
          buildAttributesExtension(language, spellCheck, placeholder)
        ),
        history(),
        // Ctrl+F / Cmd+F opens the app search dialog instead of CodeMirror's built-in search
        Prec.highest(
          keymap.of([
            {
              key: 'Ctrl-f',
              mac: 'Cmd-f',
              run: () => {
                onOpenSearchRef.current?.();
                return true;
              },
            },
          ])
        ),
        // Enter/history keymaps take precedence over defaultKeymap
        Prec.high(keymap.of(historyKeymap)),
        // Enter-behavior keymap in its own compartment
        enterCompartment.current.of(buildEnterExtension(enterBehavior)),
        // Tab keymap for Raw/Markdown modes
        Prec.high(buildTabExtension()),
        // Diff highlights for AI changes
        diffCompartment.current.of(buildDiffExtension(baselineValue, showDiff)),
        searchHighlightCompartment.current.of(
          buildSearchHighlightExtension(searchHighlightRanges)
        ),
        keymap.of(defaultKeymap),
        languageCompartment.current.of(buildLanguageExtension(mode)),
        wsCompartment.current.of(buildWsExtension(showWhitespace)),
        placeholderCompartment.current.of(buildPlaceholderExtension(placeholder)),
        mdDecorationCompartment.current.of(buildMdDecorationExtension(viewMode)),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const isExternalSync = update.transactions.some((tx) =>
              tx.annotation(externalValueSyncAnnotation)
            );
            if (isExternalSync) {
              return;
            }
            const val = update.state.doc.toString();
            lastEmittedRef.current = val;
            const isUndoRedo = update.transactions.some(
              (tx) => tx.isUserEvent('undo') || tx.isUserEvent('redo')
            );
            onChangeRef.current(val, isUndoRedo);
          }
          if (update.selectionSet) {
            const { anchor, head } = update.state.selection.main;
            onSelectionChangeRef.current?.(anchor, head);
          }
        }),
      ];

      const state = EditorState.create({ doc: value, extensions });
      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
      lastEmittedRef.current = value;

      // Expose the EditorView via forwardRef
      if (typeof ref === 'function') {
        ref(view);
      } else if (ref) {
        (ref as React.MutableRefObject<EditorView | null>).current = view;
      }

      return () => {
        view.destroy();
        viewRef.current = null;
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref) {
          (ref as React.MutableRefObject<EditorView | null>).current = null;
        }
      };
    }, []); // only on mount / unmount

    // ── Dynamic prop updates via Compartment.reconfigure ────────────────────

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: languageCompartment.current.reconfigure(buildLanguageExtension(mode)),
      });
    }, [mode]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: mdDecorationCompartment.current.reconfigure(
          buildMdDecorationExtension(viewMode)
        ),
      });
    }, [viewMode]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: wsCompartment.current.reconfigure(buildWsExtension(showWhitespace)),
      });
    }, [showWhitespace]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: enterCompartment.current.reconfigure(
          buildEnterExtension(enterBehavior)
        ),
      });
    }, [enterBehavior]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: placeholderCompartment.current.reconfigure(
          buildPlaceholderExtension(placeholder)
        ),
      });
    }, [placeholder]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: attributesCompartment.current.reconfigure(
          buildAttributesExtension(language, spellCheck, placeholder)
        ),
      });
    }, [language, spellCheck, placeholder]);

    // useLayoutEffect (not useEffect) keeps this in the same frame as the
    // external value sync below.  Both are declared in order (baseline first,
    // value second) so that when a new baseline and new content land in the
    // same render the plugin is reconfigured with the correct baseline BEFORE
    // the content dispatch fires — ensuring the first painted frame already
    // shows the correct diff decorations rather than missing them.
    useLayoutEffect(() => {
      viewRef.current?.dispatch({
        effects: diffCompartment.current.reconfigure(
          buildDiffExtension(baselineValue, showDiff)
        ),
      });
    }, [baselineValue, showDiff]);

    useEffect(() => {
      viewRef.current?.dispatch({
        effects: searchHighlightCompartment.current.reconfigure(
          buildSearchHighlightExtension(searchHighlightRanges)
        ),
      });
    }, [searchHighlightRanges]);

    // ── External value sync ─────────────────────────────────────────────────
    // Update the CodeMirror document when the value prop changes due to an
    // external cause (chapter switch, AI insertion) — not when the change
    // originated from our own onChange callback.
    // useLayoutEffect (not useEffect) ensures CodeMirror's DOM is updated
    // synchronously in the same commit phase as the React render, so that any
    // sibling layout effects that measure scrollHeight see the new content
    // height immediately — eliminating one-frame flicker during LLM streaming.
    useLayoutEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const docStr = view.state.doc.toString();
      // Skip if CodeMirror already has this value (our own edit echoed back)
      // or if the last value we emitted matches (user typed ahead of React update cycle)
      if (docStr === value || lastEmittedRef.current === value) return;

      const { anchor, head } = view.state.selection.main;
      const maxPos = value.length;

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: [
          externalValueSyncAnnotation.of(true),
          // External prop changes (LLM updates, dialog restores) must not enter
          // CodeMirror's own undo history.  Without this, Ctrl+Z inside the
          // field would undo the LLM text instead of triggering the dialog-level
          // undo, corrupting the undo/redo button state.
          Transaction.addToHistory.of(false),
        ],
        selection: {
          anchor: Math.min(anchor, maxPos),
          head: Math.min(head, maxPos),
        },
      });
      lastEmittedRef.current = value;
    }, [value]);

    return <div ref={containerRef} className={className} style={style} />;
  }
);

CodeMirrorEditor.displayName = 'CodeMirrorEditor';
