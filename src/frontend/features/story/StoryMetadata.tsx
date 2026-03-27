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
import { AppTheme, Conflict } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { MetadataEditorDialog } from './MetadataEditorDialog';

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
  onAiGenerateSummary?: (
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void
  ) => Promise<string | undefined>;
  summaryAiDisabledReason?: string;
  theme?: AppTheme;
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
  onAiGenerateSummary,
  summaryAiDisabledReason,
  theme = 'mixed',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);

  const { isLight } = useThemeClasses();
  const containerClass = isLight
    ? 'bg-brand-gray-50 text-brand-gray-800 border-brand-gray-200'
    : 'bg-brand-gray-900 text-brand-gray-300 border-brand-gray-800';
  const tagClass = isLight
    ? 'bg-brand-gray-50 text-brand-gray-600 border-brand-gray-200'
    : 'bg-brand-gray-800 text-brand-gray-400 border-brand-gray-700';
  const usesStoryDraftSource = projectType === 'short-story';

  const handleMetadataSave = async (data: {
    title: string;
    summary: string;
    tags: string[];
    notes?: string;
    private_notes?: string;
    conflicts?: Conflict[];
    language?: string;
  }) => {
    await onUpdate(
      data.title,
      data.summary,
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
          type="story"
          title="Edit Story Metadata"
          initialData={{
            title,
            summary,
            tags,
            notes,
            private_notes,
            conflicts,
            language,
          }}
          languages={languages}
          onSave={handleMetadataSave}
          onClose={() => setMetadataModalOpen(false)}
          allowConflicts={usesStoryDraftSource}
          primarySourceLabel={usesStoryDraftSource ? 'Story Draft' : 'Chapters'}
          onAiGenerate={onAiGenerateSummary}
          aiDisabledReason={summaryAiDisabledReason}
          theme={theme}
        />
      )}
      <div className="flex justify-between items-start mb-3">
        <h1 className="text-xl font-bold font-serif tracking-wide">
          {title}
          {language && (
            <span className="ml-2 text-sm text-brand-gray-500">
              ({language.toUpperCase()})
            </span>
          )}
        </h1>
        <button
          onClick={() => setMetadataModalOpen(true)}
          className="text-brand-gray-500 hover:text-brand-gray-400 transition-colors"
        >
          <Edit size={16} />
        </button>
      </div>
      <div className="text-sm text-brand-gray-500 mb-4 leading-relaxed">
        {summary ? (
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
            <MarkdownView content={summary} simple />
            {hasUnsupportedSummaryMarkdown(summary) && <SummaryWarning />}
          </div>
        ) : (
          <span className="italic">No description yet.</span>
        )}
      </div>
      {notes && (
        <div className="text-sm text-brand-gray-500 mb-4 leading-relaxed border-t pt-2 dark:border-gray-700">
          <span className="text-xs uppercase font-bold text-brand-gray-600 block mb-1">
            Notes (LLM Visible)
          </span>
          <div className="max-h-24 overflow-y-auto custom-scrollbar">
            <MarkdownView content={notes} simple />
          </div>
        </div>
      )}
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
