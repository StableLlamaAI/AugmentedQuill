// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * CodeMirror diff highlight plugin: decorates inserted text and injects
 * deleted-text widgets by diffing the current document against a baseline.
 * Also exports the shared externalValueSyncAnnotation used to distinguish
 * programmatic value syncs from user edits.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { Annotation } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { diff_match_patch } from 'diff-match-patch';

// Marks transactions that mirror external prop updates so the updateListener
// can skip emitting onChange for programmatic document replacements.
export const externalValueSyncAnnotation = Annotation.define<boolean>();

const dmp = new diff_match_patch();

const diffMark = Decoration.mark({
  class: 'cm-diff-inserted',
});

function appendDeletedTextWithWhitespaceMarkers(
  container: HTMLSpanElement,
  text: string
): void {
  const fragment = document.createDocumentFragment();
  for (const ch of text) {
    if (ch === ' ') {
      const marker = document.createElement('span');
      marker.setAttribute('aria-hidden', 'true');
      marker.className = 'cm-ws-marker';
      marker.dataset.wsMarker = '1';
      marker.dataset.wsDeleted = '1';
      marker.textContent = ' ';
      fragment.appendChild(marker);
      continue;
    }
    if (ch === '\t') {
      const marker = document.createElement('span');
      marker.setAttribute('aria-hidden', 'true');
      marker.className = 'cm-ws-marker';
      marker.dataset.wsTab = '1';
      marker.dataset.wsDeleted = '1';
      marker.textContent = '→';
      fragment.appendChild(marker);
      continue;
    }
    if (ch === '\n') {
      const marker = document.createElement('span');
      marker.setAttribute('aria-hidden', 'true');
      marker.className = 'cm-ws-marker';
      marker.dataset.wsNl = '1';
      marker.dataset.wsDeleted = '1';
      marker.textContent = '¶';
      fragment.appendChild(marker);
      // Keep a real newline so line and paragraph breaks match deleted content.
      fragment.appendChild(document.createTextNode('\n'));
      continue;
    }
    fragment.appendChild(document.createTextNode(ch));
  }
  container.appendChild(fragment);
}

/** Represents widget. */
class DeletedWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly showWhitespace: boolean
  ) {
    super();
  }
  /** Convert dom. */
  toDOM(): HTMLSpanElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-diff-deleted';
    if (this.showWhitespace) {
      appendDeletedTextWithWhitespaceMarkers(wrap, this.text);
    } else {
      wrap.textContent = this.text;
    }
    return wrap;
  }
}

/** Debounce delay before recomputing full diff decorations (ms). */
const DIFF_DEBOUNCE_MS = 500;
/** Documents smaller than this threshold are diffed immediately. */
const DIFF_IMMEDIATE_THRESHOLD = 5000;

/**
 * Return the number of leading characters that are identical in both strings.
 * Used for the streaming diff strategy which avoids LCS on partial content.
 */
function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

export const buildDiffPlugin = (
  baseline: string,
  streamingMode: boolean = false,
  showWhitespace: boolean = false
): Extension =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private pending: ReturnType<typeof setTimeout> | null = null;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      /** Update the requested value. */
      update(u: ViewUpdate): void {
        if (!u.docChanged) return;

        // External value syncs (undo/redo, AI insertion, chapter switch)
        // are single atomic replacements — compute immediately so the
        // user sees the diff result without delay.
        const isExternalSync = u.transactions.some(
          (tr: import('@codemirror/state').Transaction) =>
            tr.annotation(externalValueSyncAnnotation)
        );

        // For small documents or external syncs, compute immediately.
        if (u.state.doc.length < DIFF_IMMEDIATE_THRESHOLD || isExternalSync) {
          this.cancelPending();
          this.decorations = this.build(u.view);
          return;
        }

        // For large documents during normal typing, remap existing
        // decorations immediately so positions stay correct, then
        // schedule a full diff rebuild after the user pauses typing.
        this.decorations = this.decorations.map(u.changes);
        this.scheduleBuild(u.view);
      }
      /** Helper for the requested value. */
      destroy(): void {
        this.cancelPending();
      }
      /** Helper for pending. */
      private cancelPending(): void {
        if (this.pending !== null) {
          clearTimeout(this.pending);
          this.pending = null;
        }
      }
      /** Schedule build. */
      private scheduleBuild(view: EditorView): void {
        this.cancelPending();
        this.pending = setTimeout(() => {
          this.pending = null;
          this.decorations = this.build(view);
          view.dispatch(); // trigger decoration update
        }, DIFF_DEBOUNCE_MS);
      }
      /** Build the requested value. */
      build(view: EditorView): DecorationSet {
        const currentText = view.state.doc.toString();
        if (baseline === currentText) return Decoration.none;

        if (streamingMode) {
          // During streaming we use a common-prefix strategy instead of LCS:
          //   – Find the longest shared prefix between baseline and the partial
          //     streamed text (handles both rewrite and extend correctly).
          //   – Show baseline[prefix:] as a deleted widget at the prefix position.
          //   – Mark currentText[prefix:] as inserted (green).
          // This avoids flickering caused by diff_match_patch finding accidental
          // common subsequences inside a partially-written rewrite, which made
          // earlier chunks look "equal" and only the latest chunk look new.
          const prefixLen = commonPrefixLength(baseline, currentText);
          const deletedSuffix = baseline.slice(prefixLen);
          const insertedEnd = currentText.length;
          const decs: Range<Decoration>[] = [];
          if (deletedSuffix.length > 0) {
            decs.push(
              Decoration.widget({
                widget: new DeletedWidget(deletedSuffix, showWhitespace),
                side: 0,
              }).range(prefixLen)
            );
          }
          if (insertedEnd > prefixLen) {
            decs.push(diffMark.range(prefixLen, insertedEnd));
          }
          return decs.length > 0 ? Decoration.set(decs, true) : Decoration.none;
        }

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
                widget: new DeletedWidget(text, showWhitespace),
                side: 0,
              }).range(pos)
            );
          }
        }

        return Decoration.set(decs, true);
      }
    },
    { decorations: (v: { decorations: DecorationSet }) => v.decorations }
  );
