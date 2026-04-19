// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Assemble stable header and main-layout control props outside App.tsx.
 */

import { useCallback, useMemo } from 'react';

import { AppHeader } from '../layout/AppHeader';
import { AppMainLayout } from '../layout/AppMainLayout';
import type {
  ChapterContinuation,
  EditorSettings,
  SessionMutation,
  SourcebookEntry,
  StoryState,
} from '../../types';

type AppHeaderProps = React.ComponentProps<typeof AppHeader>;
type AppMainLayoutProps = React.ComponentProps<typeof AppMainLayout>;

type UseAppHeaderPropsParams = {
  storyTitle: string;
  sidebarControls: AppHeaderProps['sidebarControls'];
  undo: () => void;
  redo: () => void;
  undoSteps: (steps: number) => void;
  redoSteps: (steps: number) => void;
  undoOptions: AppHeaderProps['historyControls']['undoOptions'];
  redoOptions: AppHeaderProps['historyControls']['redoOptions'];
  nextUndoLabel?: string | null;
  nextRedoLabel?: string | null;
  canUndo: boolean;
  canRedo: boolean;
  viewMode: AppHeaderProps['viewControls']['viewMode'];
  setViewMode: AppHeaderProps['viewControls']['setViewMode'];
  showWhitespace: boolean;
  setShowWhitespace: (show: boolean) => void;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: (open: boolean) => void;
  isFormatMenuOpen: boolean;
  setIsFormatMenuOpen: (open: boolean) => void;
  isMobileFormatMenuOpen: boolean;
  setIsMobileFormatMenuOpen: (open: boolean) => void;
  handleFormat: (format: string) => void;
  getFormatButtonClass: (format: string) => string;
  openImagesDialog: () => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsImagesOpen: (open: boolean) => void;
  setIsDebugLogsOpen: (open: boolean) => void;
  appearanceRef: React.RefObject<HTMLDivElement | null>;
  isAppearanceOpen: boolean;
  setIsAppearanceOpen: (open: boolean) => void;
  setAppTheme: (theme: EditorSettings['theme']) => void;
  editorSettings: EditorSettings;
  setEditorSettings: (updater: (prev: EditorSettings) => EditorSettings) => void;
  appSettings: AppHeaderProps['modelControls']['appSettings'];
  setAppSettings: AppHeaderProps['modelControls']['setAppSettings'];
  handleSaveSettings: AppHeaderProps['modelControls']['saveSettings'];
  modelConnectionStatus: AppHeaderProps['modelControls']['modelConnectionStatus'];
  detectedCapabilities: AppHeaderProps['modelControls']['detectedCapabilities'];
  recheckUnavailableProviderIfStale: AppHeaderProps['modelControls']['recheckUnavailableProviderIfStale'];
  handleAiAction: AppHeaderProps['aiControls']['handleAiAction'];
  isAiActionLoading: boolean;
  isWritingAvailable: boolean;
  isCurrentChapterEmpty: boolean;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  openSearch: () => void;
};

type UseAppMainLayoutPropsParams = {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  currentChapterId: string | null;
  handleChapterSelect: (chapterId: string | null) => void;
  deleteChapter: (chapterId: string) => Promise<void>;
  updateChapter: (id: string, partial: Record<string, unknown>) => Promise<unknown>;
  updateBook: (id: string, partial: Record<string, unknown>) => Promise<void>;
  addChapter: (title: string, content?: string, bookId?: string) => Promise<void>;
  handleBookCreate: (title: string) => Promise<void>;
  handleBookDelete: (bookId: string) => Promise<void>;
  handleReorderChapters: AppMainLayoutProps['sidebarControls']['handleReorderChapters'];
  handleReorderBooks: AppMainLayoutProps['sidebarControls']['handleReorderBooks'];
  handleSidebarAiAction: AppMainLayoutProps['sidebarControls']['handleSidebarAiAction'];
  isEditingAvailable: boolean;
  handleOpenImages: () => void;
  updateStoryMetadata: AppMainLayoutProps['sidebarControls']['updateStoryMetadata'];
  checkedEntries: Set<string>;
  handleToggleEntry: (id: string, checked: boolean) => void;
  isAutoSourcebookSelectionEnabled: boolean;
  setIsAutoSourcebookSelectionEnabled: (enabled: boolean) => void;
  isSourcebookSelectionRunning: boolean;
  sourcebookMutationEntryIds: Set<string>;
  baselineState: StoryState;
  advanceBaselineToCurrentStory: () => void;
  patchSourcebook: (entry: SourcebookEntry | null, entryId?: string) => boolean;
  pushExternalHistoryEntry: (params: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
    forceNewHistory?: boolean;
    entryId?: string;
  }) => void;
  refreshStory: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  searchState: { notifyContentChanged: (chapterId: number) => void };
  currentChapter: AppMainLayoutProps['editorControls']['currentChapter'];
  isChapterLoading: boolean;
  editorRef: AppMainLayoutProps['editorControls']['editorRef'];
  editorSettings: EditorSettings;
  storyLanguage?: string;
  setEditorSettings: AppHeaderProps['appearanceControls']['setEditorSettings'];
  viewMode: AppMainLayoutProps['editorControls']['viewMode'];
  continuations: ChapterContinuation[];
  isSuggesting: boolean;
  handleTriggerSuggestions: () => void;
  cancelSuggestions: () => void;
  handleAcceptContinuation: (continuation: ChapterContinuation) => void;
  isSuggestionMode: boolean;
  handleKeyboardSuggestionAction: AppMainLayoutProps['editorControls']['suggestionControls']['handleKeyboardSuggestionAction'];
  handleAiAction: AppHeaderProps['aiControls']['handleAiAction'];
  cancelAiAction: () => void;
  isAiActionLoading: boolean;
  isWritingAvailable: boolean;
  isChatLoading: boolean;
  setActiveFormats: (formats: string[]) => void;
  showWhitespace: boolean;
  setShowWhitespace: (show: boolean) => void;
  editorBaselineContent?: string;
  openSearch: () => void;
  chatControls: AppMainLayoutProps['chatControls'];
  instructionLanguages: string[];
};

