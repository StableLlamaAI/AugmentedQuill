// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Sidebar panel containing story metadata, chapter list, and sourcebook sections.
 * Extracted from AppMainLayout to keep each layout zone a focused single-responsibility unit.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { ChapterList } from '../chapters/ChapterList';
import { SourcebookList } from '../sourcebook/SourcebookList';
import { StoryMetadata } from '../story/StoryMetadata';
import { CollapsibleSection } from './CollapsibleSection';
import { MainEditorControls, MainSidebarControls } from './layoutControlTypes';
import type {
  AppTheme,
  Book,
  Chapter,
  SourcebookEntry,
  WritingUnit,
} from '../../types';

export interface AppSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarControls: MainSidebarControls;
  sidebarPrefs: NonNullable<MainEditorControls['editorSettings']['sidebar']>;
  isLight: boolean;
  currentTheme: AppTheme;
  instructionLanguages: string[];
  storyTitle: string;
  storySummary: string;
  storyTags: string[];
  storyNotes?: string;
  storyPrivateNotes?: string;
  storyConflicts?: Array<{ id: string; description: string; resolution: string }>;
  storyDraft?: WritingUnit | null;
  sidebarChapters: Chapter[];
  sidebarBooks: Book[];
  storySourcebookEntries: SourcebookEntry[];
  storyLanguage: string;
  storyProjectType: 'short-story' | 'novel' | 'series';
  storyId: string;
  handleSourcebookToggle: (id: string, checked: boolean) => void;
  handleAddChapter: (bookId?: string) => Promise<void>;
  toggleCollapsed: (
    key: keyof NonNullable<MainEditorControls['editorSettings']['sidebar']>
  ) => void;
  updateHeight: (
    key: keyof NonNullable<MainEditorControls['editorSettings']['sidebar']>,
    height: number
  ) => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = React.memo(
  ({
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarControls,
    sidebarPrefs,
    isLight,
    currentTheme,
    instructionLanguages,
    storyTitle,
    storySummary,
    storyTags,
    storyNotes,
    storyPrivateNotes,
    storyConflicts,
    storyDraft,
    sidebarChapters,
    sidebarBooks,
    storySourcebookEntries,
    storyLanguage,
    storyProjectType,
    storyId,
    handleSourcebookToggle,
    handleAddChapter,
    toggleCollapsed,
    updateHeight,
  }) => {
    const { t } = useTranslation();
    const {
      currentChapterId,
      handleChapterSelect,
      deleteChapter,
      updateChapter,
      updateBook,
      handleBookCreate,
      handleBookDelete,
      handleReorderChapters,
      handleReorderBooks,
      handleSidebarAiAction,
      isEditingAvailable,
      handleOpenImages,
      updateStoryMetadata,
      checkedSourcebookIds,
      onSourcebookMutated,
      onAppUndo,
      onAppRedo,
      canAppUndo,
      canAppRedo,
      sourcebookDialogTrigger,
      sourcebookDialogCloseTrigger,
      metadataDialogTrigger,
      metadataDialogCloseTrigger,
      baselineState,
    } = sidebarControls;

    return (
      <nav
        id="aq-sidebar"
        role="navigation"
        aria-label={t('Project sidebar')}
        className={`fixed inset-y-0 left-0 top-14 w-[var(--sidebar-width)] flex-col border-r flex-shrink-0 z-40 transition-transform duration-300 ease-in-out lg:relative lg:top-auto lg:translate-x-0 flex h-full ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isLight
            ? 'bg-brand-gray-50 border-brand-gray-200'
            : 'bg-brand-gray-900 border-brand-gray-800'
        }`}
      >
        {isSidebarOpen && (
          <button
            className="fixed inset-0 bg-brand-gray-950/60 z-30 lg:hidden cursor-default"
            onClick={() => setIsSidebarOpen(false)}
            aria-label={t('Close sidebar')}
          ></button>
        )}

        <CollapsibleSection
          title={t('Story')}
          isCollapsed={!!sidebarPrefs.isStoryCollapsed}
          onToggle={() => toggleCollapsed('isStoryCollapsed')}
          height={sidebarPrefs.storyHeight}
          onHeightChange={(h) => updateHeight('storyHeight', h)}
          isLight={isLight}
        >
          <StoryMetadata
            title={storyTitle}
            summary={storySummary}
            tags={storyTags}
            notes={storyNotes}
            private_notes={storyPrivateNotes}
            language={storyLanguage}
            conflicts={storyConflicts}
            projectType={storyProjectType}
            baselineSummary={baselineState?.summary}
            baselineNotes={baselineState?.notes}
            baselinePrivateNotes={baselineState?.private_notes}
            baselineConflicts={baselineState?.conflicts}
            onAiGenerateSummary={(
              action,
              onProgress,
              currentText,
              onThinking,
              source
            ) =>
              handleSidebarAiAction(
                'story',
                storyId,
                action,
                onProgress,
                currentText,
                onThinking,
                source
              )
            }
            summaryAiDisabledReason={
              !isEditingAvailable
                ? t(
                    'Summary AI is unavailable because no working EDITING model is configured.'
                  )
                : undefined
            }
            primarySourceAvailable={
              storyProjectType === 'short-story' && storyDraft
                ? !!storyDraft.content?.trim()
                : undefined
            }
            onUpdate={updateStoryMetadata}
            metadataDialogTrigger={metadataDialogTrigger}
            closeDialogTrigger={metadataDialogCloseTrigger}
            initialTab={metadataDialogTrigger?.initialTab}
            theme={currentTheme}
            languages={instructionLanguages}
            spellCheck={true}
          />
        </CollapsibleSection>

        {storyProjectType !== 'short-story' && (
          <CollapsibleSection
            title={t('Chapters')}
            isCollapsed={!!sidebarPrefs.isChaptersCollapsed}
            onToggle={() => toggleCollapsed('isChaptersCollapsed')}
            height={sidebarPrefs.chaptersHeight}
            onHeightChange={(h) => updateHeight('chaptersHeight', h)}
            isLight={isLight}
          >
            <ChapterList
              chapters={sidebarChapters}
              books={sidebarBooks}
              projectType={storyProjectType}
              currentChapterId={currentChapterId}
              onSelect={handleChapterSelect}
              onDelete={deleteChapter}
              onUpdateChapter={updateChapter}
              onUpdateBook={updateBook}
              onCreate={handleAddChapter}
              onBookCreate={handleBookCreate}
              onBookDelete={handleBookDelete}
              onReorderChapters={handleReorderChapters}
              onReorderBooks={handleReorderBooks}
              onAiAction={handleSidebarAiAction}
              isAiAvailable={isEditingAvailable}
              theme={currentTheme}
              onOpenImages={handleOpenImages}
              languages={instructionLanguages}
              baselineChapters={baselineState?.chapters}
              language={storyLanguage}
              spellCheck={true}
            />
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title={t('Sourcebook')}
          isCollapsed={!!sidebarPrefs.isSourcebookCollapsed}
          onToggle={() => toggleCollapsed('isSourcebookCollapsed')}
          isLast
          isLight={isLight}
        >
          <SourcebookList
            theme={currentTheme}
            language={storyLanguage}
            externalEntries={storySourcebookEntries}
            checkedIds={checkedSourcebookIds || []}
            onToggle={handleSourcebookToggle}
            isAutoSelectionEnabled={sidebarControls.isAutoSourcebookSelectionEnabled}
            onToggleAutoSelection={sidebarControls.onToggleAutoSourcebookSelection}
            isAutoSelectionRunning={sidebarControls.isSourcebookSelectionRunning}
            mutatedEntryIds={sidebarControls.mutatedSourcebookEntryIds}
            onMutated={onSourcebookMutated}
            onAppUndo={onAppUndo}
            onAppRedo={onAppRedo}
            canAppUndo={canAppUndo}
            canAppRedo={canAppRedo}
            sourcebookDialogTrigger={sourcebookDialogTrigger}
            closeDialogTrigger={sourcebookDialogCloseTrigger}
            baselineEntries={baselineState?.sourcebook}
          />
        </CollapsibleSection>
      </nav>
    );
  }
);
