// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { ConfirmDialogProvider } from './features/layout/ConfirmDialogContext';
import { useConfirmDialog } from './features/layout/useConfirmDialog';
import { ThemeProvider } from './features/layout/ThemeContext';
import { useProjectManagement } from './features/projects/useProjectManagement';
import { DebugLogs } from './features/debug/DebugLogs';
import { useAppSettings } from './features/settings/useAppSettings';
import { useProviderHealth } from './features/settings/useProviderHealth';
import { usePrompts } from './features/settings/usePrompts';
import { ChatMessage } from './types';
import { SessionMutation } from './features/chat';
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
    baselineState,
    advanceBaselineToCurrentStory,
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

  const activeChapter = story.chapters.find((c) => c.id === currentChapterId);
  const currentChapter =
    story.projectType === 'short-story'
      ? story.draft
      : activeChapter
        ? { ...activeChapter, scope: 'chapter' as const }
        : null;
  const currentChapterContext = activeChapter
    ? {
        id: activeChapter.id,
        title: activeChapter.title,
        is_empty: !activeChapter.content || activeChapter.content.trim() === '',
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
  const [sessionMutations, setSessionMutations] = useState<SessionMutation[]>([]);
  const [sourcebookDialogTrigger, setSourcebookDialogTrigger] = useState<{
    id: number;
    entryId: string;
  } | null>(null);
  const [metadataDialogTrigger, setMetadataDialogTrigger] = useState<{
    id: number;
    initialTab?: 'summary' | 'notes' | 'private' | 'conflicts';
  } | null>(null);

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
    scratchpad,
    onUpdateScratchpad,
    onDeleteScratchpad,
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

  const onChatNewMessageBegin = useCallback(() => {
    setSessionMutations([]);
    advanceBaselineToCurrentStory();
  }, [advanceBaselineToCurrentStory]);

  const onToolMutations = useCallback((muts: any) => {
    if (!muts) return;
    const newMuts: SessionMutation[] = [];
    const callResults =
      (muts._call_results as Array<{ name: string; args: any; result: any }>) || [];

    // Map individual tool calls to granular tags, but only for write/update actions.
    callResults.forEach((res) => {
      const name = res.name;
      const args = res.args || {};
      const result = res.result || {};

      if (
        name === 'create_sourcebook_entry' ||
        name === 'update_sourcebook_entry' ||
        name === 'delete_sourcebook_entry' ||
        name === 'add_sourcebook_relation' ||
        name === 'remove_sourcebook_relation'
      ) {
        const id = result.id || args.name_or_id || args.name;
        const label = result.name || args.name || (id ? `SB: ${id}` : 'Sourcebook');
        newMuts.push({
          id: `sb-${Date.now()}-${Math.random()}`,
          type: 'sourcebook',
          label,
          targetId: id,
        });
        return;
      }

      if (
        name === 'update_story_metadata' ||
        name === 'update_chapter_metadata' ||
        name === 'update_book_metadata' ||
        name === 'set_story_tags' ||
        name === 'set_story_summary' ||
        name === 'sync_story_summary' ||
        name === 'write_story_summary'
      ) {
        // Collect all changed fields. If a single tool call updates multiple fields
        // (e.g. LLM updates both Summary and Conflicts), we generate tags for each.
        const changedFields: Array<'summary' | 'notes' | 'private' | 'conflicts'> = [];
        if (
          args.summary !== undefined ||
          name === 'set_story_summary' ||
          name === 'sync_story_summary' ||
          name === 'write_story_summary'
        ) {
          changedFields.push('summary');
        }
        if (args.notes !== undefined) changedFields.push('notes');
        if (args.private_notes !== undefined) changedFields.push('private');
        if (args.conflicts !== undefined) changedFields.push('conflicts');

        // Defaults to 'summary' if no known field was passed in args (e.g. title changes).
        if (changedFields.length === 0) {
          changedFields.push('summary');
        }

        changedFields.forEach((subType) => {
          newMuts.push({
            id: `meta-${Date.now()}-${Math.random()}`,
            type: 'metadata',
            label: subType.charAt(0).toUpperCase() + subType.slice(1),
            subType,
          });
        });
        return;
      }

      if (
        name === 'write_chapter_content' ||
        name === 'replace_text_in_chapter' ||
        name === 'apply_chapter_replacements' ||
        name === 'write_chapter'
      ) {
        const chapId = result.chap_id || args.chap_id;
        const label = chapId ? `Chapter ${chapId}` : 'Chapter prose';
        newMuts.push({
          id: `chap-${Date.now()}-${Math.random()}`,
          type: 'chapter',
          label,
          targetId: chapId ? String(chapId) : undefined,
        });
        return;
      }

      if (name === 'write_story_content') {
        newMuts.push({
          id: `story-${Date.now()}-${Math.random()}`,
          type: 'story',
          label: 'Story prose',
        });
        return;
      }

      if (name === 'call_editing_assistant' || name === 'call_writing_llm') {
        newMuts.push({
          id: `story-${Date.now()}-${Math.random()}`,
          type: 'story',
          label: 'Story prose',
        });
        return;
      }

      if (name === 'write_book_content') {
        const bookId = result.book_id || args.book_id;
        newMuts.push({
          id: `book-${Date.now()}-${Math.random()}`,
          type: 'book',
          label: 'Book',
          targetId: bookId,
        });
        return;
      }
    });

    if (newMuts.length > 0) {
      setSessionMutations((prev) => {
        const combined = [...prev];
        newMuts.forEach((m) => {
          // Avoid exact duplicates in the same session
          if (
            !combined.some(
              (x) =>
                x.type === m.type && x.label === m.label && x.targetId === m.targetId
            )
          ) {
            combined.push(m);
          }
        });
        return combined;
      });
    }
  }, []);

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
    currentUnit: currentChapter || undefined,
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
      currentUnit: currentChapter || undefined,
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

  const onMutationClick = useCallback(
    (m: SessionMutation) => {
      if (m.type === 'chapter') {
        if (m.targetId) {
          handleChapterSelect(m.targetId);
        }
      } else if (m.type === 'story') {
        handleChapterSelect(null);
      } else if (m.type === 'metadata') {
        setIsSidebarOpen(true);
        setMetadataDialogTrigger((prev) => ({
          id: (prev?.id ?? 0) + 1,
          initialTab: m.subType as any,
        }));
        setEditorSettings((prev) => ({
          ...prev,
          sidebar: { ...prev.sidebar, isStoryCollapsed: false },
        }));
      } else if (m.type === 'sourcebook') {
        setIsSidebarOpen(true);
        setSourcebookDialogTrigger((prev) => ({
          id: (prev?.id ?? 0) + 1,
          entryId: m.targetId ?? '',
        }));
        setEditorSettings((prev) => ({
          ...prev,
          sidebar: { ...prev.sidebar, isSourcebookCollapsed: false },
        }));
      } else if (m.type === 'book') {
        setIsSidebarOpen(true);
        setEditorSettings((prev) => ({
          ...prev,
          sidebar: { ...prev.sidebar, isStoryCollapsed: false },
        }));
      }
    },
    [handleChapterSelect, setIsSidebarOpen, setEditorSettings]
  );

  // Keep a stable base snapshot per prose stream so append-mode previews are
  // composed from the original chapter text, not from already preview-mutated
  // text (which would duplicate prior chunks and cause heavy flicker/jumps).
  const prosePreviewStateRef = useRef<
    Record<string, { base: string; lastAccumulated: string }>
  >({});

  useEffect(() => {
    if (!isChatLoading) {
      prosePreviewStateRef.current = {};
    }
  }, [isChatLoading]);

  const { handleSendMessage, handleStopChat, handleRegenerate } = useChatExecution({
    systemPrompt,
    activeChatConfig,
    isChatAvailable: roleAvailability.chat,
    allowWebSearch,
    currentChapterId,
    currentChatId,
    currentChapter: currentChapterContext,
    chatMessages,
    setChatMessages,
    isChatLoading,
    setIsChatLoading,
    refreshProjects,
    refreshStory,
    onProseChunk: useCallback(
      (chapId: number, writeMode: string, accumulated: string) => {
        // Find the writing unit for the given chapter ID so we can compute the
        // correct full content to preview in the editor while the LLM writes.
        let unit: { id: string; content: string } | null = null;
        if (story.projectType === 'short-story' && story.draft) {
          unit = story.draft;
        } else {
          const found = story.chapters.find((c) => Number(c.id) === chapId);
          unit = found ?? null;
        }
        if (!unit) return;

        const streamKey = `${chapId}:${writeMode}`;
        const prevState = prosePreviewStateRef.current[streamKey];
        const isRestarted =
          !prevState ||
          accumulated.length < prevState.lastAccumulated.length ||
          !accumulated.startsWith(prevState.lastAccumulated);

        const streamState = isRestarted
          ? {
              base: unit.content || '',
              lastAccumulated: '',
            }
          : prevState;

        let newContent: string;
        if (writeMode === 'replace') {
          newContent = accumulated;
        } else if (writeMode === 'append') {
          const base = streamState.base;
          const separator = base && !base.endsWith('\n') ? '\n' : '';
          newContent = base + separator + accumulated;
        } else {
          // insert_at_marker: skip live preview (position is inside the text)
          return;
        }

        prosePreviewStateRef.current[streamKey] = {
          base: streamState.base,
          lastAccumulated: accumulated,
        };

        if (newContent === unit.content) {
          return;
        }

        // Update local state only (no server sync) so the user sees progress.
        // sync=false: skip server write during streaming preview.
        // pushHistory=false: skip undo-history entries for every chunk;
        // intermediate states are ephemeral and must not pollute the undo stack.
        void updateChapter(unit.id, { content: newContent }, false, false);
      },
      [story.projectType, story.draft, story.chapters, updateChapter]
    ),
    onMutations: onToolMutations,
    pushExternalHistoryEntry: (params) => {
      pushExternalHistoryEntry?.(params);
    },
    requestToolCallLoopAccess,
  });

  const handleSendMessageWithReset = useCallback(
    async (text: string) => {
      onChatNewMessageBegin();
      await handleSendMessage(text);
    },
    [handleSendMessage, onChatNewMessageBegin]
  );

  const handleRegenerateWithReset = useCallback(async () => {
    onChatNewMessageBegin();
    await handleRegenerate();
  }, [handleRegenerate, onChatNewMessageBegin]);

  // Minimal theme values needed by the outer wrapper div.
  const bgMain = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';
  const textMain = isLight ? 'text-brand-gray-800' : 'text-brand-gray-300';

  return (
    <ConfirmDialogProvider value={confirm}>
      <ThemeProvider currentTheme={currentTheme}>
        <ConfirmDialog
          isOpen={confirmDialogState.isOpen}
          title={confirmDialogState.title}
          message={confirmDialogState.message}
          confirmLabel={confirmDialogState.confirmLabel}
          cancelLabel={confirmDialogState.cancelLabel}
          variant={confirmDialogState.variant as any}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
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
              onOpenImages: () => setIsImagesOpen(true),
            }}
            aiControls={{
              handleAiAction,
              isAiActionLoading,
              isWritingAvailable: roleAvailability.writing,
              isChapterEmpty:
                !currentChapter ||
                !currentChapter.content ||
                currentChapter.content.trim().length === 0,
            }}
            modelControls={{
              appSettings,
              setAppSettings,
              saveSettings: handleSaveSettings,
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
              onSourcebookMutated: async (params) => {
                const entryExistsInBaseline = Boolean(
                  params.entryExistsInBaseline ??
                  sidebarControls.baselineState?.sourcebook?.some(
                    (entry) => entry.id === params.entryId
                  )
                );

                if (!entryExistsInBaseline) {
                  // For AI-created entries that are being edited by the user,
                  // keep the pre-save baseline so the transition from created
                  // (green) to modified (amber) is preserved.
                  advanceBaselineToCurrentStory();
                }

                // Refresh story so story.sourcebook reflects the mutation
                // before we snapshot the state into the undo/redo history.
                await refreshStory();

                if (entryExistsInBaseline) {
                  // Manual edits to an already-baselined entry should not be
                  // shown as an automatic diff; set the baseline to the new
                  // post-save story state instead.
                  advanceBaselineToCurrentStory();
                }

                pushExternalHistoryEntry(params);
              },
              onAppUndo: undo,
              onAppRedo: redo,
              canAppUndo: canUndo,
              canAppRedo: canRedo,
              selectedSourcebookEntryId: sourcebookDialogTrigger?.entryId ?? null,
              sourcebookDialogTrigger,
              metadataDialogTrigger,
              baselineState,
            }}
            editorControls={{
              currentChapter,
              editorRef,
              editorSettings,
              storyLanguage: story.language || 'en',
              setEditorSettings,
              viewMode,
              updateChapter: (id, partial) =>
                updateChapter(id, partial, true, true, true),
              suggestionControls: {
                continuations,
                isSuggesting,
                handleTriggerSuggestions,
                handleCancelSuggestions: cancelSuggestions,
                handleAcceptContinuation,
                isSuggestionMode,
                handleKeyboardSuggestionAction,
              },
              aiControls: {
                handleAiAction,
                cancelAiAction,
                isAiActionLoading,
                isWritingAvailable: roleAvailability.writing,
                isProseStreaming: isChatLoading || isAiActionLoading,
                isChapterEmpty:
                  !currentChapter ||
                  !currentChapter.content ||
                  currentChapter.content.trim().length === 0,
              },
              setActiveFormats,
              showWhitespace,
              setShowWhitespace,
              baselineContent:
                currentChapter?.scope === 'story'
                  ? baselineState.draft?.content
                  : baselineState.chapters.find((c) => c.id === currentChapter?.id)
                      ?.content,
            }}
            chatControls={{
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
    </ConfirmDialogProvider>
  );
};

export default App;
