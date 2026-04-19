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
 *   3. No synthetic min-height locks (they create temporary blank space).
 *
 * While prose streams and the user is NOT at bottom, we freeze editor text
 * syncing (see localContent sync effect in Editor.tsx). This keeps scroll
 * geometry stable and avoids jump-to-top/clamp artifacts.
 */

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';

interface UseEditorScrollOptions {
  /** Current text content — triggers stream-follow on change. */
  localContent: string;
  /** Whether LLM prose is actively streaming into the editor. */
  isProseStreaming: boolean;
  /** Current chapter id — triggers scroll reset on chapter switch. */
  chapterId: string | number;
}

export interface UseEditorScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  scrollMainContentToBottom: () => void;
  /** Exposed so callers can check whether the user has scrolled away mid-stream. */
  isDetachedFromBottomRef: React.MutableRefObject<boolean>;
  /** Exposed so callers can gate deferred content syncs on distance. */
  distanceFromBottomRef: React.MutableRefObject<number>;
}

/** Custom React hook that manages editor scroll. */
export function useEditorScroll({
  localContent,
  isProseStreaming,
  chapterId,
}: UseEditorScrollOptions): UseEditorScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const isDetachedFromBottomRef = useRef<boolean>(false);
  const distanceFromBottomRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollSettleRafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Keep a stable ref to isProseStreaming so handleScroll (which has [] deps
  // and cannot close over changing props) can read the current value.
  const isProseStreamingRef = useRef(isProseStreaming);
  isProseStreamingRef.current = isProseStreaming;

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const scrollDelta = scrollTop - prevScrollTopRef.current;
      prevScrollTopRef.current = scrollTop;
      distanceFromBottomRef.current = distanceFromBottom;
      const atBottom = distanceFromBottom < 24;
      isAtBottomRef.current = atBottom;

      // Hysteresis prevents accidental detachment caused by tiny geometry
      // fluctuations while streaming. Only a clear manual scroll-away should
      // pause live content sync.
      if (atBottom) {
        isDetachedFromBottomRef.current = false;
      } else if (scrollDelta < -2 && distanceFromBottom > 96) {
        isDetachedFromBottomRef.current = true;
      } else if (scrollDelta > 2 && distanceFromBottom < 240) {
        // Reattach early when user scrolls back down near the end so
        // streaming resumes before reaching exact bottom.
        isDetachedFromBottomRef.current = false;
      }
    });
  }, []);

  const scrollMainContentToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, []);

  // Follow stream at bottom only.
  useLayoutEffect(() => {
    // Only auto-scroll during streaming — not on every user keystroke.
    if (!isProseStreamingRef.current) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    if (isDetachedFromBottomRef.current) return; // user intentionally scrolled away

    // At bottom: follow new content, but coalesce writes to one per frame.
    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = window.requestAnimationFrame(() => {
        autoScrollRafRef.current = null;
        const activeContainer = scrollContainerRef.current;
        if (!activeContainer || isDetachedFromBottomRef.current) return;

        const pinToBottom = () => {
          const maxScrollTop = Math.max(
            0,
            activeContainer.scrollHeight - activeContainer.clientHeight
          );
          if (Math.abs(maxScrollTop - activeContainer.scrollTop) > 1) {
            activeContainer.scrollTop = maxScrollTop;
          }
        };

        pinToBottom();

        // Paragraph boundaries can change final line-wrapping/height one
        // frame later; repin once more to avoid visible down/up jitter.
        if (autoScrollSettleRafRef.current !== null) {
          window.cancelAnimationFrame(autoScrollSettleRafRef.current);
        }
        autoScrollSettleRafRef.current = window.requestAnimationFrame(() => {
          autoScrollSettleRafRef.current = null;
          const settledContainer = scrollContainerRef.current;
          if (!settledContainer || isDetachedFromBottomRef.current) return;
          const maxScrollTop = Math.max(
            0,
            settledContainer.scrollHeight - settledContainer.clientHeight
          );
          if (Math.abs(maxScrollTop - settledContainer.scrollTop) > 1) {
            settledContainer.scrollTop = maxScrollTop;
          }
          distanceFromBottomRef.current =
            settledContainer.scrollHeight -
            settledContainer.scrollTop -
            settledContainer.clientHeight;
          prevScrollTopRef.current = settledContainer.scrollTop;
        });

        isAtBottomRef.current = true;
        isDetachedFromBottomRef.current = false;
      });
    }
  }, [localContent]);

  // Chapter switch: reset scroll so the new chapter starts at the top.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (autoScrollSettleRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollSettleRafRef.current);
      autoScrollSettleRafRef.current = null;
    }
    container.scrollTop = 0;
    isAtBottomRef.current = true;
    isDetachedFromBottomRef.current = false;
    prevScrollTopRef.current = 0;
    distanceFromBottomRef.current = 0;
  }, [chapterId]);

  // Cleanup all pending animation frames on unmount.
  useEffect(() => {
    return () => {
      if (autoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      if (autoScrollSettleRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollSettleRafRef.current);
        autoScrollSettleRafRef.current = null;
      }
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  return {
    scrollContainerRef,
    handleScroll,
    scrollMainContentToBottom,
    isDetachedFromBottomRef,
    distanceFromBottomRef,
  };
}
