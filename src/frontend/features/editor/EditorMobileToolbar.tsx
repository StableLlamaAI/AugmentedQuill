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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileEdit, MoreHorizontal, Wand2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useClickOutside } from '../../utils/hooks';
import { useEditorContext } from './EditorContext';

type ToolbarLayoutMode = 'full' | 'compact' | 'split' | 'menu';

type MenuAction = {
  key: string;
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  disabled: boolean;
  title: string;
};

const FULL_LAYOUT_MIN_WIDTH = 420;
const COMPACT_LAYOUT_MIN_WIDTH = 330;
const SPLIT_LAYOUT_MIN_WIDTH = 250;

const getLayoutMode = (width: number): ToolbarLayoutMode => {
  if (width >= FULL_LAYOUT_MIN_WIDTH) {
    return 'full';
  }
  if (width >= COMPACT_LAYOUT_MIN_WIDTH) {
    return 'compact';
  }
  if (width >= SPLIT_LAYOUT_MIN_WIDTH) {
    return 'split';
  }
  return 'menu';
};

export const EditorMobileToolbar: React.FC = () => {
  const { t } = useTranslation();
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

  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const syncWidth = (): void => {
      setToolbarWidth(element.getBoundingClientRect().width);
    };

    syncWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncWidth);
      return (): void => window.removeEventListener('resize', syncWidth);
    }

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (typeof nextWidth === 'number') {
        setToolbarWidth(nextWidth);
      }
    });
    observer.observe(element);

    return (): void => observer.disconnect();
  }, []);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const layoutMode = getLayoutMode(toolbarWidth);
  const showLabel = layoutMode === 'full';
  const showInlineRewrite = layoutMode === 'full' || layoutMode === 'compact';
  const showInlineExtend = layoutMode !== 'menu';
  const showMenuTrigger = layoutMode === 'split' || layoutMode === 'menu';
  const iconOnlyInlineActions = layoutMode === 'split' && toolbarWidth < 290;

  const aiSectionLabel = chapterScope === 'story' ? t('Story AI') : t('Chapter AI');

  const extendButtonTitle = !isWritingAvailable
    ? writingUnavailableReason
    : chapterScope === 'story'
      ? t('Extend Story Draft (WRITING model)')
      : t('Extend Chapter (WRITING model)');

  const rewriteButtonTitle = !isWritingAvailable
    ? writingUnavailableReason
    : isChapterEmpty
      ? t('Chapter is empty; cannot rewrite existing text.')
      : chapterScope === 'story'
        ? t('Rewrite Story Draft (WRITING model)')
        : t('Rewrite Chapter (WRITING model)');

  const menuActions = useMemo(
    () => [
      {
        key: 'extend',
        label: t('Extend'),
        icon: <Wand2 size={14} />,
        onClick: (): void => onAiAction('chapter', 'extend'),
        disabled: isAiLoading || !isWritingAvailable,
        title: extendButtonTitle,
      },
      {
        key: 'rewrite',
        label: t('Rewrite'),
        icon: <FileEdit size={14} />,
        onClick: (): void => onAiAction('chapter', 'rewrite'),
        disabled: isAiLoading || !isWritingAvailable || isChapterEmpty,
        title: rewriteButtonTitle,
      },
    ],
    [
      extendButtonTitle,
      isAiLoading,
      isChapterEmpty,
      isWritingAvailable,
      onAiAction,
      rewriteButtonTitle,
      t,
    ]
  );

  const visibleMenuActions = menuActions.filter((action: MenuAction) => {
    if (layoutMode === 'split') {
      return action.key === 'rewrite';
    }
    if (layoutMode === 'menu') {
      return true;
    }
    return false;
  });

  return (
    <div ref={rootRef} className={`flex-none z-20 xl:hidden ${toolbarBg}`}>
      <div className="h-14 w-full flex items-center justify-end px-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex items-center rounded-md p-1 gap-1 min-w-0 ${
              theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-800'
            }`}
          >
            {showLabel && (
              <>
                <span
                  className={`text-[10px] font-bold uppercase px-2 shrink-0 ${textMuted}`}
                >
                  {aiSectionLabel}
                </span>
                <div
                  className={`w-px h-4 ${
                    theme === 'light' ? 'bg-brand-gray-300' : 'bg-brand-gray-700'
                  }`}
                ></div>
              </>
            )}

            {showInlineExtend && (
              <Button
                theme={theme}
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={(): void => onAiAction('chapter', 'extend')}
                disabled={isAiLoading || !isWritingAvailable}
                icon={<Wand2 size={12} />}
                title={extendButtonTitle}
              >
                {iconOnlyInlineActions ? '' : t('Extend')}
              </Button>
            )}

            {showInlineRewrite && (
              <Button
                theme={theme}
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={(): void => onAiAction('chapter', 'rewrite')}
                disabled={isAiLoading || !isWritingAvailable || isChapterEmpty}
                icon={<FileEdit size={12} />}
                title={rewriteButtonTitle}
              >
                {t('Rewrite')}
              </Button>
            )}

            {showMenuTrigger && (
              <div className="relative" ref={menuRef}>
                <Button
                  theme={theme}
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2"
                  onClick={(): void => setMenuOpen((open: boolean) => !open)}
                  icon={
                    layoutMode === 'menu' ? (
                      <MoreHorizontal size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )
                  }
                  title={t('More AI actions')}
                >
                  {layoutMode === 'menu' ? t('AI') : ''}
                </Button>

                {menuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={(): void => setMenuOpen(false)}
                      aria-label={t('Close AI actions menu')}
                    />
                    <div
                      role="menu"
                      className={`absolute right-0 top-full mt-2 min-w-40 rounded-lg shadow-xl border p-1 z-20 ${
                        theme === 'light'
                          ? 'bg-brand-gray-50 border-brand-gray-200'
                          : 'bg-brand-gray-800 border-brand-gray-700'
                      }`}
                    >
                      {visibleMenuActions.map((action: MenuAction) => (
                        <Button
                          key={action.key}
                          type="button"
                          theme={theme}
                          size="sm"
                          variant="ghost"
                          className="w-full text-xs h-8 justify-start"
                          onClick={(): void => {
                            action.onClick();
                            setMenuOpen(false);
                          }}
                          disabled={action.disabled}
                          icon={action.icon}
                          title={action.title}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
