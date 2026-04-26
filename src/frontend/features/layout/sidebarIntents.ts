// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralize common sidebar navigation intents so callsites avoid
 * duplicating open/expand/trigger logic.
 * Dialog state is now managed by uiStore so no setter props are needed.
 */

import { Dispatch, SetStateAction, useCallback } from 'react';
import { EditorSettings, MetadataTab } from '../../types';
import { uiStoreActions, useUIStore, UIStoreState } from '../../stores/uiStore';

interface UseSidebarIntentsParams {
  setEditorSettings: Dispatch<SetStateAction<EditorSettings>>;
}

export const useSidebarIntents = ({ setEditorSettings }: UseSidebarIntentsParams) => {
  const setIsSidebarOpen = useUIStore((s: UIStoreState) => s.setIsSidebarOpen);

  const openAndExpandStory = useCallback(() => {
    setIsSidebarOpen(true);
    setEditorSettings((prev: EditorSettings) => ({
      ...prev,
      sidebar: { ...prev.sidebar, isStoryCollapsed: false },
    }));
  }, [setIsSidebarOpen, setEditorSettings]);

  const openAndExpandSourcebook = useCallback(() => {
    setIsSidebarOpen(true);
    setEditorSettings((prev: EditorSettings) => ({
      ...prev,
      sidebar: { ...prev.sidebar, isSourcebookCollapsed: false },
    }));
  }, [setIsSidebarOpen, setEditorSettings]);

  const openStoryMetadataDialog = useCallback(
    (initialTab?: MetadataTab) => {
      openAndExpandStory();
      uiStoreActions.openMetadataDialog(initialTab);
    },
    [openAndExpandStory]
  );

  const openSourcebookEntryDialog = useCallback(
    (entryId: string) => {
      openAndExpandSourcebook();
      uiStoreActions.openSourcebookDialog(entryId);
    },
    [openAndExpandSourcebook]
  );

  return {
    openAndExpandStory,
    openAndExpandSourcebook,
    openStoryMetadataDialog,
    openSourcebookEntryDialog,
  };
};
