// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for editor scroll behavior while prose is streaming.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { TouchEvent, WheelEvent } from 'react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import { useEditorScroll } from './useEditorScroll';

type ScrollHookResult = ReturnType<typeof useEditorScroll>;
type ScrollHookHarness<Props> = {
  result: { current: ScrollHookResult };
  rerender: (props: Props) => void;
};

const makeWheelEvent = (deltaY: number): WheelEvent<HTMLDivElement> =>
  ({ deltaY }) as unknown as WheelEvent<HTMLDivElement>;

const makeTouchEvent = (clientY: number): TouchEvent<HTMLDivElement> =>
  ({
    touches: [{ clientY }],
  }) as unknown as TouchEvent<HTMLDivElement>;

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
  return el;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEditorScroll - detach/reattach intent', () => {
  it('immediately detaches auto-scroll on an upward scroll event', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    container.scrollTop = 1050;
    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('detaches auto-scroll on an upward wheel interaction', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleWheel(makeWheelEvent(-10));
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('detaches auto-scroll on an upward touch gesture', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleTouchStart(makeTouchEvent(400));
      hook.result.current.handleTouchMove(makeTouchEvent(420));
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('detaches auto-scroll when scrolling up slightly from the bottom', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });

    container.scrollTop = 1090;
    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('reattaches when currently at bottom-near position at chunk time', () => {
    const hook: ScrollHookHarness<{ localContent: string }> = renderHook(
      ({ localContent }: { localContent: string }) =>
        useEditorScroll({ localContent, isProseStreaming: true, chapterId: '1' }),
      {
        initialProps: { localContent: '' },
      }
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Establish baseline at bottom.
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // User scrolls up very slowly (1px), still within attach distance.
    container.scrollTop = 1099;
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);

    // New chunk arrives while currently still near the bottom.
    // Auto-follow should reattach and keep bottom visibility.
    act(() => {
      hook.rerender({ localContent: 'chunk1' });
    });

    expect(container.scrollTop).toBe(1099);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });

  it('reattaches auto-scroll when the user scrolls back down near the bottom', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    container.scrollTop = 1050;
    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);

    container.scrollTop = 1090;
    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });

  it('keeps auto-scroll detached when content arrives after a user scroll without a pending scroll event', () => {
    const hook: ScrollHookHarness<{ localContent: string }> = renderHook(
      ({ localContent }: { localContent: string }) =>
        useEditorScroll({ localContent, isProseStreaming: true, chapterId: '1' }),
      {
        initialProps: { localContent: '' },
      }
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleScroll();
      vi.runOnlyPendingTimers();
    });

    // User scrolls up well away from the bottom before the scroll event fires.
    // The position-based check at chunk time detects this directly.
    container.scrollTop = 900; // distanceFromBottom = 200 > ATTACH_DISTANCE(50)
    hook.rerender({ localContent: 'new chunk' });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
    expect(container.scrollTop).toBe(900);
  });
});

