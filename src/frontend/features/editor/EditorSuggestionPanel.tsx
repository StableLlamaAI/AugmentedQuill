// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: The persistent footer panel that shows AI continuation suggestions
 * or the "Suggest next paragraph" trigger button.
 *
 * Extracted from Editor.tsx to keep this distinct UI section in its own file.
 */

import React from 'react';
import { Sparkles, Loader2, SplitSquareHorizontal, RefreshCw } from 'lucide-react';
import { useEditorContext } from './EditorContext';

export const EditorSuggestionPanel: React.FC = () => {
  const {
    theme,
    footerBg,
    textMuted,
    shouldShowContinuationPanel,
    displayedContinuations,
    isSuggesting,
    isAiLoading,
    isWritingAvailable,
    writingUnavailableReason,
    localContentRef,
    onSuggestionButtonClick,
    onAcceptContinuation,
    onRegenerate,
  } = useEditorContext();

  return (
    <div
      className={`flex-shrink-0 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${footerBg}`}
    >
      {shouldShowContinuationPanel ? (
        <div className="p-4 animate-in slide-in-from-bottom-2 duration-300">
          <div
            className="flex items-center justify-between mb-3 px-1"
            role="region"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="flex items-center space-x-2 text-brand-500">
              <SplitSquareHorizontal size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Choose a continuation
              </span>
              <button
                onClick={() => {
                  const cursor = localContentRef.current.length;
                  onRegenerate(cursor, localContentRef.current);
                }}
                className="inline-flex items-center justify-center p-1 rounded-md transition-colors text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-400 dark:hover:text-brand-gray-200 hover:bg-brand-gray-100 dark:hover:bg-brand-gray-750"
                title="Reload suggestions (same as arrow-down)"
                aria-label="Reload continuation suggestions"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <button
              onClick={() => onAcceptContinuation('', localContentRef.current)}
              className={`${textMuted} hover:text-brand-gray-800 text-xs`}
            >
              Dismiss
            </button>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar"
            role="list"
          >
            {displayedContinuations.map((option, idx) => {
              const isEmpty = !option || option.trim().length === 0;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isEmpty}
                  onClick={
                    isEmpty
                      ? undefined
                      : () => onAcceptContinuation(option, localContentRef.current)
                  }
                  className={`group relative p-5 rounded-lg border transition-all text-left ${
                    isEmpty
                      ? 'cursor-default opacity-60'
                      : 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5'
                  } ${
                    theme === 'light'
                      ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 hover:border-brand-300'
                      : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-750 hover:border-brand-gray-500/50'
                  }`}
                  role="listitem"
                  aria-label={
                    isEmpty
                      ? 'Waiting for suggestion'
                      : `Accept suggestion: ${option.substring(0, 50)}...`
                  }
                >
                  <div
                    className={`font-serif text-sm leading-relaxed ${
                      theme === 'light'
                        ? isEmpty
                          ? 'text-brand-gray-400 italic'
                          : 'text-brand-gray-800'
                        : isEmpty
                          ? 'text-brand-gray-500 italic'
                          : 'text-brand-gray-300 group-hover:text-brand-gray-200'
                    }`}
                  >
                    {isEmpty ? 'Waiting for suggestion...' : option}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-3 flex justify-center items-center space-x-3">
          <button
            onClick={onSuggestionButtonClick}
            disabled={!isWritingAvailable}
            className={`group flex items-center space-x-3 px-6 py-3 rounded-full border transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
              theme === 'light'
                ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 text-brand-gray-600'
                : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-700 hover:border-brand-500/30 text-brand-gray-300'
            }`}
            title={
              !isWritingAvailable
                ? writingUnavailableReason
                : isSuggesting || isAiLoading
                  ? 'Stop current AI generation'
                  : 'Get AI Suggestions (WRITING model)'
            }
          >
            {isSuggesting || isAiLoading ? (
              <>
                <Loader2 className="animate-spin text-violet-500" size={18} />
                <span className="font-medium text-sm text-violet-600 dark:text-violet-400">
                  Writing...
                </span>
              </>
            ) : (
              <>
                <div className="bg-violet-100 dark:bg-violet-900/30 p-1 rounded-md text-violet-600 dark:text-violet-400">
                  <Sparkles size={16} />
                </div>
                <span className="font-medium text-sm">Suggest next paragraph</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
