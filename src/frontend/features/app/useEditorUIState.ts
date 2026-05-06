// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Owns the editor toolbar UI state (view mode, whitespace toggle,
 * active formats, and menu open/close flags) so App.tsx stays thin.
 * State now lives in uiStore (Zustand) for granular subscriptions.
 */

import { useUIStore, UIStoreState } from '../../stores/uiStore';
import { ViewMode } from '../../types';

export type EditorUIState = {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  showWhitespace: boolean;
  setShowWhitespace: (v: boolean) => void;
  activeFormats: string[];
  setActiveFormats: (v: string[]) => void;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: (v: boolean) => void;
  isFormatMenuOpen: boolean;
  setIsFormatMenuOpen: (v: boolean) => void;
  isMobileFormatMenuOpen: boolean;
  setIsMobileFormatMenuOpen: (v: boolean) => void;
};

/** Custom React hook that manages editor uistate. */
export function useEditorUIState(): EditorUIState {
  const viewMode = useUIStore((s: UIStoreState): ViewMode => s.viewMode);
  const setViewMode = useUIStore(
    (s: UIStoreState): ((mode: ViewMode | ((prev: ViewMode) => ViewMode)) => void) =>
      s.setViewMode
  );
  const showWhitespace = useUIStore((s: UIStoreState): boolean => s.showWhitespace);
  const setShowWhitespace = useUIStore(
    (s: UIStoreState): ((show: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setShowWhitespace
  );
  const activeFormats = useUIStore((s: UIStoreState): string[] => s.activeFormats);
  const setActiveFormats = useUIStore(
    (s: UIStoreState): ((formats: string[] | ((prev: string[]) => string[])) => void) =>
      s.setActiveFormats
  );
  const isViewMenuOpen = useUIStore((s: UIStoreState): boolean => s.isViewMenuOpen);
  const setIsViewMenuOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsViewMenuOpen
  );
  const isFormatMenuOpen = useUIStore((s: UIStoreState): boolean => s.isFormatMenuOpen);
  const setIsFormatMenuOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsFormatMenuOpen
  );
  const isMobileFormatMenuOpen = useUIStore(
    (s: UIStoreState): boolean => s.isMobileFormatMenuOpen
  );
  const setIsMobileFormatMenuOpen = useUIStore(
    (s: UIStoreState): ((open: boolean | ((prev: boolean) => boolean)) => void) =>
      s.setIsMobileFormatMenuOpen
  );

  return {
    viewMode,
    setViewMode,
    showWhitespace,
    setShowWhitespace,
    activeFormats,
    setActiveFormats,
    isViewMenuOpen,
    setIsViewMenuOpen,
    isFormatMenuOpen,
    setIsFormatMenuOpen,
    isMobileFormatMenuOpen,
    setIsMobileFormatMenuOpen,
  };
}
