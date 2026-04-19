// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate chat UI panel visibility and thinking expansion state.
 */

import { useState, useCallback } from 'react';

interface UseChatUIStateResult {
  showSystemPrompt: boolean;
  setShowSystemPrompt: (v: boolean) => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  showScratchpad: boolean;
  setShowScratchpad: (v: boolean) => void;
  thinkingProcessExpanded: Record<string, boolean>;
  handleThinkingToggle: (id: string, next: boolean) => void;
}

/** Custom React hook that manages chat uistate. */
export function useChatUIState(): UseChatUIStateResult {
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [thinkingProcessExpanded, setThinkingProcessExpanded] = useState<
    Record<string, boolean>
  >({});

  const handleThinkingToggle = useCallback((id: string, next: boolean) => {
    setThinkingProcessExpanded((prev: Record<string, boolean>) => ({
      ...prev,
      [id]: next,
    }));
  }, []);

  return {
    showSystemPrompt,
    setShowSystemPrompt,
    showHistory,
    setShowHistory,
    showScratchpad,
    setShowScratchpad,
    thinkingProcessExpanded,
    handleThinkingToggle,
  };
}
