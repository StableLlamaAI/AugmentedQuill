// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebook entry dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AppTheme, SourcebookEntry, SourcebookRelation } from '../../types';
import { SourcebookRelationDialog } from './SourcebookRelationDialog';
import { SourcebookUpsertPayload } from '../../services/apiTypes';
import { useThemeClasses } from '../layout/ThemeContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import {
  SourcebookEntryBasicsSection,
  SourcebookEntryDescriptionSection,
  SourcebookEntryFooter,
  SourcebookEntryHeader,
  SourcebookEntryImagesSection,
  SourcebookEntryRelationsSection,
  SourcebookImagePickerModal,
} from './SourcebookEntryDialogSections';
import { useSourcebookEntryDialogState } from './useSourcebookEntryDialogState';

interface SourcebookEntryDialogProps {
  entry?: SourcebookEntry | null;
  allEntries: SourcebookEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: SourcebookUpsertPayload) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  theme?: AppTheme;
  language?: string;
  baselineEntry?: SourcebookEntry | null;
  /** When true and the dialog is opened for an existing entry that has no
   *  baseline counterpart, treat the entry as newly created by the AI and
   *  display all content as "added" (green).  Default: false (no diff for
   *  entries not in the baseline, e.g. when the user opens a recently
   *  created entry manually). */
  showDiffForNew?: boolean;
  /** App-level undo/redo so the dialog buttons reflect global history. */
  canAppUndo?: boolean;
  canAppRedo?: boolean;
  onAppUndo?: () => Promise<void>;
  onAppRedo?: () => Promise<void>;
}

