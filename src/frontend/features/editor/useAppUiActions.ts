// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use app ui actions unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, RefObject, SetStateAction } from 'react';

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
  currentProjectType,
  refreshStory,
  getErrorMessage,
  recordHistoryEntry,
}: UseAppUiActionsParams) {
  const { buttonActive, isLight } = useTheme();

  const handleFormat = (type: string) => {
    if (editorRef.current) {
      editorRef.current.format(type);
      setIsFormatMenuOpen(false);
      setIsMobileFormatMenuOpen(false);
    }
  };

  const handleChapterSelect = (id: string) => {
    selectChapter(id);
    setIsSidebarOpen(false);
  };

  const getFormatButtonClass = (type: string) => {
    const isActive = activeFormats.includes(type);
    if (isActive) return `p-1.5 rounded-md transition-colors ${buttonActive}`;
    return `p-1.5 rounded-md transition-colors ${
      isLight
        ? 'text-brand-gray-500 hover:bg-brand-gray-100 hover:text-brand-gray-700'
        : 'text-brand-gray-500 hover:bg-brand-gray-800 hover:text-brand-gray-300'
    }`;
  };

  const handleConvertProject = async (newType: string) => {
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
  };

  const handleBookCreate = async (title: string) => {
    try {
      await api.books.create(title);
      await refreshStory(`Create book: ${title}`);
    } catch (error: unknown) {
      notifyError(
        `Failed to create book: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
    }
  };

  const handleBookDelete = async (id: string) => {
    try {
      await api.books.delete(id);
      await refreshStory(`Delete book: ${id}`);
    } catch (error: unknown) {
      notifyError(
        `Failed to delete book: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
    }
  };

  const handleReorderChapters = async (chapterIds: number[], bookId?: string) => {
    try {
      await api.chapters.reorder(chapterIds, bookId);
      await refreshStory(
        bookId ? `Reorder chapters in book ${bookId}` : 'Reorder chapters'
      );
    } catch (error: unknown) {
      notifyError(
        `Failed to reorder chapters: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
    }
  };

  const handleReorderBooks = async (bookIds: string[]) => {
    try {
      await api.books.reorder(bookIds);
      await refreshStory('Reorder books');
    } catch (error: unknown) {
      notifyError(
        `Failed to reorder books: ${getErrorMessage(error, 'Unknown error')}`,
        error
      );
    }
  };

  const handleOpenImages = () => {
    if (editorRef.current?.openImageManager) {
      editorRef.current.openImageManager();
    }
  };

  const setAppTheme = (theme: AppTheme) => {
    setEditorSettings((previous) => ({ ...previous, theme }));
  };

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
