// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useCallback, useRef } from 'react';
import { useStory } from './features/story/useStory';
import { StoryMetadata } from './features/story/StoryMetadata';
import { ChapterList } from './features/chapters/ChapterList';
import { useChapterSuggestions } from './features/chapters/useChapterSuggestions';
import { Editor, EditorHandle } from './features/editor/Editor';
import { useAppUiActions } from './features/editor/useAppUiActions';
import { useEditorPreferences } from './features/editor/useEditorPreferences';
import { useAiActions } from './features/story/useAiActions';
import { Chat } from './features/chat/Chat';
import { useChatExecution } from './features/chat/useChatExecution';
import { useChatMessageActions } from './features/chat/useChatMessageActions';
import { ToolCallLimitDialog } from './features/chat/ToolCallLimitDialog';
import { useChatSessionManagement } from './features/chat/useChatSessionManagement';
import { AppDialogs } from './features/layout/AppDialogs';
import { AppHeader } from './features/layout/AppHeader';
import { AppMainLayout } from './features/layout/AppMainLayout';
import { ConfirmDialog } from './features/layout/ConfirmDialog';
import { useConfirmDialog } from './features/layout/useConfirmDialog';
import { ThemeProvider } from './features/layout/ThemeContext';
import { useProjectManagement } from './features/projects/useProjectManagement';
import { DebugLogs } from './features/debug/DebugLogs';
import { useAppSettings } from './features/settings/useAppSettings';
import { useProviderHealth } from './features/settings/useProviderHealth';
import { usePrompts } from './features/settings/usePrompts';
import { ChatMessage } from './types';
import { DEFAULT_APP_SETTINGS } from './features/app/appDefaults';
import { useBrowserHistory } from './features/app/useBrowserHistory';
import { useEditorUIState } from './features/app/useEditorUIState';
import { useSettingsPersistence } from './features/app/useSettingsPersistence';
import { useToolCallGate } from './features/app/useToolCallGate';
import { useUIPanels } from './features/app/useUIPanels';
import {
  getErrorMessage,
  resolveActiveProviderConfigs,
  resolveRoleAvailability,
  supportsImageActions,
} from './features/app/appSelectors';

