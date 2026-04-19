// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate chat execution helpers so the main hook remains short
 * and the execution path can be tested independently.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { api } from '../../services/api';
import { createChatSession } from '../../services/openaiService';
import type { ChatAttachment, ChatMessage, LLMConfig } from '../../types';
import type {
  ChatToolExecutionResponse,
  ChatToolFunctionCall,
} from '../../services/apiTypes';

export type ChatToolMutationPayload = ChatToolExecutionResponse & {
  _call_results?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
};

export type ExecuteChatRequestContext = {
  systemPrompt: string;
  activeChatConfig: LLMConfig;
  allowWebSearch: boolean;
  currentChapterId: string | null;
  currentChatId: string | null;
  currentChapter?: { id: string; title: string } | null;
  onProseChunk?: (chapId: number, writeMode: string, accumulated: string) => void;
  refreshProjects: () => Promise<void>;
  refreshStory: () => Promise<void>;
  requestToolCallLoopAccess: (
    count: number
  ) => Promise<'stop' | 'continue' | 'unlimited'>;
  onMutations?: (mutations: ChatToolMutationPayload) => void;
  pushExternalHistoryEntry?: (params: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
    forceNewHistory?: boolean;
  }) => void;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsChatLoading: Dispatch<SetStateAction<boolean>>;
  stopSignalRef: MutableRefObject<boolean>;
  pendingMessageUpdatesRef: MutableRefObject<Record<string, Partial<ChatMessage>>>;
  updateFlushFrameRef: MutableRefObject<number | null>;
  createAssistantMessage: (
    id: string,
    result: {
      text?: string;
      thinking?: string;
      functionCalls?: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
      }>;
    }
  ) => ChatMessage;
};

