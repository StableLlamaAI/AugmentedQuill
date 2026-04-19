// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Owns the editor toolbar UI state (view mode, whitespace toggle,
 * active formats, and menu open/close flags) so App.tsx stays thin.
 */

import { Dispatch, SetStateAction, useState } from 'react';
import { ViewMode } from '../../types';

export type EditorUIState = {
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  showWhitespace: boolean;
  setShowWhitespace: Dispatch<SetStateAction<boolean>>;
  activeFormats: string[];
  setActiveFormats: Dispatch<SetStateAction<string[]>>;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: Dispatch<SetStateAction<boolean>>;
  isFormatMenuOpen: boolean;
  setIsFormatMenuOpen: Dispatch<SetStateAction<boolean>>;
  isMobileFormatMenuOpen: boolean;
  setIsMobileFormatMenuOpen: Dispatch<SetStateAction<boolean>>;
};

/** Custom React hook that manages editor uistate. */
export function useEditorUIState(): EditorUIState {
  const [viewMode, setViewMode] = useState<ViewMode>('raw');
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
  const [isMobileFormatMenuOpen, setIsMobileFormatMenuOpen] = useState(false);

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
