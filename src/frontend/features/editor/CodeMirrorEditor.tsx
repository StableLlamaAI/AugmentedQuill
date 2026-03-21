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

import React, { useEffect, useRef } from 'react';
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
import { EditorState, Compartment, Prec } from '@codemirror/state';
import type { Extension, Range } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// ─── Whitespace display ──────────────────────────────────────────────────────
// These widgets replace spaces, tabs and newline-positions with a visible glyph
// while keeping the document content unchanged.  contenteditable="false" on the
// widget containers prevents the caret from landing inside them.

class WsSpaceWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.textContent = '·';
    // Use inline-block with a width equal to a typical space, so visible whitespace
    // mode does not significantly change layout.  Keep consistent with WYSIWYG.
    el.style.display = 'inline-block';
    // Use 1ch so the visible marker takes up exactly one monospace character cell
    // and does not alter layout in Raw mode.
    el.style.minWidth = '1ch';
    el.style.width = '1ch';
    el.style.textAlign = 'center';
    el.style.verticalAlign = 'baseline';
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
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
    el.textContent = '→';
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
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
    el.textContent = '¶';
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
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
        if (u.docChanged || u.viewportChanged || u.geometryChanged) {
          this.decorations = this.build(u.view);
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
          // side: -1 places the widget before the position (at the line end,
          // before any following newline character)
          decs.push(Decoration.widget({ widget: wsNlWidget, side: -1 }).range(line.to));
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
  // Placeholder styling
  '.cm-placeholder': {
    color: 'inherit',
    opacity: '0.4',
    fontStyle: 'normal',
  },
});

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * 'plain'    — no syntax highlighting (default)
   * 'markdown' — Lezer-based markdown highlighting and softbreak Enter
   */
  mode?: 'plain' | 'markdown';
  /** Show spaces / tabs / newlines as visible glyphs */
  showWhitespace?: boolean;
  /**
   * 'newline'   — Enter inserts a plain newline (default)
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
      mode = 'plain',
      showWhitespace = false,
      enterBehavior = 'newline',
      placeholder,
      className,
      style,
      onSelectionChange,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Stable callback refs so the CodeMirror updateListener closure always
    // calls the latest version without needing the view to be recreated.
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;

    // Track the last value emitted by our own onChange so we can distinguish
    // externally-driven value changes from the echo of our own edits.
    const lastEmittedRef = useRef(value);

    // Compartments allow dynamic extension switching without recreating the view
    const languageCompartment = useRef(new Compartment());
    const wsCompartment = useRef(new Compartment());
    const enterCompartment = useRef(new Compartment());
    const placeholderCompartment = useRef(new Compartment());

    // ── Extension builders ──────────────────────────────────────────────────

    const buildLanguageExtension = (m: typeof mode): Extension =>
      m === 'markdown'
        ? [markdown({ addKeymap: false }), syntaxHighlighting(mdHighlightStyle)]
        : [];

    const buildWsExtension = (ws: boolean): Extension =>
      ws ? buildWhitespacePlugin() : [];

    const buildEnterExtension = (eb: typeof enterBehavior): Extension => {
      if (eb === 'ignore') {
        return keymap.of([
          { key: 'Enter', run: () => true }, // swallow silently
          { key: 'Shift-Enter', run: () => true },
        ]);
      }
      if (eb === 'softbreak') {
        return keymap.of([
          {
            key: 'Enter',
            run: (view) => {
              const { from, to } = view.state.selection.main;
              const line = view.state.doc.lineAt(from);
              const lineBeforeCaret = view.state.doc.sliceString(line.from, from);

              let deleteFrom = from;
              let insert: string;
              if (lineBeforeCaret.endsWith('  ')) {
                // Second Enter: remove trailing soft-break spaces, open paragraph
                deleteFrom = from - 2;
                insert = '\n\n';
              } else {
                // First Enter: trailing-space soft break
                insert = '  \n';
              }

              view.dispatch({
                changes: { from: deleteFrom, to, insert },
                selection: { anchor: deleteFrom + insert.length },
              });
              return true;
            },
          },
        ]);
      }
      // 'newline' — let defaultKeymap handle Enter (inserts a single '\n')
      return [];
    };

    const buildPlaceholderExtension = (ph: string | undefined): Extension =>
      ph ? cmPlaceholder(ph) : [];

    // ── Mount / unmount ─────────────────────────────────────────────────────

    useEffect(() => {
      if (!containerRef.current) return undefined;

      const extensions: Extension[] = [
        baseTheme,
        EditorView.lineWrapping,
        // Disable spellcheck / autocorrect on the editable surface
        EditorView.contentAttributes.of({
          spellcheck: 'false',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
        history(),
        // Enter/history keymaps take precedence over defaultKeymap
        Prec.high(keymap.of(historyKeymap)),
        // Enter-behavior keymap in its own compartment
        enterCompartment.current.of(buildEnterExtension(enterBehavior)),
        keymap.of(defaultKeymap),
        languageCompartment.current.of(buildLanguageExtension(mode)),
        wsCompartment.current.of(buildWsExtension(showWhitespace)),
        placeholderCompartment.current.of(buildPlaceholderExtension(placeholder)),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const val = update.state.doc.toString();
            lastEmittedRef.current = val;
            onChangeRef.current(val);
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

    // ── External value sync ─────────────────────────────────────────────────
    // Update the CodeMirror document when the value prop changes due to an
    // external cause (chapter switch, AI insertion) — not when the change
    // originated from our own onChange callback.
    useEffect(() => {
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
