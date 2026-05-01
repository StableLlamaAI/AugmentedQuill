// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Render the sourcebook entry dialog shell while keeping state and
 * behavior orchestration in the container component.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { AppTheme, SourcebookEntry, SourcebookRelation } from '../../types';
import { ProjectImage } from '../../services/apiTypes';
import { SourcebookRelationDialog } from './SourcebookRelationDialog';
import {
  SourcebookEntryBasicsSection,
  SourcebookEntryDescriptionSection,
  SourcebookEntryFooter,
  SourcebookEntryHeader,
  SourcebookEntryImagesSection,
  SourcebookEntryRelationsSection,
  SourcebookImagePickerModal,
} from './SourcebookEntryDialogSections';

interface SourcebookEntryDialogViewProps {
  entry?: SourcebookEntry | null;
  theme: AppTheme;
  language: string;
  entryDialogRef: React.RefObject<HTMLDivElement | null>;
  imagePickerRef: React.RefObject<HTMLDivElement | null>;
  bgClass: string;
  textClass: string;
  borderClass: string;
  inputBgClass: string;
  labelClass: string;
  descriptionSurfaceClass: string;
  descriptionTextClass: string;
  inputBorderClass: string;
  isLight: boolean;
  name: string;
  category: string;
  synonyms: string[];
  newSynonym: string;
  images: string[];
  relations: SourcebookRelation[];
  relationNameMap: Record<string, string>;
  availableImages: ProjectImage[];
  selectedImagesList: ProjectImage[];
  description: string;
  descriptionBaseline?: string;
  showDiff: boolean;
  showKeywordsPanel: boolean;
  keywords: string[];
  isGeneratingKeywords: boolean;
  keywordsTooltip: string;
  searchHighlightRanges: Array<{ start: number; end: number }>;
  isImagesExpanded: boolean;
  isRelationsExpanded: boolean;
  isImagePickerOpen: boolean;
  isRelationDialogVisible: boolean;
  editingRelationIndex: number | null;
  historyIndex: number;
  historyLength: number;
  canAppUndo: boolean;
  canAppRedo: boolean;
  isSaving: boolean;
  canDelete: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  onUndo: () => void;
  onRedo: () => void;
  onToggleDiff: () => void;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSynonymInputChange: (value: string) => void;
  onAddSynonym: () => void;
  onRemoveSynonym: (index: number) => void;
  onToggleImagesExpanded: () => void;
  onOpenImagePicker: () => void;
  onToggleImage: (filename: string) => void;
  onToggleRelationsExpanded: () => void;
  onOpenAddRelation: () => void;
  onEditRelation: (index: number) => void;
  onDeleteRelation: (index: number) => void;
  onDescriptionChange: (value: string) => void;
  onToggleKeywordsPanel: () => void;
  onDeleteEntry: () => Promise<void>;
  onSaveEntry: () => Promise<void>;
  onSaveRelation: (relation: SourcebookRelation) => void;
  onCloseRelationDialog: () => void;
  onCloseImagePicker: () => void;
}

// eslint-disable-next-line max-lines-per-function
export const SourcebookEntryDialogView: React.FC<SourcebookEntryDialogViewProps> = (
  props: SourcebookEntryDialogViewProps
) => {
  const {
    entry,
    theme,
    language,
    entryDialogRef,
    imagePickerRef,
    bgClass,
    textClass,
    borderClass,
    inputBgClass,
    labelClass,
    descriptionSurfaceClass,
    descriptionTextClass,
    inputBorderClass,
    isLight,
    name,
    category,
    synonyms,
    newSynonym,
    images,
    relations,
    relationNameMap,
    availableImages,
    selectedImagesList,
    description,
    descriptionBaseline,
    showDiff,
    showKeywordsPanel,
    keywords,
    isGeneratingKeywords,
    keywordsTooltip,
    searchHighlightRanges,
    isImagesExpanded,
    isRelationsExpanded,
    isImagePickerOpen,
    isRelationDialogVisible,
    editingRelationIndex,
    historyIndex,
    historyLength,
    canAppUndo,
    canAppRedo,
    isSaving,
    canDelete,
    t,
    onUndo,
    onRedo,
    onToggleDiff,
    onClose,
    onNameChange,
    onCategoryChange,
    onSynonymInputChange,
    onAddSynonym,
    onRemoveSynonym,
    onToggleImagesExpanded,
    onOpenImagePicker,
    onToggleImage,
    onToggleRelationsExpanded,
    onOpenAddRelation,
    onEditRelation,
    onDeleteRelation,
    onDescriptionChange,
    onToggleKeywordsPanel,
    onDeleteEntry,
    onSaveEntry,
    onSaveRelation,
    onCloseRelationDialog,
    onCloseImagePicker,
  } = props;
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
            historyLength={historyLength}
            canAppUndo={canAppUndo}
            canAppRedo={canAppRedo}
            showDiff={showDiff}
            onUndo={onUndo}
            onRedo={onRedo}
            onToggleDiff={onToggleDiff}
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
              onNameChange={onNameChange}
              onCategoryChange={onCategoryChange}
              onSynonymInputChange={onSynonymInputChange}
              onAddSynonym={onAddSynonym}
              onRemoveSynonym={onRemoveSynonym}
            />

            <SourcebookEntryImagesSection
              isImagesExpanded={isImagesExpanded}
              selectedImagesList={selectedImagesList}
              labelClass={labelClass}
              inputBorderClass={inputBorderClass}
              inputBgClass={inputBgClass}
              theme={theme}
              t={t}
              onToggleExpanded={onToggleImagesExpanded}
              onOpenPicker={onOpenImagePicker}
              onToggleImage={onToggleImage}
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
              onToggleExpanded={onToggleRelationsExpanded}
              onOpenAddRelation={onOpenAddRelation}
              onEditRelation={onEditRelation}
              onDeleteRelation={onDeleteRelation}
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
              searchHighlightRanges={searchHighlightRanges}
              t={t}
              onDescriptionChange={onDescriptionChange}
              onToggleKeywordsPanel={onToggleKeywordsPanel}
            />
          </div>

          <SourcebookEntryFooter
            entry={entry}
            canDelete={canDelete}
            isSaving={isSaving}
            isLight={isLight}
            borderClass={borderClass}
            theme={theme}
            t={t}
            onDelete={onDeleteEntry}
            onCancel={onClose}
            onSave={onSaveEntry}
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
        onClose={onCloseImagePicker}
        onToggleImage={onToggleImage}
      />

      <SourcebookRelationDialog
        isOpen={isRelationDialogVisible}
        onClose={onCloseRelationDialog}
        onSave={onSaveRelation}
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
