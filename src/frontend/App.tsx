// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  startTransition,
} from 'react';
import { useStory } from './features/story/useStory';
import { useChapterSuggestions } from './features/chapters/useChapterSuggestions';
import { EditorHandle } from './features/editor/Editor';
import { useAppUiActions } from './features/editor/useAppUiActions';
import { useEditorPreferences } from './features/editor/useEditorPreferences';
import { useAiActions } from './features/story/useAiActions';
import { useChatExecution } from './features/chat/useChatExecution';
import { useChatMessageActions } from './features/chat/useChatMessageActions';
import { useChatSessionManagement } from './features/chat/useChatSessionManagement';
import { AppLayout } from './features/layout/AppLayout';
import { useConfirmDialog } from './features/layout/useConfirmDialog';
import { useProjectManagement } from './features/projects/useProjectManagement';
import { useAppSettings } from './features/settings/useAppSettings';
import { useProviderHealth } from './features/settings/useProviderHealth';
import { usePrompts } from './features/settings/usePrompts';
import { ChatMessage, ChatAttachment, SourcebookEntry } from './types';
import { SessionMutation } from './features/chat';
import { ChatToolExecutionResponse } from './services/apiTypes';
import { DEFAULT_APP_SETTINGS } from './features/app/appDefaults';
import { useBrowserHistory } from './features/app/useBrowserHistory';
import { useEditorUIState } from './features/app/useEditorUIState';
import { useSettingsPersistence } from './features/app/useSettingsPersistence';
import { useToolCallGate } from './features/app/useToolCallGate';
import { useUIPanels } from './features/app/useUIPanels';
import { useSearchReplace } from './features/search/useSearchReplace';
import { useSidebarIntents } from './features/layout/sidebarIntents';
import {
  getErrorMessage,
  resolveActiveProviderConfigs,
  resolveRoleAvailability,
  supportsImageActions,
} from './features/app/appSelectors';
import { useToast } from './components/ui/Toast';
import { setErrorDispatcher } from './services/errorNotifier';
import { applySmartQuotes } from './utils/textUtils';
import { MUTATION_TOOL_REGISTRY } from './features/chat/mutationToolRegistry';

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

  useBrowserHistory({
    historyIndex,
    canUndo,
    canRedo,
    undoSteps,
    redoSteps,
    undo,
    redo,
  });

  const activeChapter = story.chapters.find(
    (c: import('./types').Chapter) => c.id === currentChapterId
  );
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
  const pendingJumpRef = useRef<{
    chapterId: string;
    start: number;
    end: number;
  } | null>(null);

  const searchState = useSearchReplace();
  const openSearch = useCallback(() => searchState.open(), [searchState]);

  const sidebarStoryMetadata = useMemo(
    () => ({
      title: story.title,
      summary: story.summary,
      tags: story.styleTags,
      notes: story.notes,
      private_notes: story.private_notes,
      conflicts: story.conflicts,
      language: story.language,
      projectType: story.projectType,
      draft: story.draft,
    }),
    [
      story.title,
      story.summary,
      story.styleTags,
      story.notes,
      story.private_notes,
      story.conflicts,
      story.language,
      story.projectType,
      story.draft,
    ]
  );

  const chapterListChaptersKey = useMemo(
    () =>
      story.chapters
        .map(
          (ch: import('./types').Chapter) =>
            `${ch.id}:${ch.title}:${ch.summary ?? ''}:${ch.book_id ?? ''}:${
              ch.conflicts?.length ?? 0
            }`
        )
        .join('|'),
    [story.chapters]
  );

  const sidebarStoryChapters = useMemo(
    () =>
      story.chapters.map((ch: import('./types').Chapter) => ({
        ...ch,
        content: '',
      })),
    [chapterListChaptersKey]
  );

  const sidebarStoryBooks = useMemo(
    () =>
      (story.books || []).map((book: import('./types').Book) => ({
        ...book,
      })),
    [
      (story.books || [])
        .map(
          (book: import('./types').Book) =>
            `${book.id}:${book.title}:${book.summary ?? ''}`
        )
        .join('|'),
    ]
  );

  const sidebarSourcebookEntries = useMemo(
    () => story.sourcebook || [],
    [story.sourcebook]
  );

  // A stable snapshot of baselineState that only updates when sidebar-visible
  // fields change — i.e. NOT when chapter content changes due to typing.
  // The sidebar only diffs metadata (summary, notes, chapter title/summary,
  // sourcebook); it never needs to diff raw prose content.
  // This prevents sidebarControls from rebuilding on every debounced keystroke,
  // which in turn keeps AppMainLayout.React.memo valid during editing.
  const baselineChaptersMetaKey = baselineState.chapters
    .map((c: import('./types').Chapter) => `${c.id}:${c.title}:${c.summary ?? ''}`)
    .join('|');
  const sidebarBaselineState = useMemo(
    () => baselineState,
    [
      baselineState.summary,
      baselineState.notes,
      baselineState.private_notes,
      baselineState.conflicts,
      baselineState.sourcebook,
      baselineState.draft?.summary,
      baselineState.draft?.notes,
      baselineChaptersMetaKey,
    ]
  );

  const openSearchWithKeyboard = useCallback(() => {
    openSearch();
  }, [openSearch]);

  // Global Ctrl+F / Cmd+F hotkey opens the search dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only intercept when no input/textarea has focus (editor intercepts internally)
        const target = e.target as HTMLElement;
        const isEditorFocused = target.closest('#raw-markdown-editor') !== null;
        if (!isEditorFocused) {
          e.preventDefault();
          openSearchWithKeyboard();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  // Apply a deferred jump-to-position once a chapter's content is loaded.
  // This handles cross-chapter navigation from the search dialog where the
  // chapter content is fetched asynchronously after chapter selection.
  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    if (pending.chapterId !== currentChapterId) return;
    const content = currentChapter?.content ?? '';
    // Wait until the document is long enough to contain the target offset.
    if (pending.end > 0 && content.length < pending.end) return;
    pendingJumpRef.current = null;
    const { start, end } = pending;
    requestAnimationFrame(() => editorRef.current?.jumpToPosition(start, end));
  }, [currentChapterId, currentChapter?.content]);

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
  const [metadataDialogCloseTrigger, setMetadataDialogCloseTrigger] = useState(0);
  const [sourcebookDialogCloseTrigger, setSourcebookDialogCloseTrigger] = useState(0);

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
      setIsSidebarOpen,
      setEditorSettings,
      setMetadataDialogTrigger,
      setSourcebookDialogTrigger,
    });

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

  type ToolMutationPayload = ChatToolExecutionResponse & {
    _call_results?: Array<{
      name: string;
      args: Record<string, unknown>;
      result: Record<string, unknown>;
    }>;
  };

  const onToolMutations = useCallback((muts: ToolMutationPayload) => {
    if (!muts) return;
    const newMuts: SessionMutation[] = [];
    const callResults = muts._call_results || [];

    callResults.forEach(
      (res: {
        name: string;
        args: Record<string, unknown>;
        result: Record<string, unknown>;
      }) => {
        const factory = MUTATION_TOOL_REGISTRY[res.name];
        if (!factory) return;
        const produced = factory({ args: res.args || {}, result: res.result || {} });
        if (!produced) return;
        const items = Array.isArray(produced) ? produced : [produced];
        newMuts.push(...items);
      }
    );

    if (newMuts.length > 0) {
      setSessionMutations((prev: SessionMutation[]) => {
        const combined = [...prev];
        newMuts.forEach((m: SessionMutation) => {
          // Avoid exact duplicates in the same session
          if (
            !combined.some(
              (x: SessionMutation) =>
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
  const { activeChatConfig, activeWritingConfig } =
    resolveActiveProviderConfigs(appSettings);

  const { handleEditMessage, handleDeleteMessage } = useChatMessageActions({
    setChatMessages,
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

  const sourcebookMutationEntryIds = useMemo(() => {
    return new Set(
      sessionMutations
        .filter((m: SessionMutation) => m.type === 'sourcebook' && m.targetId)
        .map((m: SessionMutation) => m.targetId as string)
    );
  }, [sessionMutations]);

  const onMutationClick = useCallback(
    (m: SessionMutation) => {
      startTransition(() => {
        requestAnimationFrame(() => {
          if (m.type === 'chapter') {
            if (m.targetId) {
              handleChapterSelect(m.targetId);
            }
          } else if (m.type === 'story') {
            handleChapterSelect(null);
          } else if (m.type === 'metadata') {
            openStoryMetadataDialog(
              m.subType as 'summary' | 'notes' | 'private' | 'conflicts'
            );
          } else if (m.type === 'sourcebook') {
            openSourcebookEntryDialog(m.targetId ?? '');
          } else if (m.type === 'book') {
            openAndExpandStory();
          }
        });
      });
    },
    [
      handleChapterSelect,
      openAndExpandStory,
      openSourcebookEntryDialog,
      openStoryMetadataDialog,
    ]
  );

  // Keep a stable base snapshot per prose stream so append-mode previews are
  // composed from the original chapter text, not from already preview-mutated
  // text (which would duplicate prior chunks and cause heavy flicker/jumps).
  const prosePreviewStateRef = useRef<
    Record<
      string,
      { base: string; lastAccumulated: string; lastAppliedContent?: string }
    >
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
        // Read from ref to avoid recreating this callback whenever story state
        // changes during streaming.
        const currentStory = storyRef.current;
        let unit: { id: string; content: string } | null = null;
        if (currentStory.projectType === 'short-story' && currentStory.draft) {
          unit = currentStory.draft;
        } else {
          const found = currentStory.chapters.find(
            (c: import('./types').Chapter) => Number(c.id) === chapId
          );
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
              lastAppliedContent: undefined,
            }
          : prevState;

        // Apply typographic quote conversion so the live preview already uses the
        // same quote style that the backend will persist (backend runs
        // apply_typographic_quotes on the final accumulated text).  Without this,
        // the history entry captured by pushExternalHistoryEntry contains raw
        // quotes, and when the lazy-load later delivers the typographic version
        // the diff changes to show only the quote positions instead of the full
        // newly-written text.
        const typographicAccumulated = applySmartQuotes(accumulated);

        let newContent: string;
        if (writeMode === 'replace') {
          newContent = typographicAccumulated;
        } else if (writeMode === 'append') {
          const base = streamState.base;
          const separator = base && !base.endsWith('\n') ? '\n' : '';
          newContent = base + separator + typographicAccumulated;
        } else {
          // insert_at_marker: skip live preview (position is inside the text)
          return;
        }

        prosePreviewStateRef.current[streamKey] = {
          base: streamState.base,
          lastAccumulated: accumulated,
          lastAppliedContent: newContent,
        };

        if (
          newContent === unit.content ||
          newContent === streamState.lastAppliedContent
        ) {
          return;
        }

        // Update local state only (no server sync) so the user sees progress.
        // sync=false: skip server write during streaming preview.
        // pushHistory=false: skip undo-history entries for every chunk;
        // intermediate states are ephemeral and must not pollute the undo stack.
        void updateChapter(unit.id, { content: newContent }, false, false);
      },
      [updateChapter]
    ),
    onMutations: onToolMutations,
    pushExternalHistoryEntry: (params: {
      label: string;
      onUndo?: () => Promise<void>;
      onRedo?: () => Promise<void>;
    }) => {
      pushExternalHistoryEntry?.(params);
    },
    requestToolCallLoopAccess,
  });

  const handleSendMessageWithReset = useCallback(
    async (text: string, attachments?: ChatAttachment[]) => {
      onChatNewMessageBegin();
      await handleSendMessage(text, attachments);
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

  // ── Stable callbacks and memoised derived values for control prop objects ──

  const searchControls = useMemo(
    () => ({
      onOpenSearch: openSearch,
    }),
    [openSearch]
  );

  const historyControls = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  const viewControls = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  const formatControls = useMemo(
    () => ({
      handleFormat,
      getFormatButtonClass,
      isFormatMenuOpen,
      setIsFormatMenuOpen,
      isMobileFormatMenuOpen,
      setIsMobileFormatMenuOpen,
      onOpenImages: openImagesDialog,
    }),
    [
      handleFormat,
      getFormatButtonClass,
      isFormatMenuOpen,
      setIsFormatMenuOpen,
      isMobileFormatMenuOpen,
      setIsMobileFormatMenuOpen,
      openImagesDialog,
    ]
  );

  const settingsControls = useMemo(
    () => ({
      setIsSettingsOpen,
      setIsImagesOpen,
      setIsDebugLogsOpen,
    }),
    [setIsSettingsOpen, setIsImagesOpen, setIsDebugLogsOpen]
  );

  const appearanceControls = useMemo(
    () => ({
      appearanceRef,
      isAppearanceOpen,
      setIsAppearanceOpen,
      setAppTheme,
      editorSettings,
      setEditorSettings,
    }),
    [
      appearanceRef,
      isAppearanceOpen,
      setIsAppearanceOpen,
      setAppTheme,
      editorSettings,
      setEditorSettings,
    ]
  );

  const modelControls = useMemo(
    () => ({
      appSettings,
      setAppSettings,
      saveSettings: handleSaveSettings,
      modelConnectionStatus,
      detectedCapabilities,
      recheckUnavailableProviderIfStale,
    }),
    [
      appSettings,
      setAppSettings,
      handleSaveSettings,
      modelConnectionStatus,
      detectedCapabilities,
      recheckUnavailableProviderIfStale,
    ]
  );

  const isCurrentChapterEmpty =
    !currentChapter ||
    !currentChapter.content ||
    currentChapter.content.trim().length === 0;

  const headerAiControls = useMemo(
    () => ({
      handleAiAction,
      isAiActionLoading,
      isWritingAvailable: roleAvailability.writing,
      isChapterEmpty: isCurrentChapterEmpty,
    }),
    [handleAiAction, isAiActionLoading, roleAvailability.writing, isCurrentChapterEmpty]
  );

  const chatPanelControls = useMemo(
    () => ({
      isChatOpen,
      setIsChatOpen,
    }),
    [isChatOpen, setIsChatOpen]
  );

  const checkedSourcebookIds = useMemo(
    () => Array.from(checkedEntries),
    [checkedEntries]
  );

  const handleSourcebookMutated = useCallback(
    async (params: {
      label: string;
      onUndo?: () => Promise<void>;
      onRedo?: () => Promise<void>;
      entryId?: string;
      entryExistsInBaseline?: boolean;
      updatedEntry?: SourcebookEntry | null;
    }) => {
      const entryExistsInBaseline = Boolean(
        params.entryExistsInBaseline ??
        baselineState.sourcebook?.some(
          (entry: SourcebookEntry) => entry.id === params.entryId
        )
      );

      if (params.updatedEntry !== undefined) {
        if (!entryExistsInBaseline) {
          advanceBaselineToCurrentStory();
        }

        const changed = patchSourcebook(params.updatedEntry, params.entryId);
        if (!changed) {
          return;
        }

        if (entryExistsInBaseline) {
          advanceBaselineToCurrentStory();
        }

        pushExternalHistoryEntry({ ...params, forceNewHistory: true });
      } else {
        if (!entryExistsInBaseline) {
          advanceBaselineToCurrentStory();
        }
        await refreshStory();
        if (entryExistsInBaseline) {
          advanceBaselineToCurrentStory();
        }
        pushExternalHistoryEntry(params);
      }
    },
    [
      baselineState.sourcebook,
      advanceBaselineToCurrentStory,
      patchSourcebook,
      pushExternalHistoryEntry,
      refreshStory,
    ]
  );

  const editorUpdateChapter = useCallback(
    (id: string, partial: Record<string, unknown>) => {
      if ('content' in partial) {
        searchState.notifyContentChanged(parseInt(id, 10));
      }
      return updateChapter(id, partial, true, true, true);
    },
    [searchState, updateChapter]
  );

  const editorBaselineContent = useMemo(
    () =>
      currentChapter?.scope === 'story'
        ? baselineState.draft?.content
        : baselineState.chapters.find(
            (c: import('./types').Chapter) => c.id === currentChapter?.id
          )?.content,
    [
      currentChapter?.scope,
      currentChapter?.id,
      baselineState.draft?.content,
      baselineState.chapters,
    ]
  );

  const sidebarControls = useMemo(
    () => ({
      isSidebarOpen,
      setIsSidebarOpen,
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
      checkedSourcebookIds,
      onToggleSourcebook: handleToggleEntry,
      isAutoSourcebookSelectionEnabled,
      onToggleAutoSourcebookSelection: setIsAutoSourcebookSelectionEnabled,
      isSourcebookSelectionRunning,
      mutatedSourcebookEntryIds: sourcebookMutationEntryIds,
      onSourcebookMutated: handleSourcebookMutated,
      onAppUndo: undo,
      onAppRedo: redo,
      canAppUndo: canUndo,
      canAppRedo: canRedo,
      selectedSourcebookEntryId: sourcebookDialogTrigger?.entryId ?? null,
      sourcebookDialogTrigger,
      sourcebookDialogCloseTrigger,
      metadataDialogTrigger,
      metadataDialogCloseTrigger,
      baselineState: sidebarBaselineState,
      sidebarStoryMetadata,
      sidebarStoryChapters,
      sidebarStoryBooks,
      sidebarSourcebookEntries,
    }),
    [
      isSidebarOpen,
      setIsSidebarOpen,
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
      roleAvailability.editing,
      handleOpenImages,
      updateStoryMetadata,
      checkedSourcebookIds,
      handleToggleEntry,
      isAutoSourcebookSelectionEnabled,
      setIsAutoSourcebookSelectionEnabled,
      isSourcebookSelectionRunning,
      sourcebookMutationEntryIds,
      handleSourcebookMutated,
      undo,
      redo,
      canUndo,
      canRedo,
      sourcebookDialogTrigger,
      sourcebookDialogCloseTrigger,
      metadataDialogTrigger,
      metadataDialogCloseTrigger,
      sidebarBaselineState,
      sidebarStoryMetadata,
      sidebarStoryChapters,
      sidebarStoryBooks,
      sidebarSourcebookEntries,
    ]
  );

  const editorControls = useMemo(
    () => ({
      currentChapter,
      isChapterLoading,
      editorRef,
      editorSettings,
      storyLanguage: story.language || 'en',
      setEditorSettings,
      viewMode,
      updateChapter: editorUpdateChapter,
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
        isChapterEmpty: isCurrentChapterEmpty,
      },
      setActiveFormats,
      showWhitespace,
      setShowWhitespace,
      baselineContent: editorBaselineContent,
      onOpenSearch: openSearch,
    }),
    [
      currentChapter,
      isChapterLoading,
      editorRef,
      editorSettings,
      story.language,
      setEditorSettings,
      viewMode,
      editorUpdateChapter,
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
      roleAvailability.writing,
      isChatLoading,
      setActiveFormats,
      showWhitespace,
      setShowWhitespace,
      editorBaselineContent,
      openSearch,
    ]
  );

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
      appHeaderProps={{
        storyTitle: story.title,
        sidebarControls,
        settingsControls,
        historyControls,
        viewControls,
        formatControls,
        aiControls: headerAiControls,
        modelControls,
        appearanceControls,
        chatPanelControls,
        searchControls,
      }}
      appMainLayoutProps={{
        sidebarControls,
        editorControls,
        chatControls,
        instructionLanguages,
      }}
      isDebugLogsOpen={isDebugLogsOpen}
      setIsDebugLogsOpen={setIsDebugLogsOpen}
      toolCallLoopDialog={toolCallLoopDialog}
      searchReplaceDialogProps={{
        searchState,
        activeChapterId:
          currentChapterId !== null ? parseInt(currentChapterId, 10) : null,
        storyLanguage: story.language || 'en',
        onJumpToPosition: (start: number, end: number) => {
          editorRef.current?.jumpToPosition(start, end);
        },
        onStoryChanged: () => void refreshStory(),
        onNavigateToChapter: (
          chapId: number,
          jumpStart: number | undefined,
          jumpEnd: number | undefined
        ) => {
          setMetadataDialogCloseTrigger((c: number) => c + 1);
          setSourcebookDialogCloseTrigger((c: number) => c + 1);
          if (jumpStart !== undefined && jumpEnd !== undefined) {
            pendingJumpRef.current = {
              chapterId: String(chapId),
              start: jumpStart,
              end: jumpEnd,
            };
          }
          handleChapterSelect(String(chapId));
        },
        onNavigateToSourcebookEntry: (entryId: string) => {
          setMetadataDialogCloseTrigger((c: number) => c + 1);
          openSourcebookEntryDialog(entryId);
        },
        onNavigateToStoryMetadata: (field: string) => {
          const tab: 'summary' | 'notes' | 'private' | 'conflicts' =
            field === 'story_summary'
              ? 'summary'
              : field === 'notes'
                ? 'notes'
                : field === 'private_notes'
                  ? 'private'
                  : field.startsWith('conflicts')
                    ? 'conflicts'
                    : 'summary';
          setSourcebookDialogCloseTrigger((c: number) => c + 1);
          openStoryMetadataDialog(tab);
        },
      }}
    />
  );
};

export default App;
