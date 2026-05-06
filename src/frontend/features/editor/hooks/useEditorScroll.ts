// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate editor scroll-follow logic during prose streaming and chapter switches.
 *
 * Design goals:
 *   1. At bottom → auto-scroll to follow new content.
 *   2. Not at bottom → never programmatically move the user's viewport.
 */

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type WheelEvent,
  type TouchEvent,
} from 'react';
import { scrollDistanceFromBottom } from '../../../utils/scrollUtils';

interface UseEditorScrollOptions {
  /** Current text content — triggers stream-follow on change. */
  localContent: string;
  /** Whether LLM prose is actively streaming into the editor. */
  isProseStreaming: boolean;
  /**
   * True when streaming is replacing the chapter content from scratch rather
   * than appending. Retained for API compatibility but no longer changes scroll
   * behaviour — the position-based check handles both modes uniformly.
   */
  isReplaceStreaming?: boolean;
  /** Current chapter id — triggers scroll reset on chapter switch. */
  chapterId: string | number;
}

export interface UseEditorScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
  handleTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: TouchEvent<HTMLDivElement>) => void;
  scrollMainContentToBottom: () => void;
  /** Exposed so callers can check whether the user has scrolled away mid-stream. */
  isDetachedFromBottomRef: React.MutableRefObject<boolean>;
  /** Exposed so callers can gate deferred content syncs on distance. */
  distanceFromBottomRef: React.MutableRefObject<number>;
}

/** Distance from bottom considered attached/following. */
const FOLLOW_ATTACH_DISTANCE = 24;
const FOLLOW_REATTACH_DISTANCE = 200;
const SCROLL_UP_DETACH_DELTA = 1;
const FOLLOW_WRITE_EPSILON_PX = 1;