export function useAppHeaderProps(params: UseAppHeaderPropsParams): AppHeaderProps {
  const searchControls = useMemo(
    () => ({ onOpenSearch: params.openSearch }),
    [params.openSearch]
  );
  const historyControls = useMemo(
    () => ({
      undo: params.undo,
      redo: params.redo,
      undoSteps: params.undoSteps,
      redoSteps: params.redoSteps,
      undoOptions: params.undoOptions,
      redoOptions: params.redoOptions,
      nextUndoLabel: params.nextUndoLabel,
      nextRedoLabel: params.nextRedoLabel,
      canUndo: params.canUndo,
      canRedo: params.canRedo,
    }),
    [params]
  );
  const viewControls = useMemo(
    () => ({
      viewMode: params.viewMode,
      setViewMode: params.setViewMode,
      showWhitespace: params.showWhitespace,
      setShowWhitespace: params.setShowWhitespace,
      isViewMenuOpen: params.isViewMenuOpen,
      setIsViewMenuOpen: params.setIsViewMenuOpen,
      isFormatMenuOpen: params.isFormatMenuOpen,
      setIsFormatMenuOpen: params.setIsFormatMenuOpen,
      isMobileFormatMenuOpen: params.isMobileFormatMenuOpen,
      setIsMobileFormatMenuOpen: params.setIsMobileFormatMenuOpen,
    }),
    [params]
  );
  return useMemo(
    () => ({
      storyTitle: params.storyTitle,
      sidebarControls: params.sidebarControls,
      settingsControls: {
        setIsSettingsOpen: params.setIsSettingsOpen,
        setIsImagesOpen: params.setIsImagesOpen,
        setIsDebugLogsOpen: params.setIsDebugLogsOpen,
      },
      historyControls,
      viewControls,
      formatControls: {
        handleFormat: params.handleFormat,
        getFormatButtonClass: params.getFormatButtonClass,
        isFormatMenuOpen: params.isFormatMenuOpen,
        setIsFormatMenuOpen: params.setIsFormatMenuOpen,
        isMobileFormatMenuOpen: params.isMobileFormatMenuOpen,
        setIsMobileFormatMenuOpen: params.setIsMobileFormatMenuOpen,
        onOpenImages: params.openImagesDialog,
      },
      aiControls: {
        handleAiAction: params.handleAiAction,
        isAiActionLoading: params.isAiActionLoading,
        isWritingAvailable: params.isWritingAvailable,
        isChapterEmpty: params.isCurrentChapterEmpty,
      },
      modelControls: {
        appSettings: params.appSettings,
        setAppSettings: params.setAppSettings,
        saveSettings: params.handleSaveSettings,
        modelConnectionStatus: params.modelConnectionStatus,
        detectedCapabilities: params.detectedCapabilities,
        recheckUnavailableProviderIfStale: params.recheckUnavailableProviderIfStale,
      },
      appearanceControls: {
        appearanceRef: params.appearanceRef,
        isAppearanceOpen: params.isAppearanceOpen,
        setIsAppearanceOpen: params.setIsAppearanceOpen,
        setAppTheme: params.setAppTheme,
        editorSettings: params.editorSettings,
        setEditorSettings: params.setEditorSettings,
      },
      chatPanelControls: {
        isChatOpen: params.isChatOpen,
        setIsChatOpen: params.setIsChatOpen,
      },
      searchControls,
    }),
    [historyControls, params, searchControls, viewControls]
  );
}

