// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use chat execution unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ChatAttachment, ChatMessage, LLMConfig } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { ChatToolFunctionCall } from '../../services/apiTypes';
import {
  buildChapterContextMessage,
  buildExecuteChatRequest,
  ChatToolMutationPayload,
} from './chatExecutionHelpers';

const createAssistantMessage = (
  id: string,
  result: { text?: string; thinking?: string; functionCalls?: ChatToolFunctionCall[] }
): ChatMessage => ({
  id,
  role: 'model',
  text: result.text || '',
  thinking: result.thinking,
  tool_calls: result.functionCalls,
});

type ToolLoopChoice = 'stop' | 'continue' | 'unlimited';

type UseChatExecutionParams = {
  systemPrompt: string;
  activeChatConfig: LLMConfig;
  isChatAvailable: boolean;
  allowWebSearch: boolean;
  currentChapterId: string | null;
  currentChatId: string | null;
  currentChapter?: { id: string; title: string } | null;
  refreshProjects: () => Promise<void>;
  refreshStory: () => Promise<void>;
  onProseChunk?: (chapId: number, writeMode: string, accumulated: string) => void;
  onMutations?: (mutations: ChatToolMutationPayload) => void;
  pushExternalHistoryEntry?: (params: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  requestToolCallLoopAccess: (count: number) => Promise<ToolLoopChoice>;
};

/** Custom React hook that manages chat execution. */
export function useChatExecution({
  systemPrompt,
  activeChatConfig,
  isChatAvailable,
  allowWebSearch,
  currentChapterId,
  currentChatId,
  currentChapter,
  refreshProjects,
  refreshStory,
  onProseChunk,
  onMutations,
  pushExternalHistoryEntry,
  requestToolCallLoopAccess,
}: UseChatExecutionParams): {
  handleSendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  handleStopChat: () => void;
  handleRegenerate: () => Promise<void>;
} {
  // Setters are stable — read via getState() so this hook does not subscribe to
  // every per-token chatMessages change.
  const { setChatMessages, setIsChatLoading } = useChatStore.getState();
  const stopSignalRef = useRef(false);
  const pendingMessageUpdatesRef = useRef<Record<string, Partial<ChatMessage>>>({});
  const updateFlushFrameRef = useRef<number | null>(null);

  const executeChatRequest = useCallback(
    buildExecuteChatRequest({
      systemPrompt,
      activeChatConfig,
      allowWebSearch,
      currentChapterId,
      currentChatId,
      currentChapter,
      onProseChunk,
      refreshProjects,
      refreshStory,
      requestToolCallLoopAccess,
      onMutations,
      pushExternalHistoryEntry,
      setChatMessages,
      setIsChatLoading,
      stopSignalRef,
      pendingMessageUpdatesRef,
      updateFlushFrameRef,
      createAssistantMessage,
    }),
    [
      systemPrompt,
      activeChatConfig,
      allowWebSearch,
      currentChapterId,
      currentChatId,
      currentChapter,
      onProseChunk,
      refreshProjects,
      refreshStory,
      requestToolCallLoopAccess,
      onMutations,
      pushExternalHistoryEntry,
      setChatMessages,
      setIsChatLoading,
      stopSignalRef,
      pendingMessageUpdatesRef,
      updateFlushFrameRef,
      createAssistantMessage,
    ]
  );

  // Keep stable refs so callers holding empty-dep useCallback/useMemo never
  // receive new function identities just because App re-rendered (e.g. due to
  // a debounced story-content update).  The refs are updated every render so
  // the latest captured values are always used at call time.
  const handleSendMessageImplRef = useRef<
    (text: string, attachments?: ChatAttachment[]) => Promise<void>
  >(null!);
  const handleStopChatImplRef = useRef<() => void>(null!);
  const handleRegenerateImplRef = useRef<() => Promise<void>>(null!);

  const handleSendMessageImpl = async (
    text: string,
    attachments?: ChatAttachment[]
  ) => {
    if (!isChatAvailable) return;
    const userMsgId = uuidv4();
    const historyBefore = [...useChatStore.getState().chatMessages];

    // Inject a get_current_chapter_id context message when the chapter has changed
    // (or when starting a fresh chat). This is stored in chatMessages so that
    // subsequent requests carry the full accurate chapter-context history.
    const contextMsg = buildChapterContextMessage(historyBefore, currentChapter);

    const historyWithContext = contextMsg
      ? [...historyBefore, contextMsg]
      : historyBefore;

    setChatMessages((prev: ChatMessage[]) => [
      ...prev,
      ...(contextMsg ? [contextMsg] : []),
      { id: userMsgId, role: 'user', text, attachments },
    ]);

    await executeChatRequest(text, historyWithContext, attachments, userMsgId);
  };

  const handleStopChatImpl = () => {
    stopSignalRef.current = true;
    useChatStore.getState().setIsChatLoading(false);
  };

  const handleRegenerateImpl = async () => {
    if (!isChatAvailable) return;
    const chatMessages = useChatStore.getState().chatMessages;

    let userMessageIndex = -1;
    for (let index = chatMessages.length - 1; index >= 0; index--) {
      if (chatMessages[index].role === 'user') {
        userMessageIndex = index;
        break;
      }
    }

    if (userMessageIndex === -1) return;

    const userMessage = chatMessages[userMessageIndex];
    const newHistory = chatMessages.slice(0, userMessageIndex);
    setChatMessages([...newHistory, userMessage]);
    await executeChatRequest(
      userMessage.text,
      newHistory,
      userMessage.attachments,
      userMessage.id
    );
  };

  // Update impl refs every render so stable callbacks always call the latest version.
  handleSendMessageImplRef.current = handleSendMessageImpl;
  handleStopChatImplRef.current = handleStopChatImpl;
  handleRegenerateImplRef.current = handleRegenerateImpl;

  // Stable wrappers: identity never changes, so chatControls/useMemo deps that
  // capture these functions don't invalidate on every debounced keystroke.
  const handleSendMessage = useCallback(
    (text: string, attachments?: ChatAttachment[]) =>
      handleSendMessageImplRef.current(text, attachments),
    []
  );
  const handleStopChat = useCallback(() => handleStopChatImplRef.current(), []);
  const handleRegenerate = useCallback(() => handleRegenerateImplRef.current(), []);

  return {
    handleSendMessage,
    handleStopChat,
    handleRegenerate,
  };
}
