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
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../layout/useFocusTrap';

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
  const [draft, setDraft] = useState(scratchpad);

  useFocusTrap(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (!isOpen) {
      setDraft(scratchpad || '');
    }
  }, [scratchpad, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="none"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scratchpad-dialog-title"
        tabIndex={-1}
        className={`w-full max-w-2xl rounded-lg border shadow-xl p-4 ${
          isLight
            ? 'bg-white text-brand-gray-800 border-brand-gray-200'
            : 'bg-brand-gray-900 text-brand-gray-100 border-brand-gray-700'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            id="scratchpad-dialog-title"
            className="text-sm font-bold uppercase tracking-wider text-brand-gray-500"
          >
            {t('Scratchpad')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-brand-gray-200 dark:hover:bg-brand-gray-800"
            title={t('Close Scratchpad')}
            aria-label={t('Close scratchpad')}
          >
            <X size={16} />
          </button>
        </div>
        <textarea
          lang={storyLanguage || 'en'}
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) =>
            setDraft(e.target.value)
          }
          className={`w-full min-h-[220px] rounded border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
            isLight
              ? 'bg-white border-brand-gray-300 text-brand-gray-900'
              : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-100'
          }`}
          placeholder={t('Current internal notes of the chat LLM...')}
        />
        <div className="mt-3 flex justify-between items-center">
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
  );
};
