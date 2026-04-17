// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chat unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useDeferredValue,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatAttachment,
  ChatMessage,
  AppTheme,
  ChatSession,
  LLMConfig,
} from '../../types';
import { useFocusTrap } from '../layout/useFocusTrap';
import { useThemeClasses } from '../layout/ThemeContext';
import { Loader2, Bot, RefreshCw, X, Paperclip } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { MutationTags, SessionMutation } from './components/MutationTags';
import { ChatHeader } from './components/ChatHeader';
import { ChatHistoryPanel } from './components/ChatHistoryPanel';
import { ChatComposer } from './components/ChatComposer';
import { ChatMessageItem } from './components/ChatMessageItem';
import { estimateChatContextUsage } from './chatContextBudget';

interface ChatProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isModelAvailable?: boolean;
  activeChatConfig: LLMConfig;
  systemPrompt: string;
  onSendMessage: (text: string, attachments?: ChatAttachment[]) => void;
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
  scratchpad?: string;
  onUpdateScratchpad: (newContent: string) => void;
  onDeleteScratchpad: () => void;
  sessionMutations?: SessionMutation[];
  onMutationClick?: (m: SessionMutation) => void;
  storyLanguage?: string;
}

// Initial number of messages to commit on first render; older messages are
// progressively added one chunk per animation frame to keep each commit well
// under the browser's 50 ms long-task threshold.
const INITIAL_DISPLAY = 8;

