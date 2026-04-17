// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use app ui actions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, RefObject, SetStateAction, useCallback } from 'react';

import { api } from '../../services/api';
import { AppTheme, EditorSettings, StoryState } from '../../types';
import { EditorHandle } from './Editor';
import { useTheme } from '../layout/ThemeContext';
import { notifyError } from '../../services/errorNotifier';

type UseAppUiActionsParams = {
  editorRef: RefObject<EditorHandle | null>;
  activeFormats: string[];
  setIsFormatMenuOpen: (open: boolean) => void;
  setIsMobileFormatMenuOpen: (open: boolean) => void;
  selectChapter: (id: string) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setEditorSettings: Dispatch<SetStateAction<EditorSettings>>;
  story: StoryState;
  currentProjectType: StoryState['projectType'];
  refreshStory: (historyLabel?: string) => Promise<void>;
  getErrorMessage: (error: unknown, fallback: string) => string;
  recordHistoryEntry?: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
};

export function useAppUiActions({
  editorRef,
  activeFormats,
  setIsFormatMenuOpen,
  setIsMobileFormatMenuOpen,
  selectChapter,
  setIsSidebarOpen,
  setEditorSettings,
  story,
  currentProjectType,
  refreshStory,
  getErrorMessage,
  recordHistoryEntry,
}: UseAppUiActionsParams) {
  const { buttonActive, isLight } = useTheme();

  const handleFormat = useCallback(
    (type: string) => {
      if (editorRef.current) {
        editorRef.current.format(type);
        setIsFormatMenuOpen(false);
        setIsMobileFormatMenuOpen(false);
      }
    },
    [editorRef, setIsFormatMenuOpen, setIsMobileFormatMenuOpen]
  );

  const handleChapterSelect = useCallback(
    (id: string | null) => {
      selectChapter(id);
      setIsSidebarOpen(false);
    },
    [selectChapter, setIsSidebarOpen]
  );

  const getFormatButtonClass = useCallback(
    (type: string) => {
      const isActive = activeFormats.includes(type);
      if (isActive) return `p-1.5 rounded-md transition-colors ${buttonActive}`;
      return `p-1.5 rounded-md transition-colors ${
        isLight
          ? 'text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-700'
          : 'text-brand-gray-500 hover:bg-brand-gray-800 hover:text-brand-gray-300'
      }`;
    },
    [activeFormats, buttonActive, isLight]
  );

  const handleConvertProject = useCallback(
    async (newType: string) => {
      try {
        if (newType === currentProjectType) return;
        await api.projects.convert(newType);
        await refreshStory();
        recordHistoryEntry?.({
          label: `Convert project: ${currentProjectType} -> ${newType}`,
          onUndo: async () => {
            await api.projects.convert(currentProjectType);
            await refreshStory();
          },
          onRedo: async () => {
            await api.projects.convert(newType);
            await refreshStory();
          },
        });
      } catch (error: unknown) {
        notifyError(
          `Failed to convert project: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [currentProjectType, refreshStory, getErrorMessage, recordHistoryEntry]
  );

  const handleBookCreate = useCallback(
    async (title: string) => {
      try {
        const created = await api.books.create(title);
        let createdBookId = created.book_id || '';
        await refreshStory();
        recordHistoryEntry?.({
          label: `Create book: ${title}`,
          onUndo: async () => {
            if (!createdBookId) return;
            await api.books.delete(createdBookId);
            await refreshStory();
          },
          onRedo: async () => {
            const recreated = await api.books.create(title);
            createdBookId = recreated.book_id || createdBookId;
            await refreshStory();
          },
        });
      } catch (error: unknown) {
        notifyError(
          `Failed to create book: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [refreshStory, getErrorMessage, recordHistoryEntry]
  );

  const handleBookDelete = useCallback(
    async (id: string) => {
      try {
        const deleted = await api.books.delete(id);
        let latestRestoreId = deleted.restore_id || '';
        await refreshStory();
        recordHistoryEntry?.({
          label: `Delete book: ${id}`,
          onUndo: async () => {
            if (!latestRestoreId) return;
            await api.books.restore(latestRestoreId);
            await refreshStory();
          },
          onRedo: async () => {
            const redone = await api.books.delete(id);
            latestRestoreId = redone.restore_id || latestRestoreId;
            await refreshStory();
          },
        });
      } catch (error: unknown) {
        notifyError(
          `Failed to delete book: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [refreshStory, getErrorMessage, recordHistoryEntry]
  );

  const handleReorderChapters = useCallback(
    async (chapterIds: number[], bookId?: string) => {
      try {
        const previousChapterIds = story.chapters
          .filter((chapter) => (bookId ? chapter.book_id === bookId : true))
          .map((chapter) => Number(chapter.id));

        await api.chapters.reorder(chapterIds, bookId);
        await refreshStory();
        recordHistoryEntry?.({
          label: bookId ? `Reorder chapters in book ${bookId}` : 'Reorder chapters',
          onUndo: async () => {
            await api.chapters.reorder(previousChapterIds, bookId);
            await refreshStory();
          },
          onRedo: async () => {
            await api.chapters.reorder(chapterIds, bookId);
            await refreshStory();
          },
        });
      } catch (error: unknown) {
        notifyError(
          `Failed to reorder chapters: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [story.chapters, refreshStory, getErrorMessage, recordHistoryEntry]
  );

  const handleReorderBooks = useCallback(
    async (bookIds: string[]) => {
      try {
        const previousBookIds = (story.books || []).map((book) => book.id);
        await api.books.reorder(bookIds);
        await refreshStory();
        recordHistoryEntry?.({
          label: 'Reorder books',
          onUndo: async () => {
            await api.books.reorder(previousBookIds);
            await refreshStory();
          },
          onRedo: async () => {
            await api.books.reorder(bookIds);
            await refreshStory();
          },
        });
      } catch (error: unknown) {
        notifyError(
          `Failed to reorder books: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [story.books, refreshStory, getErrorMessage, recordHistoryEntry]
  );

  const handleOpenImages = useCallback(() => {
    if (editorRef.current?.openImageManager) {
      editorRef.current.openImageManager();
    }
  }, [editorRef]);

  const setAppTheme = useCallback(
    (theme: AppTheme) => {
      setEditorSettings((previous) => ({ ...previous, theme }));
    },
    [setEditorSettings]
  );

  return {
    handleFormat,
    handleChapterSelect,
    getFormatButtonClass,
    handleConvertProject,
    handleBookCreate,
    handleBookDelete,
    handleReorderChapters,
    handleReorderBooks,
    handleOpenImages,
    setAppTheme,
  };
}
