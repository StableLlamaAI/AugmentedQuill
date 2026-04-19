// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * CodeMirror whitespace display plugin: replaces spaces, tabs, and newlines
 * with visible glyph widgets while leaving the document content unchanged.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { Range } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

/** Represents space widget. */
class WsSpaceWidget extends WidgetType {
  /** Convert dom. */
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsMarker = '1';
    el.textContent = ' ';
    return el;
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Represents tab widget. */
class WsTabWidget extends WidgetType {
  /** Convert dom. */
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsTab = '1';
    el.textContent = '→';
    return el;
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Represents nl widget. */
class WsNlWidget extends WidgetType {
  /** Convert dom. */
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.className = 'cm-ws-marker';
    el.dataset.wsNl = '1';
    el.textContent = '¶';
    return el;
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

const wsSpaceWidget = new WsSpaceWidget();
const wsTabWidget = new WsTabWidget();
const wsNlWidget = new WsNlWidget();

export const buildWhitespacePlugin = (): Extension =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      /** Update the requested value. */
      update(u: ViewUpdate): void {
        if (u.viewportChanged || u.geometryChanged) {
          this.decorations = this.build(u.view);
        } else if (u.docChanged) {
          // Fast path: remap positions for single inert-char insertions.
          // Whitespace markers (space/tab/newline) require a full rebuild.
          let safeInsert = true;
          u.changes.iterChanges(
            (
              fromA: number,
              toA: number,
              _fB: number,
              _tB: number,
              ins: import('@codemirror/state').Text
            ) => {
              if (toA !== fromA || ins.length !== 1) {
                safeInsert = false;
                return;
              }
              const c = ins.sliceString(0, 1);
              if (c === ' ' || c === '\t' || c === '\n') safeInsert = false;
            }
          );
          this.decorations = safeInsert
            ? this.decorations.map(u.changes)
            : this.build(u.view);
        }
      }
      /** Build the requested value. */
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
    { decorations: (v: { decorations: DecorationSet }) => v.decorations }
  );