export function useAppMainLayoutProps(params: UseAppMainLayoutPropsParams): {
  sidebarControls: AppMainLayoutProps['sidebarControls'];
  editorControls: AppMainLayoutProps['editorControls'];
  appMainLayoutProps: AppMainLayoutProps;
} {
  const checkedSourcebookIds = useMemo(
    () => Array.from(params.checkedEntries),
    [params.checkedEntries]
  );
  const handleSourcebookMutated = useCallback(
    async (mutation: {
      label: string;
      onUndo?: () => Promise<void>;
      onRedo?: () => Promise<void>;
      entryId?: string;
      entryExistsInBaseline?: boolean;
      updatedEntry?: SourcebookEntry | null;
    }) => {
      const existsInBaseline = Boolean(
        mutation.entryExistsInBaseline ??
        params.baselineState.sourcebook?.some(
          (entry: SourcebookEntry) => entry.id === mutation.entryId
        )
      );
      if (mutation.updatedEntry !== undefined) {
        if (!existsInBaseline) {
          params.advanceBaselineToCurrentStory();
        }
        if (!params.patchSourcebook(mutation.updatedEntry, mutation.entryId)) {
          return;
        }
        if (existsInBaseline) {
          params.advanceBaselineToCurrentStory();
        }
        params.pushExternalHistoryEntry({ ...mutation, forceNewHistory: true });
        return;
      }
      if (!existsInBaseline) {
        params.advanceBaselineToCurrentStory();
      }
      await params.refreshStory();
      if (existsInBaseline) {
        params.advanceBaselineToCurrentStory();
      }
      params.pushExternalHistoryEntry(mutation);
    },
    [params]
  );
  const editorUpdateChapter = useCallback(
    (id: string, partial: Record<string, unknown>) => {
      if ('content' in partial) {
        params.searchState.notifyContentChanged(Number.parseInt(id, 10));
      }
      return params.updateChapter(id, partial);
    },
    [params]
  );
  const sidebarControls = useMemo(
    () => ({
      isSidebarOpen: params.isSidebarOpen,
      setIsSidebarOpen: params.setIsSidebarOpen,
      currentChapterId: params.currentChapterId,
      handleChapterSelect: params.handleChapterSelect,
      deleteChapter: params.deleteChapter,
      updateChapter: params.updateChapter,
      updateBook: params.updateBook,
      addChapter: params.addChapter,
      handleBookCreate: params.handleBookCreate,
      handleBookDelete: params.handleBookDelete,
      handleReorderChapters: params.handleReorderChapters,
      handleReorderBooks: params.handleReorderBooks,
      handleSidebarAiAction: params.handleSidebarAiAction,
      isEditingAvailable: params.isEditingAvailable,
      handleOpenImages: params.handleOpenImages,
      updateStoryMetadata: params.updateStoryMetadata,
      checkedSourcebookIds,
      onToggleSourcebook: params.handleToggleEntry,
      isAutoSourcebookSelectionEnabled: params.isAutoSourcebookSelectionEnabled,
      onToggleAutoSourcebookSelection: params.setIsAutoSourcebookSelectionEnabled,
      isSourcebookSelectionRunning: params.isSourcebookSelectionRunning,
      mutatedSourcebookEntryIds: params.sourcebookMutationEntryIds,
      onSourcebookMutated: handleSourcebookMutated,
      onAppUndo: params.undo,
      onAppRedo: params.redo,
      canAppUndo: params.canUndo,
      canAppRedo: params.canRedo,
    }),
    [checkedSourcebookIds, handleSourcebookMutated, params]
  );
  const editorControls = useMemo(
    () => ({
      currentChapter: params.currentChapter,
      isChapterLoading: params.isChapterLoading,
      editorRef: params.editorRef,
      editorSettings: params.editorSettings,
      storyLanguage: params.storyLanguage || 'en',
      setEditorSettings: params.setEditorSettings,
      viewMode: params.viewMode,
      updateChapter: editorUpdateChapter,
      suggestionControls: {
        continuations: params.continuations,
        isSuggesting: params.isSuggesting,
        handleTriggerSuggestions: params.handleTriggerSuggestions,
        handleCancelSuggestions: params.cancelSuggestions,
        handleAcceptContinuation: params.handleAcceptContinuation,
        isSuggestionMode: params.isSuggestionMode,
        handleKeyboardSuggestionAction: params.handleKeyboardSuggestionAction,
      },
      aiControls: {
        handleAiAction: params.handleAiAction,
        cancelAiAction: params.cancelAiAction,
        isAiActionLoading: params.isAiActionLoading,
        isWritingAvailable: params.isWritingAvailable,
        isProseStreaming: params.isChatLoading || params.isAiActionLoading,
        isChapterEmpty: !params.currentChapter?.content?.trim(),
      },
      setActiveFormats: params.setActiveFormats,
      showWhitespace: params.showWhitespace,
      setShowWhitespace: params.setShowWhitespace,
      baselineContent: params.editorBaselineContent,
      onOpenSearch: params.openSearch,
    }),
    [editorUpdateChapter, params]
  );
  return {
    sidebarControls,
    editorControls,
    appMainLayoutProps: {
      sidebarControls,
      editorControls,
      chatControls: params.chatControls,
      instructionLanguages: params.instructionLanguages,
    },
  };
}
