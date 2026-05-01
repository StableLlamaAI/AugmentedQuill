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

const softBreakChar = (doc: Text, p: number): string =>
  p >= 0 && p < doc.length ? doc.sliceString(p, p + 1) : '';

const softBreakLineBreakAt = (doc: Text, pos: number): number => {
  if (
    softBreakChar(doc, pos) === ' ' &&
    softBreakChar(doc, pos + 1) === ' ' &&
    softBreakChar(doc, pos + 2) === '\n'
  )
    return pos;
  if (
    pos >= 1 &&
    softBreakChar(doc, pos - 1) === ' ' &&
    softBreakChar(doc, pos) === ' ' &&
    softBreakChar(doc, pos + 1) === '\n'
  )
    return pos - 1;
  if (
    pos >= 2 &&
    softBreakChar(doc, pos - 2) === ' ' &&
    softBreakChar(doc, pos - 1) === ' ' &&
    softBreakChar(doc, pos) === '\n'
  )
    return pos - 2;
  if (
    pos >= 3 &&
    softBreakChar(doc, pos - 3) === ' ' &&
    softBreakChar(doc, pos - 2) === ' ' &&
    softBreakChar(doc, pos - 1) === '\n'
  )
    return pos - 3;
  return -1;
};

const softBreakParaBreakAt = (doc: Text, pos: number): number => {
  const isLineBreakNl = (nlPos: number): boolean =>
    nlPos >= 2 &&
    softBreakChar(doc, nlPos - 1) === ' ' &&
    softBreakChar(doc, nlPos - 2) === ' ';

  if (
    softBreakChar(doc, pos) === '\n' &&
    softBreakChar(doc, pos + 1) === '\n' &&
    !isLineBreakNl(pos)
  )
    return pos;
  if (
    pos >= 1 &&
    softBreakChar(doc, pos - 1) === '\n' &&
    softBreakChar(doc, pos) === '\n'
  ) {
    if (!isLineBreakNl(pos - 1)) return pos - 1;
  }
  if (
    pos >= 2 &&
    softBreakChar(doc, pos - 2) === '\n' &&
    softBreakChar(doc, pos - 1) === '\n'
  ) {
    if (!isLineBreakNl(pos - 2)) return pos - 2;
  }
  return -1;
};

const dispatchSoftBreakReplacement = (
  view: import('@codemirror/view').EditorView,
  from: number,
  to: number,
  insert: string,
  anchor: number
): void => {
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor },
  });
};

const trySoftBreakEnter = (view: import('@codemirror/view').EditorView): boolean => {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;

  if (from === to) {
    const lb = softBreakLineBreakAt(doc, from);
    if (lb !== -1) {
      dispatchSoftBreakReplacement(view, lb, lb + 3, '\n\n', lb + 2);
      return true;
    }

    const pb = softBreakParaBreakAt(doc, from);
    if (pb !== -1) {
      dispatchSoftBreakReplacement(view, from, to, '\n', from + 1);
      return true;
    }
  }

  const stripBefore = from > 0 && softBreakChar(doc, from - 1) === ' ' ? 1 : 0;
  const stripAfter = to < doc.length && softBreakChar(doc, to) === ' ' ? 1 : 0;
  dispatchSoftBreakReplacement(
    view,
    from - stripBefore,
    to + stripAfter,
    '  \n',
    from - stripBefore + 3
  );
  return true;
};

const isSoftNl = (doc: Text, nlPos: number): boolean =>
  nlPos >= 2 &&
  softBreakChar(doc, nlPos - 1) === ' ' &&
  softBreakChar(doc, nlPos - 2) === ' ';

const trySoftBreakBackspaceSoftLine = (
  view: import('@codemirror/view').EditorView,
  from: number,
  doc: Text
): boolean => {
  if (
    from >= 3 &&
    softBreakChar(doc, from - 3) === ' ' &&
    softBreakChar(doc, from - 2) === ' ' &&
    softBreakChar(doc, from - 1) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from - 3, from, ' ', from - 2);
    return true;
  }
  if (
    from >= 2 &&
    softBreakChar(doc, from - 2) === ' ' &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from - 2, from + 1, ' ', from - 1);
    return true;
  }
  if (
    from >= 1 &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === ' ' &&
    softBreakChar(doc, from + 1) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from - 1, from + 2, ' ', from);
    return true;
  }
  return false;
};

const trySoftBreakBackspaceParagraph = (
  view: import('@codemirror/view').EditorView,
  from: number,
  doc: Text
): boolean => {
  if (
    from >= 1 &&
    softBreakChar(doc, from - 1) === '\n' &&
    softBreakChar(doc, from) === '\n' &&
    !isSoftNl(doc, from - 1) &&
    softBreakChar(doc, from - 2) !== '\n' &&
    softBreakChar(doc, from + 1) !== '\n'
  ) {
    const pb = from - 1;
    dispatchSoftBreakReplacement(view, pb, pb + 2, '  \n', pb + 3);
    return true;
  }
  if (
    from >= 2 &&
    softBreakChar(doc, from - 2) === '\n' &&
    softBreakChar(doc, from - 1) === '\n' &&
    !isSoftNl(doc, from - 2) &&
    softBreakChar(doc, from - 3) !== '\n' &&
    softBreakChar(doc, from) !== '\n'
  ) {
    const pb = from - 2;
    dispatchSoftBreakReplacement(view, pb, pb + 2, '  \n', pb + 3);
    return true;
  }
  return false;
};

