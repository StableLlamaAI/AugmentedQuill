// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chat unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, AppTheme, ChatSession } from '../../types';
import {
  Loader2,
  Bot,
  User,
  RefreshCw,
  Trash2,
  Edit2,
  Save,
  X,
  Settings2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { MarkdownView } from '../editor/MarkdownView';
import { CollapsibleToolSection } from './components/CollapsibleToolSection';
import { WebSearchResults, VisitPageResult } from './components/ToolResultViews';
import { ChatHeader } from './components/ChatHeader';
import { ChatHistoryPanel } from './components/ChatHistoryPanel';
import { ChatComposer } from './components/ChatComposer';

interface ChatProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isModelAvailable?: boolean;
  systemPrompt: string;
  onSendMessage: (text: string) => void;
  onStop?: () => void;
  onRegenerate: () => void;
  onEditMessage: (id: string, newText: string) => void;
  onDeleteMessage: (id: string) => void;
  onUpdateSystemPrompt: (newPrompt: string) => void;
  onSwitchProject?: (id: string) => void;
  theme?: AppTheme;
  sessions: ChatSession[];
  currentSessionId: string | null;
  isIncognito: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: (incognito?: boolean) => void;
  onDeleteSession: (id: string) => void;
  onDeleteAllSessions?: () => void;
  onToggleIncognito: (val: boolean) => void;
  allowWebSearch: boolean;
  onToggleWebSearch: (val: boolean) => void;
}

type ToolCallArgumentsProps = {
  args: unknown;
};

const ToolCallArguments: React.FC<ToolCallArgumentsProps> = React.memo(({ args }) => {
  const formattedArgs = useMemo(() => {
    if (typeof args === 'string') return args;

    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }, [args]);

  return (
    <div className="whitespace-pre-wrap break-all opacity-80 max-h-[300px] overflow-y-auto custom-scrollbar">
      {formattedArgs}
    </div>
  );
});

