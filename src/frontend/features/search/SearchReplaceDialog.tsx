// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Modal dialog for project-wide search and replace, supporting
 * literal, regex, and phonetic modes across chapters, sourcebook, and metadata.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import { useFocusTrap } from '../layout/useFocusTrap';
import { useThemeClasses } from '../layout/ThemeContext';
import type { UseSearchReplaceResult } from './useSearchReplace';
import type { SearchScope } from '../../services/apiClients/search';

interface SearchReplaceDialogProps {
  searchState: UseSearchReplaceResult;
  activeChapterId: number | null;
  storyLanguage: string;
  onJumpToPosition: (start: number, end: number) => void;
  onStoryChanged: () => void;
  onNavigateToChapter: (
    chapterId: number,
    jumpStart?: number,
    jumpEnd?: number
  ) => void;
  onNavigateToSourcebookEntry: (entryId: string) => void;
  onNavigateToStoryMetadata: (field: string) => void;
}

const SCOPES: { value: SearchScope; labelKey: string }[] = [
  { value: 'current_chapter', labelKey: 'Current Chapter' },
  { value: 'all_chapters', labelKey: 'All Chapters' },
  { value: 'sourcebook', labelKey: 'Sourcebook' },
  { value: 'metadata', labelKey: 'Metadata' },
  { value: 'all', labelKey: 'All' },
];

