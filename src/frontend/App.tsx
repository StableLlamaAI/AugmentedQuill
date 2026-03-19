// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { AppSettings, ChatMessage, ViewMode } from './types';
import { DEFAULT_APP_SETTINGS } from './features/app/appDefaults';
import { api } from './services/api';
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

  const historyIndexRef = useRef(historyIndex);
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  const isPopStateUndoRedoRef = useRef(false);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;
  }, [historyIndex, canUndo, canRedo]);

  useEffect(() => {
    const existing = window.history.state || {};
    if (existing.aqUndoIndex !== historyIndex) {
      window.history.replaceState({ ...existing, aqUndoIndex: historyIndex }, '');
    }
  }, [historyIndex]);

  useEffect(() => {
    if (isPopStateUndoRedoRef.current) {
      isPopStateUndoRedoRef.current = false;
      return;
    }

    const currentState = window.history.state || {};
    if (currentState.aqUndoIndex === historyIndex) return;
    window.history.pushState({ ...currentState, aqUndoIndex: historyIndex }, '');
  }, [historyIndex]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const targetIndex =
        typeof event.state?.aqUndoIndex === 'number' ? event.state.aqUndoIndex : null;
      if (targetIndex === null) return;

      const current = historyIndexRef.current;
      const delta = targetIndex - current;
      if (delta === 0) return;

      if (delta < 0 && canUndoRef.current) {
        isPopStateUndoRedoRef.current = true;
        undoSteps(Math.abs(delta));
        return;
      }

      if (delta > 0 && canRedoRef.current) {
        isPopStateUndoRedoRef.current = true;
        redoSteps(delta);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [undoSteps, redoSteps]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl || event.altKey) return;

      const key = event.key.toLowerCase();
      const isRedoKey = key === 'y' || (key === 'z' && event.shiftKey);
      const isUndoKey = key === 'z' && !event.shiftKey;

      if (isUndoKey && canUndoRef.current) {
        event.preventDefault();
        undo();
        return;
      }

      if (isRedoKey && canRedoRef.current) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [undo, redo]);

  const currentChapter = story.chapters.find((c) => c.id === currentChapterId);
  const currentChapterContext = currentChapter
    ? {
        id: currentChapter.id,
        title: currentChapter.title,
        is_empty: !currentChapter.content || currentChapter.content.trim() === '',
      }
    : null;
  const editorRef = useRef<EditorHandle | null>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);

  const { appSettings, setAppSettings } = useAppSettings(DEFAULT_APP_SETTINGS);

  const buildMachinePayloadFromSettings = useCallback((settings: AppSettings) => {
    const providers = settings.providers || [];
    const activeChat =
      providers.find((provider) => provider.id === settings.activeChatProviderId) ||
      providers[0];
    const activeWriting =
      providers.find((provider) => provider.id === settings.activeWritingProviderId) ||
      providers[0];
    const activeEditing =
      providers.find((provider) => provider.id === settings.activeEditingProviderId) ||
      providers[0];

    return {
      openai: {
        selected: activeChat?.name || '',
        selected_chat: activeChat?.name || '',
        selected_writing: activeWriting?.name || '',
        selected_editing: activeEditing?.name || '',
        models: providers.map((provider) => ({
          name: (provider.name || '').trim(),
          base_url: (provider.baseUrl || '').trim(),
          api_key: provider.apiKey || '',
          timeout_s: Math.max(1, Math.round((provider.timeout || 10000) / 1000)),
          model: (provider.modelId || '').trim(),
          context_window_tokens: provider.contextWindowTokens,
          temperature: provider.temperature,
          top_p: provider.topP,
          max_tokens: provider.maxTokens,
          presence_penalty: provider.presencePenalty,
          frequency_penalty: provider.frequencyPenalty,
          stop: provider.stop || [],
          seed: provider.seed,
          top_k: provider.topK,
          min_p: provider.minP,
          extra_body: provider.extraBody || '',
          preset_id: provider.presetId || null,
          writing_warning: provider.writingWarning || null,
          is_multimodal: provider.isMultimodal,
          supports_function_calling: provider.supportsFunctionCalling,
          prompt_overrides: provider.prompts || {},
        })),
      },
    };
  }, []);

  const prompts = usePrompts(story.id);

  const {
    modelConnectionStatus,
    detectedCapabilities,
    refreshHealth,
    recheckUnavailableProviderIfStale,
  } = useProviderHealth(appSettings);

  const handleSaveSettings = useCallback(
    (nextSettings: AppSettings) => {
      const previousSettings = structuredClone(appSettings);
      const nextSettingsSnapshot = structuredClone(nextSettings);
      const previousPayload = buildMachinePayloadFromSettings(previousSettings);
      const nextPayload = buildMachinePayloadFromSettings(nextSettingsSnapshot);

      setAppSettings(nextSettingsSnapshot);
      refreshHealth();

      pushExternalHistoryEntry({
        label: 'Update machine settings',
        onUndo: async () => {
          await api.machine.save(previousPayload);
          setAppSettings(previousSettings);
          refreshHealth();
        },
        onRedo: async () => {
          await api.machine.save(nextPayload);
          setAppSettings(nextSettingsSnapshot);
          refreshHealth();
        },
      });
    },
    [
      appSettings,
      buildMachinePayloadFromSettings,
      pushExternalHistoryEntry,
      setAppSettings,
      refreshHealth,
    ]
  );

  const roleAvailability = resolveRoleAvailability(appSettings, modelConnectionStatus);
  const imageActionsAvailable = supportsImageActions(
    appSettings,
    detectedCapabilities,
    modelConnectionStatus
  );

  const [toolCallLoopDialog, setToolCallLoopDialog] = useState<{
    count: number;
    resolver: (choice: 'stop' | 'continue' | 'unlimited') => void;
  } | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        appearanceRef.current &&
        !appearanceRef.current.contains(event.target as Node)
      ) {
        setIsAppearanceOpen(false);
      }
    }

    if (isAppearanceOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAppearanceOpen]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImagesOpen, setIsImagesOpen] = useState(false);
  const [isDebugLogsOpen, setIsDebugLogsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('raw');
  const [showWhitespace, setShowWhitespace] = useState<boolean>(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  // UI State for Header Dropdowns
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
  const [isMobileFormatMenuOpen, setIsMobileFormatMenuOpen] = useState(false);

  const { editorSettings, setEditorSettings, currentTheme, isLight } =
    useEditorPreferences();

  const buttonActive = isLight
    ? 'bg-brand-100 text-brand-700'
    : 'bg-brand-900/40 text-brand-300 border border-brand-800/50';

  // Project Management Functions
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

  const { isAiActionLoading, handleAiAction, handleSidebarAiAction } = useAiActions({
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

  const requestToolCallLoopAccess = (
    count: number
  ): Promise<'stop' | 'continue' | 'unlimited'> => {
    return new Promise((resolve) => {
      setToolCallLoopDialog({
        count,
        resolver: (choice) => {
          setToolCallLoopDialog(null);
          resolve(choice);
        },
      });
    });
  };

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
              handleAcceptContinuation,
              isSuggestionMode,
              handleKeyboardSuggestionAction,
            },
            aiControls: {
              handleAiAction,
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
