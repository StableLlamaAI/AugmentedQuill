// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines center controls in app header to keep top-level header composition concise.
 */

import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  ChevronDown,
  Code,
  Code2,
  Cpu,
  Eye,
  FileEdit,
  FileText,
  Hash,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Wand2,
} from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import {
  HeaderAiControls,
  HeaderFormatControls,
  HeaderModelControls,
  HeaderThemeTokens,
  HeaderViewControls,
} from '../layoutControlTypes';
import { ModelSelector } from '../../chat/ModelSelector';
import { useClickOutside } from '../../../utils/hooks';
import type { AppTheme } from '../../../types/ui';

type HeaderCenterControlsProps = {
  viewControls: HeaderViewControls;
  formatControls: HeaderFormatControls;
  aiControls: HeaderAiControls;
  modelControls: HeaderModelControls;
  themeTokens: HeaderThemeTokens;
};

type FormatButton = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  extraClass?: string;
};

interface ViewModeSelectorProps {
  viewMode: string;
  setViewMode: (mode: 'raw' | 'markdown' | 'wysiwyg') => void;
  showWhitespace: boolean;
  setShowWhitespace: (v: boolean) => void;
  isViewMenuOpen: boolean;
  setIsViewMenuOpen: (v: boolean) => void;
  isLight: boolean;
  iconColor: string;
  iconHover: string;
  buttonActive: string;
  t: (key: string) => string;
}

const VIEW_MODES: Array<{
  key: 'raw' | 'markdown' | 'wysiwyg';
  icon: React.ReactNode;
  label: string;
}> = [
  { key: 'raw', icon: <FileText size={14} />, label: 'Raw' },
  { key: 'markdown', icon: <Code size={14} />, label: 'MD' },
  { key: 'wysiwyg', icon: <Eye size={14} />, label: 'Visual' },
];