export const SearchReplaceDialog: React.FC<SearchReplaceDialogProps> = ({
  searchState,
  activeChapterId,
  storyLanguage,
  onJumpToPosition,
  onStoryChanged,
  onNavigateToChapter,
  onNavigateToSourcebookEntry,
  onNavigateToStoryMetadata,
}) => {
  const { t } = useTranslation();
  const { isLight } = useThemeClasses();
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const {
    isOpen,
    close,
    query,
    setQuery,
    replacement,
    setReplacement,
    caseSensitive,
    setCaseSensitive,
    isRegex,
    setIsRegex,
    isPhonetic,
    setIsPhonetic,
    scope,
    setScope,
    results,
    totalMatches,
    currentMatchIndex,
    flatMatches,
    isLoading,
    error,
    runSearch,
    navigateNext,
    navigatePrev,
    replaceCurrent,
    replaceAllMatches,
  } = searchState;

  useFocusTrap(isOpen, dialogRef, close);

  // Focus query input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => queryInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSearch = useCallback(() => {
    void runSearch(activeChapterId);
  }, [runSearch, activeChapterId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleReplaceCurrent = useCallback(async () => {
    const changed = await replaceCurrent(activeChapterId);
    if (changed) onStoryChanged();
  }, [replaceCurrent, activeChapterId, onStoryChanged]);

  const handleReplaceAll = useCallback(async () => {
    const { storyChanged } = await replaceAllMatches(activeChapterId);
    if (storyChanged) onStoryChanged();
  }, [replaceAllMatches, activeChapterId, onStoryChanged]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleMatchClick = useCallback(
    (
      sectionType: string,
      sectionId: string,
      field: string,
      start: number,
      end: number
    ) => {
      if (sectionType === 'chapter_content') {
        if (activeChapterId !== null && sectionId === String(activeChapterId)) {
          onJumpToPosition(start, end);
        } else {
          const chapId = parseInt(sectionId, 10);
          if (!isNaN(chapId)) onNavigateToChapter(chapId, start, end);
        }
      } else if (sectionType === 'chapter_metadata') {
        const chapId = parseInt(sectionId, 10);
        if (!isNaN(chapId)) onNavigateToChapter(chapId);
      } else if (sectionType === 'story_metadata') {
        onNavigateToStoryMetadata(field);
      } else if (sectionType === 'sourcebook') {
        onNavigateToSourcebookEntry(sectionId);
      }
    },
    [
      activeChapterId,
      onJumpToPosition,
      onNavigateToChapter,
      onNavigateToSourcebookEntry,
      onNavigateToStoryMetadata,
    ]
  );

  if (!isOpen) return null;

  // Theme classes
  const overlayClass =
    'fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 p-4';
  const dialogClass = isLight
    ? 'bg-white border border-brand-gray-200 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col'
    : 'bg-brand-gray-900 border border-brand-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col';
  const headerClass = isLight
    ? 'flex items-center justify-between px-4 py-3 border-b border-brand-gray-200'
    : 'flex items-center justify-between px-4 py-3 border-b border-brand-gray-700';
  const titleClass = isLight
    ? 'flex items-center gap-2 font-semibold text-brand-gray-800'
    : 'flex items-center gap-2 font-semibold text-brand-gray-100';
  const inputClass = isLight
    ? 'flex-1 px-3 py-1.5 rounded border border-brand-gray-300 text-sm bg-white text-brand-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-blue-500'
    : 'flex-1 px-3 py-1.5 rounded border border-brand-gray-600 text-sm bg-brand-gray-800 text-brand-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-blue-400';
  const btnPrimary = isLight
    ? 'px-3 py-1.5 text-sm rounded bg-brand-blue-600 text-white hover:bg-brand-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
    : 'px-3 py-1.5 text-sm rounded bg-brand-blue-700 text-white hover:bg-brand-blue-600 disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGhost = isLight
    ? 'px-3 py-1.5 text-sm rounded border border-brand-gray-300 text-brand-gray-700 hover:bg-brand-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
    : 'px-3 py-1.5 text-sm rounded border border-brand-gray-600 text-brand-gray-300 hover:bg-brand-gray-800 disabled:opacity-50 disabled:cursor-not-allowed';
  const toggleActiveClass = isLight
    ? 'px-2 py-1 text-xs rounded border bg-brand-blue-100 border-brand-blue-400 text-brand-blue-700 font-medium'
    : 'px-2 py-1 text-xs rounded border bg-brand-blue-900 border-brand-blue-500 text-brand-blue-300 font-medium';
  const toggleInactiveClass = isLight
    ? 'px-2 py-1 text-xs rounded border border-brand-gray-300 text-brand-gray-600 hover:bg-brand-gray-100'
    : 'px-2 py-1 text-xs rounded border border-brand-gray-600 text-brand-gray-400 hover:bg-brand-gray-800';
  const radioLabelClass = isLight
    ? 'flex items-center gap-1 text-xs text-brand-gray-700 cursor-pointer'
    : 'flex items-center gap-1 text-xs text-brand-gray-300 cursor-pointer';
  const sectionHeaderClass = isLight
    ? 'flex items-center gap-1 w-full text-left text-sm font-medium text-brand-gray-700 py-1 hover:text-brand-gray-900'
    : 'flex items-center gap-1 w-full text-left text-sm font-medium text-brand-gray-300 py-1 hover:text-brand-gray-100';
  const matchItemClass = isLight
    ? 'text-xs text-brand-gray-600 py-0.5 pl-4 hover:bg-brand-gray-50 cursor-pointer rounded'
    : 'text-xs text-brand-gray-400 py-0.5 pl-4 hover:bg-brand-gray-800 cursor-pointer rounded';
  const errorClass = 'text-xs text-red-600 px-4 py-2';
  const statusClass = isLight
    ? 'text-xs text-brand-gray-500 flex-1'
    : 'text-xs text-brand-gray-400 flex-1';
  const counterClass = isLight
    ? 'text-xs text-brand-gray-600 font-medium'
    : 'text-xs text-brand-gray-300 font-medium';
  const closeClass = isLight
    ? 'p-1 rounded text-brand-gray-500 hover:text-brand-gray-700 hover:bg-brand-gray-100'
    : 'p-1 rounded text-brand-gray-400 hover:text-brand-gray-100 hover:bg-brand-gray-800';

  const content = (
    <div className={overlayClass} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('Search and Replace')}
        className={dialogClass}
      >
        {/* Header */}
        <div className={headerClass}>
          <span className={titleClass}>
            <Search size={16} />
            {t('Search and Replace')}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label={t('Close search')}
            className={closeClass}
          >
            <X size={16} />
          </button>
        </div>

        {/* Inputs */}
        <div className="px-4 py-3 space-y-2 border-b border-brand-gray-200 dark:border-brand-gray-700">
          <div className="flex gap-2">
            <input
              ref={queryInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Search...')}
              aria-label={t('Search...')}
              lang={storyLanguage}
              className={inputClass}
              autoComplete="off"
              spellCheck={true}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
              className={btnPrimary}
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : t('Find')}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={t('Replace...')}
              aria-label={t('Replace...')}
              lang={storyLanguage}
              className={inputClass}
              autoComplete="off"
              spellCheck={true}
            />
            <button
              type="button"
              onClick={handleReplaceCurrent}
              disabled={isLoading || currentMatchIndex === null || !query.trim()}
              className={btnGhost}
            >
              {t('Replace')}
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={isLoading || totalMatches === 0 || !query.trim()}
              className={btnGhost}
            >
              {t('Replace All')}
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="px-4 py-2 border-b border-brand-gray-200 dark:border-brand-gray-700 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={caseSensitive ? toggleActiveClass : toggleInactiveClass}
              aria-pressed={caseSensitive}
              title={t('Case Sensitive')}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegex(!isRegex);
                if (!isRegex) setIsPhonetic(false);
              }}
              className={isRegex ? toggleActiveClass : toggleInactiveClass}
              aria-pressed={isRegex}
              title={t('Regular Expression')}
            >
              .*
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPhonetic(!isPhonetic);
                if (!isPhonetic) setIsRegex(false);
              }}
              className={isPhonetic ? toggleActiveClass : toggleInactiveClass}
              aria-pressed={isPhonetic}
              title={t('Phonetic')}
            >
              ~
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {SCOPES.map(({ value, labelKey }) => (
              <label key={value} className={radioLabelClass}>
                <input
                  type="radio"
                  name="search-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  className="text-brand-blue-600"
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-brand-gray-200 dark:border-brand-gray-700">
          <span className={statusClass}>
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : isLoading ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" />
                {t('Find')}…
              </span>
            ) : totalMatches === 0 && query.trim() ? (
              t('No matches found')
            ) : totalMatches > 0 ? (
              t('{{count}} matches found', { count: totalMatches })
            ) : null}
          </span>
          {flatMatches.length > 0 && (
            <div className="flex items-center gap-1">
              <span className={counterClass}>
                {currentMatchIndex !== null ? currentMatchIndex + 1 : 0}/
                {flatMatches.length}
              </span>
              <button
                type="button"
                onClick={navigatePrev}
                aria-label={t('Previous match')}
                className={toggleInactiveClass}
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                onClick={navigateNext}
                aria-label={t('Next match')}
                className={toggleInactiveClass}
              >
                <ArrowDown size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 min-h-0">
          {results.map((section, si) => {
            const sectionKey = `${section.section_type}:${section.section_id}:${section.field}`;
            const isCollapsed = collapsedSections.has(sectionKey);
            const sectionLabel =
              section.section_type === 'chapter_content' ||
              section.section_type === 'chapter_metadata'
                ? t('Chapter {{title}}', { title: section.section_title })
                : section.section_type === 'sourcebook'
                  ? t('Sourcebook')
                  : t('Story Metadata');
            const fieldLabel = section.field_display;

            // Compute flat index for this section's first match
            let firstFlatIdx = 0;
            for (let i = 0; i < si; i++) {
              firstFlatIdx += results[i].matches.length;
            }

            return (
              <div key={sectionKey}>
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  className={sectionHeaderClass}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>
                    {sectionLabel}
                    {section.field_display ? ` · ${fieldLabel}` : ''}
                  </span>
                  <span className="ml-1 text-xs opacity-60">
                    ({section.matches.length})
                  </span>
                </button>
                {!isCollapsed && (
                  <ul>
                    {section.matches.map((match, mi) => {
                      const flatIdx = firstFlatIdx + mi;
                      const isCurrentMatch = flatIdx === currentMatchIndex;
                      const clickTitle =
                        section.section_type === 'chapter_content' &&
                        activeChapterId !== null &&
                        section.section_id === String(activeChapterId)
                          ? t('Jump to match in editor')
                          : section.section_type === 'chapter_content' ||
                              section.section_type === 'chapter_metadata'
                            ? t('Navigate to chapter')
                            : section.section_type === 'story_metadata'
                              ? t('Open story metadata')
                              : section.section_type === 'sourcebook'
                                ? t('Open sourcebook entry')
                                : undefined;
                      return (
                        <li
                          key={mi}
                          role="button"
                          tabIndex={0}
                          className={
                            isCurrentMatch
                              ? isLight
                                ? 'bg-brand-blue-50 border-l-2 border-brand-blue-500 pl-3 py-0.5 text-xs text-brand-gray-700 rounded-r cursor-pointer'
                                : 'bg-brand-blue-950 border-l-2 border-brand-blue-500 pl-3 py-0.5 text-xs text-brand-gray-200 rounded-r cursor-pointer'
                              : matchItemClass
                          }
                          onClick={() =>
                            handleMatchClick(
                              section.section_type,
                              section.section_id,
                              section.field,
                              match.start,
                              match.end
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleMatchClick(
                                section.section_type,
                                section.section_id,
                                section.field,
                                match.start,
                                match.end
                              );
                            }
                          }}
                          title={clickTitle}
                        >
                          <span className="opacity-60">{match.context_before}</span>
                          <mark
                            className={
                              isLight
                                ? 'bg-yellow-200 text-brand-gray-900 rounded px-0.5'
                                : 'bg-yellow-800 text-yellow-100 rounded px-0.5'
                            }
                          >
                            {match.match_text}
                          </mark>
                          <span className="opacity-60">{match.context_after}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
