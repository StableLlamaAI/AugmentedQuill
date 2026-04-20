// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Zustand store for all chat runtime state – messages, session metadata,
 * and user preferences.  Moving this out of App-level useState ensures that
 * chat updates (including every streaming token) never trigger a re-render of
 * the root App component or unrelated subtrees such as the Editor and Sidebar.
 *
 * Only components that subscribe to a slice of this store (e.g. AppChatPanel)
 * will re-render when that slice changes.  App.tsx itself must not import any
 * store selectors from this file – it may only call getState()-based writes
 * through stable callbacks returned by useAppChatRuntime.
 */

import { create, StoreApi } from 'zustand';
import type { ChatMessage, ChatSession } from '../types';
import type { SessionMutation } from '../features/chat/components/MutationTags';

// ---------------------------------------------------------------------------
// Helper – resolves functional updaters the same way React setState does.
// ---------------------------------------------------------------------------

function resolve<T>(valueOrUpdater: T | ((prev: T) => T), prev: T): T {
  return typeof valueOrUpdater === 'function'
    ? (valueOrUpdater as (p: T) => T)(prev)
    : valueOrUpdater;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ChatStoreState {
  // ── Frequently changing (every streaming token) ─────────────────────────
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  sessionMutations: SessionMutation[];

  // ── Session management ────────────────────────────────────────────────────
  chatHistoryList: ChatSession[];
  currentChatId: string | null;
  incognitoSessions: ChatSession[];

  // ── User preferences (rarely changing) ───────────────────────────────────
  isIncognito: boolean;
  allowWebSearch: boolean;
  systemPrompt: string;
  scratchpad: string;

  // ── Actions ───────────────────────────────────────────────────────────────
  setChatMessages: (
    v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])
  ) => void;
  setIsChatLoading: (v: boolean) => void;
  setSessionMutations: (
    v: SessionMutation[] | ((prev: SessionMutation[]) => SessionMutation[])
  ) => void;
  setChatHistoryList: (
    v: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])
  ) => void;
  setCurrentChatId: (id: string | null) => void;
  setIncognitoSessions: (
    v: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])
  ) => void;
  setIsIncognito: (v: boolean) => void;
  setAllowWebSearch: (v: boolean) => void;
  setSystemPrompt: (v: string | ((prev: string) => string)) => void;
  setScratchpad: (v: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatStoreState>()(
  (set: StoreApi<ChatStoreState>['setState']) => ({
    chatMessages: [],
    isChatLoading: false,
    sessionMutations: [],
    chatHistoryList: [],
    currentChatId: null,
    incognitoSessions: [],
    isIncognito: false,
    allowWebSearch: false,
    systemPrompt: '',
    scratchpad: '',

    setChatMessages: (v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) =>
      set((s: ChatStoreState) => ({ chatMessages: resolve(v, s.chatMessages) })),
    setIsChatLoading: (v: boolean) => set(() => ({ isChatLoading: v })),
    setSessionMutations: (
      v: SessionMutation[] | ((prev: SessionMutation[]) => SessionMutation[])
    ) =>
      set((s: ChatStoreState) => ({
        sessionMutations: resolve(v, s.sessionMutations),
      })),
    setChatHistoryList: (v: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) =>
      set((s: ChatStoreState) => ({ chatHistoryList: resolve(v, s.chatHistoryList) })),
    setCurrentChatId: (id: string | null) => set(() => ({ currentChatId: id })),
    setIncognitoSessions: (
      v: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])
    ) =>
      set((s: ChatStoreState) => ({
        incognitoSessions: resolve(v, s.incognitoSessions),
      })),
    setIsIncognito: (v: boolean) => set(() => ({ isIncognito: v })),
    setAllowWebSearch: (v: boolean) => set(() => ({ allowWebSearch: v })),
    setSystemPrompt: (v: string | ((prev: string) => string)) =>
      set((s: ChatStoreState) => ({ systemPrompt: resolve(v, s.systemPrompt) })),
    setScratchpad: (v: string) => set(() => ({ scratchpad: v })),
  })
);
