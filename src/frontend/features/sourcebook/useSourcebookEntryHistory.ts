// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Keep sourcebook-entry local history logic reusable and isolated
 * from dialog presentation concerns.
 */

import { useEffect, useRef, useState } from 'react';
import { SourcebookRelation } from '../../types';

export type SourcebookEntryHistoryState = {
  name: string;
  description: string;
  category: string;
  synonyms: string[];
  images: string[];
  relations: SourcebookRelation[];
  keywords: string[];
};

interface UseSourcebookEntryHistoryParams {
  initialState: SourcebookEntryHistoryState;
  currentState: SourcebookEntryHistoryState;
}

export const useSourcebookEntryHistory = ({
  initialState,
  currentState,
}: UseSourcebookEntryHistoryParams) => {
  const [history, setHistory] = useState<SourcebookEntryHistoryState[]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isRestoringRef = useRef(false);

  const historyRef = useRef<SourcebookEntryHistoryState[]>(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  useEffect(() => {
    setHistory([initialState]);
    setHistoryIndex(0);
  }, [initialState]);

  useEffect(() => {
    if (isRestoringRef.current) {
      return;
    }

    const idx = historyIndexRef.current;
    const current = historyRef.current[idx];
    if (current && JSON.stringify(current) === JSON.stringify(currentState)) {
      return;
    }

    setHistory((prev) => {
      const next = [...prev.slice(0, idx + 1), currentState];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
    setHistoryIndex(Math.min(idx + 1, 99));
  }, [currentState]);

  const restoreSourcebookHistory = (
    index: number,
    onRestore: (snapshot: SourcebookEntryHistoryState) => void
  ) => {
    if (index < 0 || index >= history.length) {
      return;
    }

    const snapshot = history[index];
    if (!snapshot) {
      return;
    }

    isRestoringRef.current = true;
    onRestore(snapshot);
    setHistoryIndex(index);
    setTimeout(() => {
      isRestoringRef.current = false;
    }, 0);
  };

  return {
    history,
    historyIndex,
    restoreSourcebookHistory,
  };
};
