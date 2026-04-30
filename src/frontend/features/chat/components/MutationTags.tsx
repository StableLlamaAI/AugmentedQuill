// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Provide a list of tags representing recent modifications made by the AI.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../layout/ThemeContext';
import { FileText, Book, Info, ScrollText, User } from 'lucide-react';

export type SessionMutation = {
  id: string;
  type: 'story' | 'chapter' | 'sourcebook' | 'metadata' | 'book';
  label: string;
  targetId?: string; // chapter ID, entry ID, etc.
  subType?: string; // further field detail if applicable (e.g. metadata tab)
};

interface MutationTagsProps {
  mutations: SessionMutation[];
  onMutationClick: (mutation: SessionMutation) => void;
}

export const MutationTags: React.FC<MutationTagsProps> = ({
  mutations,
  onMutationClick,
}: MutationTagsProps) => {
  const { isLight } = useTheme();
  const { t } = useTranslation();

  if (mutations.length === 0) return null;

  const bgClass = isLight
    ? 'bg-amber-50 border-amber-200'
    : 'bg-amber-900/20 border-amber-800/50';
  const textClass = isLight ? 'text-amber-800' : 'text-amber-200';
  const hoverClass = isLight ? 'hover:bg-amber-100' : 'hover:bg-amber-800/40';

  const getIcon = (type: SessionMutation['type']) => {
    switch (type) {
      case 'story':
      case 'chapter':
        return <FileText size={12} />;
      case 'book':
        return <Book size={12} />;
      case 'sourcebook':
        return <ScrollText size={12} />;
      case 'metadata':
        return <Info size={12} />;
      default:
        return <Info size={12} />;
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {mutations.map((m: SessionMutation) => (
        <button
          type="button"
          key={m.id}
          onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            event.preventDefault();
            onMutationClick(m);
          }}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${bgClass} ${textClass} ${hoverClass}`}
        >
          {getIcon(m.type)}
          <span>{t(m.label)}</span>
        </button>
      ))}
    </div>
  );
};
