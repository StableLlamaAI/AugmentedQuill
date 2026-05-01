// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Inline slide-down panel for viewing and updating the chat system instruction.
 * Extracted from Chat.tsx to keep this distinct UI concern in its own file.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppTheme } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { useFocusTrap } from '../../layout/useFocusTrap';

export interface ChatSystemPromptPanelProps {
  isOpen: boolean;
  isLight: boolean;
  bgMain: string;
  borderClass: string;
  inputBg: string;
  systemPrompt: string;
  isModelAvailable: boolean;
  chatDisabledReason: string;
  storyLanguage?: string;
  theme: AppTheme;
  onClose: () => void;
  onSave: (newPrompt: string) => void;
}

export const ChatSystemPromptPanel: React.FC<ChatSystemPromptPanelProps> = ({
  isOpen,
  isLight: _isLight,
  bgMain,
  borderClass,
  inputBg,
  systemPrompt,
  isModelAvailable,
  chatDisabledReason,
  storyLanguage,
  theme,
  onClose,
  onSave,
}: ChatSystemPromptPanelProps) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(systemPrompt);

  useFocusTrap(isOpen, panelRef, onClose);

  useEffect((): void => {
    setTempSystemPrompt(systemPrompt);
  }, [systemPrompt]);

  if (!isOpen) return null;

  const handleSave = (): void => {
    onSave(tempSystemPrompt);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="region"
      aria-labelledby="system-instruction-title"
      className={`p-4 border-b animate-in slide-in-from-top-2 ${bgMain} ${borderClass}`}
    >
      <label
        id="system-instruction-title"
        className="block text-xs font-medium text-brand-gray-500 uppercase tracking-wider mb-2"
      >
        {t('System Instruction')}
      </label>
      <textarea
        lang={storyLanguage || 'en'}
        value={tempSystemPrompt}
        spellCheck={true}
        onChange={(
          e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
        ): void => setTempSystemPrompt(e.target.value)}
        className={`w-full h-32 rounded-md p-3 text-sm focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none mb-3 border ${inputBg}`}
        placeholder={t("Define the AI's persona and rules...")}
        disabled={!isModelAvailable}
        title={!isModelAvailable ? chatDisabledReason : t('System Instruction')}
      />
      <div className="flex justify-end space-x-2">
        <Button
          theme={theme}
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={!isModelAvailable}
          title={!isModelAvailable ? chatDisabledReason : t('Cancel')}
        >
          {t('Cancel')}
        </Button>
        <Button
          theme={theme}
          size="sm"
          variant="primary"
          onClick={handleSave}
          disabled={!isModelAvailable}
          title={!isModelAvailable ? chatDisabledReason : t('Update Persona')}
        >
          {t('Update Persona')}
        </Button>
      </div>
    </div>
  );
};
