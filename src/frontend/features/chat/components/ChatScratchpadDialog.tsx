// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Modal dialog for viewing and editing the chat LLM's internal scratchpad notes.
 * Extracted from Chat.tsx to keep dialog UI isolated and independently testable.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../layout/useFocusTrap';
import { CodeMirrorEditor } from '../../editor/CodeMirrorEditor';

export interface ChatScratchpadDialogProps {
  isOpen: boolean;
  isLight: boolean;
  storyLanguage?: string;
  scratchpad: string;
  onClose: () => void;
  onDelete: () => void;
  onSave: (content: string) => void;
}

export const ChatScratchpadDialog: React.FC<ChatScratchpadDialogProps> = ({
  isOpen,
  isLight,
  storyLanguage,
  scratchpad,
  onClose,
  onDelete,
  onSave,
}: ChatScratchpadDialogProps) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  useFocusTrap(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (isOpen) {
      setDraft(scratchpad || '');
    }
  }, [scratchpad, isOpen]);

  if (!isOpen) return null;

  const content = (
    <div ref={dialogRef} role="none" className={isLight ? '' : 'dark'}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scratchpad-dialog-title"
        tabIndex={-1}
        className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/50"
      >
        <div
          className={`pointer-events-auto w-[98vw] h-[95vh] rounded-lg shadow-xl border flex flex-col ${
            isLight
              ? 'bg-white text-brand-gray-800 border-brand-gray-200'
              : 'bg-brand-gray-900 text-brand-gray-400 border-brand-gray-800'
          }`}
        >
          <div className="flex justify-between items-center p-4 border-b dark:border-brand-gray-800">
            <h2
              id="scratchpad-dialog-title"
              className="text-base font-semibold dark:text-brand-gray-300"
            >
              {t('Scratchpad')}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
              title={t('Close Scratchpad')}
              aria-label={t('Close scratchpad')}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 p-4 min-h-0 flex flex-col gap-2 overflow-y-auto">
            <div className="text-sm text-brand-gray-500 mb-1">
              {t('Visible to LLM')}
            </div>
            <CodeMirrorEditor
              value={draft}
              onChange={(value: string) => setDraft(value)}
              language={storyLanguage}
              spellCheck={true}
              mode="markdown"
              showDiff={false}
              className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 font-sans text-sm md:text-base leading-relaxed transition-all overflow-y-auto"
              placeholder={t('Scratchpad')}
              style={{ minHeight: '300px' }}
            />
          </div>
          <div className="p-4 border-t dark:border-brand-gray-800 flex justify-between items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                onDelete();
                setDraft('');
              }}
              className="rounded px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
              title={t('Delete scratchpad content')}
            >
              {t('Delete')}
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded px-3 py-1 text-xs font-medium border border-brand-gray-300 hover:bg-brand-gray-100 dark:border-brand-gray-700 dark:hover:bg-brand-gray-800"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
                aria-label={t('Save Scratchpad')}
                className="rounded px-3 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
