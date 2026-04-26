// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Sidebar panel containing story metadata, chapter list, and sourcebook sections.
 * Extracted from AppMainLayout to keep each layout zone a focused single-responsibility unit.
 * Story data is now read from storyStore; dialog state from uiStore.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { ChapterList } from '../chapters/ChapterList';
import { SourcebookList } from '../sourcebook/SourcebookList';
import { StoryMetadata } from '../story/StoryMetadata';
import { CollapsibleSection } from './CollapsibleSection';
import { MainEditorControls, MainSidebarControls } from './layoutControlTypes';
import type { AppTheme } from '../../types';
import {
  useStoryBaseline,
  useStoryBooks,
  useStoryCanRedo,
  useStoryCanUndo,
  useStoryChaptersListMeta,
  useStoryMeta,
  useStorySourcebook,
} from '../../stores/storyStore';

export interface AppSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  sidebarControls: MainSidebarControls;
  sidebarPrefs: NonNullable<MainEditorControls['editorSettings']['sidebar']>;
  isLight: boolean;
  currentTheme: AppTheme;
  instructionLanguages: string[];
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
    handleSourcebookToggle,
    handleAddChapter,
    toggleCollapsed,
    updateHeight,
  }: AppSidebarProps) => {
    const { t } = useTranslation();

    // Story data from Zustand storyStore (granular subscriptions)
    const storyMeta = useStoryMeta();
    // useStoryChaptersListMeta uses structural equality so typing in a chapter
    // does not cause the sidebar to re-render on every debounced keystroke.
    const chaptersMeta = useStoryChaptersListMeta();
    // Read undo/redo availability directly from storyStore so these boolean
    // values are not part of sidebarControls — keeping sidebarControls stable
    // during content-only edits and preventing AppMainLayout from re-rendering.
    const canAppUndo = useStoryCanUndo();
    const canAppRedo = useStoryCanRedo();
    const books = useStoryBooks();
    const sourcebook = useStorySourcebook();
    const baseline = useStoryBaseline();

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
    } = sidebarControls;

    // canAppUndo / canAppRedo are read from storyStore above, not from sidebarControls.

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
          onHeightChange={(h: number) => updateHeight('storyHeight', h)}
          isLight={isLight}
        >
          <StoryMetadata
            title={storyMeta.title}
            summary={storyMeta.summary}
            tags={storyMeta.styleTags}
            notes={storyMeta.notes}
            private_notes={storyMeta.private_notes}
            language={storyMeta.language}
            conflicts={storyMeta.conflicts}
            projectType={storyMeta.projectType}
            baselineSummary={baseline?.summary}
            baselineNotes={baseline?.notes}
            baselinePrivateNotes={baseline?.private_notes}
            baselineConflicts={baseline?.conflicts}
            onAiGenerateSummary={(
              action: 'update' | 'rewrite' | 'write',
              onProgress: ((text: string) => void) | undefined,
              currentText: string | undefined,
              onThinking: ((thinking: string) => void) | undefined,
              source: 'notes' | 'chapter' | undefined
            ) =>
              handleSidebarAiAction(
                'story',
                storyMeta.id,
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
              storyMeta.projectType === 'short-story'
                ? !storyMeta.draftIsEmpty
                : undefined
            }
            onUpdate={updateStoryMetadata}
            theme={currentTheme}
            languages={instructionLanguages}
            spellCheck={true}
          />
        </CollapsibleSection>

        {storyMeta.projectType !== 'short-story' && (
          <CollapsibleSection
            title={t('Chapters')}
            isCollapsed={!!sidebarPrefs.isChaptersCollapsed}
            onToggle={() => toggleCollapsed('isChaptersCollapsed')}
            height={sidebarPrefs.chaptersHeight}
            onHeightChange={(h: number) => updateHeight('chaptersHeight', h)}
            isLight={isLight}
          >
            <ChapterList
              chapters={chaptersMeta}
              books={books}
              projectType={storyMeta.projectType}
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
              baselineChapters={baseline?.chapters}
              language={storyMeta.language}
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
            language={storyMeta.language}
            externalEntries={sourcebook}
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
            baselineEntries={baseline?.sourcebook}
          />
        </CollapsibleSection>
      </nav>
    );
  }
);
