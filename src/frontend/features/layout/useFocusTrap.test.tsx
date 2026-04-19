// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for useFocusTrap so stacked-dialog Escape isolation
 * and focus management cannot break silently.
 */

// @vitest-environment jsdom

import React, { useRef } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// @testing-library/react cannot auto-register cleanup when vitest doesn't
// expose globals (afterEach).  Register it explicitly here so each test
// starts with a clean DOM and no stale document event-listeners.
afterEach(cleanup);

import { useFocusTrap } from './useFocusTrap';

// ─── Helper component ─────────────────────────────────────────────────────────

interface TrapProps {
  id: string;
  isActive: boolean;
  onDismiss: () => void;
}

const TrapDialog: React.FC<TrapProps> = ({ id, isActive, onDismiss }: TrapProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(isActive, ref, onDismiss);
  return (
    <div ref={ref} data-testid={id} role="dialog" tabIndex={-1}>
      <button>{id}-button</button>
    </div>
  );
};

// Hosts first and optionally second dialog alongside each other so that the
// first dialog's identity/effects are NOT disturbed when the second is added
// (React reconciles by position in the fragment).
const TwoDialogHost: React.FC<{
  onDismissFirst: () => void;
  onDismissSecond: () => void;
  showSecond: boolean;
}> = ({
  onDismissFirst,
  onDismissSecond,
  showSecond,
}: {
  onDismissFirst: () => void;
  onDismissSecond: () => void;
  showSecond: boolean;
}) => (
  <>
    <TrapDialog id="first" isActive={true} onDismiss={onDismissFirst} />
    {showSecond && (
      <TrapDialog id="second" isActive={true} onDismiss={onDismissSecond} />
    )}
  </>
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  // ── basic Escape dismiss ──────────────────────────────────────────────────

  it('calls onDismiss when Escape is pressed', () => {
    const onDismiss = vi.fn();
    render(<TrapDialog id="solo" isActive={true} onDismiss={onDismiss} />);

    // Fire on document.body so the event traverses document in capture phase
    // (more realistic than dispatching directly on the document node).
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape', bubbles: true });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onDismiss for other keys', () => {
    const onDismiss = vi.fn();
    render(<TrapDialog id="solo" isActive={true} onDismiss={onDismiss} />);

    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter', bubbles: true });
    fireEvent.keyDown(document.body, { key: 'Tab', code: 'Tab', bubbles: true });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not call onDismiss when isActive is false', () => {
    const onDismiss = vi.fn();
    render(<TrapDialog id="solo" isActive={false} onDismiss={onDismiss} />);

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape', bubbles: true });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  // ── stopImmediatePropagation is called on Escape ───────────────────────────

  it('Escape handler calls stopImmediatePropagation to isolate stacked dialogs', () => {
    /**
     * Regression guard: verifies the mechanism that prevents background dialogs
     * from also closing when the search dialog handles Escape.  The actual
     * multi-listener deduplication is tested via the jsdom-level test below.
     */
    render(<TrapDialog id="d" isActive={true} onDismiss={vi.fn()} />);

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    const spy = vi.spyOn(event, 'stopImmediatePropagation');
    document.body.dispatchEvent(event);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── stacked dialogs: Escape only reaches the first-registered listener ────

  it('stopImmediatePropagation prevents a second capture listener from firing', () => {
    /**
     * Pure-DOM regression test: two capture-phase listeners on document; the
     * first calls stopImmediatePropagation().  Only the first should be invoked.
     * This verifies the jsdom low-level guarantee relied on by useFocusTrap.
     */
    const calls: string[] = [];
    const handler1 = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        calls.push('handler1');
        e.stopImmediatePropagation();
      }
    };
    const handler2 = (e: KeyboardEvent) => {
      if (e.key === 'Escape') calls.push('handler2');
    };

    document.addEventListener('keydown', handler1, true);
    document.addEventListener('keydown', handler2, true);

    try {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      expect(calls).toEqual(['handler1']);
    } finally {
      document.removeEventListener('keydown', handler1, true);
      document.removeEventListener('keydown', handler2, true);
    }
  });

  it('Escape closes only the first-registered dialog when a second is added later', () => {
    /**
     * Regression: before stopImmediatePropagation() was added, pressing Escape
     * when two dialogs were open fired onDismiss on both.  This test mirrors
     * the production scenario:  the search dialog is rendered first (registering
     * its listener), then the background metadata dialog appears (adds a second
     * listener).  Only the search dialog should close on Escape.
     *
     * The second dialog is added via a controlled rerender so that React
     * preserves the first dialog's identity (and thus its registered listener).
     */
    const onDismissFirst = vi.fn();
    const onDismissSecond = vi.fn();

    const { rerender } = render(
      <TwoDialogHost
        onDismissFirst={onDismissFirst}
        onDismissSecond={onDismissSecond}
        showSecond={false}
      />
    );

    // Add the second dialog; first dialog's effect (and listener) is preserved.
    act(() => {
      rerender(
        <TwoDialogHost
          onDismissFirst={onDismissFirst}
          onDismissSecond={onDismissSecond}
          showSecond={true}
        />
      );
    });

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape', bubbles: true });

    expect(onDismissFirst).toHaveBeenCalledTimes(1);
    expect(onDismissSecond).not.toHaveBeenCalled();
  });

  it('after the first dialog is deactivated, Escape reaches the second', () => {
    const onDismissFirst = vi.fn();
    const onDismissSecond = vi.fn();

    const { rerender } = render(
      <TwoDialogHost
        onDismissFirst={onDismissFirst}
        onDismissSecond={onDismissSecond}
        showSecond={false}
      />
    );

    // Add second dialog
    act(() => {
      rerender(
        <TwoDialogHost
          onDismissFirst={onDismissFirst}
          onDismissSecond={onDismissSecond}
          showSecond={true}
        />
      );
    });

    // First Escape: only first dialog handles it
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape', bubbles: true });
    expect(onDismissFirst).toHaveBeenCalledTimes(1);
    expect(onDismissSecond).not.toHaveBeenCalled();

    // Deactivate the first dialog (simulates it closing)
    act(() => {
      rerender(
        <>
          <TrapDialog id="first" isActive={false} onDismiss={onDismissFirst} />
          <TrapDialog id="second" isActive={true} onDismiss={onDismissSecond} />
        </>
      );
    });

    // Second Escape: now the second dialog should receive it
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape', bubbles: true });
    expect(onDismissSecond).toHaveBeenCalledTimes(1);
  });

  // ── focus management ──────────────────────────────────────────────────────

  it('moves focus inside the dialog when activated', () => {
    render(<TrapDialog id="focused" isActive={true} onDismiss={vi.fn()} />);

    const dialog = screen.getByTestId('focused');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
