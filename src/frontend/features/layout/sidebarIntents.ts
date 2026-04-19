// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralize common sidebar navigation intents so callsites avoid
 * duplicating open/expand/trigger logic.
 */

import { Dispatch, SetStateAction, useCallback } from 'react';
import { EditorSettings, MetadataTab } from '../../types';

type MetadataDialogTrigger = {
  id: number;
  initialTab?: MetadataTab;
} | null;

type SourcebookDialogTrigger = {
  id: number;
  entryId: string;
} | null;

interface UseSidebarIntentsParams {
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setEditorSettings: Dispatch<SetStateAction<EditorSettings>>;
  setMetadataDialogTrigger: Dispatch<SetStateAction<MetadataDialogTrigger>>;
  setSourcebookDialogTrigger: Dispatch<SetStateAction<SourcebookDialogTrigger>>;
}

export const useSidebarIntents = ({
  setIsSidebarOpen,
  setEditorSettings,
  setMetadataDialogTrigger,
  setSourcebookDialogTrigger,
}: UseSidebarIntentsParams) => {
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
      setMetadataDialogTrigger((prev: MetadataDialogTrigger) => ({
        id: (prev?.id ?? 0) + 1,
        initialTab,
      }));
    },
    [openAndExpandStory, setMetadataDialogTrigger]
  );

  const openSourcebookEntryDialog = useCallback(
    (entryId: string) => {
      openAndExpandSourcebook();
      setSourcebookDialogTrigger((prev: SourcebookDialogTrigger) => ({
        id: (prev?.id ?? 0) + 1,
        entryId,
      }));
    },
    [openAndExpandSourcebook, setSourcebookDialogTrigger]
  );

  return {
    openAndExpandStory,
    openAndExpandSourcebook,
    openStoryMetadataDialog,
    openSourcebookEntryDialog,
  };
};
