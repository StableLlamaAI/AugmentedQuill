// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate incremental message rendering logic for the chat panel.
 *
 * Progressively reveals older messages one chunk per animation frame to keep
 * each React commit well under the browser's 50 ms long-task threshold.
 */

import { useState, useEffect, useDeferredValue } from 'react';
import { ChatMessage } from '../../../types';

// Initial number of messages to commit on first render; older messages are
// progressively added one chunk per animation frame.
const INITIAL_DISPLAY = 8;

interface UseChatMessagesResult {
  visibleMessages: ChatMessage[];
}

/** Custom React hook that manages chat messages. */
export function useChatMessages(
  messages: ChatMessage[],
  currentSessionId: string | null | undefined
): UseChatMessagesResult {
  const deferredMessages = useDeferredValue(messages);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);

  useEffect(() => {
    setDisplayCount(INITIAL_DISPLAY);
  }, [currentSessionId]);

  useEffect(() => {
    if (displayCount >= deferredMessages.length) return;
    const raf = requestAnimationFrame(() => {
      setDisplayCount((prev: number) =>
        Math.min(prev + INITIAL_DISPLAY, deferredMessages.length)
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [displayCount, deferredMessages.length]);

  const visibleMessages = deferredMessages.slice(
    Math.max(0, deferredMessages.length - displayCount)
  );

  return { visibleMessages };
}
