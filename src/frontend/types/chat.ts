// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Chat-related types – messages, sessions, tool calls, and attachments.
 */

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;
  encoding?: 'utf-8' | 'base64';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  thinking?: string;
  isError?: boolean;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  traceback?: string;
  attachments?: ChatAttachment[];
}

export interface ChatToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  messages?: ChatMessage[];
  systemPrompt?: string;
  isIncognito?: boolean;
  allowWebSearch?: boolean;
  scratchpad?: string;
  editing_scratchpad?: string;
  projectContextRevision?: number | null;
}
