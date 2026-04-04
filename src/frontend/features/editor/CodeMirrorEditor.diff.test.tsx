// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Tests for the diff-highlighting feature in CodeMirrorEditor.
 * Verifies that text insertions relative to a baseline value are decorated.
 */

// @vitest-environment jsdom

import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { CodeMirrorEditor } from './CodeMirrorEditor';

afterEach(() => {
  cleanup();
});

describe('CodeMirrorEditor Diff Highlighting', () => {
  it('identifies and marks inserted text when baselineValue is provided', async () => {
    const baseline = 'The quick brown fox';
    const current = 'The quick red brown fox';
    const ref = React.createRef<EditorView | null>();

    await act(async () => {
      render(
        <CodeMirrorEditor
          ref={ref}
          value={current}
          baselineValue={baseline}
          onChange={vi.fn()}
        />
      );
    });

    const view = ref.current!;
    expect(view.state.doc.toString()).toBe(current);

    // CodeMirror decorations are applied via a ViewPlugin.
    // We check if the 'diff-inserted' class is present in the DOM for the 'red ' part.
    const content = view.contentDOM.innerHTML;

    // Note: CodeMirror might split the text into multiple spans or elements.
    // We expect to find the 'diff-inserted' class somewhere.
    expect(content).toContain('diff-inserted');
    expect(content).toContain('red');
  });

  it('updates decorations when baselineValue or value changes', async () => {
    const ref = React.createRef<EditorView | null>();
    const { rerender } = render(
      <CodeMirrorEditor
        ref={ref}
        value="Initial"
        baselineValue="Initial"
        onChange={vi.fn()}
      />
    );

    // No highlights initially
    expect(ref.current!.contentDOM.innerHTML).not.toContain('diff-inserted');

    // Change value to add text
    await act(async () => {
      rerender(
        <CodeMirrorEditor
          ref={ref}
          value="Initial with more"
          baselineValue="Initial"
          onChange={vi.fn()}
        />
      );
    });

    expect(ref.current!.contentDOM.innerHTML).toContain('diff-inserted');
    expect(ref.current!.contentDOM.innerHTML).toContain('with more');

    // Update baseline to match value -> highlights should disappear
    await act(async () => {
      rerender(
        <CodeMirrorEditor
          ref={ref}
          value="Initial with more"
          baselineValue="Initial with more"
          onChange={vi.fn()}
        />
      );
    });

    expect(ref.current!.contentDOM.innerHTML).not.toContain('diff-inserted');
  });
});
