// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralize global search shortcuts and search-result navigation so
 * App.tsx does not own editor-jump bookkeeping and dialog routing logic.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ComponentProps, RefObject } from 'react';

import { uiStoreActions } from '../../stores/uiStore';
import type { MetadataTab } from '../../types';
import type { EditorHandle } from '../editor/Editor';
import { SearchHighlightProvider } from '../search/SearchHighlightContext';
import { SearchReplaceDialog } from '../search/SearchReplaceDialog';
import {
  useSearchReplace,
  type UseSearchReplaceResult,
} from '../search/useSearchReplace';

type SearchHighlightValue = ComponentProps<typeof SearchHighlightProvider>['value'];
type SearchReplaceDialogProps = ComponentProps<typeof SearchReplaceDialog>;

type UseAppSearchNavigationParams = {
  editorRef: RefObject<EditorHandle | null>;
  currentChapterId: string | null;
  currentChapterContent?: string;
  storyLanguage?: string;
  refreshStory: () => Promise<void>;
  handleChapterSelect: (chapterId: string | null) => void;
  openSourcebookEntryDialog: (entryId: string) => void;
  openStoryMetadataDialog: (tab?: MetadataTab) => void;
};

type UseAppSearchNavigationResult = {
  searchState: UseSearchReplaceResult;
  openSearch: () => void;
  searchHighlightValue: SearchHighlightValue;
  searchReplaceDialogProps: SearchReplaceDialogProps;
};

export function useAppSearchNavigation({
  editorRef,
  currentChapterId,
  currentChapterContent,
  storyLanguage,
  refreshStory,
  handleChapterSelect,
  openSourcebookEntryDialog,
  openStoryMetadataDialog,
}: UseAppSearchNavigationParams): UseAppSearchNavigationResult {
  const searchState = useSearchReplace();
  const pendingJumpRef = useRef<{
    chapterId: string;
    start: number;
    end: number;
  } | null>(null);

  const openSearch = searchState.open;

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        const target = event.target as HTMLElement;
        const isEditorFocused = target.closest('#raw-markdown-editor') !== null;
        if (!isEditorFocused) {
          event.preventDefault();
          openSearch();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending || pending.chapterId !== currentChapterId) {
      return;
    }

    const content = currentChapterContent ?? '';
    if (pending.end > 0 && content.length < pending.end) {
      return;
    }

    pendingJumpRef.current = null;
    requestAnimationFrame(() => {
      editorRef.current?.jumpToPosition(pending.start, pending.end);
    });
  }, [currentChapterContent, currentChapterId, editorRef]);

  const searchHighlightValue = useMemo(
    () => ({
      highlightActive: searchState.highlightActive,
      ranges: searchState.highlightRanges,
      texts: searchState.highlightTexts,
    }),
    [
      searchState.highlightActive,
      searchState.highlightRanges,
      searchState.highlightTexts,
    ]
  );

  const handleStoryChanged = useCallback(() => {
    void refreshStory();
  }, [refreshStory]);

  const handleNavigateToChapter = useCallback(
    (chapterId: number, jumpStart?: number, jumpEnd?: number) => {
      uiStoreActions.closeMetadataDialog();
      uiStoreActions.closeSourcebookDialog();

      if (jumpStart !== undefined && jumpEnd !== undefined) {
        pendingJumpRef.current = {
          chapterId: String(chapterId),
          start: jumpStart,
          end: jumpEnd,
        };
      }

      handleChapterSelect(String(chapterId));
    },
    [handleChapterSelect]
  );

  const handleNavigateToSourcebookEntry = useCallback(
    (entryId: string) => {
      uiStoreActions.closeMetadataDialog();
      openSourcebookEntryDialog(entryId);
    },
    [openSourcebookEntryDialog]
  );

  const handleNavigateToStoryMetadata = useCallback(
    (field: string) => {
      const tab: MetadataTab =
        field === 'story_summary'
          ? 'summary'
          : field === 'notes'
            ? 'notes'
            : field === 'private_notes'
              ? 'private'
              : field.startsWith('conflicts')
                ? 'conflicts'
                : 'summary';

      uiStoreActions.closeSourcebookDialog();
      openStoryMetadataDialog(tab);
    },
    [openStoryMetadataDialog]
  );

  const searchReplaceDialogProps = useMemo(
    () => ({
      searchState,
      activeChapterId:
        currentChapterId !== null ? Number.parseInt(currentChapterId, 10) : null,
      storyLanguage: storyLanguage || 'en',
      onJumpToPosition: (start: number, end: number) => {
        editorRef.current?.jumpToPosition(start, end);
      },
      onStoryChanged: handleStoryChanged,
      onNavigateToChapter: handleNavigateToChapter,
      onNavigateToSourcebookEntry: handleNavigateToSourcebookEntry,
      onNavigateToStoryMetadata: handleNavigateToStoryMetadata,
    }),
    [
      searchState,
      currentChapterId,
      storyLanguage,
      editorRef,
      handleStoryChanged,
      handleNavigateToChapter,
      handleNavigateToSourcebookEntry,
      handleNavigateToStoryMetadata,
    ]
  );

  return {
    searchState,
    openSearch,
    searchHighlightValue,
    searchReplaceDialogProps,
  };
}
