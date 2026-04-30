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
 *
 * Auto-scroll decision is made by reading the live scroll position synchronously
 * inside useLayoutEffect (before browser paint). This avoids all timing races
 * with RAF-deferred scrolls and wheel/touch event coalescing.
 */

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type WheelEvent,
  type TouchEvent,
} from 'react';

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

/**
 * Distance from the bottom (px) at or below which the viewport is considered
 * "at the bottom" and auto-scroll re-attaches.
 */
const ATTACH_DISTANCE = 50;

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
  const detachedAnchorScrollTopRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  /**
   * Set to true immediately before a programmatic scrollTop assignment so that
   * the resulting scroll event is skipped for user-intent detection.
   */
  const isProgrammaticScrollRef = useRef<boolean>(false);

  // Keep a stable ref so useLayoutEffect can read the current value.
  const isProseStreamingRef = useRef(isProseStreaming);
  isProseStreamingRef.current = isProseStreaming;

  // isReplaceStreaming is retained in the interface for callers but the hook
  // no longer branches on it — the live position check handles both modes.
  void isReplaceStreaming;

  /**
   * Pin the container to its maximum scroll position.
   * Marks the resulting scroll event as programmatic so it is not mistaken for
   * a user gesture.
   */
  const pinToBottom = useCallback((container: HTMLDivElement) => {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (Math.abs(maxScrollTop - container.scrollTop) > 1) {
      isProgrammaticScrollRef.current = true;
      container.scrollTop = maxScrollTop;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    distanceFromBottomRef.current = distanceFromBottom;

    // Programmatic scrolls must not influence user-intent detection.
    // prevScrollTopRef is intentionally NOT updated here.
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }

    const prevScrollTop = prevScrollTopRef.current ?? scrollTop;
    const scrollDelta = scrollTop - prevScrollTop;
    prevScrollTopRef.current = scrollTop;

    if (scrollDelta < 0) {
      isDetachedFromBottomRef.current = true;
      detachedAnchorScrollTopRef.current = scrollTop;
    } else if (scrollDelta > 0 && distanceFromBottom < ATTACH_DISTANCE) {
      isDetachedFromBottomRef.current = false;
      detachedAnchorScrollTopRef.current = null;
    } else if (isDetachedFromBottomRef.current) {
      // Keep anchor current while user scrolls in detached mode.
      detachedAnchorScrollTopRef.current = scrollTop;
    }
  }, []);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    // Wheel fires before the DOM scroll updates — earliest possible signal of
    // user intent. Primary detach trigger for the "first wheel tick" case where
    // scrollTop hasn't changed yet when the next useLayoutEffect runs.
    if (event.deltaY < 0) {
      isDetachedFromBottomRef.current = true;
      if (scrollContainerRef.current) {
        detachedAnchorScrollTopRef.current = scrollContainerRef.current.scrollTop;
      }
    } else if (event.deltaY > 0 && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < ATTACH_DISTANCE + 80) {
        isDetachedFromBottomRef.current = false;
        detachedAnchorScrollTopRef.current = null;
      }
    }
  }, []);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0]?.clientY ?? null;
    const previousY = lastTouchYRef.current;
    lastTouchYRef.current = currentY;
    if (previousY === null || currentY === null) return;

    const deltaY = currentY - previousY;
    if (deltaY > 2) {
      isDetachedFromBottomRef.current = true;
      if (scrollContainerRef.current) {
        detachedAnchorScrollTopRef.current = scrollContainerRef.current.scrollTop;
      }
    } else if (deltaY < -2 && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < ATTACH_DISTANCE + 80) {
        isDetachedFromBottomRef.current = false;
        detachedAnchorScrollTopRef.current = null;
      }
    }
  }, []);

  const scrollMainContentToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    isProgrammaticScrollRef.current = true;
    container.scrollTop = container.scrollHeight;
    detachedAnchorScrollTopRef.current = null;
  }, []);

  /**
   * Auto-scroll during streaming.
   *
   * Runs synchronously in the commit phase (before browser paint) so wheel
   * events that fired before this render have already updated
   * isDetachedFromBottomRef, and the live scrollTop reflects the user's actual
   * position. No RAF is used, eliminating the timing window where a RAF could
   * move the viewport after the wheel event set the detach flag.
   */
  useLayoutEffect(() => {
    if (!isProseStreamingRef.current) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const wasDetached = isDetachedFromBottomRef.current;
    const previousDistanceFromBottom = distanceFromBottomRef.current;
    const previousKnownScrollTop = prevScrollTopRef.current;

    // Primary guard: read the live scroll position right now.
    // Content growth can increase this distance even when the user was at
    // bottom before this chunk; preserve attached state across that case.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    distanceFromBottomRef.current = distanceFromBottom;

    // If currently at bottom, usually (re)attach and follow new content.
    // Exception: detached mode with an anchor beyond the current max means the
    // viewport is temporarily clamped by short content during replace streaming.
    // Keep detached in that case and restore the anchor when content grows.
    if (distanceFromBottom <= ATTACH_DISTANCE) {
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const anchorTop = detachedAnchorScrollTopRef.current;
      const isDetachedClampCase =
        wasDetached && anchorTop !== null && anchorTop > maxScrollTop + 1;

      if (isDetachedClampCase) {
        isDetachedFromBottomRef.current = true;
        return;
      }

      isDetachedFromBottomRef.current = false;
      detachedAnchorScrollTopRef.current = null;
      pinToBottom(container);
      return;
    }

    // Keep auto-scroll attached across chunk growth if we were attached and
    // previously at/near bottom, unless the user has already moved upward
    // without a delivered scroll event.
    const userLikelyMovedUpWithoutScrollEvent =
      previousKnownScrollTop !== null &&
      container.scrollTop < previousKnownScrollTop - 1;
    if (
      !wasDetached &&
      previousDistanceFromBottom <= ATTACH_DISTANCE &&
      !userLikelyMovedUpWithoutScrollEvent
    ) {
      isDetachedFromBottomRef.current = false;
      detachedAnchorScrollTopRef.current = null;
      pinToBottom(container);
      return;
    }

    // Detached mode: preserve viewport anchor and restore it when geometry
    // temporarily clamps during replace streaming.
    isDetachedFromBottomRef.current = true;
    if (detachedAnchorScrollTopRef.current === null) {
      detachedAnchorScrollTopRef.current = container.scrollTop;
    }

    const anchorTop = detachedAnchorScrollTopRef.current;
    if (anchorTop !== null) {
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetTop = Math.min(anchorTop, maxScrollTop);
      if (Math.abs(container.scrollTop - targetTop) > 1) {
        isProgrammaticScrollRef.current = true;
        container.scrollTop = targetTop;
      }
    }
  }, [localContent, pinToBottom]);

  // Chapter switch: reset scroll so the new chapter starts at the top.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    isProgrammaticScrollRef.current = true;
    container.scrollTop = 0;
    isDetachedFromBottomRef.current = false;
    detachedAnchorScrollTopRef.current = null;
    prevScrollTopRef.current = 0;
    distanceFromBottomRef.current = 0;
  }, [chapterId]);

  // No cleanup needed (no pending animation frames).
  useEffect(() => undefined, []);

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