const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  viewMode,
  setViewMode,
  showWhitespace,
  setShowWhitespace,
  isViewMenuOpen,
  setIsViewMenuOpen,
  isLight,
  iconColor,
  iconHover,
  buttonActive,
  t,
}: ViewModeSelectorProps) => {
  const activeMode = VIEW_MODES.find((m: { key: string }) => m.key === viewMode);
  const tabBg = isLight
    ? 'bg-brand-gray-100 border-brand-gray-200'
    : 'bg-brand-gray-800 border-brand-gray-700';
  const dropBg = isLight
    ? 'bg-brand-gray-50 border-brand-gray-200'
    : 'bg-brand-gray-800 border-brand-gray-700';
  const dropItem = isLight ? 'hover:bg-brand-gray-100' : 'dark:hover:bg-brand-gray-700';
  return (
    <div className="relative">
      {/* Desktop: inline tab row */}
      <div className={`hidden 2xl:flex items-center p-1 rounded-lg border ${tabBg}`}>
        {VIEW_MODES.map((m: (typeof VIEW_MODES)[0]) => (
          <button
            key={m.key}
            onClick={(): void => setViewMode(m.key)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === m.key ? buttonActive : `${iconColor} ${iconHover}`
            }`}
          >
            {React.cloneElement(m.icon as React.ReactElement<{ size?: number }>, {
              size: 13,
            })}
            <span>{m.label}</span>
          </button>
        ))}
        <div
          className={`w-px h-4 mx-2 ${isLight ? 'bg-brand-gray-300' : 'bg-brand-gray-700'}`}
        />
        <button
          onClick={(): void => setShowWhitespace(!showWhitespace)}
          title={t('Toggle whitespace characters')}
          className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
            showWhitespace ? buttonActive : `${iconColor} ${iconHover}`
          }`}
        >
          <Pilcrow size={13} />
          <span>WS</span>
        </button>
      </div>

      {/* Mobile/tablet: dropdown */}
      <div className="2xl:hidden relative">
        <button
          onClick={(): void => setIsViewMenuOpen(!isViewMenuOpen)}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium border ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700'
              : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-300'
          }`}
        >
          {activeMode &&
            React.cloneElement(
              activeMode.icon as React.ReactElement<{ size?: number }>,
              { size: 14 }
            )}
          <span>{activeMode?.label}</span>
          <ChevronDown size={12} className="opacity-50" />
        </button>
        {isViewMenuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              onClick={(): void => setIsViewMenuOpen(false)}
              aria-label={t('Close menu')}
            />
            <div
              role="menu"
              className={`absolute top-full left-0 mt-2 w-32 rounded-lg shadow-lg border p-1 z-20 flex flex-col gap-1 ${dropBg}`}
            >
              {VIEW_MODES.map((m: (typeof VIEW_MODES)[0]) => (
                <button
                  key={m.key}
                  onClick={(): void => {
                    setViewMode(m.key);
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded text-xs text-left ${
                    viewMode === m.key
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : dropItem
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface FormatToolbarProps {
  allFormatButtons: FormatButton[];
  inlineCount: number;
  getFormatButtonClass: (key: string) => string;
  isFormatMenuOpen: boolean;
  setIsFormatMenuOpen: (v: boolean) => void;
  isMobileFormatMenuOpen: boolean;
  setIsMobileFormatMenuOpen: (v: boolean) => void;
  formatMenuRef: React.RefObject<HTMLDivElement | null>;
  dividerColor: string;
  isLight: boolean;
  buttonActive: string;
  currentTheme: AppTheme;
  t: (key: string) => string;
}

const FormatToolbar: React.FC<FormatToolbarProps> = ({
  allFormatButtons,
  inlineCount,
  getFormatButtonClass,
  isFormatMenuOpen,
  setIsFormatMenuOpen,
  isMobileFormatMenuOpen,
  setIsMobileFormatMenuOpen,
  formatMenuRef,
  dividerColor,
  isLight,
  buttonActive,
  t,
}: FormatToolbarProps) => {
  const dropBg = isLight
    ? 'bg-brand-gray-50 border-brand-gray-200'
    : 'bg-brand-gray-800 border-brand-gray-700';
  const mobileBg = isLight
    ? 'bg-brand-gray-50 border-brand-gray-200'
    : 'bg-brand-gray-900 border-brand-gray-700';
  return (
    <>
      {/* Desktop inline buttons */}
      {inlineCount > 0 && (
        <div className="hidden lg:flex items-center space-x-0.5">
          <div className={`w-px h-4 mx-2 ${dividerColor}`} />
          {allFormatButtons.slice(0, inlineCount).map((btn: FormatButton) => (
            <button
              key={btn.key}
              onClick={btn.onClick}
              className={getFormatButtonClass(btn.key)}
              title={btn.label}
            >
              {btn.icon}
            </button>
          ))}
          {inlineCount < allFormatButtons.length && (
            <div className="relative" ref={formatMenuRef}>
              <button
                onClick={(): void => setIsFormatMenuOpen(!isFormatMenuOpen)}
                className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                  isFormatMenuOpen
                    ? buttonActive
                    : isLight
                      ? 'text-brand-gray-500 hover:bg-brand-gray-100'
                      : 'text-brand-gray-400 hover:bg-brand-gray-800'
                }`}
                title={t('Formatting')}
              >
                <Type size={16} />
                <ChevronDown size={10} />
              </button>
              {isFormatMenuOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={(): void => setIsFormatMenuOpen(false)}
                    aria-label={t('Close formatting menu')}
                  />
                  <div
                    className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-lg shadow-xl border p-2 z-20 flex gap-1 flex-wrap max-w-48 ${dropBg}`}
                  >
                    {allFormatButtons.slice(inlineCount).map((btn: FormatButton) => (
                      <button
                        key={btn.key}
                        onClick={(): void => {
                          btn.onClick();
                          setIsFormatMenuOpen(false);
                        }}
                        className={getFormatButtonClass(btn.key)}
                        title={btn.label}
                      >
                        {btn.icon}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile: all buttons in one menu */}
      <div className="lg:hidden relative">
        <button
          onClick={(): void => setIsMobileFormatMenuOpen(!isMobileFormatMenuOpen)}
          className={`p-2 rounded-md border flex items-center gap-2 text-xs font-medium ${
            isMobileFormatMenuOpen
              ? buttonActive
              : isLight
                ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700'
                : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-300'
          }`}
        >
          <Type size={16} />
          <span>{t('Format')}</span>
        </button>
        {isMobileFormatMenuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              onClick={(): void => setIsMobileFormatMenuOpen(false)}
              aria-label={t('Close mobile format menu')}
            />
            <div
              className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl shadow-2xl border p-3 z-50 flex flex-wrap gap-1 ${mobileBg}`}
            >
              {allFormatButtons.map((btn: FormatButton) => (
                <button
                  key={btn.key}
                  onClick={(): void => {
                    btn.onClick();
                    setIsMobileFormatMenuOpen(false);
                  }}
                  className={`flex-1 min-w-[2.5rem] flex justify-center ${getFormatButtonClass(btn.key)}`}
                  title={btn.label}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

interface AiChapterControlsProps {
  handleAiAction: (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => Promise<void>;
  isAiActionLoading: boolean;
  isWritingAvailable: boolean;
  isChapterEmpty: boolean | undefined;
  isLight: boolean;
  currentTheme: AppTheme;
  t: (key: string) => string;
}

const AiChapterControls: React.FC<AiChapterControlsProps> = ({
  handleAiAction,
  isAiActionLoading,
  isWritingAvailable,
  isChapterEmpty,
  isLight,
  currentTheme,
  t,
}: AiChapterControlsProps) => {
  const writingUnavailableReason = t(
    'This action is unavailable because no working WRITING model is configured.'
  );
  const chapterExtendDisabled = isAiActionLoading || !isWritingAvailable;
  const chapterRewriteDisabled =
    isAiActionLoading || !isWritingAvailable || !!isChapterEmpty;
  return (
    <div className="hidden lg:flex items-center space-x-1">
      <div
        className={`flex items-center rounded-md p-1 space-x-1 border ${
          isLight
            ? 'bg-brand-gray-100 border-brand-gray-200'
            : 'bg-brand-gray-800 border-brand-gray-700'
        }`}
      >
        <span className="hidden 2xl:inline text-[10px] text-brand-gray-500 font-bold uppercase px-2">
          {t('Chapter AI')}
        </span>
        <div
          className={`hidden 2xl:block w-px h-4 ${isLight ? 'bg-brand-gray-300' : 'bg-brand-gray-700'}`}
        />
        <Button
          theme={currentTheme}
          size="sm"
          variant="ghost"
          className="text-xs h-6"
          onClick={(): Promise<void> => handleAiAction('chapter', 'extend')}
          disabled={chapterExtendDisabled}
          icon={<Wand2 size={12} />}
          title={
            !isWritingAvailable
              ? writingUnavailableReason
              : t('Extend Chapter (WRITING model)')
          }
        >
          <span className="hidden 2xl:inline">{t('Extend')}</span>
        </Button>
        <Button
          theme={currentTheme}
          size="sm"
          variant="ghost"
          className="text-xs h-6"
          onClick={(): Promise<void> => handleAiAction('chapter', 'rewrite')}
          disabled={chapterRewriteDisabled}
          icon={<FileEdit size={12} />}
          title={
            !isWritingAvailable
              ? writingUnavailableReason
              : isChapterEmpty
                ? t('Chapter is empty; cannot rewrite existing text.')
                : t('Rewrite Chapter (WRITING model)')
          }
        >
          <span className="hidden 2xl:inline">{t('Rewrite')}</span>
        </Button>
      </div>
    </div>
  );
};

export const HeaderCenterControls: React.FC<HeaderCenterControlsProps> = ({
  viewControls,
  formatControls,
  aiControls,
  modelControls,
  themeTokens,
}: HeaderCenterControlsProps) => {
  const { t } = useTranslation();
  const {
    viewMode,
    setViewMode,
    showWhitespace,
    setShowWhitespace,
    isViewMenuOpen,
    setIsViewMenuOpen,
  } = viewControls;
  const {
    handleFormat,
    getFormatButtonClass,
    isFormatMenuOpen,
    setIsFormatMenuOpen,
    isMobileFormatMenuOpen,
    setIsMobileFormatMenuOpen,
    onOpenImages,
  } = formatControls;
  const { handleAiAction, isAiActionLoading, isWritingAvailable, isChapterEmpty } =
    aiControls;
  const {
    appSettings,
    setAppSettings,
    saveSettings,
    modelConnectionStatus,
    detectedCapabilities,
    recheckUnavailableProviderIfStale,
  } = modelControls;
  const { isLight, iconColor, iconHover, dividerColor, buttonActive, currentTheme } =
    themeTokens;

  const updateAppSettings = (nextSettings: typeof appSettings): void => {
    setAppSettings(nextSettings);
    if (saveSettings) {
      void saveSettings(nextSettings).catch((error: unknown): void => {
        console.error('Failed to persist model selection', error);
      });
    }
  };

  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);

  const [windowWidth, setWindowWidth] = useState((): number => window.innerWidth);
  useEffect((): (() => void) => {
    const onResize = (): void => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return (): void => window.removeEventListener('resize', onResize);
  }, []);

  useClickOutside(modelMenuRef, (): void => setIsModelMenuOpen(false), isModelMenuOpen);
  useClickOutside(
    formatMenuRef,
    (): void => setIsFormatMenuOpen(false),
    isFormatMenuOpen
  );

  const allFormatButtons: FormatButton[] = [
    {
      key: 'bold',
      icon: <Bold size={16} />,
      label: 'Bold',
      onClick: (): void => handleFormat('bold'),
    },
    {
      key: 'italic',
      icon: <Italic size={16} />,
      label: 'Italic',
      onClick: (): void => handleFormat('italic'),
    },
    {
      key: 'image',
      icon: <ImageIcon size={16} />,
      label: 'Insert Image',
      onClick: onOpenImages,
    },
    {
      key: 'h1',
      icon: <span className="font-serif font-bold text-xs">H1</span>,
      label: 'Heading 1',
      onClick: (): void => handleFormat('h1'),
    },
    {
      key: 'h2',
      icon: <span className="font-serif font-bold text-xs">H2</span>,
      label: 'Heading 2',
      onClick: (): void => handleFormat('h2'),
    },
    {
      key: 'h3',
      icon: <span className="font-serif font-bold text-xs">H3</span>,
      label: 'Heading 3',
      onClick: (): void => handleFormat('h3'),
    },
    {
      key: 'ul',
      icon: <List size={16} />,
      label: 'List',
      onClick: (): void => handleFormat('ul'),
    },
    {
      key: 'ol',
      icon: <ListOrdered size={16} />,
      label: 'Numbered List',
      onClick: (): void => handleFormat('ol'),
    },
    {
      key: 'quote',
      icon: <Quote size={16} />,
      label: 'Blockquote',
      onClick: (): void => handleFormat('quote'),
    },
    {
      key: 'link',
      icon: <LinkIcon size={16} />,
      label: 'Link',
      onClick: (): void => handleFormat('link'),
    },
    {
      key: 'footnote',
      icon: <Hash size={14} />,
      label: 'Footnote',
      onClick: (): void => handleFormat('footnote'),
    },
    {
      key: 'codeblock',
      icon: <Code2 size={16} />,
      label: 'Fenced Code Block',
      onClick: (): void => handleFormat('codeblock'),
    },
    {
      key: 'subscript',
      icon: <Subscript size={16} />,
      label: 'Subscript',
      onClick: (): void => handleFormat('subscript'),
    },
    {
      key: 'superscript',
      icon: <Superscript size={16} />,
      label: 'Superscript',
      onClick: (): void => handleFormat('superscript'),
    },
    {
      key: 'strikethrough',
      icon: <Strikethrough size={16} />,
      label: 'Strikethrough',
      onClick: (): void => handleFormat('strikethrough'),
    },
  ];

  const inlineCount = ((): number => {
    if (windowWidth >= 1920) return allFormatButtons.length;
    if (windowWidth >= 1700) return 14;
    if (windowWidth >= 1536) return 13;
    if (windowWidth >= 1400) return 12;
    if (windowWidth >= 1280) return 10;
    if (windowWidth >= 1180) return 8;
    if (windowWidth >= 1024) return 6;
    return 0;
  })();

  const modelSelectorProps = {
    options: appSettings.providers,
    theme: currentTheme,
    connectionStatus: modelConnectionStatus,
    detectedCapabilities,
  };

  return (
    <div className="basis-full sm:basis-auto order-3 sm:order-2 flex-1 flex justify-center items-center min-w-0 px-2 space-x-2 xl:space-x-4 py-1 sm:py-0">
      <ViewModeSelector
        viewMode={viewMode}
        setViewMode={setViewMode}
        showWhitespace={showWhitespace}
        setShowWhitespace={setShowWhitespace}
        isViewMenuOpen={isViewMenuOpen}
        setIsViewMenuOpen={setIsViewMenuOpen}
        isLight={isLight}
        iconColor={iconColor}
        iconHover={iconHover}
        buttonActive={buttonActive}
        t={t}
      />

      <FormatToolbar
        allFormatButtons={allFormatButtons}
        inlineCount={inlineCount}
        getFormatButtonClass={getFormatButtonClass}
        isFormatMenuOpen={isFormatMenuOpen}
        setIsFormatMenuOpen={setIsFormatMenuOpen}
        isMobileFormatMenuOpen={isMobileFormatMenuOpen}
        setIsMobileFormatMenuOpen={setIsMobileFormatMenuOpen}
        formatMenuRef={formatMenuRef}
        dividerColor={dividerColor}
        isLight={isLight}
        buttonActive={buttonActive}
        currentTheme={currentTheme}
        t={t}
      />

      <div className="hidden lg:flex items-center space-x-1">
        <div className={`w-px h-4 mx-2 ${dividerColor}`} />
        <AiChapterControls
          handleAiAction={handleAiAction}
          isAiActionLoading={isAiActionLoading}
          isWritingAvailable={isWritingAvailable}
          isChapterEmpty={isChapterEmpty}
          isLight={isLight}
          currentTheme={currentTheme}
          t={t}
        />
      </div>

      {/* Model selectors */}
      <div
        className={`hidden 2xl:flex items-center ml-2 pl-2 border-l h-8 ${isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'}`}
      >
        <div className="2xl:hidden relative" ref={modelMenuRef}>
          <button
            onClick={(): void => setIsModelMenuOpen(!isModelMenuOpen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700 hover:bg-brand-gray-100'
                : 'bg-brand-gray-800 border-brand-gray-700 text-brand-gray-300 hover:bg-brand-gray-700'
            }`}
            title={t('Model settings')}
          >
            <Cpu size={13} />
            <span>{t('Models')}</span>
            <ChevronDown size={10} className="opacity-60" />
          </button>
          {isModelMenuOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={(): void => setIsModelMenuOpen(false)}
                aria-label={t('Close model menu')}
              />
              <div
                className={`absolute top-full right-0 mt-2 w-72 rounded-lg shadow-xl border p-3 z-20 flex flex-col gap-3 ${isLight ? 'bg-brand-gray-50 border-brand-gray-200' : 'bg-brand-gray-900 border-brand-gray-700'}`}
              >
                <ModelSelector
                  {...modelSelectorProps}
                  label="Writing"
                  value={appSettings.activeWritingProviderId}
                  onSelectorClick={(): void => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeWritingProviderId
                    );
                  }}
                  onChange={(v: string): void =>
                    updateAppSettings({ ...appSettings, activeWritingProviderId: v })
                  }
                  labelColorClass={isLight ? 'text-violet-600' : 'text-violet-400'}
                />
                <ModelSelector
                  {...modelSelectorProps}
                  label="Editing"
                  value={appSettings.activeEditingProviderId}
                  onSelectorClick={(): void => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeEditingProviderId
                    );
                  }}
                  onChange={(v: string): void =>
                    updateAppSettings({ ...appSettings, activeEditingProviderId: v })
                  }
                  labelColorClass={isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}
                />
                <ModelSelector
                  {...modelSelectorProps}
                  label="Chat"
                  value={appSettings.activeChatProviderId}
                  onSelectorClick={(): void => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeChatProviderId
                    );
                  }}
                  onChange={(v: string): void =>
                    updateAppSettings({ ...appSettings, activeChatProviderId: v })
                  }
                  labelColorClass={isLight ? 'text-blue-600' : 'text-blue-400'}
                />
              </div>
            </>
          )}
        </div>
        <div className="hidden 2xl:flex items-center space-x-3">
          <ModelSelector
            {...modelSelectorProps}
            label="Writing"
            value={appSettings.activeWritingProviderId}
            onSelectorClick={(): void => {
              void recheckUnavailableProviderIfStale(
                appSettings.activeWritingProviderId
              );
            }}
            onChange={(v: string): void =>
              updateAppSettings({ ...appSettings, activeWritingProviderId: v })
            }
            labelColorClass={isLight ? 'text-violet-600' : 'text-violet-400'}
          />
          <ModelSelector
            {...modelSelectorProps}
            label="Editing"
            value={appSettings.activeEditingProviderId}
            onSelectorClick={(): void => {
              void recheckUnavailableProviderIfStale(
                appSettings.activeEditingProviderId
              );
            }}
            onChange={(v: string): void =>
              updateAppSettings({ ...appSettings, activeEditingProviderId: v })
            }
            labelColorClass={isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}
          />
          <ModelSelector
            {...modelSelectorProps}
            label="Chat"
            value={appSettings.activeChatProviderId}
            onSelectorClick={(): void => {
              void recheckUnavailableProviderIfStale(appSettings.activeChatProviderId);
            }}
            onChange={(v: string): void =>
              updateAppSettings({ ...appSettings, activeChatProviderId: v })
            }
            labelColorClass={isLight ? 'text-blue-600' : 'text-blue-400'}
          />
        </div>
      </div>
    </div>
  );
};
