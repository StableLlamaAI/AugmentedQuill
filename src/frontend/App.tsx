// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import { useStory } from './features/story/useStory';
import { useChapterSuggestions } from './features/chapters/useChapterSuggestions';
import { EditorHandle } from './features/editor/Editor';
import { useAppUiActions } from './features/editor/useAppUiActions';
import { useEditorPreferences } from './features/editor/useEditorPreferences';
import { useAiActions } from './features/story/useAiActions';
import { AppLayout } from './features/layout/AppLayout';
import { useConfirmDialog } from './features/layout/useConfirmDialog';
import { useProjectManagement } from './features/projects/useProjectManagement';
import { useAppSettings } from './features/settings/useAppSettings';
import { useProviderHealth } from './features/settings/useProviderHealth';
import { usePrompts } from './features/settings/usePrompts';
import { DEFAULT_APP_SETTINGS } from './features/app/appDefaults';
import { useAppChatRuntime } from './features/app/useAppChatRuntime';
import {
  useAppHeaderProps,
  useAppMainLayoutProps,
} from './features/app/useAppControlProps';
import { useAppSearchNavigation } from './features/app/useAppSearchNavigation';
import { useBrowserHistory } from './features/app/useBrowserHistory';
import { useEditorUIState } from './features/app/useEditorUIState';
import { useSettingsPersistence } from './features/app/useSettingsPersistence';
import { useToolCallGate } from './features/app/useToolCallGate';
import { useUIPanels } from './features/app/useUIPanels';
import { useSidebarIntents } from './features/layout/sidebarIntents';
import { useCurrentWritingUnit } from './features/story/useCurrentWritingUnit';
import {
  getErrorMessage,
  resolveActiveProviderConfigs,
  resolveRoleAvailability,
  supportsImageActions,
} from './features/app/appSelectors';
import { useToast } from './components/ui/Toast';
import { setErrorDispatcher } from './services/errorNotifier';

