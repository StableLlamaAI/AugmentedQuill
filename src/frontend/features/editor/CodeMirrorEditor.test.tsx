// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Tests for CodeMirrorEditor covering the public API surface —
 * ref exposure, value initialisation, onChange/onSelectionChange callbacks,
 * external value sync with echo-prevention, compartment reconfiguration, and
 * enterBehavior modes.
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Press a key on the CodeMirror content DOM by dispatching a real KeyboardEvent.
 * Wrapped in `act` so React flushes any resulting state updates.
 */
function pressKey(
  view: EditorView,
  key: string,
  extraInit: KeyboardEventInit = {}
): void {
  view.contentDOM.focus();
  act(() => {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...extraInit,
      })
    );
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('CodeMirrorEditor', () => {
  // ── Mount / ref ────────────────────────────────────────────────────────────

  it('exposes an EditorView instance via forwardRef after mount', async () => {
    const ref = React.createRef<EditorView | null>();
    await act(async () => {
      render(<CodeMirrorEditor ref={ref} value="hello" onChange={vi.fn()} />);
    });
    expect(ref.current).toBeInstanceOf(EditorView);
  });

  it('initialises the document content from the value prop', async () => {
    const ref = React.createRef<EditorView | null>();
    await act(async () => {
      render(<CodeMirrorEditor ref={ref} value="initial text" onChange={vi.fn()} />);
    });
    expect(ref.current?.state.doc.toString()).toBe('initial text');
  });

  it('clears the forwardRef on unmount', async () => {
    const ref = React.createRef<EditorView | null>();
    const { unmount } = render(
      <CodeMirrorEditor ref={ref} value="text" onChange={vi.fn()} />
    );
    await act(async () => {
      unmount();
    });
    expect(ref.current).toBeNull();
  });

  // ── Callbacks ──────────────────────────────────────────────────────────────

  it('calls onChange with the new document string when content is mutated', async () => {
    const onChange = vi.fn();
    const ref = React.createRef<EditorView | null>();
    await act(async () => {
      render(<CodeMirrorEditor ref={ref} value="" onChange={onChange} />);
    });
    act(() => {
      ref.current!.dispatch({ changes: { from: 0, to: 0, insert: 'typed' } });
    });
    expect(onChange).toHaveBeenCalledWith('typed');
  });

  it('calls onSelectionChange with anchor and head when selection changes', async () => {
    const onSelectionChange = vi.fn();
    const ref = React.createRef<EditorView | null>();
    await act(async () => {
      render(
        <CodeMirrorEditor
          ref={ref}
          value="hello world"
          onChange={vi.fn()}
          onSelectionChange={onSelectionChange}
        />
      );
    });
    act(() => {
      ref.current!.dispatch({ selection: { anchor: 3, head: 7 } });
    });
    expect(onSelectionChange).toHaveBeenCalledWith(3, 7);
  });

  // ── External value sync ────────────────────────────────────────────────────

  it('syncs document when value prop changes due to an external update', async () => {
    const ref = React.createRef<EditorView | null>();
    const { rerender } = render(
      <CodeMirrorEditor ref={ref} value="first" onChange={vi.fn()} />
    );
    // 'first' is both in doc and lastEmittedRef at this point.
    // Simulate an external change (e.g. chapter switch): mutate the doc
    // directly so lastEmittedRef stays 'first', then pass a different value prop.
    act(() => {
      // Manually update the doc without going through onChange so lastEmittedRef
      // stays 'first' and the new value prop 'external' is truly foreign.
      ref.current!.dispatch({
        changes: { from: 0, to: ref.current!.state.doc.length, insert: 'first' },
      });
    });
    // Reset lastEmittedRef to 'first' (it is already, but make it explicit) then
    // pass a different inbound value that neither matches the doc nor lastEmitted.
    await act(async () => {
      rerender(<CodeMirrorEditor ref={ref} value="external" onChange={vi.fn()} />);
    });
    expect(ref.current?.state.doc.toString()).toBe('external');
  });

  it('does not re-dispatch when echoed value prop matches the last emitted value', async () => {
    const onChange = vi.fn();
    const ref = React.createRef<EditorView | null>();
    await act(async () => {
      render(<CodeMirrorEditor ref={ref} value="" onChange={onChange} />);
    });
    // User types, onChange is called with 'typed', lastEmittedRef becomes 'typed'
    act(() => {
      ref.current!.dispatch({ changes: { from: 0, to: 0, insert: 'typed' } });
    });
    expect(onChange).toHaveBeenCalledWith('typed');
    onChange.mockClear();

    // React echoes the value prop back — should NOT trigger another dispatch
    await act(async () => {
      render(<CodeMirrorEditor ref={ref} value="typed" onChange={onChange} />);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.state.doc.toString()).toBe('typed');
  });

  // ── Compartment reconfiguration ────────────────────────────────────────────

  it('switching mode prop between plain and markdown does not crash or lose content', async () => {
    const ref = React.createRef<EditorView | null>();
    const { rerender } = render(
      <CodeMirrorEditor ref={ref} value="prose text" onChange={vi.fn()} mode="plain" />
    );
    await act(async () => {
      rerender(
        <CodeMirrorEditor
          ref={ref}
          value="prose text"
          onChange={vi.fn()}
          mode="markdown"
        />
      );
    });
    expect(ref.current?.state.doc.toString()).toBe('prose text');
  });

  it('toggling showWhitespace does not crash or corrupt the document', async () => {
    const ref = React.createRef<EditorView | null>();
    const { rerender } = render(
      <CodeMirrorEditor
        ref={ref}
        value="a b"
        onChange={vi.fn()}
        showWhitespace={false}
      />
    );
    await act(async () => {
      rerender(
        <CodeMirrorEditor
          ref={ref}
          value="a b"
          onChange={vi.fn()}
          showWhitespace={true}
        />
      );
    });
    expect(ref.current?.state.doc.toString()).toBe('a b');
  });

  it('renders whitespace space markers at 1ch width', async () => {
    const { container } = render(
      <CodeMirrorEditor value="a b" onChange={vi.fn()} showWhitespace={true} />
    );
    await act(async () => {});

    const marker = Array.from(container.querySelectorAll('.cm-ws-marker')).find(
      (el) => el.textContent === '·'
    ) as HTMLElement | undefined;
    expect(marker).toBeDefined();
    expect(marker?.style.minWidth).toBe('1ch');
    expect(marker?.style.width).toBe('1ch');
  });

  it('places cursor before end-of-line ws marker', async () => {
    const ref = React.createRef<EditorView | null>();
    const { container } = render(
      <CodeMirrorEditor
        ref={ref}
        value="abc\n"
        onChange={vi.fn()}
        showWhitespace={true}
      />
    );

    await act(async () => {
      ref.current?.dispatch({ selection: { anchor: 3, head: 3 } });
    });

    const line = container.querySelector('.cm-line');
    expect(line).not.toBeNull();
    if (!line) return;

    const lineHtml = line.innerHTML;
    expect(lineHtml).toContain('abc');
    expect(lineHtml).toContain('<span aria-hidden="true" class="cm-ws-marker"');
    // In Raw mode with WS markers, EOL marker should appear after the line text
    expect(lineHtml.indexOf('abc')).toBeLessThan(
      lineHtml.indexOf('class="cm-ws-marker"')
    );
  });

  // ── Placeholder ────────────────────────────────────────────────────────────

  it('renders a placeholder element when the document is empty', async () => {
    const { container } = render(
      <CodeMirrorEditor value="" onChange={vi.fn()} placeholder="Start writing…" />
    );
    await act(async () => {});
    expect(container.querySelector('.cm-placeholder')).not.toBeNull();
  });

  it('does not render a placeholder element when the document is non-empty', async () => {
    const { container } = render(
      <CodeMirrorEditor
        value="not empty"
        onChange={vi.fn()}
        placeholder="Start writing…"
      />
    );
    await act(async () => {});
    expect(container.querySelector('.cm-placeholder')).toBeNull();
  });

  // ── enterBehavior ──────────────────────────────────────────────────────────

  describe('enterBehavior', () => {
    it('ignore: Enter key does not modify the document', async () => {
      const onChange = vi.fn();
      const ref = React.createRef<EditorView | null>();
      await act(async () => {
        render(
          <CodeMirrorEditor
            ref={ref}
            value="line one"
            onChange={onChange}
            enterBehavior="ignore"
          />
        );
      });
      act(() => {
        ref.current!.dispatch({ selection: { anchor: 8 } });
      });
      pressKey(ref.current!, 'Enter');
      expect(onChange).not.toHaveBeenCalled();
      expect(ref.current!.state.doc.toString()).toBe('line one');
    });

    it('ignore: Shift-Enter key also does not modify the document', async () => {
      const onChange = vi.fn();
      const ref = React.createRef<EditorView | null>();
      await act(async () => {
        render(
          <CodeMirrorEditor
            ref={ref}
            value="one line"
            onChange={onChange}
            enterBehavior="ignore"
          />
        );
      });
      pressKey(ref.current!, 'Enter', { shiftKey: true });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('softbreak: first Enter inserts a two-space soft-break followed by a newline', async () => {
      const onChange = vi.fn();
      const ref = React.createRef<EditorView | null>();
      await act(async () => {
        render(
          <CodeMirrorEditor
            ref={ref}
            value="hello"
            onChange={onChange}
            enterBehavior="softbreak"
          />
        );
      });
      // Position caret at end of 'hello'
      act(() => {
        ref.current!.dispatch({ selection: { anchor: 5 } });
      });
      pressKey(ref.current!, 'Enter');
      expect(ref.current!.state.doc.toString()).toBe('hello  \n');
    });

    it('softbreak: second Enter on a line already ending with two spaces opens a paragraph', async () => {
      const ref = React.createRef<EditorView | null>();
      await act(async () => {
        render(
          <CodeMirrorEditor
            ref={ref}
            value="hello  "
            onChange={vi.fn()}
            enterBehavior="softbreak"
          />
        );
      });
      // Position caret at end of the trailing spaces (offset 7)
      act(() => {
        ref.current!.dispatch({ selection: { anchor: 7 } });
      });
      pressKey(ref.current!, 'Enter');
      expect(ref.current!.state.doc.toString()).toBe('hello\n\n');
    });
  });
});