export const Chat: React.FC<ChatProps> = ({
  messages,
  isLoading,
  isModelAvailable = true,
  activeChatConfig,
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
  scratchpad = '',
  onUpdateScratchpad,
  onDeleteScratchpad,
  sessionMutations = [],
  onMutationClick = () => {},
  storyLanguage,
}) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadDraft, setScratchpadDraft] = useState(scratchpad);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt);
  const systemPromptRef = useRef<HTMLDivElement>(null);
  const scratchpadRef = useRef<HTMLDivElement>(null);

  useFocusTrap(showSystemPrompt, systemPromptRef, () => setShowSystemPrompt(false));
  useFocusTrap(showScratchpad, scratchpadRef, () => setShowScratchpad(false));

  const [thinkingProcessExpanded, setThinkingProcessExpanded] = useState<
    Record<string, boolean>
  >({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const themeClasses = useThemeClasses();
  const { isLight } = themeClasses;
  const { t } = useTranslation();
  const chatDisabledReason = t(
    'Chat is unavailable because no working CHAT model is configured.'
  );
  const bgMain = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-900';
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
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // Consider "at bottom" if within 50px of the actual bottom to handle fast layouts
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isAtBottomRef.current = isAtBottom;
    }
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
    const el = scrollContainerRef.current;
    if (!el) return undefined;

    // Use MutationObserver to catch size changes in children (like Markdown
    // rendering, Collapsible tool sections expanding, etc.).  The callback is
    // RAF-throttled so that rapid DOM mutations during streaming don't pile up
    // redundant scroll operations.
    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (!isAtBottomRef.current) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        scrollToBottom(isLoading ? 'auto' : 'smooth');
      });
    });

    observer.observe(el, { childList: true, subtree: true });

    // Ensure we scroll immediately if a basic dependency change caused an update too
    if (isAtBottomRef.current) {
      scrollToBottom(isLoading ? 'auto' : 'smooth');
    }

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
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
    if (!showScratchpad) {
      setScratchpadDraft(scratchpad || '');
    }
  }, [scratchpad, showScratchpad]);

  const handleSubmit = (text: string, attachments?: ChatAttachment[]) => {
    if (isLoading || !isModelAvailable) return;

    onSendMessage(text, attachments);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Force scroll to bottom on user message
    isAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('auto'), 0);
  };

  // Keep a ref so handleSaveEdit has a stable identity regardless of editContent.
  const editContentRef = useRef(editContent);
  editContentRef.current = editContent;

  const handleStartEditing = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.text);
  }, []);

  const handleSaveEdit = useCallback(
    (id: string) => {
      if (editContentRef.current.trim()) {
        onEditMessage(id, editContentRef.current.trim());
        setEditingMessageId(null);
        setEditContent('');
      }
    },
    [onEditMessage]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
  }, []);

  const handleThinkingToggle = useCallback((id: string, next: boolean) => {
    setThinkingProcessExpanded((prev) => ({ ...prev, [id]: next }));
  }, []);

  const handleSystemPromptSave = () => {
    onUpdateSystemPrompt(tempSystemPrompt);
    setShowSystemPrompt(false);
  };

  const deferredMessages = useDeferredValue(messages);

  // Incremental rendering: start with the most‑recent INITIAL_DISPLAY messages
  // and add one chunk per animation frame. With React.memo on ChatMessageItem,
  // each frame only commits the new items; already-rendered ones bail out.
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);

  useEffect(() => {
    setDisplayCount(INITIAL_DISPLAY);
  }, [currentSessionId]);

  useEffect(() => {
    if (displayCount >= deferredMessages.length) return;
    const raf = requestAnimationFrame(() => {
      setDisplayCount((prev) =>
        Math.min(prev + INITIAL_DISPLAY, deferredMessages.length)
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [displayCount, deferredMessages.length]);

  const visibleMessages = deferredMessages.slice(
    Math.max(0, deferredMessages.length - displayCount)
  );

  const hasUserMessage = messages.some((msg) => msg.role === 'user');
  const canRegenerate = !isLoading && isModelAvailable && hasUserMessage;
  const contextUsage = useMemo(
    () =>
      estimateChatContextUsage({
        systemInstruction: systemPrompt,
        messages,
        config: activeChatConfig,
      }),
    [activeChatConfig, messages, systemPrompt]
  );

  return (
    <div
      id="chat-panel"
      className={`flex flex-col h-full border-l ${bgMain} ${themeClasses.border} ${textMain}`}
    >
      <ChatHeader
        title={isIncognito ? t('Incognito Chat') : t('Writing Partner')}
        headerBg={headerBg}
        isLightTheme={isLight}
        currentSessionId={currentSessionId}
        isIncognito={isIncognito}
        contextUsage={contextUsage}
        isDisabled={!isModelAvailable}
        disabledReason={chatDisabledReason}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        showSystemPrompt={showSystemPrompt}
        setShowSystemPrompt={setShowSystemPrompt}
        allowWebSearch={allowWebSearch}
        onDeleteSession={onDeleteSession}
        onNewSession={onNewSession}
        onScratchpadOpen={() => setShowScratchpad(true)}
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

      {showScratchpad && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="none"
        >
          <div
            ref={scratchpadRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scratchpad-dialog-title"
            tabIndex={-1}
            className={`w-full max-w-2xl rounded-lg border shadow-xl p-4 ${isLight ? 'bg-white text-brand-gray-800 border-brand-gray-200' : 'bg-brand-gray-900 text-brand-gray-100 border-brand-gray-700'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                id="scratchpad-dialog-title"
                className="text-sm font-bold uppercase tracking-wider text-brand-gray-500"
              >
                {t('Scratchpad')}
              </h2>
              <button
                onClick={() => setShowScratchpad(false)}
                className="p-1 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800"
                title={t('Close Scratchpad')}
                aria-label={t('Close scratchpad')}
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              lang={storyLanguage || 'en'}
              value={scratchpadDraft}
              onChange={(e) => setScratchpadDraft(e.target.value)}
              className={`w-full min-h-[220px] rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${isLight ? 'bg-white border-brand-gray-300 text-brand-gray-900' : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-100'}`}
              placeholder={t('Current internal notes of the chat LLM...')}
            />
            <div className="mt-3 flex justify-between items-center">
              <button
                onClick={() => {
                  onDeleteScratchpad();
                  setScratchpadDraft('');
                }}
                className="rounded px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                title={t('Delete scratchpad content')}
              >
                {t('Delete')}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowScratchpad(false)}
                  className="rounded px-3 py-1 text-xs font-medium border border-brand-gray-300 hover:bg-brand-gray-100 dark:border-brand-gray-700 dark:hover:bg-brand-gray-800"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={() => {
                    onUpdateScratchpad(scratchpadDraft);
                    setShowScratchpad(false);
                  }}
                  aria-label={t('Save Scratchpad')}
                  className="rounded px-3 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  {t('Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSystemPrompt && (
        <div
          ref={systemPromptRef}
          role="region"
          aria-labelledby="system-instruction-title"
          className={`p-4 border-b animate-in slide-in-from-top-2 ${bgMain} ${themeClasses.border}`}
        >
          <label
            id="system-instruction-title"
            className="block text-xs font-medium text-brand-gray-500 uppercase tracking-wider mb-2"
          >
            {t('System Instruction')}
          </label>
          <textarea
            lang={storyLanguage || 'en'}
            value={tempSystemPrompt}
            spellCheck={true}
            onChange={(e) => setTempSystemPrompt(e.target.value)}
            className={`w-full h-32 rounded-md p-3 text-sm focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none mb-3 border ${inputBg}`}
            placeholder={t("Define the AI's persona and rules...")}
            disabled={!isModelAvailable}
            title={!isModelAvailable ? chatDisabledReason : t('System Instruction')}
          />
          <div className="flex justify-end space-x-2">
            <Button
              theme={theme}
              size="sm"
              variant="ghost"
              onClick={() => setShowSystemPrompt(false)}
              disabled={!isModelAvailable}
              title={!isModelAvailable ? chatDisabledReason : t('Cancel')}
            >
              {t('Cancel')}
            </Button>
            <Button
              theme={theme}
              size="sm"
              variant="primary"
              onClick={handleSystemPromptSave}
              disabled={!isModelAvailable}
              title={!isModelAvailable ? chatDisabledReason : t('Update Persona')}
            >
              {t('Update Persona')}
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

        {visibleMessages.length === 0 && !showSystemPrompt && (
          <div className="text-center text-brand-gray-500 mt-10 p-4">
            <Bot className="mx-auto mb-3 opacity-50" size={40} />
            <p className="text-sm">
              {t(
                "I'm your AI co-author. Ask me to write, edit, or brainstorm ideas for your story!"
              )}
            </p>
          </div>
        )}

        {visibleMessages.map((msg, i) => (
          <ChatMessageItem
            key={msg.id || `msg-${i}`}
            msg={msg}
            isLast={i === visibleMessages.length - 1}
            isLoading={isLoading}
            isLight={isLight}
            msgUserBg={msgUserBg}
            msgBotBg={msgBotBg}
            inputBg={inputBg}
            isEditing={editingMessageId === msg.id}
            editContent={editingMessageId === msg.id ? editContent : ''}
            anyMessageBeingEdited={!!editingMessageId}
            isThinkingExpanded={thinkingProcessExpanded[msg.id]}
            isModelAvailable={isModelAvailable}
            chatDisabledReason={chatDisabledReason}
            storyLanguage={storyLanguage}
            theme={theme}
            onSwitchProject={onSwitchProject}
            onStartEditing={handleStartEditing}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onSetEditContent={setEditContent}
            onDeleteMessage={onDeleteMessage}
            onThinkingToggle={handleThinkingToggle}
          />
        ))}

        {isLoading && (
          <div className="flex items-center space-x-3" role="status" aria-live="polite">
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

      <div className={`p-4 border-t ${bgMain} ${themeClasses.border}`}>
        {sessionMutations.length > 0 && (
          <div className="mb-3">
            <MutationTags
              mutations={sessionMutations}
              onMutationClick={onMutationClick}
            />
          </div>
        )}
        {(canRegenerate || isLoading || attachments.length === 0) && (
          <div className="relative mb-3 min-h-[2.75rem] py-1">
            <div className="absolute inset-x-0 flex justify-center">
              {isLoading ? (
                <Button
                  theme={theme}
                  size="sm"
                  variant="secondary"
                  onClick={onStop}
                  icon={<X size={12} />}
                  className="text-xs py-1 h-7 border-dashed border-red-500/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                  title={t('Stop generation')}
                >
                  {t('Stop generation')}
                </Button>
              ) : canRegenerate ? (
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
                      : t('Regenerate last response (CHAT model)')
                  }
                >
                  {t('Regenerate last response')}
                </Button>
              ) : null}
            </div>
            {attachments.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t('Attach files')}
                aria-label={t('Attach files')}
                className={`absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
                  isLight
                    ? 'border-brand-gray-300 bg-white text-brand-gray-700 hover:bg-brand-gray-50'
                    : 'border-brand-gray-700 bg-brand-gray-900 text-brand-gray-200 hover:bg-brand-gray-800'
                }`}
              >
                <Paperclip size={16} />
              </button>
            )}
          </div>
        )}

        <ChatComposer
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          isLoading={isLoading}
          isModelAvailable={isModelAvailable}
          disabledReason={chatDisabledReason}
          inputBg={inputBg}
          attachments={attachments}
          language={storyLanguage}
          onAttachmentsChange={setAttachments}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};