// eslint-disable-next-line max-lines-per-function
const App: React.FC = () => {
  const { confirm, alert, confirmDialogState, handleConfirm, handleCancel } =
    useConfirmDialog();

  const addToast = useToast();
  useEffect(() => {
    setErrorDispatcher((msg: string) => addToast(msg, 'error'));
  }, [addToast]);

  const {
    story,
    currentChapterId,
    selectChapter,
    updateStoryMetadata,
    updateStoryImageSettings,
    updateChapter,
    updateBook,
    addChapter,
    deleteChapter,
    loadStory,
    refreshStory,
    undo,
    redo,
    undoSteps,
    redoSteps,
    pushExternalHistoryEntry,
    undoOptions,
    redoOptions,
    nextUndoLabel,
    nextRedoLabel,
    historyIndex,
    canUndo,
    canRedo,
    baselineState,
    advanceBaselineToCurrentStory,
    patchSourcebook,
    isChapterLoading,
  } = useStory({ confirm, alert: (msg: string) => void alert(msg) });

  // Stable ref to avoid recreating callbacks that read story state during
  // streaming (e.g. onProseChunk).
  const storyRef = useRef(story);
  storyRef.current = story;
  const editorRef = useRef<EditorHandle | null>(null);
  const refreshProjectsRef = useRef<null | (() => Promise<void>)>(null);

  useBrowserHistory({
    historyIndex,
    canUndo,
    canRedo,
    undoSteps,
    redoSteps,
    undo,
    redo,
  });

  const {
    currentChapter,
    currentChapterContext,
    isCurrentChapterEmpty,
    editorBaselineContent,
  } = useCurrentWritingUnit({
    story,
    currentChapterId,
    baselineState,
  });

  const { appSettings, setAppSettings } = useAppSettings(DEFAULT_APP_SETTINGS);

  const prompts = usePrompts(story.id);

  const {
    modelConnectionStatus,
    detectedCapabilities,
    refreshHealth,
    recheckUnavailableProviderIfStale,
  } = useProviderHealth(appSettings);

  const { handleSaveSettings } = useSettingsPersistence({
    appSettings,
    setAppSettings,
    pushExternalHistoryEntry,
    refreshHealth,
  });

  const roleAvailability = useMemo(
    () => resolveRoleAvailability(appSettings, modelConnectionStatus),
    [appSettings, modelConnectionStatus]
  );
  const imageActionsAvailable = useMemo(
    () =>
      supportsImageActions(appSettings, detectedCapabilities, modelConnectionStatus),
    [appSettings, detectedCapabilities, modelConnectionStatus]
  );

  const { toolCallLoopDialog, requestToolCallLoopAccess } = useToolCallGate();

  const {
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
  } = useUIPanels();

  const openImagesDialog = useCallback(() => setIsImagesOpen(true), [setIsImagesOpen]);

  const {
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
  } = useEditorUIState();

  const { editorSettings, setEditorSettings, currentTheme, isLight } =
    useEditorPreferences();

  const { openAndExpandStory, openSourcebookEntryDialog, openStoryMetadataDialog } =
    useSidebarIntents({
      setEditorSettings,
    });

  // Get Active LLM Configs — memoized so hooks that receive these as params
  // don't re-run unnecessarily when unrelated appSettings fields change.
  const { activeChatConfig, activeWritingConfig } = useMemo(
    () => resolveActiveProviderConfigs(appSettings),
    [appSettings]
  );

  const {
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
  } = useAppUiActions({
    editorRef,
    activeFormats,
    setIsFormatMenuOpen,
    setIsMobileFormatMenuOpen,
    selectChapter,
    setIsSidebarOpen,
    setEditorSettings,
    story,
    currentProjectType: story.projectType,
    refreshStory,
    getErrorMessage,
    recordHistoryEntry: pushExternalHistoryEntry,
  });

  const {
    chatMessages,
    setChatMessages,
    isChatLoading,
    chatHistoryList,
    setChatHistoryList,
    currentChatId,
    isIncognito,
    setIsIncognito,
    allowWebSearch,
    setAllowWebSearch,
    systemPrompt,
    setSystemPrompt,
    scratchpad,
    onUpdateScratchpad,
    onDeleteScratchpad,
    incognitoSessions,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteAllChats,
    sessionMutations,
    sourcebookMutationEntryIds,
    onMutationClick,
    handleSendMessageWithReset,
    handleStopChat,
    handleRegenerateWithReset,
    handleEditMessage,
    handleDeleteMessage,
  } = useAppChatRuntime({
    storyId: story.id,

    storyRef,
    prompts,
    activeChatConfig,
    isChatAvailable: roleAvailability.chat,
    currentChapterId,
    currentChapterContext,
    advanceBaselineToCurrentStory,
    refreshProjects: async () => {
      await refreshProjectsRef.current?.();
    },
    refreshStory,
    updateChapter,
    pushExternalHistoryEntry,
    requestToolCallLoopAccess,
    handleChapterSelect,
    openAndExpandStory,
    openSourcebookEntryDialog,
    openStoryMetadataDialog,
  });

  const {
    continuations,
    isSuggesting,
    isSuggestionMode,
    handleTriggerSuggestions,
    handleKeyboardSuggestionAction,
    handleAcceptContinuation,
    cancelSuggestions,
    checkedEntries,
    handleToggleEntry,
    isAutoSourcebookSelectionEnabled,
    setIsAutoSourcebookSelectionEnabled,
    isSourcebookSelectionRunning,
  } = useChapterSuggestions({
    currentUnit: currentChapter || undefined,
    storyTitle: story.title,
    storySummary: story.summary,
    storyStyleTags: story.styleTags,
    systemPrompt,
    activeWritingConfig,
    isWritingAvailable: roleAvailability.writing,
    updateChapter,
    viewMode,
    setChatMessages,
    getErrorMessage,
  });

  // Stabilize checkedSourcebookIds so useAiActions does not receive a new
  // array reference on every render when checkedEntries hasn't changed.
  const checkedSourcebookIdsMemo = useMemo(
    () => Array.from(checkedEntries),
    [checkedEntries]
  );

  const { isAiActionLoading, handleAiAction, handleSidebarAiAction, cancelAiAction } =
    useAiActions({
      currentUnit: currentChapter || undefined,
      prompts,
      isEditingAvailable: roleAvailability.editing,
      isWritingAvailable: roleAvailability.writing,
      checkedSourcebookIds: checkedSourcebookIdsMemo,
      updateChapter,
      setChatMessages,
      getErrorMessage,
    });

  const {
    projects,
    refreshProjects,
    isCreateProjectOpen,
    setIsCreateProjectOpen,
    instructionLanguages,
    handleLoadProject,
    handleImportProject,
    handleCreateProject,
    handleCreateProjectConfirm,
    handleDeleteProject,
    handleRenameProject,
  } = useProjectManagement({
    storyId: story.id,
    storyTitle: story.title,
    storyProjectType: story.projectType,
    storyLanguage: story.language ?? 'en',
    storySummary: story.summary,
    storyStyleTags: story.styleTags,
    storyConflicts: story.conflicts,
    refreshStory,
    loadStory,
    updateStoryMetadata,
    handleSelectChat,
    handleNewChat,
    setChatHistoryList,
    getErrorMessage,
    isSettingsOpen,
    setIsSettingsOpen,
    recordHistoryEntry: pushExternalHistoryEntry,
  });
  refreshProjectsRef.current = refreshProjects;

  const { searchState, openSearch, searchHighlightValue, searchReplaceDialogProps } =
    useAppSearchNavigation({
      editorRef,
      currentChapterId,
      currentChapterContent: currentChapter?.content,
      storyLanguage: story.language,
      refreshStory: async () => {
        await refreshStory();
      },
      handleChapterSelect,
      openSourcebookEntryDialog,
      openStoryMetadataDialog,
    });

  // Minimal theme values needed by the outer wrapper div.
  const bgMain = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';
  const textMain = isLight ? 'text-brand-gray-800' : 'text-brand-gray-300';

  // Memoize so AppChatPanel's React.memo actually fires; without this the
  // chat panel re-renders on every App update even when nothing chat-related
  // changed.
  const chatControls = useMemo(
    () => ({
      isChatOpen,
      chatMessages,
      isChatLoading,
      isChatAvailable: roleAvailability.chat,
      activeChatConfig,
      systemPrompt,
      handleSendMessage: handleSendMessageWithReset,
      handleStopChat,
      handleRegenerate: handleRegenerateWithReset,
      handleEditMessage,
      handleDeleteMessage,
      setSystemPrompt,
      handleLoadProject,
      incognitoSessions,
      chatHistoryList,
      currentChatId,
      isIncognito,
      handleSelectChat,
      handleNewChat,
      handleDeleteChat,
      handleDeleteAllChats,
      setIsIncognito,
      allowWebSearch,
      setAllowWebSearch,
      scratchpad,
      onUpdateScratchpad,
      onDeleteScratchpad,
      sessionMutations,
      onMutationClick,
    }),
    [
      isChatOpen,
      chatMessages,
      isChatLoading,
      roleAvailability.chat,
      activeChatConfig,
      systemPrompt,
      handleSendMessageWithReset,
      handleStopChat,
      handleRegenerateWithReset,
      handleEditMessage,
      handleDeleteMessage,
      setSystemPrompt,
      handleLoadProject,
      incognitoSessions,
      chatHistoryList,
      currentChatId,
      isIncognito,
      handleSelectChat,
      handleNewChat,
      handleDeleteChat,
      handleDeleteAllChats,
      setIsIncognito,
      allowWebSearch,
      setAllowWebSearch,
      scratchpad,
      onUpdateScratchpad,
      onDeleteScratchpad,
      sessionMutations,
      onMutationClick,
    ]
  );

  const { sidebarControls, appMainLayoutProps } = useAppMainLayoutProps({
    isSidebarOpen,
    setIsSidebarOpen,
    currentChapterId,
    handleChapterSelect,
    deleteChapter,
    updateChapter: (id: string, partial: Record<string, unknown>) =>
      updateChapter(id, partial, true, true, true),
    updateBook,
    addChapter,
    handleBookCreate,
    handleBookDelete,
    handleReorderChapters,
    handleReorderBooks,
    handleSidebarAiAction,
    isEditingAvailable: roleAvailability.editing,
    handleOpenImages,
    updateStoryMetadata,
    checkedEntries,
    handleToggleEntry,
    isAutoSourcebookSelectionEnabled,
    setIsAutoSourcebookSelectionEnabled,
    isSourcebookSelectionRunning,
    sourcebookMutationEntryIds,
    baselineState,
    advanceBaselineToCurrentStory,
    patchSourcebook,
    pushExternalHistoryEntry,
    refreshStory,
    undo,
    redo,
    canUndo,
    canRedo,
    searchState,
    currentChapter,
    isChapterLoading,
    editorRef,
    editorSettings,
    storyLanguage: story.language,
    setEditorSettings,
    viewMode,
    continuations,
    isSuggesting,
    handleTriggerSuggestions,
    cancelSuggestions,
    handleAcceptContinuation,
    isSuggestionMode,
    handleKeyboardSuggestionAction,
    handleAiAction,
    cancelAiAction,
    isAiActionLoading,
    isWritingAvailable: roleAvailability.writing,
    isChatLoading,
    setActiveFormats,
    showWhitespace,
    setShowWhitespace,
    editorBaselineContent,
    openSearch,
    chatControls,
    instructionLanguages,
  });

  const appHeaderProps = useAppHeaderProps({
    storyTitle: story.title,
    sidebarControls,
    undo,
    redo,
    undoSteps,
    redoSteps,
    undoOptions,
    redoOptions,
    nextUndoLabel,
    nextRedoLabel,
    canUndo,
    canRedo,
    viewMode,
    setViewMode,
    showWhitespace,
    setShowWhitespace,
    isViewMenuOpen,
    setIsViewMenuOpen,
    isFormatMenuOpen,
    setIsFormatMenuOpen,
    isMobileFormatMenuOpen,
    setIsMobileFormatMenuOpen,
    handleFormat,
    getFormatButtonClass,
    openImagesDialog,
    setIsSettingsOpen,
    setIsImagesOpen,
    setIsDebugLogsOpen,
    appearanceRef,
    isAppearanceOpen,
    setIsAppearanceOpen,
    setAppTheme,
    editorSettings,
    setEditorSettings,
    appSettings,
    setAppSettings,
    handleSaveSettings,
    modelConnectionStatus,
    detectedCapabilities,
    recheckUnavailableProviderIfStale,
    handleAiAction,
    isAiActionLoading,
    isWritingAvailable: roleAvailability.writing,
    isCurrentChapterEmpty,
    isChatOpen,
    setIsChatOpen,
    openSearch,
  });

  return (
    <AppLayout
      confirm={confirm}
      searchHighlightValue={searchHighlightValue}
      currentTheme={currentTheme}
      confirmDialogState={confirmDialogState}
      handleConfirm={handleConfirm}
      handleCancel={handleCancel}
      bgMain={bgMain}
      textMain={textMain}
      sidebarWidth={editorSettings.sidebarWidth}
      appDialogsProps={{
        isSettingsOpen,
        setIsSettingsOpen,
        appSettings,
        setAppSettings: handleSaveSettings,
        projects,
        story,
        handleLoadProject,
        handleCreateProject,
        handleImportProject,
        handleDeleteProject,
        handleRenameProject,
        handleConvertProject,
        refreshProjects,
        currentTheme,
        prompts,
        instructionLanguages,
        isImagesOpen,
        setIsImagesOpen,
        updateStoryImageSettings,
        imageActionsAvailable,
        recordHistoryEntry: pushExternalHistoryEntry,
        editorRef,
        isCreateProjectOpen,
        setIsCreateProjectOpen,
        handleCreateProjectConfirm,
      }}
      appHeaderProps={appHeaderProps}
      appMainLayoutProps={appMainLayoutProps}
      isDebugLogsOpen={isDebugLogsOpen}
      setIsDebugLogsOpen={setIsDebugLogsOpen}
      toolCallLoopDialog={toolCallLoopDialog}
      searchReplaceDialogProps={searchReplaceDialogProps}
    />
  );
};

export default App;
