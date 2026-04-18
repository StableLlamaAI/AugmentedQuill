// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the story metadata unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState } from 'react';
import { Edit } from 'lucide-react';
import {
  MarkdownView,
  hasUnsupportedSummaryMarkdown,
  SummaryWarning,
} from '../editor/MarkdownView';
import { useSearchHighlight } from '../search/SearchHighlightContext';
import { AppTheme, Conflict } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { MetadataEditorDialog } from './MetadataEditorDialog';
import { MetadataParams } from './metadataSync';

interface StoryMetadataProps {
  title: string;
  summary: string;
  tags: string[];
  notes?: string;
  private_notes?: string;
  conflicts?: Conflict[];
  language?: string;
  projectType?: 'short-story' | 'novel' | 'series';
  /** available instruction languages, used by the metadata dialog */
  languages?: string[];
  onUpdate: (
    title: string,
    summary: string,
    tags: string[],
    notes?: string,
    private_notes?: string,
    conflicts?: Conflict[],
    language?: string
  ) => Promise<void>;
  metadataDialogTrigger?: {
    id: number;
    initialTab?: 'summary' | 'notes' | 'private' | 'conflicts';
  } | null;
  onAiGenerateSummary?: (
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void,
    source?: 'chapter' | 'notes'
  ) => Promise<string | undefined>;
  summaryAiDisabledReason?: string;
  primarySourceAvailable?: boolean;
  initialTab?: 'summary' | 'notes' | 'private' | 'conflicts';
  closeDialogTrigger?: number;
  theme?: AppTheme;
  baselineSummary?: string;
  baselineNotes?: string;
  baselinePrivateNotes?: string;
  baselineConflicts?: Conflict[];
  spellCheck?: boolean;
}

export const StoryMetadata: React.FC<StoryMetadataProps> = ({
  title,
  summary,
  tags,
  notes,
  private_notes,
  conflicts,
  language,
  projectType = 'novel',
  languages,
  onUpdate,
  metadataDialogTrigger,
  onAiGenerateSummary,
  summaryAiDisabledReason,
  primarySourceAvailable,
  initialTab,
  closeDialogTrigger,
  theme = 'mixed',
  baselineSummary = '',
  baselineNotes = '',
  baselinePrivateNotes = '',
  baselineConflicts = [],
  spellCheck = true,
}) => {
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);

  React.useEffect(() => {
    if (metadataDialogTrigger) {
      setMetadataModalOpen(true);
    }
  }, [metadataDialogTrigger]);

  React.useEffect(() => {
    if (closeDialogTrigger) {
      setMetadataModalOpen(false);
    }
  }, [closeDialogTrigger]);

  const { isLight } = useThemeClasses();
  const { getRanges } = useSearchHighlight();
  const summaryHighlightRanges = getRanges('story_metadata', 'story', 'story_summary');

  const containerClass = isLight
    ? 'bg-brand-gray-50 text-brand-gray-800 border-brand-gray-200'
    : 'bg-brand-gray-900 text-brand-gray-300 border-brand-gray-800';
  const tagClass = isLight
    ? 'bg-brand-gray-50 text-brand-gray-600 border-brand-gray-200'
    : 'bg-brand-gray-800 text-brand-gray-400 border-brand-gray-700';
  const usesStoryDraftSource = projectType === 'short-story';
  const primarySourceLabel = usesStoryDraftSource
    ? 'Story Draft'
    : projectType === 'series'
      ? 'Books'
      : 'Chapters';

  const handleMetadataSave = async (data: MetadataParams) => {
    await onUpdate(
      data.title || '',
      data.summary || '',
      data.tags || [],
      data.notes,
      data.private_notes,
      data.conflicts,
      data.language
    );
  };

  return (
    <div
      id="story-metadata"
      className={`p-6 flex-1 overflow-y-auto custom-scrollbar ${containerClass}`}
    >
      {metadataModalOpen && (
        <MetadataEditorDialog
          key={metadataDialogTrigger?.id ?? 0}
          type="story"
          title="Edit Story Metadata"
          language={language}
          spellCheck={spellCheck}
          initialData={{
            title,
            summary,
            tags,
            notes,
            private_notes,
            conflicts,
            language,
          }}
          baseline={{
            title,
            summary: baselineSummary,
            notes: baselineNotes,
            private_notes: baselinePrivateNotes,
            conflicts: baselineConflicts,
            language,
          }}
          languages={languages}
          onSave={handleMetadataSave}
          onClose={() => setMetadataModalOpen(false)}
          allowConflicts={usesStoryDraftSource}
          primarySourceLabel={primarySourceLabel}
          initialTab={initialTab}
          onAiGenerate={onAiGenerateSummary}
          aiDisabledReason={summaryAiDisabledReason}
          primarySourceAvailable={primarySourceAvailable}
          theme={theme}
        />
      )}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-2">
          <h1 className="text-xl font-bold font-serif tracking-wide">
            {title}
            {language && (
              <span className="ml-2 text-sm text-brand-gray-500">
                ({language.toUpperCase()})
              </span>
            )}
          </h1>
          {!!conflicts?.length && (
            <span
              className="mt-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
              aria-label={`${conflicts.length} active conflicts`}
              title={`${conflicts.length} active conflicts`}
            >
              {conflicts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setMetadataModalOpen(true)}
          className="text-brand-gray-500 hover:text-brand-gray-400 transition-colors"
          aria-label="Edit story metadata"
          title="Edit story metadata"
        >
          <Edit size={16} />
        </button>
      </div>
      <div className="text-sm text-brand-gray-500 mb-4 leading-relaxed">
        {summary ? (
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            <MarkdownView
              content={summary}
              simple
              baseline={baselineSummary}
              language={language}
              searchHighlightRanges={summaryHighlightRanges}
            />
            {hasUnsupportedSummaryMarkdown(summary) && <SummaryWarning />}
          </div>
        ) : (
          <span className="italic">No description yet.</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <span key={i} className={`px-2 py-1 text-xs rounded-full border ${tagClass}`}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
};