export const ensureUniqueMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const seen = new Set<string>();
  return messages.filter((message: ChatMessage) => {
    if (!message.id) return true;
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
};

export const upsertChatMessage = (
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  ensureUniqueMessagesFn: (messages: ChatMessage[]) => ChatMessage[],
  msgId: string,
  messageUpdate: Partial<ChatMessage>
) => {
  setChatMessages((prev: ChatMessage[]) => {
    const messageIndex = prev.findIndex((item: ChatMessage) => item.id === msgId);
    if (messageIndex !== -1) {
      const next = [...prev];
      next[messageIndex] = {
        ...next[messageIndex],
        ...messageUpdate,
        text: messageUpdate.text ?? next[messageIndex].text,
        thinking: messageUpdate.thinking ?? next[messageIndex].thinking,
        traceback: messageUpdate.traceback ?? next[messageIndex].traceback,
      } as ChatMessage;
      return ensureUniqueMessagesFn(next);
    }
    return ensureUniqueMessagesFn([
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

export const flushPendingMessageUpdates = (
  pendingMessageUpdatesRef: MutableRefObject<Record<string, Partial<ChatMessage>>>,
  updateFlushFrameRef: MutableRefObject<number | null>,
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
) => {
  if (updateFlushFrameRef.current !== null) {
    cancelAnimationFrame(updateFlushFrameRef.current);
    updateFlushFrameRef.current = null;
  }

  const updates = pendingMessageUpdatesRef.current;
  const updateEntries = Object.entries(updates);
  if (updateEntries.length === 0) return;

  pendingMessageUpdatesRef.current = {};

  setChatMessages((prev: ChatMessage[]) => {
    const next = [...prev];
    const messageIndexById = new Map<string, number>();

    next.forEach((message: ChatMessage, index: number) => {
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

export const buildChapterContextMessage = (
  history: ChatMessage[],
  chapter?: { id: string; title: string } | null
): ChatMessage | null => {
  if (!chapter?.id) return null;
  const chapterId = parseInt(chapter.id, 10);
  if (!Number.isFinite(chapterId)) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'tool' && msg.name === 'get_current_chapter_id') {
      try {
        const parsed = JSON.parse(msg.text || '');
        if (parsed.chapter_id === chapterId) return null;
      } catch {
        // malformed content – fall through to inject
      }
      break;
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

const parseToolCallResults = (
  messages: Array<{ content: string; tool_call_id: string; name: string }>,
  assistantMessage: ChatMessage
) => {
  const callResults: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }> = [];

  for (const message of messages) {
    const toolCall = assistantMessage.tool_calls?.find(
      (tc: import('../../types').ChatToolCall) => tc.id === message.tool_call_id
    );
    if (!toolCall) continue;

    let parsedResult: Record<string, unknown> = {};
    try {
      parsedResult = JSON.parse(message.content);
    } catch {
      // ignore malformed JSON
    }

    callResults.push({
      name: toolCall.name,
      args: toolCall.args,
      result: parsedResult,
    });
  }

  return callResults;
};

const makeMessageUpdater =
  (
    pendingMessageUpdatesRef: MutableRefObject<Record<string, Partial<ChatMessage>>>,
    updateFlushFrameRef: MutableRefObject<number | null>,
    flushPendingMessageUpdatesFn: () => void
  ) =>
  (msgId: string) =>
  (update: { text?: string; thinking?: string; traceback?: string }) => {
    if (pendingMessageUpdatesRef.current === null) return;

    const existingUpdate = pendingMessageUpdatesRef.current[msgId] || {};
    pendingMessageUpdatesRef.current[msgId] = {
      ...existingUpdate,
      ...update,
      text: update.text ?? existingUpdate.text,
      thinking: update.thinking ?? existingUpdate.thinking,
      traceback: update.traceback ?? existingUpdate.traceback,
    };

    if (updateFlushFrameRef.current !== null) return;
    updateFlushFrameRef.current = requestAnimationFrame(() => {
      updateFlushFrameRef.current = null;
      flushPendingMessageUpdatesFn();
    });
  };

const normalizeFunctionCalls = (
  functionCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown> | string;
  }>
): Array<ChatToolFunctionCall> | undefined =>
  functionCalls?.map(
    (call: { id: string; name: string; args: Record<string, unknown> | string }) => ({
      id: call.id,
      name: call.name,
      args: typeof call.args === 'string' ? { raw: call.args } : call.args,
    })
  );

const buildToolPayload = (
  currentHistory: ChatMessage[],
  currentChapterId: string | null,
  currentChatId: string | null
) => ({
  messages: currentHistory.map((message: ChatMessage) => ({
    role: (message.role === 'model' ? 'assistant' : message.role) as
      | 'user'
      | 'assistant'
      | 'system'
      | 'tool',
    content: message.text || null,
    tool_calls: message.tool_calls?.map(
      (toolCall: import('../../types').ChatToolCall) => ({
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments:
            typeof toolCall.args === 'string'
              ? toolCall.args
              : JSON.stringify(toolCall.args),
        },
      })
    ),
  })),
  active_chapter_id: currentChapterId ? Number(currentChapterId) : undefined,
  chat_id: currentChatId || undefined,
});

const handleToolResponse = async (
  context: ExecuteChatRequestContext,
  toolResponse: ChatToolExecutionResponse,
  assistantMessage: ChatMessage,
  currentHistory: ChatMessage[],
  currentMsgId: string,
  accumulatedToolBatches: Array<{
    batch_id: string;
    label: string;
    operation_count?: number;
  }>
) => {
  const callResults = parseToolCallResults(
    toolResponse.appended_messages,
    assistantMessage
  );

  for (const message of toolResponse.appended_messages) {
    currentHistory.push({
      id: uuidv4(),
      role: 'tool',
      text: message.content,
      name: message.name,
      tool_call_id: message.tool_call_id,
    });
  }

  context.setChatMessages(ensureUniqueMessages([...currentHistory]));

  if (toolResponse.mutations?.story_changed) {
    await context.refreshProjects();
    await context.refreshStory();
  }

  if (toolResponse.mutations) {
    context.onMutations?.({
      ...toolResponse,
      _call_results: callResults,
    });
  }

  const toolBatch = toolResponse.mutations?.tool_batch;
  if (toolBatch?.batch_id) {
    accumulatedToolBatches.push({
      batch_id: toolBatch.batch_id,
      label: toolBatch.label || `AI tools (${toolBatch.operation_count})`,
      operation_count: toolBatch.operation_count,
    });
  }

  if (context.stopSignalRef.current) {
    return null;
  }

  const nextSession = createChatSession(
    context.systemPrompt,
    currentHistory,
    context.activeChatConfig,
    'CHAT',
    {
      allowWebSearch: context.allowWebSearch,
      currentChapter: context.currentChapter,
    }
  );

  const nextMsgId = uuidv4();
  const nextResult = await nextSession.sendMessage(
    { message: '' },
    makeMessageUpdater(
      context.pendingMessageUpdatesRef,
      context.updateFlushFrameRef,
      () =>
        flushPendingMessageUpdates(
          context.pendingMessageUpdatesRef,
          context.updateFlushFrameRef,
          context.setChatMessages
        )
    )(nextMsgId)
  );

  return {
    currentHistory,
    currentMsgId: nextMsgId,
    result: nextResult,
  };
};

type UnifiedChatResult = {
  text: string;
  thinking?: string;
  functionCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown> | string;
  }>;
  traceback?: string;
};

const runToolCallLoop = async (
  context: ExecuteChatRequestContext,
  currentHistory: ChatMessage[],
  currentMsgId: string,
  result: UnifiedChatResult,
  accumulatedToolBatches: Array<{
    batch_id: string;
    label: string;
    operation_count?: number;
  }>
) => {
  let sequentialToolCalls = 0;
  let toolCallLimit = 10;

  while (result.functionCalls && result.functionCalls.length > 0) {
    if (context.stopSignalRef.current) break;

    sequentialToolCalls++;
    if (sequentialToolCalls >= toolCallLimit) {
      const choice = await context.requestToolCallLoopAccess(sequentialToolCalls);
      if (choice === 'stop') break;
      if (choice === 'continue') {
        toolCallLimit += 10;
      } else {
        toolCallLimit = Infinity;
      }
    }

    const assistantMessage = context.createAssistantMessage(currentMsgId, {
      text: result.text,
      thinking: result.thinking,
      functionCalls: normalizeFunctionCalls(result.functionCalls),
    });
    flushPendingMessageUpdates(
      context.pendingMessageUpdatesRef,
      context.updateFlushFrameRef,
      context.setChatMessages
    );
    upsertChatMessage(
      context.setChatMessages,
      ensureUniqueMessages,
      currentMsgId,
      assistantMessage
    );
    currentHistory.push(assistantMessage);

    const toolResponse = await api.chat.executeTools(
      buildToolPayload(currentHistory, context.currentChapterId, context.currentChatId),
      context.onProseChunk
    );

    if (context.stopSignalRef.current) break;
    if (!toolResponse.ok) break;

    const nextState = await handleToolResponse(
      context,
      toolResponse,
      assistantMessage,
      currentHistory,
      currentMsgId,
      accumulatedToolBatches
    );

    if (!nextState) break;

    currentHistory = nextState.currentHistory;
    currentMsgId = nextState.currentMsgId;
    result = nextState.result;
  }

  return { currentHistory, currentMsgId, result };
};

export const buildExecuteChatRequest =
  (context: ExecuteChatRequestContext) =>
  (
    userText: string,
    history: ChatMessage[],
    attachments?: ChatAttachment[],
    userMsgId?: string
  ) =>
    executeChatRequestImpl(context, userText, history, attachments, userMsgId);

const executeChatRequestImpl = async (
  context: ExecuteChatRequestContext,
  userText: string,
  history: ChatMessage[],
  attachments?: ChatAttachment[],
  userMsgId?: string
) => {
  context.setIsChatLoading(true);
  context.stopSignalRef.current = false;

  const updateMessage = makeMessageUpdater(
    context.pendingMessageUpdatesRef,
    context.updateFlushFrameRef,
    () =>
      flushPendingMessageUpdates(
        context.pendingMessageUpdatesRef,
        context.updateFlushFrameRef,
        context.setChatMessages
      )
  );

  try {
    let currentHistory = [...history];
    const session = createChatSession(
      context.systemPrompt,
      currentHistory,
      context.activeChatConfig,
      'CHAT',
      {
        allowWebSearch: context.allowWebSearch,
        currentChapter: context.currentChapter,
      }
    );

    let currentMsgId = uuidv4();
    let result = await session.sendMessage(
      { message: userText, attachments },
      updateMessage(currentMsgId)
    );

    const effectiveUserMsgId = userMsgId || uuidv4();
    if (!currentHistory.some((msg: ChatMessage) => msg.id === effectiveUserMsgId)) {
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

    const loopResult = await runToolCallLoop(
      context,
      currentHistory,
      currentMsgId,
      result,
      accumulatedToolBatches
    );

    currentHistory = loopResult.currentHistory;
    currentMsgId = loopResult.currentMsgId;
    result = loopResult.result;

    if (accumulatedToolBatches.length > 0) {
      const entryLabel =
        accumulatedToolBatches.length === 1
          ? accumulatedToolBatches[0].label
          : `AI tools: ${accumulatedToolBatches
              .map(
                (batch: {
                  batch_id: string;
                  label: string;
                  operation_count?: number;
                }) => batch.label
              )
              .join(', ')}`;

      await context.pushExternalHistoryEntry?.({
        label: entryLabel,
        onUndo: async () => {
          for (const batch of [...accumulatedToolBatches].reverse()) {
            await api.chat.undoToolBatch(batch.batch_id);
          }
          await context.refreshProjects();
          await context.refreshStory();
        },
        onRedo: async () => {
          for (const batch of accumulatedToolBatches) {
            await api.chat.redoToolBatch(batch.batch_id);
          }
          await context.refreshProjects();
          await context.refreshStory();
        },
      });
    }

    if (!context.stopSignalRef.current) {
      const botMessage = context.createAssistantMessage(currentMsgId, {
        text: result.text,
        thinking: result.thinking,
        functionCalls: normalizeFunctionCalls(result.functionCalls),
      });
      flushPendingMessageUpdates(
        context.pendingMessageUpdatesRef,
        context.updateFlushFrameRef,
        context.setChatMessages
      );
      upsertChatMessage(
        context.setChatMessages,
        ensureUniqueMessages,
        currentMsgId,
        botMessage
      );
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
    context.setChatMessages((prev: ChatMessage[]) => [...prev, errorMessage]);
  } finally {
    flushPendingMessageUpdates(
      context.pendingMessageUpdatesRef,
      context.updateFlushFrameRef,
      context.setChatMessages
    );
    context.setIsChatLoading(false);
    context.stopSignalRef.current = false;
  }
};
