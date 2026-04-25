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
import { diff_match_patch } from 'diff-match-patch';

type WsDiffFlag = '1' | undefined;
type WsMarkerKind = 'space' | 'tab' | 'newline';

const dmp = new diff_match_patch();

function isVisibleWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n';
}

export function createWhitespaceMarkerElement(
  kind: WsMarkerKind,
  diffFlag?: WsDiffFlag
): HTMLSpanElement {
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  el.className = 'cm-ws-marker';

  const glyph = document.createElement('span');
  glyph.className = 'cm-ws-glyph';

  if (kind === 'space') {
    el.dataset.wsMarker = '1';
    glyph.textContent = ' ';
  } else if (kind === 'tab') {
    el.dataset.wsTab = '1';
    glyph.textContent = '→';
  } else {
    el.dataset.wsNl = '1';
    glyph.textContent = '¶';
  }

  if (diffFlag) {
    el.dataset.wsDiff = diffFlag;
  }

  el.appendChild(glyph);
  return el;
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

function computeInsertedWhitespacePositions(
  baseline: string,
  currentText: string,
  streamingMode: boolean
): Set<number> {
  const positions = new Set<number>();
  if (baseline === currentText) {
    return positions;
  }

  if (streamingMode) {
    const prefixLen = commonPrefixLength(baseline, currentText);
    for (let pos = prefixLen; pos < currentText.length; pos++) {
      if (isVisibleWhitespace(currentText[pos])) {
        positions.add(pos);
      }
    }
    return positions;
  }

  const diffs = dmp.diff_main(baseline, currentText);
  dmp.diff_cleanupSemantic(diffs);

  let pos = 0;
  for (const [op, text] of diffs) {
    if (op === 0) {
      pos += text.length;
      continue;
    }
    if (op === 1) {
      for (let i = 0; i < text.length; i++) {
        if (isVisibleWhitespace(text[i])) {
          positions.add(pos + i);
        }
      }
      pos += text.length;
    }
  }

  return positions;
}

/** Represents space widget. */
class WsSpaceWidget extends WidgetType {
  constructor(private readonly diffFlag?: WsDiffFlag) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('space', this.diffFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Represents tab widget. */
class WsTabWidget extends WidgetType {
  constructor(private readonly diffFlag?: WsDiffFlag) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('tab', this.diffFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Represents nl widget. */
class WsNlWidget extends WidgetType {
  constructor(private readonly diffFlag?: WsDiffFlag) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('newline', this.diffFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return true;
  }
}

const wsSpaceWidget = new WsSpaceWidget();
const wsSpaceDiffWidget = new WsSpaceWidget('1');
const wsTabWidget = new WsTabWidget();
const wsTabDiffWidget = new WsTabWidget('1');
const wsNlWidget = new WsNlWidget();
const wsNlDiffWidget = new WsNlWidget('1');

export const buildWhitespacePlugin = (
  baseline: string | undefined,
  showDiff: boolean,
  streamingMode: boolean
): Extension =>
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
        const docText = view.state.doc.toString();
        const insertedWhitespace =
          showDiff && baseline != null
            ? computeInsertedWhitespacePositions(baseline, docText, streamingMode)
            : null;
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
          const nlWidget = insertedWhitespace?.has(line.to)
            ? wsNlDiffWidget
            : wsNlWidget;
          // side: 1 places the widget after the position (at the line end,
          // after the logical caret slot), so the cursor appears before the mark.
          decs.push(Decoration.widget({ widget: nlWidget, side: 1 }).range(line.to));
        }

        // Space / tab replacements within the visible range
        const text = doc.sliceString(vpFrom, vpTo);
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const pos = vpFrom + i;
          const isInsertedWs = insertedWhitespace?.has(pos) ?? false;
          if (ch === ' ') {
            decs.push(
              Decoration.replace({
                widget: isInsertedWs ? wsSpaceDiffWidget : wsSpaceWidget,
              }).range(pos, pos + 1)
            );
          } else if (ch === '\t') {
            decs.push(
              Decoration.replace({
                widget: isInsertedWs ? wsTabDiffWidget : wsTabWidget,
              }).range(pos, pos + 1)
            );
          }
        }

        // Decoration.set(decs, true) sorts by position automatically
        return Decoration.set(decs, true);
      }
    },
    { decorations: (v: { decorations: DecorationSet }) => v.decorations }
  );
