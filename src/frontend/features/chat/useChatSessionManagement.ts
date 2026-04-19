// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use chat session management unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
  startTransition,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ChatMessage, ChatSession } from '../../types';
import { api } from '../../services/api';

type UseChatSessionManagementParams = {
  storyId: string;
  getSystemPrompt: () => string;
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  isChatLoading: boolean;
};

/** Custom React hook that manages chat session management. */
export function useChatSessionManagement({
  storyId,
  getSystemPrompt,
  chatMessages,
  setChatMessages,
  isChatLoading,
}: UseChatSessionManagementParams): {
  chatHistoryList: ChatSession[];
  setChatHistoryList: Dispatch<SetStateAction<ChatSession[]>>;
  currentChatId: string | null;
  setCurrentChatId: Dispatch<SetStateAction<string | null>>;
  isIncognito: boolean;
  setIsIncognito: Dispatch<SetStateAction<boolean>>;
  allowWebSearch: boolean;
  setAllowWebSearch: Dispatch<SetStateAction<boolean>>;
  systemPrompt: string;
  setSystemPrompt: Dispatch<SetStateAction<string>>;
  scratchpad: string;
  setScratchpad: Dispatch<SetStateAction<string>>;
  incognitoSessions: ChatSession[];
  setIncognitoSessions: Dispatch<SetStateAction<ChatSession[]>>;
  refreshChatList: () => Promise<void>;
  handleNewChat: (incognito?: boolean) => void;
  handleSelectChat: (id: string) => Promise<void>;
  handleDeleteChat: (id: string) => Promise<void>;
  handleDeleteAllChats: () => Promise<void>;
  onUpdateScratchpad: (content: string) => void;
  onDeleteScratchpad: () => void;
} {
  const [chatHistoryList, setChatHistoryList] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isIncognito, setIsIncognito] = useState(false);
  const [allowWebSearch, setAllowWebSearch] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(getSystemPrompt());
  const [scratchpad, setScratchpad] = useState('');
  const [incognitoSessions, setIncognitoSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    setSystemPrompt(getSystemPrompt());
  }, [storyId, getSystemPrompt]);

  const refreshChatList = useCallback(async () => {
    try {
      const chats = await api.chat.list();
      setChatHistoryList(chats);
    } catch (error) {
      console.error('Failed to list chats', error);
    }
  }, []);

  const handleNewChat = useCallback(
    (incognito: boolean = false) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newId = incognito ? uuidv4() : `chat-${timestamp}`;
      if (incognito) {
        const newSession: ChatSession = {
          id: newId,
          name: 'Incognito Chat',
          messages: [],
          systemPrompt: getSystemPrompt(),
          isIncognito: true,
          allowWebSearch: false,
          scratchpad: '',
        };
        setIncognitoSessions((prev: ChatSession[]) => [newSession, ...prev]);
        setChatMessages([]);
        setIsIncognito(true);
        setCurrentChatId(newId);
        setAllowWebSearch(false);
        setScratchpad('');
      } else {
        setChatMessages([]);
        setIsIncognito(false);
        setCurrentChatId(newId);
        setAllowWebSearch(false);
        setScratchpad('');
      }
      setSystemPrompt(getSystemPrompt());
    },
    [getSystemPrompt, setChatMessages]
  );

  const handleSelectChat = useCallback(
    async (id: string) => {
      const incognito = incognitoSessions.find(
        (session: ChatSession) => session.id === id
      );
      if (incognito) {
        setChatMessages(incognito.messages || []);
        setCurrentChatId(id);
        setIsIncognito(true);
        if (incognito.systemPrompt) {
          setSystemPrompt(incognito.systemPrompt);
        }
        setAllowWebSearch(incognito.allowWebSearch || false);
        return;
      }

      try {
        const chat = await api.chat.load(id);
        if (chat) {
          startTransition(() => {
            setChatMessages(chat.messages || []);
            setCurrentChatId(id);
            setIsIncognito(false);
            setScratchpad(chat.scratchpad || '');
            if (chat.systemPrompt) {
              setSystemPrompt(chat.systemPrompt);
            }
            setAllowWebSearch(chat.allowWebSearch || false);
          });
        }
      } catch (error) {
        console.error('Failed to load chat', error);
      }
    },
    [incognitoSessions, setChatMessages]
  );

  const handleUpdateScratchpad = useCallback(
    (content: string) => {
      setScratchpad(content);

      if (isIncognito && currentChatId) {
        setIncognitoSessions((prev: ChatSession[]) =>
          prev.map((session: ChatSession) =>
            session.id === currentChatId ? { ...session, scratchpad: content } : session
          )
        );
      }
    },
    [currentChatId, isIncognito]
  );

  const handleDeleteScratchpad = useCallback(() => {
    handleUpdateScratchpad('');
  }, [handleUpdateScratchpad]);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      if (incognitoSessions.some((session: ChatSession) => session.id === id)) {
        setIncognitoSessions((prev: ChatSession[]) =>
          prev.filter((session: ChatSession) => session.id !== id)
        );
        if (currentChatId === id) {
          handleNewChat();
        }
        return;
      }

      try {
        await api.chat.delete(id);
        await refreshChatList();
        if (currentChatId === id) {
          handleNewChat();
        }
      } catch (error) {
        console.error('Failed to delete chat', error);
      }
    },
    [incognitoSessions, currentChatId, handleNewChat, refreshChatList]
  );

  const handleDeleteAllChats = useCallback(async () => {
    if (
      !confirm(
        'Are you sure you want to delete ALL chats (including incognito)? This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      setIncognitoSessions([]);
      await api.chat.deleteAll();
      await refreshChatList();
      handleNewChat();
    } catch (error) {
      console.error('Failed to delete all chats', error);
    }
  }, [refreshChatList, handleNewChat]);

  useEffect(() => {
    if (storyId && !currentChatId && !isIncognito) {
      const loadInitialChats = async () => {
        try {
          const chats = await api.chat.list();
          startTransition(() => setChatHistoryList(chats));
          if (chats.length > 0) {
            await handleSelectChat(chats[0].id);
          } else {
            handleNewChat(false);
          }
        } catch (error) {
          console.error('Failed to load initial chats', error);
        }
      };
      loadInitialChats();
    }
  }, [storyId, currentChatId, isIncognito, handleSelectChat, handleNewChat]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (currentChatId && chatMessages.length > 0 && !isChatLoading) {
      if (isIncognito) {
        const firstUserMsg = chatMessages.find(
          (message: ChatMessage) => message.role === 'user'
        );
        const name = firstUserMsg?.text?.substring(0, 40) || 'Incognito Chat';
        setIncognitoSessions((prev: ChatSession[]) =>
          prev.map((session: ChatSession) =>
            session.id === currentChatId
              ? {
                  ...session,
                  name,
                  messages: chatMessages,
                  systemPrompt,
                  allowWebSearch,
                  scratchpad,
                }
              : session
          )
        );
      } else {
        timeout = setTimeout(async () => {
          try {
            const firstUserMsg = chatMessages.find(
              (message: ChatMessage) => message.role === 'user'
            );
            const name = firstUserMsg?.text?.substring(0, 40) || 'Untitled Chat';
            await api.chat.save(currentChatId, {
              name,
              messages: chatMessages,
              systemPrompt,
              allowWebSearch,
              scratchpad,
            });
            refreshChatList();
          } catch (error) {
            console.error('Failed to auto-save chat', error);
          }
        }, 2000);
      }
    }

    return () => clearTimeout(timeout);
  }, [
    chatMessages,
    currentChatId,
    isIncognito,
    systemPrompt,
    scratchpad,
    isChatLoading,
    allowWebSearch,
    refreshChatList,
  ]);

  return {
    chatHistoryList,
    setChatHistoryList,
    currentChatId,
    setCurrentChatId,
    isIncognito,
    setIsIncognito,
    allowWebSearch,
    setAllowWebSearch,
    systemPrompt,
    setSystemPrompt,
    scratchpad,
    setScratchpad,
    incognitoSessions,
    setIncognitoSessions,
    refreshChatList,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleDeleteAllChats,
    onUpdateScratchpad: handleUpdateScratchpad,
    onDeleteScratchpad: handleDeleteScratchpad,
  };
}
