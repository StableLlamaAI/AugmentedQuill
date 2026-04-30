// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for chat scroll reattachment and auto-scroll state.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatScroll } from './useChatScroll';

const makeContainer = (
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number
): HTMLDivElement => {
  const el = document.createElement('div');
  Object.defineProperties(el, {
    clientHeight: { value: clientHeight, configurable: true },
    scrollHeight: { value: scrollHeight, configurable: true },
  });
  el.scrollTop = scrollTop;
  // jsdom does not implement scrollTo; provide a stub that sets scrollTop.
  el.scrollTo = ({ top }: ScrollToOptions) => {
    if (top !== undefined) el.scrollTop = top;
  };
  return el;
};

const makeWheelEvent = (deltaY: number): WheelEvent<HTMLDivElement> =>
  ({ deltaY }) as unknown as WheelEvent<HTMLDivElement>;

const makeTouchEvent = (clientY: number): TouchEvent<HTMLDivElement> =>
  ({ touches: [{ clientY }] }) as unknown as TouchEvent<HTMLDivElement>;

describe('useChatScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deactivates auto-scroll when the user scrolls up even from the bottom', () => {
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);

    container.scrollTop = 1050;
    act(() => {
      result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isAtBottomRef.current).toBe(false);
  });

  it('reattaches auto-scroll when the user scrolls down near the bottom', () => {
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);

    container.scrollTop = 1050;
    act(() => {
      result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isAtBottomRef.current).toBe(false);

    container.scrollTop = 1090;
    act(() => {
      result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);
  });

  it('deactivates auto-scroll on an upward wheel event', () => {
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.handleWheel(makeWheelEvent(-10));
    });
    expect(result.current.isAtBottomRef.current).toBe(false);
  });

  it('deactivates auto-scroll on an upward touch gesture', () => {
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.handleTouchStart(makeTouchEvent(400));
      result.current.handleTouchMove(makeTouchEvent(420));
    });
    expect(result.current.isAtBottomRef.current).toBe(false);
  });

  it('does not deactivate auto-scroll when a programmatic scrollToBottom fires its scroll event', () => {
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.handleScroll();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);

    // Programmatic scroll to bottom, then the resulting scroll event.
    act(() => {
      result.current.scrollToBottom('auto');
      container.scrollTop = 1100;
      result.current.handleScroll();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);
  });

  it('deactivates when a coalesced scroll event delivers user position after a programmatic scroll', () => {
    // Regression: browser coalesces programmatic scroll to 1100 with user's upward
    // scroll to 700 into one event at 700. The hook must not treat that as "at bottom".
    const { result } = renderHook(() =>
      useChatScroll({
        messages: [],
        isLoading: false,
        editingMessageId: null,
        currentSessionId: null,
      })
    );

    const container = makeContainer(1100, 100, 1200);
    result.current.scrollContainerRef.current = container;

    // Establish state at the bottom.
    act(() => {
      result.current.handleScroll();
    });
    expect(result.current.isAtBottomRef.current).toBe(true);

    // Programmatic scroll fires, browser coalesces with user's upward scroll → event at 700.
    act(() => {
      result.current.scrollToBottom('auto'); // sets isProgrammaticScrollRef=true
      container.scrollTop = 700; // coalesced position
      result.current.handleScroll(); // skipped — prevScrollTopRef stays at 1100
    });

    // isProgrammaticScrollRef was consumed; next real scroll event at same position
    // reveals the actual user position and deactivates auto-scroll.
    act(() => {
      result.current.handleScroll();
    });
    expect(result.current.isAtBottomRef.current).toBe(false);
  });
});
