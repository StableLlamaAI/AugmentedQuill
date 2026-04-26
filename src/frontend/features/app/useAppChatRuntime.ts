// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Own App-level chat/session orchestration so App.tsx only coordinates features.
 */

import { useCallback, useEffect, useRef, startTransition } from 'react';

import { useChatExecution } from '../chat/useChatExecution';
import { useChatMessageActions } from '../chat/useChatMessageActions';
import { useChatSessionManagement } from '../chat/useChatSessionManagement';
import { MUTATION_TOOL_REGISTRY } from '../chat/mutationToolRegistry';
import type { SessionMutation } from '../chat';
import { applySmartQuotes } from '../../utils/textUtils';
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  LLMConfig,
  MetadataTab,
  StoryState,
} from '../../types';
import type { PromptsState } from '../settings/usePrompts';
import type { ChatToolExecutionResponse } from '../../services/apiTypes';
import { useChatStore, ChatStoreState } from '../../stores/chatStore';
import { useStoryStore } from '../../stores/storyStore';

type CurrentChapterContext = {
  id: string;
  title: string;
  is_empty: boolean;
} | null;

type UseAppChatRuntimeParams = {
  storyId: string;
  storyRef: React.MutableRefObject<StoryState>;
  prompts: PromptsState;
  activeChatConfig: LLMConfig;
  isChatAvailable: boolean;
  currentChapterId: string | null;
  currentChapterContext: CurrentChapterContext;
  advanceBaselineToCurrentStory: () => void;
  refreshProjects: () => Promise<void>;
  refreshStory: () => Promise<void>;
  updateChapter: (
    id: string,
    partial: Record<string, unknown>,
    sync?: boolean,
    pushHistory?: boolean,
    forceNewHistory?: boolean
  ) => Promise<unknown>;
  pushExternalHistoryEntry?: (params: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  requestToolCallLoopAccess: (
    count: number
  ) => Promise<'stop' | 'continue' | 'unlimited'>;
  handleChapterSelect: (chapterId: string | null) => void;
  openAndExpandStory: () => void;
  openSourcebookEntryDialog: (entryId: string) => void;
  openStoryMetadataDialog: (tab?: MetadataTab) => void;
};

type UseAppChatRuntimeResult = ReturnType<typeof useChatSessionManagement> & {
  onMutationClick: (mutation: SessionMutation) => void;
  handleSendMessageWithReset: (
    text: string,
    attachments?: ChatAttachment[]
  ) => Promise<void>;
  handleStopChat: () => void;
  handleRegenerateWithReset: () => Promise<void>;
  handleEditMessage: (messageId: string, text: string) => void;
  handleDeleteMessage: (messageId: string) => void;
};

type ToolMutationPayload = ChatToolExecutionResponse & {
  _call_results?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
};

export function useAppChatRuntime({
  storyId,
  storyRef,
  prompts,
  activeChatConfig,
  isChatAvailable,
  currentChapterId,
  currentChapterContext,
  advanceBaselineToCurrentStory,
  refreshProjects,
  refreshStory,
  updateChapter,
  pushExternalHistoryEntry,
  requestToolCallLoopAccess,
  handleChapterSelect,
  openAndExpandStory,
  openSourcebookEntryDialog,
  openStoryMetadataDialog,
}: UseAppChatRuntimeParams): UseAppChatRuntimeResult {
  // Setters are stable function references — use getState() to avoid subscribing
  // this hook (and its App.tsx caller) to every streaming token update.
  const { setChatMessages, setIsChatLoading, setSessionMutations } =
    useChatStore.getState();

  const getSystemPrompt = useCallback(
    () => prompts.system_messages.chat_llm || '',
    [prompts]
  );

  const sessionState = useChatSessionManagement({
    storyId,
    getSystemPrompt,
  });

  const { handleEditMessage, handleDeleteMessage } = useChatMessageActions({
    setChatMessages,
  });

  const onChatNewMessageBegin = useCallback(() => {
    setSessionMutations([]);
    advanceBaselineToCurrentStory();
  }, [advanceBaselineToCurrentStory, setSessionMutations]);

  const onToolMutations = useCallback((muts: ToolMutationPayload) => {
    const newMuts: SessionMutation[] = [];
    (muts?._call_results || []).forEach(
      (res: {
        name: string;
        args?: Record<string, unknown>;
        result?: Record<string, unknown>;
      }) => {
        const factory = MUTATION_TOOL_REGISTRY[res.name];
        if (!factory) {
          return;
        }
        const produced = factory({ args: res.args || {}, result: res.result || {} });
        (Array.isArray(produced) ? produced : [produced]).forEach(
          (item: SessionMutation | null): void => {
            if (item) {
              newMuts.push(item);
            }
          }
        );
      }
    );
    if (!newMuts.length) {
      return;
    }
    setSessionMutations((prev: SessionMutation[]): SessionMutation[] => {
      const combined = [...prev];
      newMuts.forEach((mutation: SessionMutation) => {
        const exists = combined.some(
          (entry: SessionMutation) =>
            entry.type === mutation.type &&
            entry.label === mutation.label &&
            entry.targetId === mutation.targetId
        );
        if (!exists) {
          combined.push(mutation);
        }
      });
      return combined;
    });
  }, []);

  const prosePreviewStateRef = useRef<
    Record<
      string,
      { base: string; lastAccumulated: string; lastAppliedContent?: string }
    >
  >({});

  useEffect(() => {
    if (!useChatStore.getState().isChatLoading) {
      prosePreviewStateRef.current = {};
    }
    // Subscribe to isChatLoading changes imperatively to reset prose preview state
    const unsubscribe = useChatStore.subscribe(
      (state: ChatStoreState, prevState: ChatStoreState) => {
        if (prevState.isChatLoading && !state.isChatLoading) {
          prosePreviewStateRef.current = {};
          // Clear the streaming slot so the editor shows the committed chapter content.
          useStoryStore.getState().setStreamingContent(null);
          useChatStore.getState().setIsProseStreamingFromChat(false);
        }
      }
    );
    return unsubscribe;
  }, []);

  const { handleSendMessage, handleStopChat, handleRegenerate } = useChatExecution({
    getSystemPrompt: () => useChatStore.getState().systemPrompt,
    activeChatConfig,
    isChatAvailable,
    getAllowWebSearch: () => useChatStore.getState().allowWebSearch,
    currentChapterId,
    getCurrentChatId: () => useChatStore.getState().currentChatId,
    currentChapter: currentChapterContext,
    refreshProjects,
    refreshStory,
    onProseChunk: useCallback(
      (chapterId: number, writeMode: string, accumulated: string) => {
        const currentStory = storyRef.current;
        const unit =
          currentStory.projectType === 'short-story' && currentStory.draft
            ? currentStory.draft
            : currentStory.chapters.find(
                (chapter: { id: string }) => Number(chapter.id) === chapterId
              ) || null;
        if (!unit || writeMode === 'insert_at_marker') {
          return;
        }

        const streamKey = `${chapterId}:${writeMode}`;
        const previous = prosePreviewStateRef.current[streamKey];
        const restarted =
          !previous ||
          accumulated.length < previous.lastAccumulated.length ||
          !accumulated.startsWith(previous.lastAccumulated);
        const streamState = restarted
          ? {
              base: unit.content || '',
              lastAccumulated: '',
              lastAppliedContent: undefined,
            }
          : previous;
        const typographicAccumulated = applySmartQuotes(accumulated);
        const separator =
          streamState.base && !streamState.base.endsWith('\n') ? '\n' : '';
        const newContent =
          writeMode === 'replace'
            ? typographicAccumulated
            : `${streamState.base}${separator}${typographicAccumulated}`;

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

        void useStoryStore.getState().setStreamingContent({
          chapterId: unit.id,
          content: newContent,
        });
        useChatStore.getState().setIsProseStreamingFromChat(true);
      },
      [storyRef, updateChapter]
    ),
    onMutations: onToolMutations,
    pushExternalHistoryEntry: (
      params: Parameters<NonNullable<typeof pushExternalHistoryEntry>>[0]
    ) => pushExternalHistoryEntry?.(params),
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

  const onMutationClick = useCallback(
    (mutation: SessionMutation) => {
      startTransition(() => {
        requestAnimationFrame(() => {
          if (mutation.type === 'chapter') {
            handleChapterSelect(mutation.targetId ?? null);
          } else if (mutation.type === 'story') {
            handleChapterSelect(null);
          } else if (mutation.type === 'metadata') {
            openStoryMetadataDialog(mutation.subType as MetadataTab);
          } else if (mutation.type === 'sourcebook') {
            openSourcebookEntryDialog(mutation.targetId ?? '');
          } else if (mutation.type === 'book') {
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

  return {
    ...sessionState,
    onMutationClick,
    handleSendMessageWithReset,
    handleStopChat,
    handleRegenerateWithReset,
    handleEditMessage,
    handleDeleteMessage,
  };
}
