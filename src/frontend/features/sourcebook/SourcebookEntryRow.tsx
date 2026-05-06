// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: A single row in the sourcebook entry list with checkbox and hover interaction.
 *
 * Extracted from SourcebookList to keep this focused component in its own file.
 */

import React from 'react';
import { Check } from 'lucide-react';
import type { SourcebookEntry } from '../../types';

export interface SourcebookEntryRowProps {
  entry: SourcebookEntry;
  CategoryIcon: React.ElementType;
  isChecked: boolean;
  diffBorderClass: string;
  isAutoSelectionEnabled: boolean;
  isLoadingEntry: boolean;
  isLight: boolean;
  textClass: string;
  subTextClass: string;
  itemHoverClass: string;
  onClick: (entry: SourcebookEntry) => void;
  onMouseEnter: (
    event: React.MouseEvent<HTMLButtonElement>,
    entry: SourcebookEntry
  ) => void;
  onMouseLeave: () => void;
  onToggle: (id: string, checked: boolean) => void;
}

export const SourcebookEntryRow = React.memo(
  ({
    entry,
    CategoryIcon,
    isChecked,
    diffBorderClass,
    isAutoSelectionEnabled,
    isLoadingEntry,
    isLight,
    textClass,
    subTextClass,
    itemHoverClass,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onToggle,
  }: SourcebookEntryRowProps) => {
    return (
      <div
        key={entry.id}
        className={`group px-3 py-2 rounded-md transition-colors ${itemHoverClass} flex items-center gap-2 select-none ${diffBorderClass} ${
          isLoadingEntry ? 'pointer-events-none opacity-70' : ''
        }`}
        role="listitem"
      >
        <button
          type="button"
          onClick={(): void => onClick(entry)}
          onMouseEnter={(evt: React.MouseEvent<HTMLButtonElement, MouseEvent>): void =>
            onMouseEnter(evt, entry)
          }
          onMouseLeave={onMouseLeave}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <CategoryIcon
            size={14}
            className={`flex-shrink-0 ${subTextClass} group-hover:text-brand-500 transition-colors`}
          />
          <div className={`text-sm truncate ${textClass}`}>{entry.name}</div>
        </button>
        <button
          onClick={(ev: React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
            ev.stopPropagation();
            if (isAutoSelectionEnabled) return;
            onToggle(entry.id, !isChecked);
          }}
          disabled={isAutoSelectionEnabled}
          className={`ml-auto w-4 h-4 rounded border transition-all flex items-center justify-center ${
            isAutoSelectionEnabled ? 'opacity-40 cursor-not-allowed' : ''
          } ${
            isChecked
              ? 'bg-brand-500 border-brand-500 text-white'
              : `${isLight ? 'border-brand-gray-300' : 'border-brand-gray-600'} hover:border-brand-500`
          }`}
          title={
            isAutoSelectionEnabled
              ? 'Automatic selection is enabled; disable Auto to change this manually'
              : isChecked
                ? 'Exclude from context'
                : 'Include in context'
          }
        >
          {isChecked && <Check size={10} strokeWidth={4} />}
        </button>
      </div>
    );
  },
  (
    prevProps: Readonly<SourcebookEntryRowProps>,
    nextProps: Readonly<SourcebookEntryRowProps>
  ): boolean =>
    prevProps.entry.id === nextProps.entry.id &&
    prevProps.entry.name === nextProps.entry.name &&
    prevProps.entry.category === nextProps.entry.category &&
    prevProps.isChecked === nextProps.isChecked &&
    prevProps.diffBorderClass === nextProps.diffBorderClass &&
    prevProps.isAutoSelectionEnabled === nextProps.isAutoSelectionEnabled &&
    prevProps.isLoadingEntry === nextProps.isLoadingEntry &&
    prevProps.isLight === nextProps.isLight &&
    prevProps.textClass === nextProps.textClass &&
    prevProps.subTextClass === nextProps.subTextClass &&
    prevProps.itemHoverClass === nextProps.itemHoverClass &&
    prevProps.CategoryIcon === nextProps.CategoryIcon &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onMouseEnter === nextProps.onMouseEnter &&
    prevProps.onMouseLeave === nextProps.onMouseLeave &&
    prevProps.onToggle === nextProps.onToggle
);
