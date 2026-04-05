// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use chat execution unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { Dispatch, SetStateAction, useRef } from 'react';

const createAssistantMessage = (
  id: string,
  result: { text?: string; thinking?: string; functionCalls?: any[] }
): ChatMessage => ({
  id,
  role: 'model',
  text: result.text || '',
  thinking: result.thinking,
  tool_calls: result.functionCalls,
});

import { v4 as uuidv4 } from 'uuid';

import { api } from '../../services/api';
import { createChatSession } from '../../services/openaiService';
import { ChatAttachment, ChatMessage, LLMConfig } from '../../types';

type ToolLoopChoice = 'stop' | 'continue' | 'unlimited';

type UseChatExecutionParams = {
  systemPrompt: string;
  activeChatConfig: LLMConfig;
  isChatAvailable: boolean;
  allowWebSearch: boolean;
  currentChapterId: string | null;
  currentChatId: string | null;
  currentChapter?: { id: string; title: string } | null;
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  isChatLoading: boolean;
  setIsChatLoading: Dispatch<SetStateAction<boolean>>;
  refreshProjects: () => Promise<void>;
  refreshStory: () => Promise<void>;
  onProseChunk?: (chapId: number, writeMode: string, accumulated: string) => void;
  pushExternalHistoryEntry?: (params: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  requestToolCallLoopAccess: (count: number) => Promise<ToolLoopChoice>;
};

export function useChatExecution({
  systemPrompt,
  activeChatConfig,
  isChatAvailable,
  allowWebSearch,
  currentChapterId,
  currentChatId,
  currentChapter,
  chatMessages,
  setChatMessages,
  isChatLoading,
  setIsChatLoading,
  refreshProjects,
  refreshStory,
  onProseChunk,
  pushExternalHistoryEntry,
  requestToolCallLoopAccess,
}: UseChatExecutionParams) {
  const stopSignalRef = useRef(false);
  const pendingMessageUpdatesRef = useRef<Record<string, Partial<ChatMessage>>>({});
  const updateFlushFrameRef = useRef<number | null>(null);

  const ensureUniqueMessages = (messages: ChatMessage[]): ChatMessage[] => {
    const seen = new Set<string>();
    return messages.filter((message) => {
      if (!message.id) return true;
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
  };

  const upsertChatMessage = (msgId: string, messageUpdate: Partial<ChatMessage>) => {
    setChatMessages((prev) => {
      const messageIndex = prev.findIndex((item) => item.id === msgId);
      if (messageIndex !== -1) {
        const next = [...prev];
        next[messageIndex] = {
          ...next[messageIndex],
          ...messageUpdate,
          text: messageUpdate.text ?? next[messageIndex].text,
          thinking: messageUpdate.thinking ?? next[messageIndex].thinking,
          traceback: messageUpdate.traceback ?? next[messageIndex].traceback,
        } as ChatMessage;
        return ensureUniqueMessages(next);
      }
      return ensureUniqueMessages([
        ...prev,
        {
          id: msgId,
          role: 'model',
          text: messageUpdate.text ?? '',
          thinking: messageUpdate.thinking ?? '',
          traceback: messageUpdate.traceback ?? '',
          ...messageUpdate,
        } as ChatMessage,
      ]);
    });
  };

  const flushPendingMessageUpdates = () => {
    if (updateFlushFrameRef.current !== null) {
      cancelAnimationFrame(updateFlushFrameRef.current);
      updateFlushFrameRef.current = null;
    }

    const updates = pendingMessageUpdatesRef.current;
    const updateEntries = Object.entries(updates);
    if (updateEntries.length === 0) return;

    pendingMessageUpdatesRef.current = {};

    setChatMessages((prev) => {
      const next = [...prev];
      const messageIndexById = new Map<string, number>();

      next.forEach((message, index) => {
        messageIndexById.set(message.id, index);
      });

      for (const [messageId, messageUpdate] of updateEntries) {
        const existingIndex = messageIndexById.get(messageId);

        if (existingIndex !== undefined) {
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            ...messageUpdate,
            text: messageUpdate.text ?? existing.text,
            thinking: messageUpdate.thinking ?? existing.thinking,
            traceback: messageUpdate.traceback ?? existing.traceback,
          } as ChatMessage;
        } else {
          next.push({
            id: messageId,
            role: 'model',
            text: messageUpdate.text ?? '',
            thinking: messageUpdate.thinking ?? '',
            traceback: messageUpdate.traceback ?? '',
            ...messageUpdate,
          } as ChatMessage);
        }
      }

      return next;
    });
  };

  const scheduleMessageUpdate = (
    msgId: string,
    messageUpdate: Partial<ChatMessage>
  ) => {
    const existingUpdate = pendingMessageUpdatesRef.current[msgId] || {};
    pendingMessageUpdatesRef.current[msgId] = {
      ...existingUpdate,
      ...messageUpdate,
      text: messageUpdate.text ?? existingUpdate.text,
      thinking: messageUpdate.thinking ?? existingUpdate.thinking,
      traceback: messageUpdate.traceback ?? existingUpdate.traceback,
    };

    if (updateFlushFrameRef.current !== null) return;

    updateFlushFrameRef.current = requestAnimationFrame(() => {
      updateFlushFrameRef.current = null;
      flushPendingMessageUpdates();
    });
  };

  const executeChatRequest = async (
    userText: string,
    history: ChatMessage[],
    attachments?: ChatAttachment[],
    userMsgId?: string
  ) => {
    setIsChatLoading(true);
    stopSignalRef.current = false;

    let sequentialToolCalls = 0;
    let toolCallLimit = 10;

    try {
      let currentHistory = [...history];
      const session = createChatSession(
        systemPrompt,
        currentHistory,
        activeChatConfig,
        'CHAT',
        {
          allowWebSearch,
          currentChapter,
        }
      );

      const updateMessage = (
        msgId: string,
        update: { text?: string; thinking?: string; traceback?: string }
      ) => {
        if (stopSignalRef.current) return;
        scheduleMessageUpdate(msgId, update);
      };

      let currentMsgId = uuidv4();
      let result = await session.sendMessage(
        { message: userText, attachments },
        (update) => updateMessage(currentMsgId, update)
      );

      const effectiveUserMsgId = userMsgId || uuidv4();
      if (!currentHistory.some((msg) => msg.id === effectiveUserMsgId)) {
        currentHistory.push({
          id: effectiveUserMsgId,
          role: 'user',
          text: userText,
          attachments,
        });
      }

      const accumulatedToolBatches: Array<{
        batch_id: string;
        label: string;
        operation_count?: number;
      }> = [];

      while (result.functionCalls && result.functionCalls.length > 0) {
        if (stopSignalRef.current) break;

        sequentialToolCalls++;
        if (sequentialToolCalls >= toolCallLimit) {
          const choice = await requestToolCallLoopAccess(sequentialToolCalls);
          if (choice === 'stop') break;
          if (choice === 'continue') {
            toolCallLimit += 10;
          } else {
            toolCallLimit = Infinity;
          }
        }

        const assistantMessage = createAssistantMessage(currentMsgId, result);

        flushPendingMessageUpdates();
        upsertChatMessage(currentMsgId, assistantMessage);

        currentHistory.push(assistantMessage);

        const toolResponse = await api.chat.executeTools(
          {
            messages: currentHistory.map((message) => ({
              role: message.role === 'model' ? 'assistant' : message.role,
              content: message.text || null,
              tool_calls: message.tool_calls?.map((toolCall) => ({
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.name,
                  arguments:
                    typeof toolCall.args === 'string'
                      ? toolCall.args
                      : JSON.stringify(toolCall.args),
                },
              })),
            })),
            active_chapter_id: currentChapterId ? Number(currentChapterId) : undefined,
            chat_id: currentChatId || undefined,
          },
          onProseChunk
        );

        if (stopSignalRef.current) break;

        if (!toolResponse.ok) break;

        for (const message of toolResponse.appended_messages) {
          currentHistory.push({
            id: uuidv4(),
            role: 'tool',
            text: message.content,
            name: message.name,
            tool_call_id: message.tool_call_id,
          });
        }
        setChatMessages(ensureUniqueMessages([...currentHistory]));

        if (toolResponse.mutations?.story_changed) {
          await refreshProjects();
          await refreshStory();
        }

        const toolBatch = toolResponse.mutations?.tool_batch;
        if (toolBatch?.batch_id) {
          accumulatedToolBatches.push({
            batch_id: toolBatch.batch_id,
            label: toolBatch.label || `AI tools (${toolBatch.operation_count})`,
            operation_count: toolBatch.operation_count,
          });
        }

        if (stopSignalRef.current) break;

        const nextSession = createChatSession(
          systemPrompt,
          currentHistory,
          activeChatConfig,
          'CHAT',
          {
            allowWebSearch,
            currentChapter,
          }
        );
        currentMsgId = uuidv4();
        result = await nextSession.sendMessage({ message: '' }, (update) =>
          updateMessage(currentMsgId, update)
        );
      }

      if (accumulatedToolBatches.length > 0 && pushExternalHistoryEntry) {
        const entryLabel =
          accumulatedToolBatches.length === 1
            ? accumulatedToolBatches[0].label
            : `AI tools: ${accumulatedToolBatches
                .map((batch) => batch.label)
                .join(', ')}`;

        pushExternalHistoryEntry({
          label: entryLabel,
          onUndo: async () => {
            for (const batch of [...accumulatedToolBatches].reverse()) {
              await api.chat.undoToolBatch(batch.batch_id);
            }
            await refreshProjects();
            await refreshStory();
          },
          onRedo: async () => {
            for (const batch of accumulatedToolBatches) {
              await api.chat.redoToolBatch(batch.batch_id);
            }
            await refreshProjects();
            await refreshStory();
          },
        });
      }

      if (!stopSignalRef.current) {
        const botMessage = createAssistantMessage(currentMsgId, result);
        flushPendingMessageUpdates();
        upsertChatMessage(currentMsgId, botMessage);
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      let errorText = `AI Error: ${message}`;
      const detailedError = error as { data?: unknown; traceback?: string };
      if (detailedError.data) {
        const detail =
          typeof detailedError.data === 'string'
            ? detailedError.data
            : JSON.stringify(detailedError.data, null, 2);
        errorText += `\n\n**Details:**\n${detail}`;
      }

      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'model',
        text: errorText,
        isError: true,
        traceback: detailedError.traceback,
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      flushPendingMessageUpdates();
      setIsChatLoading(false);
      stopSignalRef.current = false;
    }
  };

  const buildChapterContextMessage = (
    history: ChatMessage[],
    chapter?: { id: string; title: string } | null
  ): ChatMessage | null => {
    if (!chapter?.id) return null;
    const chapterId = parseInt(chapter.id, 10);
    if (!Number.isFinite(chapterId)) return null;

    // Find the last get_current_chapter_id context message in history.
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === 'tool' && msg.name === 'get_current_chapter_id') {
        try {
          const parsed = JSON.parse(msg.text || '');
          if (parsed.chapter_id === chapterId) return null; // same chapter, no injection needed
        } catch {
          // malformed content – fall through to inject
        }
        break; // found a context message but for a different chapter
      }
    }

    return {
      id: uuidv4(),
      role: 'tool',
      text: JSON.stringify({
        chapter_id: chapterId,
        chapter_title: chapter.title ?? '',
      }),
      name: 'get_current_chapter_id',
      tool_call_id: 'current_context',
    };
  };

  const handleSendMessage = async (text: string, attachments?: ChatAttachment[]) => {
    if (!isChatAvailable) return;
    const userMsgId = uuidv4();
    const historyBefore = [...chatMessages];

    // Inject a get_current_chapter_id context message when the chapter has changed
    // (or when starting a fresh chat). This is stored in chatMessages so that
    // subsequent requests carry the full accurate chapter-context history.
    const contextMsg = buildChapterContextMessage(historyBefore, currentChapter);

    const historyWithContext = contextMsg
      ? [...historyBefore, contextMsg]
      : historyBefore;

    setChatMessages((prev) => [
      ...prev,
      ...(contextMsg ? [contextMsg] : []),
      { id: userMsgId, role: 'user', text, attachments },
    ]);

    await executeChatRequest(text, historyWithContext, attachments, userMsgId);
  };

  const handleStopChat = () => {
    stopSignalRef.current = true;
    setIsChatLoading(false);
  };

  const handleRegenerate = async () => {
    if (!isChatAvailable) return;
    const lastMessageIndex = chatMessages.length - 1;
    if (lastMessageIndex < 0) return;

    const lastMessage = chatMessages[lastMessageIndex];
    if (lastMessage.role !== 'model') return;

    let userMessageIndex = -1;
    for (let index = lastMessageIndex; index >= 0; index--) {
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

  return {
    isChatLoading,
    handleSendMessage,
    handleStopChat,
    handleRegenerate,
  };
}
