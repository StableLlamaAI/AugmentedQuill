// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Syncs in-app undo/redo history with the browser's History API and
 * wires up keyboard shortcuts (Ctrl/Cmd+Z / Ctrl/Cmd+Y).
 */

import { useEffect, useRef } from 'react';

type UseBrowserHistoryParams = {
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  undoSteps: (steps: number) => void;
  redoSteps: (steps: number) => void;
  undo: () => void;
  redo: () => void;
};

/** Custom React hook that synchronizes browser history. */
export function useBrowserHistory({
  historyIndex,
  canUndo,
  canRedo,
  undoSteps,
  redoSteps,
  undo,
  redo,
}: UseBrowserHistoryParams): void {
  const historyIndexRef = useRef(historyIndex);
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  const isPopStateUndoRedoRef = useRef(false);

  useEffect((): void => {
    historyIndexRef.current = historyIndex;
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;
  }, [historyIndex, canUndo, canRedo]);

  useEffect((): void => {
    const existing = window.history.state || {};
    if (existing.aqUndoIndex !== historyIndex) {
      window.history.replaceState({ ...existing, aqUndoIndex: historyIndex }, '');
    }
  }, [historyIndex]);

  useEffect((): void => {
    if (isPopStateUndoRedoRef.current) {
      isPopStateUndoRedoRef.current = false;
      return;
    }

    const currentState = window.history.state || {};
    if (currentState.aqUndoIndex === historyIndex) return;
    window.history.pushState({ ...currentState, aqUndoIndex: historyIndex }, '');
  }, [historyIndex]);

  useEffect((): (() => void) => {
    const onPopState = (event: PopStateEvent): void => {
      const targetIndex =
        typeof event.state?.aqUndoIndex === 'number' ? event.state.aqUndoIndex : null;
      if (targetIndex === null) return;

      const current = historyIndexRef.current;
      const delta = targetIndex - current;
      if (delta === 0) return;

      if (delta < 0 && canUndoRef.current) {
        isPopStateUndoRedoRef.current = true;
        undoSteps(Math.abs(delta));
        return;
      }

      if (delta > 0 && canRedoRef.current) {
        isPopStateUndoRedoRef.current = true;
        redoSteps(delta);
      }
    };

    window.addEventListener('popstate', onPopState);
    return (): void => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [undoSteps, redoSteps]);

  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl || event.altKey) return;

      const key = event.key.toLowerCase();
      const isRedoKey = key === 'y' || (key === 'z' && event.shiftKey);
      const isUndoKey = key === 'z' && !event.shiftKey;

      if (isUndoKey && canUndoRef.current) {
        event.preventDefault();
        undo();
        return;
      }

      if (isRedoKey && canRedoRef.current) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return (): void => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [undo, redo]);
}
