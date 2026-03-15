// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat context budgeting helpers so oversized histories are compacted before they hit upstream LLM limits.
 */

import { ChatMessage, ChatToolCall, LLMConfig } from '../../types';

export type ChatHistoryMessage = {
  role: 'user' | 'model' | 'assistant' | 'tool' | 'system';
  text?: string;
  parts?: Array<{ text?: string }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    args: string | Record<string, unknown>;
  }>;
};

export type ChatApiPreparedMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

export type ChatContextUsage = {
  enabled: boolean;
  estimatedTokens: number;
  contextWindowTokens: number;
  promptBudgetTokens: number;
  usageRatio: number;
  withinBudget: boolean;
  compactionApplied: boolean;
  compactedMessages: number;
};

export type PreparedChatContext = {
  messages: ChatApiPreparedMessage[];
  usage: ChatContextUsage;
};

type MutablePreparedMessage = ChatApiPreparedMessage;

const MIN_RESPONSE_RESERVE_TOKENS = 1024;
const EXTRA_PROMPT_MARGIN_TOKENS = 512;
const RECENT_NON_SYSTEM_MESSAGES_TO_KEEP = 6;
const RECENT_USER_MESSAGES_TO_KEEP = 2;
const MAX_TOOL_TEXT_PREVIEW = 480;
const MAX_TEXT_EXCERPT = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function estimateStringTokens(value: string): number {
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

function estimateToolCallsTokens(
  toolCalls?: MutablePreparedMessage['tool_calls']
): number {
  if (!toolCalls || toolCalls.length === 0) return 0;
  return toolCalls.reduce((total, toolCall) => {
    const args = toolCall.function.arguments || '';
    return (
      total +
      12 +
      estimateStringTokens(toolCall.function.name) +
      estimateStringTokens(args)
    );
  }, 0);
}

function estimatePromptTokens(messages: MutablePreparedMessage[]): number {
  return messages.reduce((total, message) => {
    const content = message.content || '';
    return (
      total +
      8 +
      estimateStringTokens(message.role) +
      estimateStringTokens(message.name || '') +
      estimateStringTokens(message.tool_call_id || '') +
      estimateStringTokens(content) +
      estimateToolCallsTokens(message.tool_calls)
    );
  }, 0);
}

function resolveContextWindowTokens(config: LLMConfig): number | null {
  const explicit = Number(config.contextWindowTokens);
  if (Number.isFinite(explicit) && explicit >= 2048) {
    return Math.round(explicit);
  }
  return null;
}

function buildPromptBudget(config: LLMConfig, contextWindowTokens: number): number {
  const requestedMaxTokens = Number(config.maxTokens);
  const responseReserve = Number.isFinite(requestedMaxTokens)
    ? clamp(
        Math.round(requestedMaxTokens),
        MIN_RESPONSE_RESERVE_TOKENS,
        Math.floor(contextWindowTokens / 3)
      )
    : MIN_RESPONSE_RESERVE_TOKENS * 2;

  return Math.max(
    MIN_RESPONSE_RESERVE_TOKENS,
    contextWindowTokens - responseReserve - EXTRA_PROMPT_MARGIN_TOKENS
  );
}

function summarizeText(value: string, maxLength: number): string {
  const compact = normalizeWhitespace(value);
  if (!compact) return '';
  if (compact.length <= maxLength) return compact;

  const headLength = Math.max(80, Math.floor(maxLength * 0.72));
  const tailLength = Math.max(40, maxLength - headLength - 5);
  const head = compact.slice(0, headLength).trimEnd();
  const tail = compact.slice(-tailLength).trimStart();
  return `${head} ... ${tail}`;
}

function summarizeStructuredValue(value: unknown, depth: number = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return summarizeText(value, depth === 0 ? MAX_TOOL_TEXT_PREVIEW : 180);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    const limit = depth === 0 ? 6 : 4;
    const trimmed = value
      .slice(0, limit)
      .map((entry) => summarizeStructuredValue(entry, depth + 1));
    if (value.length > limit) {
      trimmed.push({ omitted_items: value.length - limit });
    }
    return trimmed;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    'project_title',
    'project_type',
    'sourcebook_entry_count',
    'chapter_count',
    'book_count',
    'id',
    'title',
    'name',
    'summary',
    'description',
    'filename',
    'book_id',
    'content',
    'count',
    'results',
    'books',
    'chapters',
  ];

  const keys = Object.keys(record);
  const selectedKeys = preferredKeys.filter((key) => key in record);
  const fallbackKeys = keys
    .filter((key) => !selectedKeys.includes(key))
    .slice(0, Math.max(0, 8 - selectedKeys.length));
  const finalKeys = [...selectedKeys, ...fallbackKeys];
  const summarized: Record<string, unknown> = {};

  for (const key of finalKeys) {
    const current = record[key];
    if (key === 'chapters' && Array.isArray(current)) {
      summarized[key] = current.slice(0, 8).map((chapter) => {
        if (!chapter || typeof chapter !== 'object') {
          return summarizeStructuredValue(chapter, depth + 1);
        }

        const chapterRecord = chapter as Record<string, unknown>;
        return {
          id: chapterRecord.id,
          title: chapterRecord.title,
          summary: summarizeText(String(chapterRecord.summary || ''), 140),
          conflict_count: Array.isArray(chapterRecord.conflicts)
            ? chapterRecord.conflicts.length
            : undefined,
        };
      });
      if (current.length > 8) {
        summarized.chapter_count = current.length;
      }
      continue;
    }

    if (key === 'books' && Array.isArray(current)) {
      summarized[key] = current.slice(0, 5).map((book) => {
        if (!book || typeof book !== 'object') {
          return summarizeStructuredValue(book, depth + 1);
        }
        const bookRecord = book as Record<string, unknown>;
        return {
          id: bookRecord.id,
          title: bookRecord.title,
          chapter_count: Array.isArray(bookRecord.chapters)
            ? bookRecord.chapters.length
            : undefined,
        };
      });
      if (current.length > 5) {
        summarized.book_count = current.length;
      }
      continue;
    }

    summarized[key] = summarizeStructuredValue(current, depth + 1);
  }

  const omittedKeys = keys.filter((key) => !finalKeys.includes(key));
  if (omittedKeys.length > 0) {
    summarized.omitted_keys = omittedKeys.length;
  }

  return summarized;
}

