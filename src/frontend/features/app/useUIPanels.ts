// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralises all top-level UI panel open/close state so App.tsx stays
 * focused on orchestration rather than boolean bookkeeping.
 */

import {
  Dispatch,
  RefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useClickOutside } from '../../utils/hooks';

const PANEL_STATE_KEY = 'aq_ui_panels';

export type UIPanels = {
  isChatOpen: boolean;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isAppearanceOpen: boolean;
  setIsAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  isImagesOpen: boolean;
  setIsImagesOpen: Dispatch<SetStateAction<boolean>>;
  isDebugLogsOpen: boolean;
  setIsDebugLogsOpen: Dispatch<SetStateAction<boolean>>;
  /** Ref passed to the appearance dropdown so clicks inside don't close it. */
  appearanceRef: RefObject<HTMLDivElement | null>;
};

export function useUIPanels(): UIPanels {
  const [isChatOpen, setIsChatOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_STATE_KEY);
      return saved
        ? ((JSON.parse(saved) as { isChatOpen?: boolean }).isChatOpen ?? false)
        : false;
    } catch {
      return false;
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_STATE_KEY);
      return saved
        ? ((JSON.parse(saved) as { isSidebarOpen?: boolean }).isSidebarOpen ?? false)
        : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const current = JSON.parse(
        localStorage.getItem(PANEL_STATE_KEY) || '{}'
      ) as Record<string, unknown>;
      localStorage.setItem(
        PANEL_STATE_KEY,
        JSON.stringify({ ...current, isSidebarOpen })
      );
    } catch {
      /* ignore */
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    try {
      const current = JSON.parse(
        localStorage.getItem(PANEL_STATE_KEY) || '{}'
      ) as Record<string, unknown>;
      localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({ ...current, isChatOpen }));
    } catch {
      /* ignore */
    }
  }, [isChatOpen]);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImagesOpen, setIsImagesOpen] = useState(false);
  const [isDebugLogsOpen, setIsDebugLogsOpen] = useState(false);
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
