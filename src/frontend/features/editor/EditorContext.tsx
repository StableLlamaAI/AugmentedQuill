// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the editor context unit so this responsibility stays isolated,
 * testable, and easy to evolve.
 */

import React, { createContext, useContext } from 'react';
import type { AppTheme, SuggestionGenerationMode } from '../../types';

export interface EditorContextValue {
  theme: AppTheme;
  toolbarBg: string;
  footerBg: string;
  textMuted: string;
  chapterScope: string | undefined;
  isAiLoading: boolean;
  isWritingAvailable: boolean;
  writingUnavailableReason: string;
  isChapterEmpty: boolean;
  onAiAction: (
    unit: 'chapter' | 'summary',
    action: 'update' | 'rewrite' | 'extend'
  ) => void;
  shouldShowContinuationPanel: boolean;
  displayedContinuations: string[];
  suggestionMode: SuggestionGenerationMode;
  onSuggestionModeChange: (mode: SuggestionGenerationMode) => void;
  isSuggesting: boolean;
  localContentRef: React.MutableRefObject<string>;
  onSuggestionButtonClick: () => void;
  onAcceptContinuation: (text: string, contentOverride?: string) => void;
  onRegenerate: (cursor: number, content: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditorContext = (): EditorContextValue => {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('useEditorContext must be used inside <EditorProvider>');
  }
  return ctx;
};

interface EditorProviderProps {
  value: EditorContextValue;
  children: React.ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({
  value,
  children,
}: EditorProviderProps) => {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};
