// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Right-side chat panel wrapper that conditionally renders the Chat component in a slide-in aside.
 * Extracted from AppMainLayout to isolate the chat panel layout concern.
 */

import React, { useMemo } from 'react';

import { Chat } from '../chat/Chat';
import { ChatProvider } from '../chat/ChatContext';
import { MainChatControls } from './layoutControlTypes';
import type { AppTheme } from '../../types';

export interface AppChatPanelProps {
  chatControls: MainChatControls;
  currentTheme: AppTheme;
  storyLanguage: string;
}

export const AppChatPanel: React.FC<AppChatPanelProps> = React.memo(
  ({ chatControls, currentTheme, storyLanguage }: AppChatPanelProps) => {
    const {
      isChatOpen,
      chatMessages,
      isChatLoading,
      isChatAvailable,
      activeChatConfig,
      systemPrompt,
      handleSendMessage,
      handleStopChat,
      handleRegenerate,
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
    } = chatControls;

    // Memoize merged session list so Chat's React.memo isn't defeated by a
    // new array reference on every parent render.
    const chatSessions = useMemo(
      () => [...incognitoSessions, ...(chatHistoryList ?? [])],
      [incognitoSessions, chatHistoryList]
    );

    if (!isChatOpen) return null;

    return (
      <aside
        id="aq-chat"
        aria-label="AI Chat Assistant"
        className="fixed inset-y-0 right-0 top-14 w-full md:w-[var(--sidebar-width)] flex-shrink-0 flex flex-col z-40 shadow-xl transition duration-300 ease-in-out md:relative md:top-auto md:bottom-auto md:z-20 md:h-full"
      >
        <ChatProvider
          value={{
            isChatOpen,
            messages: chatMessages,
            isLoading: isChatLoading,
            isModelAvailable: isChatAvailable,
            activeChatConfig,
            systemPrompt,
            onSendMessage: handleSendMessage,
            onStop: handleStopChat,
            onRegenerate: handleRegenerate,
            onEditMessage: handleEditMessage,
            onDeleteMessage: handleDeleteMessage,
            onUpdateSystemPrompt: setSystemPrompt,
            onSwitchProject: handleLoadProject,
            sessions: chatSessions,
            currentSessionId: currentChatId,
            isIncognito,
            onSelectSession: handleSelectChat,
            onNewSession: handleNewChat,
            onDeleteSession: handleDeleteChat,
            onDeleteAllSessions: handleDeleteAllChats,
            onToggleIncognito: setIsIncognito,
            allowWebSearch,
            onToggleWebSearch: setAllowWebSearch,
            scratchpad,
            onUpdateScratchpad,
            onDeleteScratchpad,
            sessionMutations,
            onMutationClick,
            storyLanguage,
            currentTheme,
          }}
        >
          <Chat />
        </ChatProvider>
      </aside>
    );
  }
);