function summarizeToolContent(
  toolName: string | undefined,
  content: string | null
): string | null {
  if (!content) return content;
  const trimmed = content.trim();
  if (!trimmed) return content;

  const label = toolName
    ? `[Earlier tool result: ${toolName}]`
    : '[Earlier tool result]';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const summarized = summarizeStructuredValue(parsed);
    const serialized = JSON.stringify(summarized);
    if (serialized.length < trimmed.length) {
      return `${label} ${serialized}`;
    }
  } catch {
    // Tool output is not structured JSON; fall back to text compaction.
  }

  if (trimmed.length <= MAX_TOOL_TEXT_PREVIEW) {
    return trimmed;
  }

  return `${label} ${summarizeText(trimmed, MAX_TOOL_TEXT_PREVIEW)}`;
}

function summarizeToolCall(
  toolCall: NonNullable<MutablePreparedMessage['tool_calls']>[number]
) {
  const args = toolCall.function.arguments || '';
  const compactArgs = summarizeText(args, 180);
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: compactArgs,
    },
  };
}

function summarizeConversationMessage(message: MutablePreparedMessage): string | null {
  const roleLabel = message.role === 'assistant' ? 'assistant' : 'user';
  const content = summarizeText(message.content || '', MAX_TEXT_EXCERPT);
  if (!content) return message.content;
  if (content === (message.content || '')) return message.content;
  return `[Earlier ${roleLabel} message] ${content}`;
}

function buildPreparedMessages(
  systemInstruction: string,
  history: ChatHistoryMessage[],
  userMessageText?: string
): MutablePreparedMessage[] {
  const messages: MutablePreparedMessage[] = [
    { role: 'system', content: systemInstruction },
    ...history.map((historyMessage) => {
      const prepared: MutablePreparedMessage = {
        role: historyMessage.role === 'model' ? 'assistant' : historyMessage.role,
        content:
          historyMessage.text ||
          (historyMessage.parts && historyMessage.parts[0]?.text) ||
          '',
      };

      if (historyMessage.name) prepared.name = historyMessage.name;
      if (historyMessage.tool_call_id)
        prepared.tool_call_id = historyMessage.tool_call_id;
      if (historyMessage.tool_calls) {
        prepared.tool_calls = historyMessage.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments:
              typeof toolCall.args === 'string'
                ? toolCall.args
                : JSON.stringify(toolCall.args),
          },
        }));
      }

      return prepared;
    }),
  ];

  if (userMessageText) {
    messages.push({ role: 'user', content: userMessageText });
  }

  return messages;
}

function getRecentIndexes(messages: MutablePreparedMessage[]): {
  recentNonSystem: Set<number>;
  recentUsers: Set<number>;
} {
  const recentNonSystem = new Set<number>();
  const recentUsers = new Set<number>();

  for (let index = messages.length - 1; index >= 0; index--) {
    if (
      messages[index].role !== 'system' &&
      recentNonSystem.size < RECENT_NON_SYSTEM_MESSAGES_TO_KEEP
    ) {
      recentNonSystem.add(index);
    }
    if (
      messages[index].role === 'user' &&
      recentUsers.size < RECENT_USER_MESSAGES_TO_KEEP
    ) {
      recentUsers.add(index);
    }
    if (
      recentNonSystem.size >= RECENT_NON_SYSTEM_MESSAGES_TO_KEEP &&
      recentUsers.size >= RECENT_USER_MESSAGES_TO_KEEP
    ) {
      break;
    }
  }

  return { recentNonSystem, recentUsers };
}

