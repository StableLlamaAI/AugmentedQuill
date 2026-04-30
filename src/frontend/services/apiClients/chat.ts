// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chat unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { ChatSession } from '../../types';
import {
  ChatApiMessage,
  ChatListResponse,
  ChatToolBatchMutationResponse,
  ChatToolExecutionResponse,
} from '../apiTypes';
import { fetchJson, postJson, deleteJson, projectEndpoint } from './shared';

export const createChatApi = (projectName: string) => ({
  list: async () => {
    const response = await fetchJson<ChatListResponse>(
      projectEndpoint(projectName, '/chats'),
      undefined,
      'Failed to list chats'
    );
    return response.chats ?? [];
  },

  load: async (id: string) => {
    return fetchJson<ChatSession>(
      projectEndpoint(projectName, `/chats/${id}`),
      undefined,
      'Failed to load chat'
    );
  },

  save: async (
    id: string,
    data: {
      name: string;
      messages: unknown[];
      systemPrompt: string;
      allowWebSearch?: boolean;
      scratchpad?: string;
    }
  ) => {
    return postJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chats/${id}`),
      data,
      'Failed to save chat'
    );
  },

  delete: async (id: string) => {
    return deleteJson<{ ok: boolean }>(
      projectEndpoint(projectName, `/chats/${id}`),
      'Failed to delete chat'
    );
  },

  deleteAll: async () => {
    return deleteJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/chats'),
      'Failed to delete all chats'
    );
  },

  executeTools: async (
    payload: {
      messages: ChatApiMessage[];
      active_chapter_id?: number;
      model_name?: string;
      chat_id?: string;
    },
    onProseChunk?: (chapId: number, writeMode: string, accumulated: string) => void,
    isStopped?: () => boolean
  ): Promise<ChatToolExecutionResponse> => {
    const res = await fetch(`/api/v1${projectEndpoint(projectName, '/chat/tools')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error('Failed to execute chat tools');
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Failed to execute chat tools: no response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Coalesce chunk callbacks to at most once per frame so prose preview
    // updates do not force token-rate React re-renders.
    let pendingProseChunk: {
      chapId: number;
      writeMode: string;
      accumulated: string;
    } | null = null;
    let proseFlushHandle: number | ReturnType<typeof setTimeout> | null = null;
    let proseFlushUsesRaf = false;

    const flushPendingProseChunk = () => {
      proseFlushHandle = null;
      if (!pendingProseChunk || !onProseChunk) return;
      const chunk = pendingProseChunk;
      pendingProseChunk = null;
      onProseChunk(chunk.chapId, chunk.writeMode, chunk.accumulated);
    };

    const scheduleProseChunkFlush = () => {
      if (!onProseChunk || proseFlushHandle !== null) return;

      if (typeof globalThis.requestAnimationFrame === 'function') {
        proseFlushUsesRaf = true;
        proseFlushHandle = globalThis.requestAnimationFrame(() => {
          flushPendingProseChunk();
        });
      } else {
        proseFlushUsesRaf = false;
        proseFlushHandle = setTimeout(() => {
          flushPendingProseChunk();
        }, 16);
      }
    };

    const cancelScheduledProseFlush = () => {
      if (proseFlushHandle === null) return;

      if (proseFlushUsesRaf && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(proseFlushHandle as number);
      } else {
        clearTimeout(proseFlushHandle as ReturnType<typeof setTimeout>);
      }
      proseFlushHandle = null;
    };

    try {
      while (true) {
        if (isStopped?.()) {
          // User stopped generation — close the stream so the backend disconnects.
          reader.cancel().catch(() => undefined);
          return { ok: false, appended_messages: [] };
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (isStopped?.()) {
          reader.cancel().catch(() => undefined);
          return { ok: false, appended_messages: [] };
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const event = JSON.parse(dataStr) as {
              type?: string;
              accumulated?: string;
              chap_id?: number;
              write_mode?: string;
              ok?: boolean;
              appended_messages?: ChatToolExecutionResponse['appended_messages'];
              mutations?: ChatToolExecutionResponse['mutations'];
              error?: string;
            };

            if (event.type === 'prose_chunk') {
              pendingProseChunk = {
                chapId: event.chap_id ?? 0,
                writeMode: event.write_mode ?? '',
                accumulated: event.accumulated ?? '',
              };
              scheduleProseChunkFlush();
            } else if (event.type === 'result') {
              cancelScheduledProseFlush();
              flushPendingProseChunk();
              return {
                ok: event.ok ?? true,
                appended_messages: event.appended_messages ?? [],
                mutations: event.mutations,
              };
            } else if (event.type === 'error') {
              throw new Error(event.error ?? 'Tool execution failed');
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue; // malformed SSE line – skip
            throw e;
          }
        }
      }
    } finally {
      cancelScheduledProseFlush();
      flushPendingProseChunk();
    }

    // Stream ended without a result event (should not normally happen).
    throw new Error('Failed to execute chat tools: stream ended unexpectedly');
  },

  undoToolBatch: async (batchId: string) => {
    return fetchJson<ChatToolBatchMutationResponse>(
      projectEndpoint(projectName, `/chat/tools/undo/${encodeURIComponent(batchId)}`),
      {
        method: 'POST',
      },
      'Failed to undo AI tool batch'
    );
  },

  redoToolBatch: async (batchId: string) => {
    return fetchJson<ChatToolBatchMutationResponse>(
      projectEndpoint(projectName, `/chat/tools/redo/${encodeURIComponent(batchId)}`),
      {
        method: 'POST',
      },
      'Failed to redo AI tool batch'
    );
  },

  getChapterBeforeContent: async (
    batchId: string,
    chapterId: number
  ): Promise<string | null> => {
    try {
      const res = await fetchJson<{ content: string }>(
        projectEndpoint(
          projectName,
          `/chat/tools/batches/${encodeURIComponent(batchId)}/chapter-before/${chapterId}`
        ),
        undefined,
        'Failed to get chapter before content'
      );
      return res.content ?? null;
    } catch {
      return null;
    }
  },
});

export const chatApi = createChatApi('');
