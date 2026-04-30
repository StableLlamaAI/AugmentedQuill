// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate chat scroll-to-bottom behavior and MutationObserver tracking.
 */

import {
  useRef,
  useEffect,
  useCallback,
  type WheelEvent,
  type TouchEvent,
} from 'react';
import { ChatMessage } from '../../../types';

interface UseChatScrollDeps {
  messages: ChatMessage[];
  isLoading: boolean;
  editingMessageId: string | null;
  currentSessionId: string | null | undefined;
}

interface UseChatScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  handleWheel: (event: WheelEvent<HTMLDivElement>) => void;
  handleTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (event: TouchEvent<HTMLDivElement>) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  isAtBottomRef: React.MutableRefObject<boolean>;
}

/**
 * Distance from the bottom (px) at or below which the viewport is considered
 * "at the bottom" and auto-scroll re-attaches.
 */
const ATTACH_DISTANCE = 50;

/** Custom React hook that manages chat scroll. */
export function useChatScroll({
  messages,
  isLoading,
  editingMessageId,
  currentSessionId,
}: UseChatScrollDeps): UseChatScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevScrollTopRef = useRef(0);
  const lastTouchYRef = useRef<number | null>(null);
  /**
   * Set to true immediately before a programmatic scrollTo/scrollTop so that
   * the resulting scroll event is skipped for user-intent detection.
   * prevScrollTopRef is intentionally NOT updated on programmatic scrolls so
   * that browser-coalesced user+programmatic events are handled correctly by
   * the delta check.
   */
  const isProgrammaticScrollRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight } = scrollContainerRef.current;
    if (behavior === 'auto' || behavior === 'instant') {
      isProgrammaticScrollRef.current = true;
    }
    scrollContainerRef.current.scrollTo({ top: scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 24;

    // Skip direction logic for programmatic scrolls.
    // prevScrollTopRef is intentionally NOT updated here.
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      isAtBottomRef.current = isAtBottom;
      return;
    }

    const scrollDelta = scrollTop - prevScrollTopRef.current;
    prevScrollTopRef.current = scrollTop;

    // Any upward user scroll immediately detaches auto-scroll.
    if (scrollDelta < -2) {
      isAtBottomRef.current = false;
    } else if (distanceFromBottom < ATTACH_DISTANCE) {
      // User scrolled down to near the bottom — re-attach auto-scroll.
      isAtBottomRef.current = true;
    }
  }, []);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      isAtBottomRef.current = false;
    } else if (event.deltaY > 0 && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < ATTACH_DISTANCE + 80) {
        isAtBottomRef.current = true;
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

    // Positive deltaY = finger moved down = content scrolled up = user wants to see above.
    const deltaY = currentY - previousY;
    if (deltaY > 2) {
      isAtBottomRef.current = false;
    } else if (deltaY < -2 && scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < ATTACH_DISTANCE + 80) {
        isAtBottomRef.current = true;
      }
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return undefined;

    // Use MutationObserver to catch size changes in children (like Markdown
    // rendering, Collapsible tool sections expanding, etc.).  The callback is
    // RAF-throttled so that rapid DOM mutations during streaming don't pile up
    // redundant scroll operations.
    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (!isAtBottomRef.current) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        scrollToBottom(isLoading ? 'auto' : 'smooth');
      });
    });

    observer.observe(el, { childList: true, subtree: true });

    // Ensure we scroll immediately if a basic dependency change caused an update too
    if (isAtBottomRef.current) {
      scrollToBottom(isLoading ? 'auto' : 'smooth');
    }

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [messages, isLoading, editingMessageId, scrollToBottom]);

  // Always scroll to bottom on session switch
  useEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom('auto');
  }, [currentSessionId, scrollToBottom]);

  return {
    scrollContainerRef,
    handleScroll,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    scrollToBottom,
    isAtBottomRef,
  };
}
