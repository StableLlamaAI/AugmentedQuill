// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * CodeMirror keymap extensions for the prose editor:
 * - buildEnterExtension: custom Enter/Backspace/Delete handling for markdown
 *   soft-breaks ("  \n") and paragraph breaks ("\n\n").
 * - buildTabExtension: Tab/Shift-Tab insert a literal tab character.
 */

import { keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { Text } from '@codemirror/state';

type EnterBehavior = 'ignore' | 'softbreak' | 'newline';

export const buildEnterExtension = (eb: EnterBehavior): Extension => {
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
     */
    const lineBreakAt = (doc: Text, pos: number): number => {
      if (ch(doc, pos) === ' ' && ch(doc, pos + 1) === ' ' && ch(doc, pos + 2) === '\n')
        return pos;
      if (
        pos >= 1 &&
        ch(doc, pos - 1) === ' ' &&
        ch(doc, pos) === ' ' &&
        ch(doc, pos + 1) === '\n'
      )
        return pos - 1;
      if (
        pos >= 2 &&
        ch(doc, pos - 2) === ' ' &&
        ch(doc, pos - 1) === ' ' &&
        ch(doc, pos) === '\n'
      )
        return pos - 2;
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
     * the first \n. Only matches a bare "\n\n" — not one that follows "  \n".
     */
    const paraBreakAt = (doc: Text, pos: number): number => {
      const isLineBreakNl = (nlPos: number): boolean =>
        nlPos >= 2 && ch(doc, nlPos - 1) === ' ' && ch(doc, nlPos - 2) === ' ';

      if (ch(doc, pos) === '\n' && ch(doc, pos + 1) === '\n' && !isLineBreakNl(pos))
        return pos;
      if (pos >= 1 && ch(doc, pos - 1) === '\n' && ch(doc, pos) === '\n') {
        if (!isLineBreakNl(pos - 1)) return pos - 1;
      }
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
          // • cursor in "\n\n" zone   → insert plain "\n"
          // • otherwise               → insert "  \n" as a line-break
          key: 'Enter',
          run: (view: import('@codemirror/view').EditorView) => {
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
                view.dispatch({
                  changes: { from, to, insert: '\n' },
                  selection: { anchor: from + 1 },
                });
                return true;
              }
            }

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
          // "  \n" — remove whole sequence when cursor at lb+1, lb+2, lb+3.
          // "\n\n" — downgrade to "  \n" when cursor at pb+1 or pb+2.
          key: 'Backspace',
          run: (view: import('@codemirror/view').EditorView) => {
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const from = sel.from;
            if (from === 0) return false;
            const doc = view.state.doc;

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

            const isSoftNl = (nlPos: number): boolean =>
              nlPos >= 2 && ch(doc, nlPos - 1) === ' ' && ch(doc, nlPos - 2) === ' ';

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
          // "  \n" — remove whole sequence when cursor at lb+0, lb+1, lb+2.
          // "\n\n" — downgrade to "  \n" when cursor at pb+1 or pb+0.
          key: 'Delete',
          run: (view: import('@codemirror/view').EditorView) => {
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const from = sel.from;
            const doc = view.state.doc;
            if (from >= doc.length) return false;

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
              nlPos >= 2 && ch(doc, nlPos - 1) === ' ' && ch(doc, nlPos - 2) === ' ';

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
      EditorState.transactionFilter.of(
        (tr: import('@codemirror/state').Transaction) => {
          if (!tr.docChanged) return tr;
          if (!tr.isUserEvent('input.type') && !tr.isUserEvent('input.paste'))
            return tr;
          const sel = tr.startState.selection.main;
          if (!sel.empty) return tr;
          const from = sel.from;
          if (from < 1) return tr;
          const doc = tr.startState.doc;

          const ch = (d: Text, p: number): string =>
            p >= 0 && p < d.length ? d.sliceString(p, p + 1) : '';

          let lb = -1;
          if (
            from >= 1 &&
            ch(doc, from - 1) === ' ' &&
            ch(doc, from) === ' ' &&
            ch(doc, from + 1) === '\n'
          ) {
            lb = from - 1;
          } else if (
            from >= 2 &&
            ch(doc, from - 2) === ' ' &&
            ch(doc, from - 1) === ' ' &&
            ch(doc, from) === '\n'
          ) {
            lb = from - 2;
          }
          if (lb === -1) return tr;

          let insertedText = '';
          tr.changes.iterChanges(
            (_fA: number, _tA: number, _fB: number, _tB: number, inserted: Text) => {
              insertedText += inserted.toString();
            }
          );
          if (!insertedText) return tr;

          return {
            changes: { from: lb, to: lb, insert: insertedText },
            selection: { anchor: lb + insertedText.length },
            userEvent: 'input.type',
          };
        }
      ),
    ];
  }
  // 'newline' — let defaultKeymap handle Enter (inserts a single '\n')
  return [];
};

export const buildTabExtension = (): Extension =>
  keymap.of([
    {
      key: 'Tab',
      run: (view: import('@codemirror/view').EditorView) => {
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
      run: (view: import('@codemirror/view').EditorView) => {
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