export const Chat: React.FC<ChatProps> = ({
  messages,
  isLoading,
  isModelAvailable = true,
  systemPrompt,
  onSendMessage,
  onStop,
  onRegenerate,
  onEditMessage,
  onDeleteMessage,
  onUpdateSystemPrompt,
  onSwitchProject,
  theme = 'mixed',
  sessions,
  currentSessionId,
  isIncognito,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteAllSessions,
  onToggleIncognito,
  allowWebSearch,
  onToggleWebSearch,
}) => {
  const chatDisabledReason =
    'Chat is unavailable because no working CHAT model is configured.';

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollCheckFrameRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);

  const isLight = theme === 'light';
  const bgMain = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-900';
  const borderMain = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const textMain = isLight ? 'text-brand-gray-800' : 'text-brand-gray-400';
  const headerBg = isLight ? 'bg-brand-gray-100' : 'bg-brand-gray-900';
  const msgUserBg = isLight
    ? 'bg-blue-600 text-white'
    : 'bg-blue-900/40 text-blue-300 border border-blue-800/50';
  const msgBotBg = isLight
    ? 'bg-brand-gray-50 border border-brand-gray-200 shadow-sm'
    : 'bg-brand-gray-800/50 border border-brand-gray-700 shadow-sm';
  const inputBg = isLight
    ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-900'
    : 'bg-brand-gray-950 border-brand-gray-800 text-brand-gray-300';

  const handleScroll = () => {
    if (scrollCheckFrameRef.current !== null) return;

    scrollCheckFrameRef.current = requestAnimationFrame(() => {
      scrollCheckFrameRef.current = null;
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Consider "at bottom" if within 10px of the actual bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
        isAtBottomRef.current = isAtBottom;
      }
    });
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight } = scrollContainerRef.current;
    scrollContainerRef.current.scrollTo({
      top: scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      // Use 'auto' for streaming (isLoading) to avoid laggy smooth scroll
      scrollToBottom(isLoading ? 'auto' : 'smooth');
    }
  }, [messages, isLoading, editingMessageId]);

  // Always scroll to bottom on session switch
  useEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom('auto');
  }, [currentSessionId]);

  useEffect(() => {
    setTempSystemPrompt(systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    return () => {
      if (scrollCheckFrameRef.current !== null) {
        cancelAnimationFrame(scrollCheckFrameRef.current);
      }
    };
  }, []);

  const handleSubmit = (text: string) => {
    if (isLoading || !isModelAvailable) return;

    onSendMessage(text);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Force scroll to bottom on user message
    isAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('auto'), 0);
  };

  const startEditing = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.text);
  };

  const saveEdit = (id: string) => {
    if (editContent.trim()) {
      onEditMessage(id, editContent.trim());
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSystemPromptSave = () => {
    onUpdateSystemPrompt(tempSystemPrompt);
    setShowSystemPrompt(false);
  };

  const lastMessage = messages[messages.length - 1];
  const canRegenerate = !isLoading && isModelAvailable && lastMessage?.role === 'model';

  return (
    <div
      className={`flex flex-col h-full border-l ${bgMain} ${borderMain} ${textMain}`}
    >
      <ChatHeader
        title={isIncognito ? 'Incognito Chat' : 'Writing Partner'}
        headerBg={headerBg}
        currentSessionId={currentSessionId}
        isIncognito={isIncognito}
        isDisabled={!isModelAvailable}
        disabledReason={chatDisabledReason}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        showSystemPrompt={showSystemPrompt}
        setShowSystemPrompt={setShowSystemPrompt}
        allowWebSearch={allowWebSearch}
        onDeleteSession={onDeleteSession}
        onNewSession={onNewSession}
        onToggleWebSearch={onToggleWebSearch}
      />

      {showHistory && (
        <ChatHistoryPanel
          sessions={sessions}
          currentSessionId={currentSessionId}
          isDisabled={!isModelAvailable}
          disabledReason={chatDisabledReason}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onDeleteAllSessions={onDeleteAllSessions}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSystemPrompt && (
        <div
          className={`p-4 border-b animate-in slide-in-from-top-2 ${bgMain} ${borderMain}`}
        >
          <label className="block text-xs font-medium text-brand-gray-500 uppercase tracking-wider mb-2">
            System Instruction
          </label>
          <textarea
            value={tempSystemPrompt}
            onChange={(e) => setTempSystemPrompt(e.target.value)}
            className={`w-full h-32 rounded-md p-3 text-sm focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none mb-3 border ${inputBg}`}
            placeholder="Define the AI's persona and rules..."
            disabled={!isModelAvailable}
            title={!isModelAvailable ? chatDisabledReason : 'System Instruction'}
          />
          <div className="flex justify-end space-x-2">
            <Button
              theme={theme}
              size="sm"
              variant="ghost"
              onClick={() => setShowSystemPrompt(false)}
              disabled={!isModelAvailable}
              title={!isModelAvailable ? chatDisabledReason : 'Cancel'}
            >
              Cancel
            </Button>
            <Button
              theme={theme}
              size="sm"
              variant="primary"
              onClick={handleSystemPromptSave}
              disabled={!isModelAvailable}
              title={!isModelAvailable ? chatDisabledReason : 'Update Persona'}
            >
              Update Persona
            </Button>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto p-4 space-y-4 ${
          isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950/30'
        }`}
      >
        {!isModelAvailable && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              isLight
                ? 'border-amber-500/40 bg-amber-100/50 text-amber-700'
                : 'border-amber-500/40 bg-amber-900/20 text-amber-300'
            }`}
          >
            {chatDisabledReason}
          </div>
        )}

        {messages.length === 0 && !showSystemPrompt && (
          <div className="text-center text-brand-gray-500 mt-10 p-4">
            <Bot className="mx-auto mb-3 opacity-50" size={40} />
            <p className="text-sm">
              I'm your AI co-author. Ask me to write, edit, or brainstorm ideas for your
              story!
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`group flex items-start space-x-3 ${
              msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border mt-1 ${
                msg.role === 'user'
                  ? 'bg-blue-100 border-blue-200 text-blue-700'
                  : msg.role === 'tool'
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                    : isLight
                      ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-500'
                      : 'bg-brand-gray-800 border-brand-gray-700 text-brand-gray-400'
              }`}
            >
              {msg.role === 'user' ? (
                <User size={16} />
              ) : msg.role === 'tool' ? (
                <Settings2 size={16} />
              ) : (
                <Bot size={16} />
              )}
            </div>

            <div className={'flex-1 max-w-[85%] relative'}>
              {editingMessageId === msg.id ? (
                <div
                  className={`border rounded-lg p-3 shadow-lg ${
                    isLight
                      ? 'bg-brand-gray-50 border-brand-gray-200'
                      : 'bg-brand-gray-800 border-brand-gray-600'
                  }`}
                >
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className={`w-full text-sm p-2 rounded border focus:outline-none focus:border-brand-500 min-h-[100px] ${inputBg}`}
                  />
                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      onClick={cancelEdit}
                      className="p-1 text-brand-gray-400 hover:text-brand-gray-600"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => saveEdit(msg.id)}
                      className="p-1 text-brand-500 hover:opacity-80"
                    >
                      <Save size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-lg p-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? msgUserBg
                      : msg.role === 'tool'
                        ? msg.name === 'web_search' ||
                          msg.name === 'wikipedia_search' ||
                          msg.name === 'visit_page'
                          ? 'bg-blue-500/5 border border-blue-500/30 shadow-sm'
                          : 'bg-blue-500/5 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-mono text-xs'
                        : msgBotBg
                  }`}
                >
                  {msg.role === 'tool' ? (
                    <>
                      {msg.name === 'web_search' || msg.name === 'wikipedia_search' ? (
                        <WebSearchResults content={msg.text} name={msg.name} />
                      ) : msg.name === 'visit_page' ? (
                        <VisitPageResult content={msg.text} />
                      ) : (
                        <CollapsibleToolSection title={`Tool Result: ${msg.name}`}>
                          <MarkdownView content={msg.text} />
                          {msg.name === 'create_project' &&
                            msg.text.includes('Project created:') &&
                            onSwitchProject && (
                              <div className="mt-2">
                                <Button
                                  theme={theme}
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    if (!isModelAvailable) return;
                                    // Extract project name from either raw text or JSON message field
                                    let projectName = '';
                                    try {
                                      const parsed = JSON.parse(msg.text);
                                      const innerMsg = parsed.message || '';
                                      const match =
                                        innerMsg.match(/Project created: (.+)/);
                                      if (match) projectName = match[1];
                                    } catch (e) {
                                      /* ignore */
                                    }

                                    if (!projectName) {
                                      const match = msg.text.match(
                                        /Project created: ([^"}\s]+)/
                                      );
                                      if (match) projectName = match[1];
                                    }

                                    if (projectName) {
                                      onSwitchProject(projectName.trim());
                                    }
                                  }}
                                  icon={<ArrowRight size={14} />}
                                  disabled={!isModelAvailable}
                                  title={
                                    !isModelAvailable
                                      ? chatDisabledReason
                                      : 'Switch to New Project'
                                  }
                                >
                                  Switch to New Project
                                </Button>
                              </div>
                            )}
                        </CollapsibleToolSection>
                      )}
                    </>
                  ) : (
                    <>
                      {msg.thinking && (
                        <CollapsibleToolSection
                          title="Thinking Process"
                          defaultExpanded={isLoading && i === messages.length - 1}
                        >
                          <div className="text-xs italic text-brand-gray-500 whitespace-pre-wrap">
                            {msg.thinking}
                          </div>
                        </CollapsibleToolSection>
                      )}
                      <MarkdownView content={msg.text} />
                      {msg.traceback && (
                        <CollapsibleToolSection
                          title="Stack Trace"
                          defaultExpanded={false}
                        >
                          <div className="text-[10px] font-mono bg-black/5 dark:bg-black/40 p-2 rounded overflow-x-auto whitespace-pre border border-black/10 dark:border-white/10 text-red-600 dark:text-red-400">
                            {msg.traceback}
                          </div>
                        </CollapsibleToolSection>
                      )}
                      {msg.tool_calls && msg.tool_calls.length > 0 && (
                        <CollapsibleToolSection
                          title={`${msg.tool_calls.length} Tool Call${
                            msg.tool_calls.length > 1 ? 's' : ''
                          }`}
                        >
                          <div className="space-y-2">
                            {msg.tool_calls.map((tc, i) => (
                              <div
                                key={i}
                                className="p-2 rounded bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 text-[10px] font-mono"
                              >
                                <div className="text-blue-600 dark:text-blue-400 font-bold mb-1">
                                  Call: {tc.name}
                                </div>
                                <ToolCallArguments args={tc.args} />
                              </div>
                            ))}
                          </div>
                        </CollapsibleToolSection>
                      )}
                    </>
                  )}
                </div>
              )}

              {!editingMessageId && !isLoading && (
                <div
                  className={`absolute top-0 ${
                    msg.role === 'user'
                      ? 'left-0 -translate-x-full pr-2'
                      : 'right-0 translate-x-full pl-2'
                  } opacity-0 group-hover:opacity-100 transition-opacity flex flex-col space-y-1`}
                >
                  <button
                    onClick={() => {
                      if (!isModelAvailable) return;
                      startEditing(msg);
                    }}
                    className="p-1 text-brand-gray-400 hover:text-brand-gray-600 bg-brand-gray-950/5 rounded"
                    title={!isModelAvailable ? chatDisabledReason : 'Edit'}
                    disabled={!isModelAvailable}
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (!isModelAvailable) return;
                      onDeleteMessage(msg.id);
                    }}
                    className="p-1 text-brand-gray-400 hover:text-red-500 bg-brand-gray-950/5 rounded"
                    title={!isModelAvailable ? chatDisabledReason : 'Delete'}
                    disabled={!isModelAvailable}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-3">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
                isLight
                  ? 'bg-brand-gray-50 border-brand-gray-200'
                  : 'bg-brand-gray-900/30 border-brand-gray-800'
              }`}
            >
              <Bot size={16} className="text-brand-gray-400" />
            </div>
            <div
              className={`px-4 py-2 rounded-lg shadow-sm border ${
                isLight
                  ? 'bg-brand-gray-50 border-brand-gray-200'
                  : 'bg-brand-gray-800 border-brand-gray-700'
              }`}
            >
              <Loader2 className="animate-spin text-brand-500" size={16} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={`p-4 border-t ${bgMain} ${borderMain}`}>
        {(canRegenerate || isLoading) && (
          <div className="flex justify-center mb-4">
            {isLoading ? (
              <Button
                theme={theme}
                size="sm"
                variant="secondary"
                onClick={onStop}
                icon={<X size={12} />}
                className="text-xs py-1 h-7 border-dashed border-red-500/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                title="Stop generation"
              >
                Stop generation
              </Button>
            ) : (
              <Button
                theme={theme}
                size="sm"
                variant="secondary"
                onClick={onRegenerate}
                disabled={!isModelAvailable}
                icon={<RefreshCw size={12} />}
                className="text-xs py-1 h-7 border-dashed"
                title={
                  !isModelAvailable
                    ? chatDisabledReason
                    : 'Regenerate last response (CHAT model)'
                }
              >
                Regenerate last response
              </Button>
            )}
          </div>
        )}

        <ChatComposer
          textareaRef={textareaRef}
          isLoading={isLoading}
          isModelAvailable={isModelAvailable}
          disabledReason={chatDisabledReason}
          inputBg={inputBg}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};
