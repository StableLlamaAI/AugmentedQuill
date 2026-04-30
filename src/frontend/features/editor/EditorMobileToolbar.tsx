// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Compact mobile toolbar shown on screens narrower than xl breakpoint,
 * providing quick access to AI extend/rewrite actions.
 */

import React from 'react';
import { Wand2, FileEdit } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useEditorContext } from './EditorContext';

export const EditorMobileToolbar: React.FC = () => {
  const {
    theme,
    toolbarBg,
    textMuted,
    chapterScope,
    isAiLoading,
    isWritingAvailable,
    writingUnavailableReason,
    isChapterEmpty,
    onAiAction,
  } = useEditorContext();

  return (
    <div className={`flex-none z-20 xl:hidden ${toolbarBg}`}>
      <div className="h-14 flex items-center justify-between px-4">
        <div className="flex items-center space-x-3">
          {/* Mobile Toolbar Left Items */}
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`flex items-center rounded-md p-1 space-x-1 ${
              theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-800'
            }`}
          >
            <span className={`text-[10px] font-bold uppercase px-2 ${textMuted}`}>
              {chapterScope === 'story' ? 'Story AI' : 'Chapter AI'}
            </span>
            <div
              className={`w-px h-4 ${
                theme === 'light' ? 'bg-brand-gray-300' : 'bg-brand-gray-700'
              }`}
            ></div>
            <Button
              theme={theme}
              size="sm"
              variant="ghost"
              className="text-xs h-7"
              onClick={(): void => onAiAction('chapter', 'extend')}
              disabled={isAiLoading || !isWritingAvailable}
              icon={<Wand2 size={12} />}
              title={
                !isWritingAvailable
                  ? writingUnavailableReason
                  : chapterScope === 'story'
                    ? 'Extend Story Draft (WRITING model)'
                    : 'Extend Chapter (WRITING model)'
              }
            >
              Extend
            </Button>
            <Button
              theme={theme}
              size="sm"
              variant="ghost"
              className="text-xs h-7"
              onClick={(): void => onAiAction('chapter', 'rewrite')}
              disabled={isAiLoading || !isWritingAvailable || isChapterEmpty}
              icon={<FileEdit size={12} />}
              title={
                !isWritingAvailable
                  ? writingUnavailableReason
                  : isChapterEmpty
                    ? 'Chapter is empty; cannot rewrite existing text.'
                    : chapterScope === 'story'
                      ? 'Rewrite Story Draft (WRITING model)'
                      : 'Rewrite Chapter (WRITING model)'
              }
            >
              Rewrite
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
