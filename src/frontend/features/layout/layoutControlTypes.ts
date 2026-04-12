// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines shared layout control-bundle types so prop contracts stay consistent across layout components.
 */

import type { ComponentProps, Dispatch, RefObject, SetStateAction } from 'react';

import type {
  AppSettings,
  AppTheme,
  Chapter,
  ChatMessage,
  ChatSession,
  EditorSettings,
  LLMConfig,
  StoryState,
  ViewMode,
  WritingUnit,
} from '../../types';
import type { ModelSelector } from '../chat/ModelSelector';
import type { EditorHandle } from '../editor/Editor';
import type { SessionMutation } from '../chat/components/MutationTags';

export type HeaderSidebarControls = {
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export type HeaderSettingsControls = {
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsImagesOpen: Dispatch<SetStateAction<boolean>>;
  setIsDebugLogsOpen: Dispatch<SetStateAction<boolean>>;
};

export type HeaderHistoryControls = {
  undo: () => void;
  redo: () => void;
  undoSteps: (steps: number) => void;
  redoSteps: (steps: number) => void;
  undoOptions: Array<{ id: string; label: string; steps: number }>;
  redoOptions: Array<{ id: string; label: string; steps: number }>;
  nextUndoLabel: string | null;
  nextRedoLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type HeaderViewControls = {
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  showWhitespace: boolean;
  setShowWhitespace: Dispatch<SetStateAction<boolean>>;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export type HeaderFormatControls = {
  handleFormat: (type: string) => void;
  getFormatButtonClass: (type: string) => string;
  isFormatMenuOpen: boolean;
  setIsFormatMenuOpen: Dispatch<SetStateAction<boolean>>;
  isMobileFormatMenuOpen: boolean;
  setIsMobileFormatMenuOpen: Dispatch<SetStateAction<boolean>>;
  onOpenImages: () => void;
};

export type HeaderAiControls = {
  handleAiAction: (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => Promise<void>;
  isAiActionLoading: boolean;
  isWritingAvailable: boolean;
  isChapterEmpty?: boolean;
};

export type HeaderModelControls = {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  saveSettings?: (settings: AppSettings) => Promise<void>;
  modelConnectionStatus: ComponentProps<typeof ModelSelector>['connectionStatus'];
  detectedCapabilities: ComponentProps<typeof ModelSelector>['detectedCapabilities'];
  recheckUnavailableProviderIfStale: (providerId: string, minAgeMs?: number) => void;
};

export type HeaderAppearanceControlsState = {
  appearanceRef: RefObject<HTMLDivElement | null>;
  isAppearanceOpen: boolean;
  setIsAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  setAppTheme: (theme: AppTheme) => void;
  editorSettings: EditorSettings;
  setEditorSettings: Dispatch<SetStateAction<EditorSettings>>;
};

export type HeaderChatPanelControls = {
  isChatOpen: boolean;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
};

export type HeaderThemeTokens = {
  isLight: boolean;
  iconColor: string;
  iconHover: string;
  dividerColor: string;
  buttonActive: string;
  currentTheme: AppTheme;
};

export type MainSidebarControls = {
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  story: StoryState;
  currentChapterId: string | null;
  handleChapterSelect: (id: string | null) => void;
  deleteChapter: (id: string) => Promise<void>;
  updateChapter: (id: string, partial: Partial<Chapter>) => Promise<void>;
  updateBook: (
    id: string,
    partial: { title?: string; summary?: string }
  ) => Promise<void>;
  addChapter: (title?: string, content?: string, bookId?: string) => Promise<void>;
  handleBookCreate: (title: string) => Promise<void>;
  handleBookDelete: (id: string) => Promise<void>;
  handleReorderChapters: (chapterIds: number[], bookId?: string) => Promise<void>;
  handleReorderBooks: (bookIds: string[]) => Promise<void>;
  handleSidebarAiAction: (
    type: 'chapter' | 'book' | 'story',
    id: string,
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void,
    source?: 'chapter' | 'notes'
  ) => Promise<string | undefined>;
  isEditingAvailable: boolean;
  handleOpenImages: () => void;
  // story metadata updates now include optional language so that the UI
  // can propagate project language changes from the metadata editor.
  updateStoryMetadata: (
    title: string,
    summary: string,
    tags: string[],
    notes?: string,
    private_notes?: string,
    conflicts?: Array<{ id: string; description: string; resolution: string }>,
    language?: string
  ) => Promise<void>;
  baselineState?: StoryState;
  // optional sourcebook relevance controls (provided by suggestions hook)
  checkedSourcebookIds?: string[];
  onToggleSourcebook?: (id: string, checked: boolean) => void;
  isAutoSourcebookSelectionEnabled?: boolean;
  onToggleAutoSourcebookSelection?: (enabled: boolean) => void;
  isSourcebookSelectionRunning?: boolean;
  onSourcebookMutated?: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => Promise<void>;
  onAppUndo?: () => Promise<void>;
  onAppRedo?: () => Promise<void>;
  canAppUndo?: boolean;
  canAppRedo?: boolean;
  selectedSourcebookEntryId?: string | null;
  sourcebookDialogTrigger?: { id: number; entryId: string } | null;
  metadataDialogTrigger?: {
    id: number;
    initialTab?: 'summary' | 'notes' | 'private' | 'conflicts';
  } | null;
};

export type MainEditorSuggestionControls = {
  continuations: string[];
  isSuggesting: boolean;
  handleTriggerSuggestions: (
    cursor?: number,
    contentOverride?: string,
    enableSuggestionMode?: boolean
  ) => Promise<void>;
  handleCancelSuggestions: () => void;
  handleAcceptContinuation: (text: string, contentOverride?: string) => Promise<void>;
  isSuggestionMode: boolean;
  handleKeyboardSuggestionAction: (
    action: 'trigger' | 'chooseLeft' | 'chooseRight' | 'regenerate' | 'undo' | 'exit',
    cursor?: number,
    contentOverride?: string
  ) => Promise<void>;
};

export type MainEditorAiControls = {
  handleAiAction: (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => Promise<void>;
  isAiActionLoading: boolean;
  isWritingAvailable: boolean;
  cancelAiAction: () => void;
  isChapterEmpty?: boolean;
  /** True whenever any LLM is writing prose into the editor (direct AI action or chat-tool streaming). */
  isProseStreaming?: boolean;
};

export type MainEditorControls = {
  currentChapter?: WritingUnit | null;
  editorRef: RefObject<EditorHandle | null>;
  editorSettings: EditorSettings;
  storyLanguage?: string;
  setEditorSettings: Dispatch<SetStateAction<EditorSettings>>;
  viewMode: ViewMode;
  updateChapter: (id: string, partial: Partial<WritingUnit>) => Promise<void>;
  suggestionControls: MainEditorSuggestionControls;
  aiControls: MainEditorAiControls;
  setActiveFormats: Dispatch<SetStateAction<string[]>>;
  showWhitespace: boolean;
  setShowWhitespace: Dispatch<SetStateAction<boolean>>;
  baselineContent?: string;
};

export type MainChatControls = {
  isChatOpen: boolean;
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  isChatAvailable: boolean;
  activeChatConfig: LLMConfig;
  systemPrompt: string;
  handleSendMessage: (text: string) => Promise<void>;
  handleStopChat: () => void;
  handleRegenerate: () => Promise<void>;
  handleEditMessage: (id: string, newText: string) => void;
  handleDeleteMessage: (id: string) => void;
  setSystemPrompt: Dispatch<SetStateAction<string>>;
  handleLoadProject: (projectId: string) => Promise<void>;
  incognitoSessions: ChatSession[];
  chatHistoryList: ChatSession[];
  currentChatId: string | null;
  isIncognito: boolean;
  handleSelectChat: (chatId: string) => Promise<void>;
  handleNewChat: (incognito?: boolean) => void;
  handleDeleteChat: (chatId: string) => Promise<void>;
  handleDeleteAllChats: () => Promise<void>;
  setIsIncognito: Dispatch<SetStateAction<boolean>>;
  allowWebSearch: boolean;
  setAllowWebSearch: Dispatch<SetStateAction<boolean>>;
  scratchpad: string;
  onUpdateScratchpad: (content: string) => void;
  onDeleteScratchpad: () => void;
  sessionMutations: SessionMutation[];
  onMutationClick: (m: SessionMutation) => void;
};
