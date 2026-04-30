// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Isolate metadata dialog undo/redo history management from dialog UI.
 */

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { Conflict } from '../../types';
import { MetadataParams } from './metadataSync';

interface UseMetadataDialogHistoryParams {
  data: MetadataParams;
  initialData: MetadataParams;
  baseline?: MetadataParams;
  normalizeMetadataParams: (value: MetadataParams) => MetadataParams;
  diffFieldsEqual: (a: MetadataParams, b: MetadataParams) => boolean;
  setData: Dispatch<SetStateAction<MetadataParams>>;
  setConflicts: Dispatch<SetStateAction<Conflict[]>>;
}

export const useMetadataDialogHistory = ({
  data,
  initialData,
  baseline,
  normalizeMetadataParams,
  diffFieldsEqual,
  setData,
  setConflicts,
}: UseMetadataDialogHistoryParams): {
  history: MetadataParams[];
  historyIndex: number;
  restoreMetadataHistory: (index: number) => void;
} => {
  const [history, setHistory] = useState<MetadataParams[]>((): MetadataParams[] => {
    const current = normalizeMetadataParams(initialData);
    if (baseline) {
      const base = normalizeMetadataParams(baseline);
      if (!diffFieldsEqual(base, current)) {
        return [base, current];
      }
    }
    return [current];
  });

  const [historyIndex, setHistoryIndex] = useState((): 1 | 0 => {
    if (baseline) {
      const base = normalizeMetadataParams(baseline);
      const current = normalizeMetadataParams(initialData);
      if (!diffFieldsEqual(base, current)) {
        return 1;
      }
    }
    return 0;
  });

  const isRestoringRef = useRef(false);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect((): (() => void) | undefined => {
    if (isRestoringRef.current) {
      return;
    }

    const DEBOUNCE_MS = 600;

    const pushNow = (
      currentData: MetadataParams,
      currentHistory: MetadataParams[],
      currentIndex: number
    ): void => {
      const snapshot = normalizeMetadataParams(
        JSON.parse(JSON.stringify(currentData)) as MetadataParams
      );
      const existing = currentHistory[currentIndex];
      if (existing && JSON.stringify(existing) === JSON.stringify(snapshot)) {
        return;
      }

      const snapshotJson = JSON.stringify(snapshot);
      const historyJson = currentHistory.map((entry: MetadataParams): string =>
        JSON.stringify(entry)
      );
      const matchedIndex = historyJson.findIndex(
        (entryJson: string): boolean => entryJson === snapshotJson
      );
      if (matchedIndex !== -1) {
        setHistoryIndex(matchedIndex);
        return;
      }

      setHistory((prev: MetadataParams[]): MetadataParams[] => {
        const next = [...prev.slice(0, currentIndex + 1), snapshot];
        return next.length > 100 ? next.slice(next.length - 100) : next;
      });
      setHistoryIndex((prev: number): number => Math.min(prev + 1, 99));
    };

    if (historyDebounceRef.current) {
      clearTimeout(historyDebounceRef.current);
    }
    historyDebounceRef.current = setTimeout((): void => {
      historyDebounceRef.current = null;
      pushNow(data, history, historyIndex);
    }, DEBOUNCE_MS);

    return (): void => {
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = null;
      }
    };
  }, [data, history, historyIndex, normalizeMetadataParams]);

  const restoreMetadataHistory = (index: number): void => {
    if (index < 0 || index >= history.length) {
      return;
    }

    const entry = history[index];
    if (!entry) {
      return;
    }

    isRestoringRef.current = true;
    setData(JSON.parse(JSON.stringify(entry)));
    setConflicts(JSON.parse(JSON.stringify(entry.conflicts || [])));
    setHistoryIndex(index);
    setTimeout((): void => {
      isRestoringRef.current = false;
    }, 0);
  };

  return {
    history,
    historyIndex,
    restoreMetadataHistory,
  };
};