/** Custom React hook that manages editor scroll. */
export function useEditorScroll({
  localContent,
  isProseStreaming,
  isReplaceStreaming = false,
  chapterId,
}: UseEditorScrollOptions): UseEditorScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDetachedFromBottomRef = useRef<boolean>(false);
  const distanceFromBottomRef = useRef<number>(0);
  const pendingFollowRafRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number>(0);
  const lastKnownMaxScrollTopRef = useRef<number>(0);
  const lastTouchYRef = useRef<number | null>(null);
  const lastUserScrollIntentAtRef = useRef<number>(0);
  const prevChapterKeyRef = useRef<string>(String(chapterId));
  const hasMountedRef = useRef<boolean>(false);
  const shouldAutoFollowRef = useRef<boolean>(true);

  const isProseStreamingRef = useRef<boolean>(isProseStreaming);
  isProseStreamingRef.current = isProseStreaming;

  const wasProseStreamingRef = useRef<boolean>(isProseStreaming);

  // isReplaceStreaming is retained in the interface for callers but the hook
  // no longer branches on it — the live position check handles both modes.
  void isReplaceStreaming;

  const clearPendingFollow = useCallback((): void => {
    if (pendingFollowRafRef.current !== null) {
      window.cancelAnimationFrame(pendingFollowRafRef.current);
      pendingFollowRafRef.current = null;
    }
  }, []);

  const isNearBottom = useCallback((container: HTMLDivElement): boolean => {
    return scrollDistanceFromBottom(container) <= FOLLOW_ATTACH_DISTANCE;
  }, []);

  const isWithinReattachRange = useCallback((container: HTMLDivElement): boolean => {
    return scrollDistanceFromBottom(container) <= FOLLOW_REATTACH_DISTANCE;
  }, []);

  const updateDistanceFromContainer = useCallback((container: HTMLDivElement): void => {
    distanceFromBottomRef.current = scrollDistanceFromBottom(container);
  }, []);

  const syncDetachedFlag = useCallback((): void => {
    isDetachedFromBottomRef.current = !shouldAutoFollowRef.current;
  }, []);

  const updateAutoFollowFromScrollPosition = useCallback(
    (container: HTMLDivElement): void => {
      const currentTop = container.scrollTop;
      const previousTop = prevScrollTopRef.current;
      const delta = currentTop - previousTop;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const userIntentRecent = now - lastUserScrollIntentAtRef.current < 500;
      let detachedInThisUpdate = false;

      if (delta <= -SCROLL_UP_DETACH_DELTA) {
        if (!isProseStreamingRef.current || userIntentRecent) {
          shouldAutoFollowRef.current = false;
          detachedInThisUpdate = true;
        }
      } else if (
        !shouldAutoFollowRef.current &&
        delta > SCROLL_UP_DETACH_DELTA &&
        userIntentRecent &&
        isWithinReattachRange(container)
      ) {
        shouldAutoFollowRef.current = true;
      } else if (isNearBottom(container)) {
        shouldAutoFollowRef.current = true;
      }

      // If detach came from a generic scroll event (e.g. scrollbar drag),
      // cancel any already queued follow write to prevent a late jump.
      if (detachedInThisUpdate && pendingFollowRafRef.current !== null) {
        clearPendingFollow();
      }

      prevScrollTopRef.current = currentTop;
      updateDistanceFromContainer(container);
      syncDetachedFlag();
      void delta;
      void userIntentRecent;
    },
    [
      clearPendingFollow,
      isNearBottom,
      isWithinReattachRange,
      syncDetachedFlag,
      updateDistanceFromContainer,
    ]
  );

  const scheduleFollowToBottom = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const liveDistance = scrollDistanceFromBottom(container);
    if (liveDistance <= FOLLOW_WRITE_EPSILON_PX) {
      updateDistanceFromContainer(container);
      return;
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const alreadyPinned = Math.abs(container.scrollTop - maxScrollTop) <= 1;
    const maxScrollTopChanged =
      Math.abs(maxScrollTop - lastKnownMaxScrollTopRef.current) > 1;

    // Avoid per-chunk RAF churn when geometry and position are unchanged.
    if (alreadyPinned && !maxScrollTopChanged) {
      void maxScrollTop;
      return;
    }

    if (pendingFollowRafRef.current !== null) {
      return;
    }
    pendingFollowRafRef.current = window.requestAnimationFrame((): void => {
      pendingFollowRafRef.current = null;
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }
      if (!shouldAutoFollowRef.current) {
        return;
      }
      const liveDistance = scrollDistanceFromBottom(container);
      if (liveDistance <= FOLLOW_WRITE_EPSILON_PX) {
        updateDistanceFromContainer(container);
        return;
      }
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const didWrite = Math.abs(container.scrollTop - maxScrollTop) > 1;
      if (didWrite) {
        container.scrollTop = maxScrollTop;
      }
      lastKnownMaxScrollTopRef.current = maxScrollTop;
      prevScrollTopRef.current = container.scrollTop;
      updateDistanceFromContainer(container);
      shouldAutoFollowRef.current = true;
      syncDetachedFlag();
      void didWrite;
      void maxScrollTop;
    });
  }, [syncDetachedFlag, updateDistanceFromContainer]);

  /**
   * Pin the container to its maximum scroll position.
   */
  const pinToBottom = useCallback((container: HTMLDivElement): void => {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (Math.abs(maxScrollTop - container.scrollTop) > 1) {
      container.scrollTop = maxScrollTop;
    }
  }, []);

  const handleScroll = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (!container) return;
    updateAutoFollowFromScrollPosition(container);
  }, [updateAutoFollowFromScrollPosition]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>): void => {
      const container = scrollContainerRef.current;
      if (!container) return;
      lastUserScrollIntentAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();

      // When detached, never keep stale pending follow frames while the user is
      // manually wheeling through content.
      if (!shouldAutoFollowRef.current && pendingFollowRafRef.current !== null) {
        clearPendingFollow();
      }

      // Detach immediately on upward intent so we don't fight user scroll before
      // the browser emits the resulting scroll event.
      if (event.deltaY < 0) {
        shouldAutoFollowRef.current = false;
        syncDetachedFlag();
        clearPendingFollow();
        return;
      }

      // Reattach decisions are handled in handleScroll from actual geometry
      // updates to avoid wheel-vs-stream races.
      updateDistanceFromContainer(container);
      void event.deltaY;
    },
    [clearPendingFollow, syncDetachedFlag, updateDistanceFromContainer]
  );

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>): void => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
    lastUserScrollIntentAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, []);

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>): void => {
      const currentY = event.touches[0]?.clientY ?? null;
      const previousY = lastTouchYRef.current;
      lastTouchYRef.current = currentY;
      if (previousY === null || currentY === null) return;

      const deltaY = currentY - previousY;
      lastUserScrollIntentAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (deltaY > 2) {
        shouldAutoFollowRef.current = false;
        syncDetachedFlag();
        clearPendingFollow();
        return;
      }
      if (deltaY < -2 && scrollContainerRef.current) {
        updateDistanceFromContainer(scrollContainerRef.current);
        if (isNearBottom(scrollContainerRef.current)) {
          shouldAutoFollowRef.current = true;
          syncDetachedFlag();
        }
      }
      void deltaY;
    },
    [clearPendingFollow, isNearBottom, syncDetachedFlag, updateDistanceFromContainer]
  );

  const scrollMainContentToBottom = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (!container) return;
    shouldAutoFollowRef.current = true;
    syncDetachedFlag();
    scheduleFollowToBottom();
  }, [scheduleFollowToBottom, syncDetachedFlag]);

  /** Auto-scroll during streaming before paint to avoid visual jumps. */
  useLayoutEffect((): void => {
    if (!isProseStreaming) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // On stream start, initialize follow mode from current viewport position.
    const startedStreamingNow = !wasProseStreamingRef.current;
    if (startedStreamingNow) {
      updateDistanceFromContainer(container);
      // Preserve existing attached state when streaming starts so transient
      // layout shifts cannot disable auto-follow.
      shouldAutoFollowRef.current =
        shouldAutoFollowRef.current || isNearBottom(container);
      prevScrollTopRef.current = container.scrollTop;
      syncDetachedFlag();
    }

    const userLikelyMovedUpWithoutScrollEvent =
      container.scrollTop < prevScrollTopRef.current - SCROLL_UP_DETACH_DELTA;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const userIntentRecent = now - lastUserScrollIntentAtRef.current < 500;
    if (userLikelyMovedUpWithoutScrollEvent) {
      if (userIntentRecent) {
        shouldAutoFollowRef.current = false;
        prevScrollTopRef.current = container.scrollTop;
        updateDistanceFromContainer(container);
        syncDetachedFlag();
      }
    }

    if (!shouldAutoFollowRef.current) {
      return;
    }

    const liveDistance = scrollDistanceFromBottom(container);
    if (liveDistance > FOLLOW_WRITE_EPSILON_PX) {
      pinToBottom(container);
    }

    lastKnownMaxScrollTopRef.current = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    prevScrollTopRef.current = container.scrollTop;
    updateDistanceFromContainer(container);
    shouldAutoFollowRef.current = true;
    syncDetachedFlag();
  }, [
    isProseStreaming,
    pinToBottom,
    localContent,
    isNearBottom,
    syncDetachedFlag,
    updateDistanceFromContainer,
  ]);

  useEffect((): void => {
    wasProseStreamingRef.current = isProseStreaming;
  }, [isProseStreaming]);

  // Chapter switch: reset scroll so the new chapter starts at the top.
  useLayoutEffect((): void => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevChapterKeyRef.current = String(chapterId);
      return;
    }

    const chapterKey = String(chapterId);
    if (prevChapterKeyRef.current === chapterKey) {
      return;
    }

    prevChapterKeyRef.current = chapterKey;
    const container = scrollContainerRef.current;
    if (!container) return;

    clearPendingFollow();
    container.scrollTop = 0;
    shouldAutoFollowRef.current = true;
    syncDetachedFlag();
    distanceFromBottomRef.current = 0;
    prevScrollTopRef.current = 0;
    lastKnownMaxScrollTopRef.current = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
  }, [chapterId, clearPendingFollow, syncDetachedFlag]);

  useEffect((): (() => void) => {
    return (): void => {
      clearPendingFollow();
    };
  }, [clearPendingFollow]);

  return {
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    scrollMainContentToBottom,
    isDetachedFromBottomRef,
    distanceFromBottomRef,
  };
}
