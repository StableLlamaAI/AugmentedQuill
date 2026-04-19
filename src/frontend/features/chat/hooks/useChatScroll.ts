// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate chat scroll-to-bottom behavior and MutationObserver tracking.
 */

import { useRef, useEffect } from 'react';
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
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/** Custom React hook that manages chat scroll. */
export function useChatScroll({
  messages,
  isLoading,
  editingMessageId,
  currentSessionId,
}: UseChatScrollDeps): UseChatScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // Consider "at bottom" if within 50px of the actual bottom to handle fast layouts
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isAtBottomRef.current = isAtBottom;
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight } = scrollContainerRef.current;
    scrollContainerRef.current.scrollTo({ top: scrollHeight, behavior });
  };

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
  }, [messages, isLoading, editingMessageId]);

  // Always scroll to bottom on session switch
  useEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom('auto');
  }, [currentSessionId]);

  return { scrollContainerRef, handleScroll, scrollToBottom };
}