const trySoftBreakBackspace = (
  view: import('@codemirror/view').EditorView
): boolean => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const from = sel.from;
  if (from === 0) return false;
  const doc = view.state.doc;
  return (
    trySoftBreakBackspaceSoftLine(view, from, doc) ||
    trySoftBreakBackspaceParagraph(view, from, doc)
  );
};

const trySoftBreakDeleteSoftLine = (
  view: import('@codemirror/view').EditorView,
  from: number,
  doc: Text
): boolean => {
  if (
    softBreakChar(doc, from) === ' ' &&
    softBreakChar(doc, from + 1) === ' ' &&
    softBreakChar(doc, from + 2) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from, from + 3, ' ', from + 1);
    return true;
  }
  if (
    from >= 1 &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === ' ' &&
    softBreakChar(doc, from + 1) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from - 1, from + 2, ' ', from);
    return true;
  }
  if (
    from >= 2 &&
    softBreakChar(doc, from - 2) === ' ' &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === '\n'
  ) {
    dispatchSoftBreakReplacement(view, from - 2, from + 1, ' ', from - 1);
    return true;
  }
  return false;
};

const trySoftBreakDeleteParagraph = (
  view: import('@codemirror/view').EditorView,
  from: number,
  doc: Text
): boolean => {
  if (
    from >= 1 &&
    softBreakChar(doc, from - 1) === '\n' &&
    softBreakChar(doc, from) === '\n' &&
    !isSoftNl(doc, from - 1) &&
    softBreakChar(doc, from - 2) !== '\n' &&
    softBreakChar(doc, from + 1) !== '\n'
  ) {
    const pb = from - 1;
    dispatchSoftBreakReplacement(view, pb, pb + 2, '  \n', pb + 3);
    return true;
  }
  if (
    softBreakChar(doc, from) === '\n' &&
    softBreakChar(doc, from + 1) === '\n' &&
    !isSoftNl(doc, from) &&
    softBreakChar(doc, from - 1) !== '\n' &&
    softBreakChar(doc, from + 2) !== '\n'
  ) {
    dispatchSoftBreakReplacement(view, from, from + 2, '  \n', from + 3);
    return true;
  }
  return false;
};

const trySoftBreakDelete = (view: import('@codemirror/view').EditorView): boolean => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const from = sel.from;
  const doc = view.state.doc;
  if (from >= doc.length) return false;
  return (
    trySoftBreakDeleteSoftLine(view, from, doc) ||
    trySoftBreakDeleteParagraph(view, from, doc)
  );
};

const redirectTypingInSoftBreaks = (
  tr: import('@codemirror/state').Transaction
):
  | import('@codemirror/state').TransactionSpec
  | readonly import('@codemirror/state').TransactionSpec[] => {
  if (!tr.docChanged) return tr;
  if (!tr.isUserEvent('input.type') && !tr.isUserEvent('input.paste')) return tr;
  const sel = tr.startState.selection.main;
  if (!sel.empty) return tr;
  const from = sel.from;
  if (from < 1) return tr;
  const doc = tr.startState.doc;

  let lb = -1;
  if (
    from >= 1 &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === ' ' &&
    softBreakChar(doc, from + 1) === '\n'
  ) {
    lb = from - 1;
  } else if (
    from >= 2 &&
    softBreakChar(doc, from - 2) === ' ' &&
    softBreakChar(doc, from - 1) === ' ' &&
    softBreakChar(doc, from) === '\n'
  ) {
    lb = from - 2;
  }
  if (lb === -1) return tr;

  let insertedText = '';
  tr.changes.iterChanges(
    (_fA: number, _tA: number, _fB: number, _tB: number, inserted: Text): void => {
      insertedText += inserted.toString();
    }
  );
  if (!insertedText) return tr;

  return {
    changes: { from: lb, to: lb, insert: insertedText },
    selection: { anchor: lb + insertedText.length },
    userEvent: 'input.type',
  };
};

export const buildEnterExtension = (eb: EnterBehavior): Extension => {
  if (eb === 'ignore') {
    return keymap.of([
      { key: 'Enter', run: (): boolean => true }, // swallow silently
      { key: 'Shift-Enter', run: (): boolean => true },
    ]);
  }
  if (eb === 'softbreak') {
    return [
      keymap.of([
        {
          key: 'Enter',
          run: trySoftBreakEnter,
        },
        {
          key: 'Backspace',
          run: trySoftBreakBackspace,
        },
        {
          key: 'Delete',
          run: trySoftBreakDelete,
        },
      ]),
      EditorState.transactionFilter.of(redirectTypingInSoftBreaks),
    ];
  }
  // 'newline' — let defaultKeymap handle Enter (inserts a single '\n')
  return [];
};

export const buildTabExtension = (): Extension =>
  keymap.of([
    {
      key: 'Tab',
      run: (view: import('@codemirror/view').EditorView): boolean => {
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
      run: (view: import('@codemirror/view').EditorView): boolean => {
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
