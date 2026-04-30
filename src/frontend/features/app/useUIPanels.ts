// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralises all top-level UI panel open/close state so App.tsx stays
 * focused on orchestration rather than boolean bookkeeping.
 * State now lives in uiStore (Zustand) so panel toggling never re-renders
 * unrelated subtrees.
 */

import { RefObject, useRef } from 'react';
import { useClickOutside } from '../../utils/hooks';
import { useUIStore, UIStoreState } from '../../stores/uiStore';

export type UIPanels = {
  isChatOpen: boolean;
  setIsChatOpen: (v: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  isAppearanceOpen: boolean;
  setIsAppearanceOpen: (v: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  isImagesOpen: boolean;
  setIsImagesOpen: (v: boolean) => void;
  isDebugLogsOpen: boolean;
  setIsDebugLogsOpen: (v: boolean) => void;
  /** Ref passed to the appearance dropdown so clicks inside don't close it. */
  appearanceRef: RefObject<HTMLDivElement | null>;
};

/** Custom React hook that manages uipanels. */
export function useUIPanels(): UIPanels {
  const isChatOpen = useUIStore((s: UIStoreState): boolean => s.isChatOpen);
  const setIsChatOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsChatOpen
  );
  const isSidebarOpen = useUIStore((s: UIStoreState): boolean => s.isSidebarOpen);
  const setIsSidebarOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsSidebarOpen
  );
  const isAppearanceOpen = useUIStore((s: UIStoreState): boolean => s.isAppearanceOpen);
  const setIsAppearanceOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsAppearanceOpen
  );
  const isSettingsOpen = useUIStore((s: UIStoreState): boolean => s.isSettingsOpen);
  const setIsSettingsOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsSettingsOpen
  );
  const isImagesOpen = useUIStore((s: UIStoreState): boolean => s.isImagesOpen);
  const setIsImagesOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsImagesOpen
  );
  const isDebugLogsOpen = useUIStore((s: UIStoreState): boolean => s.isDebugLogsOpen);
  const setIsDebugLogsOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsDebugLogsOpen
  );

  const appearanceRef = useRef<HTMLDivElement>(null);
  useClickOutside(appearanceRef, () => setIsAppearanceOpen(false), isAppearanceOpen);

  return {
    isChatOpen,
    setIsChatOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    isAppearanceOpen,
    setIsAppearanceOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isImagesOpen,
    setIsImagesOpen,
    isDebugLogsOpen,
    setIsDebugLogsOpen,
    appearanceRef,
  };
}
