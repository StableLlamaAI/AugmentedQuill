// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app main layout unit so this responsibility stays isolated, testable, and easy to evolve.
 * Composes AppSidebar, the story editor pane, and AppChatPanel.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Editor } from '../editor/Editor';
import { AppChatPanel } from './AppChatPanel';
import { AppSidebar } from './AppSidebar';
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

export const AppMainLayout: React.FC<AppMainLayoutProps> = React.memo(
  ({ sidebarControls, editorControls, chatControls, instructionLanguages }) => {
    const { bgMain, isLight, currentTheme } = useTheme();
    const { t } = useTranslation();

    if (!sidebarControls || !editorControls || !chatControls) {
      console.error('AppMainLayout missing required controls', {
        sidebarControls,
        editorControls,
        chatControls,
      });
      return (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-brand-red-500">
          <p className="text-lg font-semibold">
            {t('Application failed to initialize.')}
          </p>
          <p className="mt-2 text-sm text-brand-gray-400">
            {t('Please refresh the page or try again.')}
          </p>
        </div>
      );
    }

    const {
      story,
      addChapter,
      isSidebarOpen,
      setIsSidebarOpen,
      onToggleSourcebook,
      sidebarStoryMetadata,
      sidebarStoryChapters,
      sidebarStoryBooks,
      sidebarSourcebookEntries,
    } = sidebarControls;

    const { editorSettings, setEditorSettings } = editorControls;
    const sidebarPrefs = editorSettings.sidebar || {};
    const sidebarRef = useRef<HTMLDivElement>(null);

    const storyTitle = sidebarStoryMetadata?.title ?? story?.title ?? '';
    const storySummary = sidebarStoryMetadata?.summary ?? story?.summary ?? '';
    const storyTags = sidebarStoryMetadata?.tags ?? story?.styleTags ?? [];
    const storyNotes = sidebarStoryMetadata?.notes ?? story?.notes;
    const storyPrivateNotes =
      sidebarStoryMetadata?.private_notes ?? story?.private_notes;
    const storyConflicts = sidebarStoryMetadata?.conflicts ?? story?.conflicts;
    const storyDraft = sidebarStoryMetadata?.draft ?? story?.draft;
    const sidebarChapters = sidebarStoryChapters ?? story?.chapters ?? [];
    const sidebarBooks = sidebarStoryBooks ?? story?.books ?? [];
    const storySourcebookEntries = sidebarSourcebookEntries ?? story?.sourcebook ?? [];
    const storyLanguage = sidebarStoryMetadata?.language ?? story?.language ?? 'en';
    const storyProjectType =
      sidebarStoryMetadata?.projectType ?? story?.projectType ?? 'novel';
    const storyId = story?.id ?? '';

    useEffect(() => {
      const totalHeight = sidebarRef.current?.clientHeight || 0;
      if (
        totalHeight > 0 &&
        (!sidebarPrefs.storyHeight || !sidebarPrefs.chaptersHeight)
      ) {
        const hasStorySummary = !!storySummary;
        const chapterCount =
          storyProjectType === 'short-story' ? 0 : sidebarChapters.length;

        let storyRatio = storyProjectType === 'short-story' ? 0.5 : 0.33;
        let chaptersRatio = storyProjectType === 'short-story' ? 0.15 : 0.33;

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
      storyId,
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
      isChapterLoading,
      editorRef,
      viewMode,
      suggestionControls,
      aiControls,
      setActiveFormats,
      showWhitespace,
      setShowWhitespace,
      onOpenSearch,
    } = editorControls;

    // Stable callbacks so memoized sidebar sub-components don't re-render on
    // every AppMainLayout render caused by sidebarControls reference churn.
    const handleSourcebookToggle = useCallback(
      (id: string, checked: boolean) => onToggleSourcebook?.(id, checked),
      [onToggleSourcebook]
    );
    const handleAddChapter = useCallback(
      (bookId?: string) => addChapter('New Chapter', '', bookId),
      [addChapter]
    );

    return (
      <main id="aq-main-layout" className="flex-1 flex overflow-hidden relative">
        <AppSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          sidebarControls={sidebarControls}
          sidebarPrefs={
            sidebarPrefs as NonNullable<MainEditorControls['editorSettings']['sidebar']>
          }
          isLight={isLight}
          currentTheme={currentTheme}
          instructionLanguages={instructionLanguages}
          storyTitle={storyTitle}
          storySummary={storySummary}
          storyTags={storyTags}
          storyNotes={storyNotes}
          storyPrivateNotes={storyPrivateNotes}
          storyConflicts={storyConflicts}
          storyDraft={storyDraft}
          sidebarChapters={sidebarChapters}
          sidebarBooks={sidebarBooks}
          storySourcebookEntries={storySourcebookEntries}
          storyLanguage={storyLanguage}
          storyProjectType={storyProjectType}
          storyId={storyId}
          handleSourcebookToggle={handleSourcebookToggle}
          handleAddChapter={handleAddChapter}
          toggleCollapsed={toggleCollapsed}
          updateHeight={updateHeight}
        />

        <section
          id="aq-editor"
          role="main"
          aria-label={t('Story editor')}
          className={`flex-1 flex flex-col relative overflow-hidden w-full h-full ${bgMain}`}
        >
          <div className="flex-1 overflow-hidden h-full flex flex-col">
            {isChapterLoading ? (
              <div
                className="flex-1 p-8 space-y-4 animate-pulse"
                aria-busy="true"
                aria-label={t('Loading chapter')}
              >
                <div
                  className={`h-5 w-1/3 rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-full rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-5/6 rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-full rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-3/4 rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div className="pt-2" />
                <div
                  className={`h-3 w-full rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-4/5 rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-full rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
                <div
                  className={`h-3 w-2/3 rounded ${isLight ? 'bg-brand-gray-200' : 'bg-brand-gray-700'}`}
                />
              </div>
            ) : currentChapter ? (
              <Editor
                ref={editorRef}
                chapter={currentChapter}
                settings={editorSettings}
                language={editorControls.storyLanguage || 'en'}
                viewMode={viewMode}
                onChange={editorControls.updateChapter}
                suggestionControls={{
                  continuations: suggestionControls.continuations,
                  isSuggesting: suggestionControls.isSuggesting,
                  onTriggerSuggestions: suggestionControls.handleTriggerSuggestions,
                  onCancelSuggestion: suggestionControls.handleCancelSuggestions,
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
                baselineContent={editorControls.baselineContent}
                spellCheck={true}
                onOpenSearch={onOpenSearch}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-brand-gray-500">
                <img
                  src="/static/images/logo_512.png"
                  srcSet="/static/images/logo_256.png 256w, /static/images/logo_512.png 512w, /static/images/logo_1024.png 1024w, /static/images/logo_2048.png 2048w"
                  sizes="(max-width: 640px) 128px, (max-width: 1024px) 192px, 256px"
                  className="w-64 h-64 mb-8 opacity-20"
                  alt="AugmentedQuill Logo"
                  decoding="async"
                  loading="lazy"
                />
                <p className="text-lg font-medium">
                  {t('Select or create a chapter to start writing.')}
                </p>
              </div>
            )}
          </div>
        </section>

        <AppChatPanel
          chatControls={chatControls}
          currentTheme={currentTheme}
          storyLanguage={storyLanguage}
        />
      </main>
    );
  }
);