export const SourcebookEntryDialog: React.FC<SourcebookEntryDialogProps> = ({
  entry,
  allEntries,
  isOpen,
  onClose,
  onSave,
  onDelete,
  theme = 'mixed',
  language = 'en',
  baselineEntry = null,
  showDiffForNew = false,
  canAppUndo = false,
  canAppRedo = false,
  onAppUndo,
  onAppRedo,
}) => {
  const { t } = useTranslation();
  const {
    name,
    description,
    descriptionBaseline,
    showDiff,
    category,
    synonyms,
    newSynonym,
    images,
    relations,
    isImagesExpanded,
    isRelationsExpanded,
    isRelationDialogVisible,
    editingRelationIndex,
    isImagePickerOpen,
    showKeywordsPanel,
    isSaving,
    relationNameMap,
    descriptionHighlightRanges,
    availableImages,
    selectedImagesList,
    keywords,
    isGeneratingKeywords,
    history,
    historyIndex,
    setName,
    setDescription,
    setDescriptionBaseline,
    setShowDiff,
    setCategory,
    setNewSynonym,
    setRelations,
    setIsImagesExpanded,
    setIsRelationsExpanded,
    setIsRelationDialogVisible,
    setEditingRelationIndex,
    setIsImagePickerOpen,
    setShowKeywordsPanel,
    handleSave,
    addSynonym,
    removeSynonym,
    toggleImage,
    restoreFromHistory,
  } = useSourcebookEntryDialogState({
    entry,
    allEntries,
    isOpen,
    baselineEntry,
    showDiffForNew,
    onSave,
    onClose,
  });

  const entryDialogRef = useRef<HTMLDivElement>(null);
  const imagePickerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, entryDialogRef, onClose);
  useFocusTrap(isImagePickerOpen, imagePickerRef, () => setIsImagePickerOpen(false));

  const {
    isLight,
    bg: bgClass,
    text: textClass,
    border: borderClass,
    input: inputBgClass,
    muted: labelClass,
    surface: descriptionSurfaceClass,
  } = useThemeClasses();
  const inputBorderClass = borderClass;
  const descriptionTextClass = isLight ? 'text-brand-gray-700' : 'text-brand-gray-300';
  const keywordsTooltip = isGeneratingKeywords
    ? '...generating...'
    : keywords.length > 0
      ? keywords.join(', ')
      : 'No keywords yet.';

  if (!isOpen) {
    return null;
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      restoreFromHistory(historyIndex - 1);
      return;
    }
    onAppUndo?.();
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      restoreFromHistory(historyIndex + 1);
      return;
    }
    onAppRedo?.();
  };

  const handleDeleteEntry = async () => {
    if (!entry || !onDelete) {
      return;
    }

    if (await confirm(t('Are you sure you want to delete this entry?'))) {
      await onDelete(entry.id);
      onClose();
    }
  };

  const handleRelationSave = (rel: SourcebookRelation) => {
    if (editingRelationIndex !== null) {
      const nextRelations = [...relations];
      nextRelations[editingRelationIndex] = rel;
      setRelations(nextRelations);
      return;
    }

    setRelations([...relations, rel]);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        role="none"
      >
        <div
          ref={entryDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sourcebook-entry-title"
          tabIndex={-1}
          className={`${bgClass} ${textClass} w-full max-w-[90vw] rounded-lg shadow-2xl border ${borderClass} flex flex-col max-h-[94vh]`}
        >
          <SourcebookEntryHeader
            entryExists={Boolean(entry)}
            isLight={isLight}
            borderClass={borderClass}
            historyIndex={historyIndex}
            historyLength={history.length}
            canAppUndo={canAppUndo}
            canAppRedo={canAppRedo}
            showDiff={showDiff}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleDiff={() => setShowDiff((value) => !value)}
            onClose={onClose}
            t={t}
          />

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <SourcebookEntryBasicsSection
              name={name}
              category={category}
              synonyms={synonyms}
              newSynonym={newSynonym}
              inputBorderClass={inputBorderClass}
              inputBgClass={inputBgClass}
              labelClass={labelClass}
              isLight={isLight}
              language={language}
              t={t}
              onNameChange={setName}
              onCategoryChange={setCategory}
              onSynonymInputChange={setNewSynonym}
              onAddSynonym={addSynonym}
              onRemoveSynonym={removeSynonym}
            />

            <SourcebookEntryImagesSection
              isImagesExpanded={isImagesExpanded}
              selectedImagesList={selectedImagesList}
              labelClass={labelClass}
              inputBorderClass={inputBorderClass}
              inputBgClass={inputBgClass}
              theme={theme}
              t={t}
              onToggleExpanded={() => setIsImagesExpanded((value) => !value)}
              onOpenPicker={() => setIsImagePickerOpen(true)}
              onToggleImage={toggleImage}
            />

            <SourcebookEntryRelationsSection
              isRelationsExpanded={isRelationsExpanded}
              relations={relations}
              relationNameMap={relationNameMap}
              labelClass={labelClass}
              inputBorderClass={inputBorderClass}
              inputBgClass={inputBgClass}
              theme={theme}
              t={t}
              onToggleExpanded={() => setIsRelationsExpanded((value) => !value)}
              onOpenAddRelation={() => {
                setEditingRelationIndex(null);
                setIsRelationDialogVisible(true);
              }}
              onEditRelation={(index) => {
                setEditingRelationIndex(index);
                setIsRelationDialogVisible(true);
              }}
              onDeleteRelation={(index) => {
                setRelations(
                  relations.filter((_, relationIndex) => relationIndex !== index)
                );
              }}
            />

            <SourcebookEntryDescriptionSection
              description={description}
              descriptionBaseline={descriptionBaseline}
              showDiff={showDiff}
              showKeywordsPanel={showKeywordsPanel}
              keywords={keywords}
              isGeneratingKeywords={isGeneratingKeywords}
              keywordsTooltip={keywordsTooltip}
              isLight={isLight}
              borderClass={borderClass}
              inputBorderClass={inputBorderClass}
              descriptionSurfaceClass={descriptionSurfaceClass}
              descriptionTextClass={descriptionTextClass}
              labelClass={labelClass}
              language={language}
              searchHighlightRanges={descriptionHighlightRanges}
              t={t}
              onDescriptionChange={(value) => {
                setDescriptionBaseline(value);
                setDescription(value);
              }}
              onToggleKeywordsPanel={() => setShowKeywordsPanel((value) => !value)}
            />
          </div>

          <SourcebookEntryFooter
            entry={entry}
            canDelete={Boolean(onDelete)}
            isSaving={isSaving}
            isLight={isLight}
            borderClass={borderClass}
            theme={theme}
            t={t}
            onDelete={handleDeleteEntry}
            onCancel={onClose}
            onSave={handleSave}
            disableSave={!name.trim() || isSaving}
          />
        </div>
      </div>

      <SourcebookImagePickerModal
        isOpen={isImagePickerOpen}
        availableImages={availableImages}
        selectedImageNames={images}
        bgClass={bgClass}
        textClass={textClass}
        borderClass={borderClass}
        theme={theme}
        imagePickerRef={imagePickerRef}
        t={t}
        onClose={() => setIsImagePickerOpen(false)}
        onToggleImage={toggleImage}
      />

      <SourcebookRelationDialog
        isOpen={isRelationDialogVisible}
        onClose={() => setIsRelationDialogVisible(false)}
        onSave={handleRelationSave}
        currentEntryId={entry?.id}
        currentEntryName={name}
        theme={theme}
        initialRelation={
          editingRelationIndex !== null ? relations[editingRelationIndex] : undefined
        }
      />
    </>,
    document.body
  );
};