const App: React.FC = () => {
  const { confirm, confirmDialogState, handleConfirm, handleCancel } =
    useConfirmDialog();

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
  } = useStory({ confirm, alert: window.alert });

  useBrowserHistory({
    historyIndex,
    canUndo,
    canRedo,
    undoSteps,
    redoSteps,
    undo,
    redo,
  });

  const currentChapter = story.chapters.find((c) => c.id === currentChapterId);
  const currentChapterContext = currentChapter
    ? {
        id: currentChapter.id,
        title: currentChapter.title,
        is_empty: !currentChapter.content || currentChapter.content.trim() === '',
      }
    : null;
  const editorRef = useRef<EditorHandle | null>(null);

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

  const roleAvailability = resolveRoleAvailability(appSettings, modelConnectionStatus);
  const imageActionsAvailable = supportsImageActions(
    appSettings,
    detectedCapabilities,
    modelConnectionStatus
  );

  const { toolCallLoopDialog, requestToolCallLoopAccess } = useToolCallGate();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

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

  const getSystemPrompt = useCallback(() => {
    return prompts.system_messages.chat_llm || '';
  }, [prompts]);

  const {
    chatHistoryList,
    setChatHistoryList,
    currentChatId,
    isIncognito,
    setIsIncognito,
    allowWebSearch,
    setAllowWebSearch,
    systemPrompt,
    setSystemPrompt,
    incognitoSessions,
    refreshChatList,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteAllChats,
  } = useChatSessionManagement({
    storyId: story.id,
    getSystemPrompt,
    chatMessages,
    setChatMessages,
    isChatLoading,
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
    story,
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

  // Get Active LLM Configs
  const { activeChatConfig, activeWritingConfig, activeEditingConfig } =
    resolveActiveProviderConfigs(appSettings);

  const { handleEditMessage, handleDeleteMessage } = useChatMessageActions({
    setChatMessages,
  });

  const {
    continuations,
    isSuggesting,
    isSuggestionMode,
    suggestCursor,
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
    currentChapter,
    currentChapterId,
    story,
    systemPrompt,
    activeWritingConfig,
    isWritingAvailable: roleAvailability.writing,
    updateChapter,
    viewMode,
    setChatMessages,
    getErrorMessage,
  });

  const { isAiActionLoading, handleAiAction, handleSidebarAiAction, cancelAiAction } =
    useAiActions({
      currentChapter,
      story,
      prompts,
      isEditingAvailable: roleAvailability.editing,
      isWritingAvailable: roleAvailability.writing,
      checkedSourcebookIds: Array.from(checkedEntries),
      updateChapter,
      setChatMessages,
      getErrorMessage,
    });

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

  const { handleSendMessage, handleStopChat, handleRegenerate } = useChatExecution({
    systemPrompt,
    activeChatConfig,
    isChatAvailable: roleAvailability.chat,
    allowWebSearch,
    currentChapterId,
    currentChapter: currentChapterContext,
    chatMessages,
    setChatMessages,
    isChatLoading,
    setIsChatLoading,
    refreshProjects,
    refreshStory,
    pushExternalHistoryEntry,
    requestToolCallLoopAccess,
  });

  // Minimal theme values needed by the outer wrapper div.
  const bgMain = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';
  const textMain = isLight ? 'text-brand-gray-800' : 'text-brand-gray-300';

  return (
    <ThemeProvider currentTheme={currentTheme}>
      <div
        id="aq-app-root"
        className={`flex flex-col h-screen font-sans overflow-hidden ${bgMain} ${textMain}`}
        style={
          {
            '--sidebar-width': `${editorSettings.sidebarWidth}px`,
          } as React.CSSProperties
        }
      >
        <AppDialogs
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          appSettings={appSettings}
          setAppSettings={handleSaveSettings}
          projects={projects}
          story={story}
          handleLoadProject={handleLoadProject}
          handleCreateProject={handleCreateProject}
          handleImportProject={handleImportProject}
          handleDeleteProject={handleDeleteProject}
          handleRenameProject={handleRenameProject}
          handleConvertProject={handleConvertProject}
          refreshProjects={refreshProjects}
          currentTheme={currentTheme}
          prompts={prompts}
          instructionLanguages={instructionLanguages}
          isImagesOpen={isImagesOpen}
          setIsImagesOpen={setIsImagesOpen}
          updateStoryImageSettings={updateStoryImageSettings}
          imageActionsAvailable={imageActionsAvailable}
          recordHistoryEntry={pushExternalHistoryEntry}
          editorRef={editorRef}
          isCreateProjectOpen={isCreateProjectOpen}
          setIsCreateProjectOpen={setIsCreateProjectOpen}
          handleCreateProjectConfirm={handleCreateProjectConfirm}
        />

        <AppHeader
          storyTitle={story.title}
          sidebarControls={{ isSidebarOpen, setIsSidebarOpen }}
          settingsControls={{
            setIsSettingsOpen,
            setIsImagesOpen,
            setIsDebugLogsOpen,
          }}
          historyControls={{
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
          }}
          viewControls={{
            viewMode,
            setViewMode,
            showWhitespace,
            setShowWhitespace,
            isViewMenuOpen,
            setIsViewMenuOpen,
          }}
          formatControls={{
            handleFormat,
            getFormatButtonClass,
            isFormatMenuOpen,
            setIsFormatMenuOpen,
            isMobileFormatMenuOpen,
            setIsMobileFormatMenuOpen,
          }}
          aiControls={{
            handleAiAction,
            isAiActionLoading,
            isWritingAvailable: roleAvailability.writing,
          }}
          modelControls={{
            appSettings,
            setAppSettings,
            modelConnectionStatus,
            detectedCapabilities,
            recheckUnavailableProviderIfStale,
          }}
          appearanceControls={{
            appearanceRef,
            isAppearanceOpen,
            setIsAppearanceOpen,
            setAppTheme,
            editorSettings,
            setEditorSettings,
          }}
          chatPanelControls={{ isChatOpen, setIsChatOpen }}
        />

        <AppMainLayout
          sidebarControls={{
            isSidebarOpen,
            setIsSidebarOpen,
            story,
            currentChapterId,
            handleChapterSelect,
            deleteChapter,
            updateChapter,
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
            checkedSourcebookIds: Array.from(checkedEntries),
            onToggleSourcebook: handleToggleEntry,
            isAutoSourcebookSelectionEnabled,
            onToggleAutoSourcebookSelection: setIsAutoSourcebookSelectionEnabled,
            isSourcebookSelectionRunning,
            onSourcebookMutated: pushExternalHistoryEntry,
          }}
          editorControls={{
            currentChapter,
            editorRef,
            editorSettings,
            setEditorSettings,
            viewMode,
            updateChapter,
            suggestionControls: {
              continuations,
              isSuggesting,
              handleTriggerSuggestions,
              cancelSuggestions,
              handleAcceptContinuation,
              isSuggestionMode,
              handleKeyboardSuggestionAction,
            },
            aiControls: {
              handleAiAction,
              cancelAiAction,
              isAiActionLoading,
              isWritingAvailable: roleAvailability.writing,
            },
            setActiveFormats,
            showWhitespace,
            setShowWhitespace,
          }}
          chatControls={{
            isChatOpen,
            chatMessages,
            isChatLoading,
            isChatAvailable: roleAvailability.chat,
            activeChatConfig,
            systemPrompt,
            handleSendMessage,
            handleStopChat,
            handleRegenerate,
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
          }}
          instructionLanguages={instructionLanguages}
        />

        <DebugLogs
          isOpen={isDebugLogsOpen}
          onClose={() => setIsDebugLogsOpen(false)}
          theme={currentTheme}
        />

        <ToolCallLimitDialog
          isOpen={!!toolCallLoopDialog}
          count={toolCallLoopDialog?.count ?? 0}
          theme={currentTheme}
          onResolve={(choice) => toolCallLoopDialog?.resolver(choice)}
        />
      </div>
    </ThemeProvider>
  );
};

export default App;