describe('useEditorScroll - streaming follow behavior', () => {
  it('does not detach auto-scroll when a programmatic scroll fires its scroll event', () => {
    const hook: { result: { current: ScrollHookResult } } = renderHook(() =>
      useEditorScroll({ localContent: '', isProseStreaming: true, chapterId: '1' })
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Establish prevScrollTop at the bottom.
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // Simulate: auto-scroll pins to bottom (programmatic), then scroll event fires.
    act(() => {
      // pinToBottom would set isProgrammaticScrollRef; simulate the same.
      hook.result.current.scrollMainContentToBottom();
      container.scrollTop = 1100; // already there
      hook.result.current.handleScroll();
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });

  it('detaches when a coalesced scroll event delivers user position after a programmatic scroll', () => {
    // Regression test for browser event coalescing:
    // Auto-scroll programmatically moves to 1100 (bottom). The browser coalesces
    // that with the user's upward scroll and fires ONE event at the user's
    // position (700). Because isProgrammaticScrollRef is true the event is
    // skipped without updating prevScrollTopRef. When the next chunk arrives,
    // the position-based check sees distanceFromBottom = 400 > ATTACH_DISTANCE
    // and immediately detaches without needing a scroll event at all.
    const hook: ScrollHookHarness<{ content: string }> = renderHook(
      ({ content }: { content: string }) =>
        useEditorScroll({
          localContent: content,
          isProseStreaming: true,
          chapterId: '1',
        }),
      { initialProps: { content: 'chunk1' } }
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Establish state at the bottom.
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // Auto-scroll fires (programmatic flag set), but the browser coalesces it
    // with a user upward scroll → single event fires at 700, not 1100.
    act(() => {
      hook.result.current.scrollMainContentToBottom(); // sets isProgrammaticScrollRef=true
      container.scrollTop = 700; // coalesced position (user scrolled up)
      hook.result.current.handleScroll(); // isProgrammaticScrollRef=true → event skipped
    });

    // Next chunk arrives: distanceFromBottom = 1200 - 700 - 100 = 400 > 50 → detach.
    act(() => {
      hook.rerender({ content: 'chunk2' });
      vi.runAllTimers();
    });

    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
    expect(container.scrollTop).toBe(700); // viewport must NOT have been moved
  });

  it('does not force scroll to top when replace streaming begins; follows bottom like append mode', () => {
    const hook: ScrollHookHarness<{ content: string; isReplace: boolean }> = renderHook(
      ({ content, isReplace }: { content: string; isReplace: boolean }) =>
        useEditorScroll({
          localContent: content,
          isProseStreaming: true,
          isReplaceStreaming: isReplace,
          chapterId: '1',
        }),
      { initialProps: { content: 'original', isReplace: false } }
    );

    // Container: user is at bottom (distanceFromBottom = 0).
    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // Replace stream begins — should NOT scroll to top; user was at bottom.
    act(() => {
      hook.rerender({ content: 'chunk1', isReplace: true });
    });
    // scrollTop must not have been changed to 0
    expect(container.scrollTop).not.toBe(0);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });

  it('keeps auto-scroll attached at bottom when append streaming chunk grows content significantly', () => {
    const hook: ScrollHookHarness<{ content: string }> = renderHook(
      ({ content }: { content: string }) =>
        useEditorScroll({
          localContent: content,
          isProseStreaming: true,
          isReplaceStreaming: false,
          chapterId: '1',
        }),
      { initialProps: { content: 'chunk0' } }
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Start attached at bottom.
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // New chunk increases document height by 100px (> ATTACH_DISTANCE).
    Object.defineProperty(container, 'scrollHeight', {
      value: 1300,
      configurable: true,
    });

    act(() => {
      hook.rerender({ content: 'chunk1' });
    });

    // Must stay attached and pinned to the new bottom.
    expect(container.scrollTop).toBe(1200);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });

  it('keeps auto-scroll attached at bottom when rewrite streaming chunk grows content significantly', () => {
    const hook: ScrollHookHarness<{ content: string }> = renderHook(
      ({ content }: { content: string }) =>
        useEditorScroll({
          localContent: content,
          isProseStreaming: true,
          isReplaceStreaming: true,
          chapterId: '1',
        }),
      { initialProps: { content: 'chunk0' } }
    );

    const container = makeContainer(1100, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Start attached at bottom.
    act(() => {
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);

    // New rewrite chunk increases height by 100px (> ATTACH_DISTANCE).
    Object.defineProperty(container, 'scrollHeight', {
      value: 1300,
      configurable: true,
    });

    act(() => {
      hook.rerender({ content: 'chunk1' });
    });

    // Must stay attached and pinned to the new bottom.
    expect(container.scrollTop).toBe(1200);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });
});

describe('useEditorScroll - replace streaming detached behavior', () => {
  it('stays in place (does not scroll) when replace streaming begins and user is not at bottom', () => {
    const hook: ScrollHookHarness<{ content: string; isReplace: boolean }> = renderHook(
      ({ content, isReplace }: { content: string; isReplace: boolean }) =>
        useEditorScroll({
          localContent: content,
          isProseStreaming: true,
          isReplaceStreaming: isReplace,
          chapterId: '1',
        }),
      { initialProps: { content: 'original', isReplace: false } }
    );

    // User scrolled up — far from bottom.
    const container = makeContainer(700, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    act(() => {
      hook.result.current.handleWheel(makeWheelEvent(-10));
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);

    // Replace stream begins — viewport must not move.
    act(() => {
      hook.rerender({ content: 'chunk1', isReplace: true });
    });
    expect(container.scrollTop).toBe(700);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('restores detached anchor position after temporary clamp during streaming', () => {
    const hook: ScrollHookHarness<{ localContent: string }> = renderHook(
      ({ localContent }: { localContent: string }) =>
        useEditorScroll({ localContent, isProseStreaming: true, chapterId: '1' }),
      {
        initialProps: { localContent: 'chunk0' },
      }
    );

    const container = makeContainer(700, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // User detached in the middle.
    act(() => {
      hook.result.current.handleWheel(makeWheelEvent(-10));
      hook.result.current.handleScroll();
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
    expect(container.scrollTop).toBe(700);

    // Streaming update with temporarily short content; browser clamp equivalent.
    Object.defineProperty(container, 'scrollHeight', {
      value: 760,
      configurable: true,
    });
    container.scrollTop = 660; // max for current geometry
    act(() => {
      hook.rerender({ localContent: 'chunk1' });
    });
    expect(container.scrollTop).toBe(660);

    // Later chunk grows content again; anchored detached position should restore.
    Object.defineProperty(container, 'scrollHeight', {
      value: 1300,
      configurable: true,
    });
    act(() => {
      hook.rerender({ localContent: 'chunk2' });
    });

    expect(container.scrollTop).toBe(700);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);
  });

  it('resets scroll and detach state on chapter switch', () => {
    const hook: ScrollHookHarness<{ chapterId: string }> = renderHook(
      ({ chapterId }: { chapterId: string }) =>
        useEditorScroll({ localContent: '', isProseStreaming: false, chapterId }),
      { initialProps: { chapterId: '1' } }
    );

    const container = makeContainer(500, 100, 1200);
    hook.result.current.scrollContainerRef.current = container;

    // Simulate being detached mid-scroll.
    act(() => {
      hook.result.current.handleWheel(makeWheelEvent(-10));
    });
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(true);

    // Switch chapter.
    act(() => {
      hook.rerender({ chapterId: '2' });
    });

    expect(container.scrollTop).toBe(0);
    expect(hook.result.current.isDetachedFromBottomRef.current).toBe(false);
  });
});
