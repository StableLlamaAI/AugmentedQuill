// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * CodeMirror whitespace display plugin: renders spaces as styled marks and
 * tabs/newlines as widgets while leaving the document content unchanged.
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
type WsSelectedFlag = '1' | undefined;

const dmp = new diff_match_patch();

function isVisibleWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n';
}

export function createWhitespaceMarkerElement(
  kind: WsMarkerKind,
  diffFlag?: WsDiffFlag,
  selectedFlag?: WsSelectedFlag
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
  if (selectedFlag) {
    el.dataset.wsSelected = selectedFlag;
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
  constructor(
    private readonly diffFlag?: WsDiffFlag,
    private readonly selectedFlag?: WsSelectedFlag
  ) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('space', this.diffFlag, this.selectedFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Represents tab widget. */
class WsTabWidget extends WidgetType {
  constructor(
    private readonly diffFlag?: WsDiffFlag,
    private readonly selectedFlag?: WsSelectedFlag
  ) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('tab', this.diffFlag, this.selectedFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Represents nl widget. */
class WsNlWidget extends WidgetType {
  constructor(
    private readonly diffFlag?: WsDiffFlag,
    private readonly selectedFlag?: WsSelectedFlag
  ) {
    super();
  }

  /** Convert dom. */
  toDOM(): HTMLElement {
    return createWhitespaceMarkerElement('newline', this.diffFlag, this.selectedFlag);
  }
  /** Helper for event. */
  ignoreEvent(): boolean {
    return false;
  }
}

const wsSpaceWidget = new WsSpaceWidget();
const wsSpaceSelectedWidget = new WsSpaceWidget(undefined, '1');
const wsSpaceDiffWidget = new WsSpaceWidget('1');
const wsSpaceDiffSelectedWidget = new WsSpaceWidget('1', '1');

const wsTabWidget = new WsTabWidget();
const wsTabSelectedWidget = new WsTabWidget(undefined, '1');
const wsTabDiffWidget = new WsTabWidget('1');
const wsTabDiffSelectedWidget = new WsTabWidget('1', '1');

const wsNlWidget = new WsNlWidget();
const wsNlSelectedWidget = new WsNlWidget(undefined, '1');
const wsNlDiffWidget = new WsNlWidget('1');
const wsNlDiffSelectedWidget = new WsNlWidget('1', '1');

function createNewlineWidget(isDiff: boolean, isSelected: boolean): WidgetType {
  return isDiff
    ? isSelected
      ? wsNlDiffSelectedWidget
      : wsNlDiffWidget
    : isSelected
      ? wsNlSelectedWidget
      : wsNlWidget;
}

function createSpaceDecoration(isSelected: boolean): Decoration {
  return isSelected ? wsSpaceSelectedMark : wsSpaceMark;
}

function createWhitespaceWidget(
  ch: string,
  isInserted: boolean,
  isSelected: boolean
): WidgetType | null {
  if (ch === ' ') {
    return isInserted
      ? isSelected
        ? wsSpaceDiffSelectedWidget
        : wsSpaceDiffWidget
      : isSelected
        ? wsSpaceSelectedWidget
        : wsSpaceWidget;
  }
  if (ch === '\t') {
    return isInserted
      ? isSelected
        ? wsTabDiffSelectedWidget
        : wsTabDiffWidget
      : isSelected
        ? wsTabSelectedWidget
        : wsTabWidget;
  }
  return null;
}

function createSpaceMark(
  diffFlag?: WsDiffFlag,
  selectedFlag?: WsSelectedFlag
): Decoration {
  const attributes: Record<string, string> = {
    class: 'cm-ws-marker cm-ws-space',
    'data-ws-marker': '1',
  };
  if (diffFlag) {
    attributes['data-ws-diff'] = diffFlag;
  }
  if (selectedFlag) {
    attributes['data-ws-selected'] = selectedFlag;
  }
  return Decoration.mark({ attributes });
}

const wsSpaceMark = createSpaceMark();
const wsSpaceSelectedMark = createSpaceMark(undefined, '1');
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
        } else if (u.selectionSet) {
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
            ): void => {
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
        const selectionRanges = view.state.selection.ranges;

        const intersectsSelection = (from: number, to: number): boolean =>
          selectionRanges.some(
            (range: { from: number; to: number }): boolean =>
              range.from < to && range.to > from
          );

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
          const hasRealNewline = line.to < doc.length;
          const isSelectedNewline = hasRealNewline
            ? intersectsSelection(line.to, line.to + 1)
            : false;
          const isDiffNewline = insertedWhitespace?.has(line.to) ?? false;
          const nlWidget = createNewlineWidget(isDiffNewline, isSelectedNewline);
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
          const isSelectedWs = intersectsSelection(pos, pos + 1);
          if (ch === ' ') {
            if (isInsertedWs) {
              const widget = createWhitespaceWidget(ch, isInsertedWs, isSelectedWs);
              if (widget) {
                decs.push(Decoration.replace({ widget }).range(pos, pos + 1));
              }
            } else {
              decs.push(createSpaceDecoration(isSelectedWs).range(pos, pos + 1));
            }
            continue;
          }
          const widget = createWhitespaceWidget(ch, isInsertedWs, isSelectedWs);
          if (widget) {
            decs.push(Decoration.replace({ widget }).range(pos, pos + 1));
          }
        }

        // Decoration.set(decs, true) sorts by position automatically
        return Decoration.set(decs, true);
      }
    },
    { decorations: (v: { decorations: DecorationSet }): DecorationSet => v.decorations }
  );