function compactPreparedMessages(
  originalMessages: MutablePreparedMessage[],
  promptBudgetTokens: number
): { messages: MutablePreparedMessage[]; compactedMessages: number } {
  const messages = originalMessages.map((message) => ({
    ...message,
    tool_calls: message.tool_calls?.map((toolCall) => ({
      ...toolCall,
      function: { ...toolCall.function },
    })),
  }));

  let compactedMessages = 0;
  let estimatedTokens = estimatePromptTokens(messages);
  if (estimatedTokens <= promptBudgetTokens) {
    return { messages, compactedMessages };
  }

  const { recentNonSystem, recentUsers } = getRecentIndexes(messages);

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (message.role !== 'tool' || recentNonSystem.has(index)) continue;
    const summarized = summarizeToolContent(message.name, message.content);
    if (summarized && summarized !== message.content) {
      message.content = summarized;
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (message.role !== 'tool') continue;
    const summarized = summarizeToolContent(message.name, message.content);
    if (summarized && summarized !== message.content) {
      message.content = summarized;
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (
      message.role !== 'assistant' ||
      recentNonSystem.has(index) ||
      !message.tool_calls?.length
    ) {
      continue;
    }

    const summarizedCalls = message.tool_calls.map(summarizeToolCall);
    const callsChanged =
      JSON.stringify(summarizedCalls) !== JSON.stringify(message.tool_calls);
    if (callsChanged) {
      message.tool_calls = summarizedCalls;
      if (!message.content) {
        message.content = `[Earlier tool planning] ${summarizedCalls.map((call) => call.function.name).join(', ')}`;
      }
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (message.role !== 'assistant' || !message.tool_calls?.length) {
      continue;
    }

    const summarizedCalls = message.tool_calls.map(summarizeToolCall);
    const callsChanged =
      JSON.stringify(summarizedCalls) !== JSON.stringify(message.tool_calls);
    if (callsChanged) {
      message.tool_calls = summarizedCalls;
      if (!message.content) {
        message.content = `[Earlier tool planning] ${summarizedCalls.map((call) => call.function.name).join(', ')}`;
      }
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (
      recentNonSystem.has(index) ||
      message.role === 'system' ||
      message.role === 'tool'
    ) {
      continue;
    }
    if (message.role === 'user' && recentUsers.has(index)) continue;

    const summarized = summarizeConversationMessage(message);
    if (summarized && summarized !== message.content) {
      message.content = summarized;
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  for (
    let index = 1;
    index < messages.length && estimatedTokens > promptBudgetTokens;
    index++
  ) {
    const message = messages[index];
    if (message.role !== 'tool' || recentNonSystem.has(index)) continue;
    const fallback = message.name
      ? `[Earlier tool result omitted to stay within context budget: ${message.name}]`
      : '[Earlier tool result omitted to stay within context budget]';
    if (message.content !== fallback) {
      message.content = fallback;
      compactedMessages += 1;
      estimatedTokens = estimatePromptTokens(messages);
    }
  }

  return { messages, compactedMessages };
}

export function prepareChatContext(params: {
  systemInstruction: string;
  history: ChatHistoryMessage[];
  config: LLMConfig;
  userMessageText?: string;
}): PreparedChatContext {
  const { systemInstruction, history, config, userMessageText } = params;
  const contextWindowTokens = resolveContextWindowTokens(config);
  const preparedMessages = buildPreparedMessages(
    systemInstruction,
    history,
    userMessageText
  );
  if (!contextWindowTokens) {
    return {
      messages: preparedMessages,
      usage: {
        enabled: false,
        estimatedTokens: 0,
        contextWindowTokens: 0,
        promptBudgetTokens: 0,
        usageRatio: 0,
        withinBudget: true,
        compactionApplied: false,
        compactedMessages: 0,
      },
    };
  }

  const promptBudgetTokens = buildPromptBudget(config, contextWindowTokens);
  const compacted = compactPreparedMessages(preparedMessages, promptBudgetTokens);
  const estimatedTokens = estimatePromptTokens(compacted.messages);

  return {
    messages: compacted.messages,
    usage: {
      enabled: true,
      estimatedTokens,
      contextWindowTokens,
      promptBudgetTokens,
      usageRatio: clamp(estimatedTokens / Math.max(1, contextWindowTokens), 0, 1.5),
      withinBudget: estimatedTokens <= promptBudgetTokens,
      compactionApplied: compacted.compactedMessages > 0,
      compactedMessages: compacted.compactedMessages,
    },
  };
}

export function estimateChatContextUsage(params: {
  systemInstruction: string;
  messages: ChatMessage[];
  config: LLMConfig;
}): ChatContextUsage {
  return prepareChatContext({
    systemInstruction: params.systemInstruction,
    history: params.messages,
    config: params.config,
  }).usage;
}
