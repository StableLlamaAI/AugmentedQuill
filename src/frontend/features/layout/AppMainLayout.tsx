// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app main layout unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';

import { ChapterList } from '../chapters/ChapterList';
import { Chat } from '../chat/Chat';
import { Editor } from '../editor/Editor';
import { SourcebookList } from '../sourcebook/SourcebookList';
import { StoryMetadata } from '../story/StoryMetadata';
import { useTheme } from './ThemeContext';
import {
  MainChatControls,
  MainEditorControls,
  MainSidebarControls,
} from './layoutControlTypes';

type AppMainLayoutProps = {
  sidebarControls: MainSidebarControls;
  editorControls: MainEditorControls;
  chatControls: MainChatControls;
  /** languages available for instructions; used by the metadata editor */
  instructionLanguages: string[];
};

interface CollapsibleSectionProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  height?: number;
  onHeightChange?: (height: number) => void;
  isLast?: boolean;
  isLight?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isCollapsed,
  onToggle,
  children,
  height,
  onHeightChange,
  isLast,
  isLight,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [minHeaderHeight, setMinHeaderHeight] = useState(50);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef<number | undefined>(height);
  const startTopRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const applyHeight = (value: number) => {
    const clamped = Math.max(minHeaderHeight, value);
    if (sectionRef.current) {
      sectionRef.current.style.height = `${clamped}px`;
    }
  };

  const updateMinHeight = useCallback(() => {
    if (!headerRef.current) return;
    const h = Math.round(headerRef.current.getBoundingClientRect().height);
    setMinHeaderHeight(Math.max(50, h));
  }, []);

  useEffect(() => {
    updateMinHeight();
    window.addEventListener('resize', updateMinHeight);
    return () => window.removeEventListener('resize', updateMinHeight);
  }, [updateMinHeight]);

  const startResizing = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    startTopRef.current = sectionRef.current?.getBoundingClientRect().top ?? null;
  };

  const stopResizing = useCallback(() => {
    if (isResizing && onHeightChange && heightRef.current) {
      onHeightChange(Math.max(minHeaderHeight, heightRef.current));
    }
    setIsResizing(false);
    startTopRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [isResizing, minHeaderHeight, onHeightChange]);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !sectionRef.current || !onHeightChange) return;
      const top = startTopRef.current ?? sectionRef.current.getBoundingClientRect().top;
      const newHeight = Math.max(minHeaderHeight, e.clientY - top);
      heightRef.current = newHeight;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (!isResizing) return;
        applyHeight(newHeight);
      });
    },
    [isResizing, minHeaderHeight, onHeightChange]
  );

  useEffect(() => {
    if (!sectionRef.current) return;

    // Keep min-height in sync with what the header actually renders as,
    // so the section can never shrink below its header.
    sectionRef.current.style.minHeight = `${minHeaderHeight}px`;

    if (isCollapsed) {
      // When collapsed, let the section shrink naturally (remove any manual height)
      sectionRef.current.style.height = '';
      return;
    }

    if (!isResizing && typeof height === 'number') {
      // Keep the DOM height in sync with the last persisted height
      applyHeight(height);
      heightRef.current = height;
    }
  }, [height, isCollapsed, isResizing, minHeaderHeight]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResizing);
      // Prevent text selection while resizing
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  const borderClass = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const headerBg = isLight ? 'bg-brand-gray-100/50' : 'bg-brand-gray-800/30';
  const textColor = isLight ? 'text-brand-gray-600' : 'text-brand-gray-400';

  // Make the track less visible while keeping the handle itself accentuated.
  const resizerBase = isLight ? 'bg-brand-gray-200/18' : 'bg-brand-gray-800/20';
  const resizerHover = isLight
    ? 'hover:bg-brand-gray-300/30'
    : 'hover:bg-brand-gray-700/30';
  const resizerActive = isLight ? 'bg-brand-gray-300/38' : 'bg-brand-gray-700/38';

  // Chapter-selection style (yellow/red) for the handle icon.
  const gripDefault = isLight ? 'text-amber-500' : 'text-rose-400';
  const gripActive = isLight ? 'text-amber-600' : 'text-rose-300';

  const sectionId = useId();
  const contentId = `${sectionId}-content`;

  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleResizerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!sectionRef.current) return;
    let currentHeight = sectionRef.current.getBoundingClientRect().height;
    const step = 10;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(minHeaderHeight, currentHeight - step);
      applyHeight(next);
      heightRef.current = next;
      onHeightChange?.(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(minHeaderHeight, currentHeight + step);
      applyHeight(next);
      heightRef.current = next;
      onHeightChange?.(next);
    }
  };

  return (
    <div
      ref={sectionRef}
      className={`flex flex-col overflow-hidden ${isLast ? 'flex-1' : ''} ${!isLast ? `border-b ${borderClass}` : ''}`}
      style={!isLast && !isCollapsed && height ? { height: `${height}px` } : {}}
    >
      <button
        ref={headerRef}
        id={`${sectionId}-header`}
        type="button"
        className={`flex items-center justify-between px-4 py-2 cursor-pointer select-none shrink-0 ${headerBg}`}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight size={16} className={textColor} />
          ) : (
            <ChevronDown size={16} className={textColor} />
          )}
          <h2
            className={`text-[11px] font-bold uppercase tracking-widest ${textColor}`}
          >
            {title}
          </h2>
        </div>
      </button>
      {!isCollapsed && (
        <div id={contentId} className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      )}
      {!isLast && !isCollapsed && (
        <button
          type="button"
          className={`h-1.5 w-full cursor-ns-resize flex items-center justify-center transition-colors shrink-0 group ${resizerBase} ${resizerHover} ${isResizing ? resizerActive : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            startResizing();
          }}
          onKeyDown={handleResizerKeyDown}
          tabIndex={0}
          aria-label={`Resize ${title} section`}
          aria-valuemin={minHeaderHeight}
          aria-valuemax={Math.max(minHeaderHeight, height ?? minHeaderHeight)}
          aria-valuenow={
            sectionRef.current?.getBoundingClientRect().height ??
            height ??
            minHeaderHeight
          }
          aria-orientation="horizontal"
          role="slider"
        >
          <GripHorizontal
            size={12}
            className={`${isResizing ? gripActive : gripDefault} opacity-70 group-hover:opacity-100 transition-opacity`}
          />
        </button>
      )}
    </div>
  );
};

export const AppMainLayout: React.FC<AppMainLayoutProps> = ({
  sidebarControls,
  editorControls,
  chatControls,
  instructionLanguages,
}) => {
  const { bgMain, isLight, currentTheme } = useTheme();

  if (!sidebarControls || !editorControls || !chatControls) {
    // Guard against missing layout control bundles which can occur during
    // rehydration mismatch or when state is not yet initialized.
    // This prevents crashes like "Cannot destructure property 'editorSettings' of 'editorControls' as it is undefined".
    console.error('AppMainLayout missing required controls', {
      sidebarControls,
      editorControls,
      chatControls,
    });
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-brand-red-500">
        <p className="text-lg font-semibold">Application failed to initialize.</p>
        <p className="mt-2 text-sm text-brand-gray-400">
          Please refresh the page or try again.
        </p>
      </div>
    );
  }

  const {
    isSidebarOpen,
    setIsSidebarOpen,
    story,
    currentChapterId,
    handleChapterSelect,
    deleteChapter,
    updateChapter,
    updateBook,
    addChapter,
    handleBookCreate,
    handleBookDelete,
    handleReorderChapters,
    handleReorderBooks,
    handleSidebarAiAction,
    isEditingAvailable,
    handleOpenImages,
    updateStoryMetadata,
    checkedSourcebookIds,
    onToggleSourcebook,
    isAutoSourcebookSelectionEnabled,
    onToggleAutoSourcebookSelection,
    isSourcebookSelectionRunning,
    onSourcebookMutated,
  } = sidebarControls;

  const { editorSettings, setEditorSettings } = editorControls;
  const sidebarPrefs = editorSettings.sidebar || {};
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If we don't have stored heights, initialize them based on available space and content
    // We only do this once when totalHeight becomes available or story changes significantly
    const totalHeight = sidebarRef.current?.clientHeight || 0;
    if (
      totalHeight > 0 &&
      (!sidebarPrefs.storyHeight || !sidebarPrefs.chaptersHeight)
    ) {
      // Intelligence: Check content to decide priorities
      const hasStorySummary = !!story.summary;
      const chapterCount =
        story.projectType === 'short-story' ? 0 : story.chapters.length;

      // Base ratios
      let storyRatio = story.projectType === 'short-story' ? 0.5 : 0.33;
      let chaptersRatio = story.projectType === 'short-story' ? 0.15 : 0.33;

      if (chapterCount < 2) {
        chaptersRatio = 0.2;
        storyRatio = hasStorySummary ? 0.4 : 0.3;
      } else if (chapterCount > 10) {
        chaptersRatio = 0.5;
        storyRatio = 0.25;
      }

      const sHeight = Math.round(totalHeight * storyRatio);
      const cHeight = Math.round(totalHeight * chaptersRatio);

      setEditorSettings((prev) => ({
        ...prev,
        sidebar: {
          ...prev.sidebar,
          storyHeight: prev.sidebar?.storyHeight || sHeight,
          chaptersHeight: prev.sidebar?.chaptersHeight || cHeight,
        },
      }));
    }
  }, [
    story.id,
    setEditorSettings,
    sidebarPrefs.storyHeight,
    sidebarPrefs.chaptersHeight,
  ]);

  const toggleCollapsed = (key: keyof NonNullable<typeof editorSettings.sidebar>) => {
    setEditorSettings((prev) => ({
      ...prev,
      sidebar: {
        ...prev.sidebar,
        [key]: !prev.sidebar?.[key],
      },
    }));
  };

  const updateHeight = (
    key: keyof NonNullable<typeof editorSettings.sidebar>,
    height: number
  ) => {
    setEditorSettings((prev) => ({
      ...prev,
      sidebar: {
        ...prev.sidebar,
        [key]: height,
      },
    }));
  };

  const {
    currentChapter,
    editorRef,
    viewMode,
    suggestionControls,
    aiControls,
    setActiveFormats,
    showWhitespace,
    setShowWhitespace,
  } = editorControls;

  const {
    isChatOpen,
    chatMessages,
    isChatLoading,
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
  } = chatControls;

  return (
    <main id="aq-main-layout" className="flex-1 flex overflow-hidden relative">
      {isSidebarOpen && (
        <button
          className="fixed inset-0 bg-brand-gray-950/60 z-30 lg:hidden cursor-default"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        ></button>
      )}
      <nav
        id="aq-sidebar"
        role="navigation"
        aria-label="Project sidebar"
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 top-14 w-[var(--sidebar-width)] flex-col border-r flex-shrink-0 z-40 transition-transform duration-300 ease-in-out lg:relative lg:top-auto lg:translate-x-0 flex h-full ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isLight
            ? 'bg-brand-gray-50 border-brand-gray-200'
            : 'bg-brand-gray-900 border-brand-gray-800'
        }`}
      >
        <CollapsibleSection
          title="Story"
          isCollapsed={!!sidebarPrefs.isStoryCollapsed}
          onToggle={() => toggleCollapsed('isStoryCollapsed')}
          height={sidebarPrefs.storyHeight}
          onHeightChange={(h) => updateHeight('storyHeight', h)}
          isLight={isLight}
        >
          <StoryMetadata
            title={story.title}
            summary={story.summary}
            tags={story.styleTags}
            notes={story.notes}
            private_notes={story.private_notes}
            language={story.language}
            conflicts={story.conflicts}
            projectType={story.projectType}
            onAiGenerateSummary={(action, onProgress, currentText, onThinking) =>
              handleSidebarAiAction(
                'story',
                story.id,
                action,
                onProgress,
                currentText,
                onThinking
              )
            }
            summaryAiDisabledReason={
              !isEditingAvailable
                ? 'Summary AI is unavailable because no working EDITING model is configured.'
                : undefined
            }
            onUpdate={updateStoryMetadata}
            theme={currentTheme}
            languages={instructionLanguages}
          />
        </CollapsibleSection>

        {story.projectType !== 'short-story' && (
          <CollapsibleSection
            title="Chapters"
            isCollapsed={!!sidebarPrefs.isChaptersCollapsed}
            onToggle={() => toggleCollapsed('isChaptersCollapsed')}
            height={sidebarPrefs.chaptersHeight}
            onHeightChange={(h) => updateHeight('chaptersHeight', h)}
            isLight={isLight}
          >
            <ChapterList
              chapters={story.chapters}
              books={story.books}
              projectType={story.projectType}
              currentChapterId={currentChapterId}
              onSelect={handleChapterSelect}
              onDelete={deleteChapter}
              onUpdateChapter={updateChapter}
              onUpdateBook={updateBook}
              onCreate={(bookId) => addChapter('New Chapter', '', bookId)}
              onBookCreate={handleBookCreate}
              onBookDelete={handleBookDelete}
              onReorderChapters={handleReorderChapters}
              onReorderBooks={handleReorderBooks}
              onAiAction={handleSidebarAiAction}
              isAiAvailable={isEditingAvailable}
              theme={currentTheme}
              onOpenImages={handleOpenImages}
              languages={instructionLanguages}
            />
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Sourcebook"
          isCollapsed={!!sidebarPrefs.isSourcebookCollapsed}
          onToggle={() => toggleCollapsed('isSourcebookCollapsed')}
          isLast
          isLight={isLight}
        >
          <SourcebookList
            theme={currentTheme}
            externalEntries={story.sourcebook || []}
            checkedIds={checkedSourcebookIds || []}
            onToggle={(id, checked) => onToggleSourcebook?.(id, checked)}
            isAutoSelectionEnabled={isAutoSourcebookSelectionEnabled}
            onToggleAutoSelection={onToggleAutoSourcebookSelection}
            isAutoSelectionRunning={isSourcebookSelectionRunning}
            onMutated={onSourcebookMutated}
          />
        </CollapsibleSection>
      </nav>
      <section
        id="aq-editor"
        role="main"
        aria-label="Story editor"
        className={`flex-1 flex flex-col relative overflow-hidden w-full h-full ${bgMain}`}
      >
        <div className="flex-1 overflow-hidden h-full flex flex-col">
          {currentChapter ? (
            <Editor
              ref={editorRef}
              chapter={currentChapter}
              settings={editorSettings}
              viewMode={viewMode}
              onChange={editorControls.updateChapter}
              suggestionControls={{
                continuations: suggestionControls.continuations,
                isSuggesting: suggestionControls.isSuggesting,
                onTriggerSuggestions: suggestionControls.handleTriggerSuggestions,
                onCancelSuggestion: suggestionControls.cancelSuggestions,
                onAcceptContinuation: suggestionControls.handleAcceptContinuation,
                isSuggestionMode: suggestionControls.isSuggestionMode,
                onKeyboardSuggestionAction:
                  suggestionControls.handleKeyboardSuggestionAction,
              }}
              aiControls={{
                onAiAction: aiControls.handleAiAction,
                isAiLoading: aiControls.isAiActionLoading,
                isProseStreaming: aiControls.isProseStreaming,
                isWritingAvailable: aiControls.isWritingAvailable,
                onCancelAiAction: aiControls.cancelAiAction,
              }}
              onContextChange={setActiveFormats}
              showWhitespace={showWhitespace}
              onToggleShowWhitespace={() => setShowWhitespace((value) => !value)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-brand-gray-500">
              <img
                src="/static/images/logo_2048.png"
                className="w-64 h-64 mb-8 opacity-20"
                alt="AugmentedQuill Logo"
              />
              <p className="text-lg font-medium">
                Select or create a chapter to start writing.
              </p>
            </div>
          )}
        </div>
      </section>

      {isChatOpen && (
        <aside
          id="aq-chat"
          aria-label="AI Chat Assistant"
          className="fixed inset-y-0 right-0 top-14 w-full md:w-[var(--sidebar-width)] flex-shrink-0 flex flex-col z-40 shadow-xl transition duration-300 ease-in-out md:relative md:top-auto md:bottom-auto md:z-20 md:h-full"
        >
          <Chat
            messages={chatMessages}
            isLoading={isChatLoading}
            isModelAvailable={chatControls.isChatAvailable}
            activeChatConfig={activeChatConfig}
            systemPrompt={systemPrompt}
            onSendMessage={handleSendMessage}
            onStop={handleStopChat}
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onUpdateSystemPrompt={setSystemPrompt}
            onSwitchProject={handleLoadProject}
            theme={currentTheme}
            sessions={[...incognitoSessions, ...chatHistoryList]}
            currentSessionId={currentChatId}
            isIncognito={isIncognito}
            onSelectSession={handleSelectChat}
            onNewSession={handleNewChat}
            onDeleteSession={handleDeleteChat}
            onDeleteAllSessions={handleDeleteAllChats}
            onToggleIncognito={setIsIncognito}
            allowWebSearch={allowWebSearch}
            onToggleWebSearch={setAllowWebSearch}
            scratchpad={scratchpad}
            onUpdateScratchpad={onUpdateScratchpad}
            onDeleteScratchpad={onDeleteScratchpad}
          />
        </aside>
      )}
    </main>
  );
};
