// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines center controls in app header to keep top-level header composition concise.
 */

import React, { useEffect, useRef, useState } from 'react';
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

type HeaderCenterControlsProps = {
  viewControls: HeaderViewControls;
  formatControls: HeaderFormatControls;
  aiControls: HeaderAiControls;
  modelControls: HeaderModelControls;
  themeTokens: HeaderThemeTokens;
};

export const HeaderCenterControls: React.FC<HeaderCenterControlsProps> = ({
  viewControls,
  formatControls,
  aiControls,
  modelControls,
  themeTokens,
}) => {
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
  const writingUnavailableReason =
    'This action is unavailable because no working WRITING model is configured.';
  const chapterExtendDisabled = isAiActionLoading || !isWritingAvailable;
  const chapterRewriteDisabled =
    isAiActionLoading || !isWritingAvailable || !!isChapterEmpty;
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

  const updateAppSettings = (nextSettings: typeof appSettings) => {
    setAppSettings(nextSettings);
    if (saveSettings) {
      void saveSettings(nextSettings).catch((error) => {
        console.error('Failed to persist model selection', error);
      });
    }
  };

  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const formatMenuRef = useRef<HTMLDivElement | null>(null);

  // Track window width to compute which format buttons collapse into the dropdown.
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) {
        setIsFormatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setIsFormatMenuOpen]);

  // Format buttons ordered from MOST important (index 0) to LEAST important (last).
  // The least-important ones collapse into the Formatting dropdown first.
  const allFormatButtons: Array<{
    key: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    extraClass?: string;
  }> = [
    {
      key: 'bold',
      icon: <Bold size={16} />,
      label: 'Bold',
      onClick: () => handleFormat('bold'),
    },
    {
      key: 'italic',
      icon: <Italic size={16} />,
      label: 'Italic',
      onClick: () => handleFormat('italic'),
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
      onClick: () => handleFormat('h1'),
    },
    {
      key: 'h2',
      icon: <span className="font-serif font-bold text-xs">H2</span>,
      label: 'Heading 2',
      onClick: () => handleFormat('h2'),
    },
    {
      key: 'h3',
      icon: <span className="font-serif font-bold text-xs">H3</span>,
      label: 'Heading 3',
      onClick: () => handleFormat('h3'),
    },
    {
      key: 'ul',
      icon: <List size={16} />,
      label: 'List',
      onClick: () => handleFormat('ul'),
    },
    {
      key: 'ol',
      icon: <ListOrdered size={16} />,
      label: 'Numbered List',
      onClick: () => handleFormat('ol'),
    },
    {
      key: 'quote',
      icon: <Quote size={16} />,
      label: 'Blockquote',
      onClick: () => handleFormat('quote'),
    },
    {
      key: 'link',
      icon: <LinkIcon size={16} />,
      label: 'Link',
      onClick: () => handleFormat('link'),
    },
    {
      key: 'footnote',
      icon: <Hash size={14} />,
      label: 'Footnote',
      onClick: () => handleFormat('footnote'),
    },
    {
      key: 'codeblock',
      icon: <Code2 size={16} />,
      label: 'Fenced Code Block',
      onClick: () => handleFormat('codeblock'),
    },
    {
      key: 'subscript',
      icon: <Subscript size={16} />,
      label: 'Subscript',
      onClick: () => handleFormat('subscript'),
    },
    {
      key: 'superscript',
      icon: <Superscript size={16} />,
      label: 'Superscript',
      onClick: () => handleFormat('superscript'),
    },
    {
      key: 'strikethrough',
      icon: <Strikethrough size={16} />,
      label: 'Strikethrough',
      onClick: () => handleFormat('strikethrough'),
    },
  ];

  // How many buttons are shown inline at current width (rest go to dropdown).
  // Thresholds chosen so the toolbar never overflows before the next step kicks in.
  const inlineCount = (() => {
    if (windowWidth >= 1920) return allFormatButtons.length; // all inline
    if (windowWidth >= 1700) return 14; // hide strikethrough
    if (windowWidth >= 1536) return 13; // hide strikethrough + superscript
    if (windowWidth >= 1400) return 12; // hide + subscript
    if (windowWidth >= 1280) return 10; // hide + codeblock + footnote
    if (windowWidth >= 1180) return 8; // hide + link + quote
    if (windowWidth >= 1024) return 6; // hide + ol + ul
    return 0; // all in mobile menu
  })();

  return (
    <div className="basis-full sm:basis-auto order-3 sm:order-2 flex-1 flex justify-center items-center min-w-0 px-2 space-x-2 xl:space-x-4 py-1 sm:py-0">
      <div className="relative">
        <div
          className={`hidden 2xl:flex items-center p-1 rounded-lg border ${
            isLight
              ? 'bg-brand-gray-100 border-brand-gray-200'
              : 'bg-brand-gray-800 border-brand-gray-700'
          }`}
        >
          <button
            onClick={() => setViewMode('raw')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'raw' ? buttonActive : `${iconColor} ${iconHover}`
            }`}
          >
            <FileText size={13} />
            <span>Raw</span>
          </button>
          <button
            onClick={() => setViewMode('markdown')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'markdown' ? buttonActive : `${iconColor} ${iconHover}`
            }`}
          >
            <Code size={13} />
            <span>MD</span>
          </button>
          <button
            onClick={() => setViewMode('wysiwyg')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'wysiwyg' ? buttonActive : `${iconColor} ${iconHover}`
            }`}
          >
            <Eye size={13} />
            <span>Visual</span>
          </button>
          <div
            className={`w-px h-4 mx-2 ${
              isLight ? 'bg-brand-gray-300' : 'bg-brand-gray-700'
            }`}
          />
          <button
            onClick={() => setShowWhitespace((value) => !value)}
            title="Toggle whitespace characters"
            className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              showWhitespace ? buttonActive : `${iconColor} ${iconHover}`
            }`}
          >
            <Pilcrow size={13} />
            <span>WS</span>
          </button>
        </div>

        <div className="2xl:hidden relative">
          <button
            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium border ${
              isLight
                ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700'
                : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-300'
            }`}
          >
            {viewMode === 'raw' && (
              <>
                <FileText size={14} />
                <span>Raw</span>
              </>
            )}
            {viewMode === 'markdown' && (
              <>
                <Code size={14} />
                <span>MD</span>
              </>
            )}
            {viewMode === 'wysiwyg' && (
              <>
                <Eye size={14} />
                <span>Visual</span>
              </>
            )}
            <ChevronDown size={12} className="opacity-50" />
          </button>

          {isViewMenuOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setIsViewMenuOpen(false)}
                aria-label="Close menu"
              ></button>
              <div
                role="menu"
                className={`absolute top-full left-0 mt-2 w-32 rounded-lg shadow-lg border p-1 z-20 flex flex-col gap-1 ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-200'
                    : 'bg-brand-gray-800 border-brand-gray-700'
                }`}
              >
                <button
                  onClick={() => {
                    setViewMode('raw');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded text-xs text-left ${
                    viewMode === 'raw'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700'
                  }`}
                >
                  <FileText size={14} />
                  <span>Raw</span>
                </button>
                <button
                  onClick={() => {
                    setViewMode('markdown');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded text-xs text-left ${
                    viewMode === 'markdown'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700'
                  }`}
                >
                  <Code size={14} />
                  <span>MD</span>
                </button>
                <button
                  onClick={() => {
                    setViewMode('wysiwyg');
                    setIsViewMenuOpen(false);
                  }}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded text-xs text-left ${
                    viewMode === 'wysiwyg'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700'
                  }`}
                >
                  <Eye size={14} />
                  <span>Visual</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop format toolbar: inline buttons + single Formatting dropdown for overflow */}
      {inlineCount > 0 && (
        <div className="hidden lg:flex items-center space-x-0.5">
          <div className={`w-px h-4 mx-2 ${dividerColor}`}></div>

          {allFormatButtons.slice(0, inlineCount).map((btn) => (
            <button
              key={btn.key}
              onClick={btn.onClick}
              className={getFormatButtonClass(btn.key)}
              title={btn.label}
            >
              {btn.icon}
            </button>
          ))}

          {/* Formatting dropdown: collects buttons that don't fit inline */}
          {inlineCount < allFormatButtons.length && (
            <div className="relative" ref={formatMenuRef}>
              <button
                onClick={() => setIsFormatMenuOpen(!isFormatMenuOpen)}
                className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                  isFormatMenuOpen
                    ? buttonActive
                    : isLight
                      ? 'text-brand-gray-500 hover:bg-brand-gray-100'
                      : 'text-brand-gray-400 hover:bg-brand-gray-800'
                }`}
                title="Formatting"
              >
                <Type size={16} />
                <ChevronDown size={10} />
              </button>
              {isFormatMenuOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setIsFormatMenuOpen(false)}
                    aria-label="Close formatting menu"
                  ></button>
                  <div
                    className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-lg shadow-xl border p-2 z-20 flex gap-1 flex-wrap max-w-48 ${
                      isLight
                        ? 'bg-brand-gray-50 border-brand-gray-200'
                        : 'bg-brand-gray-800 border-brand-gray-700'
                    }`}
                  >
                    {allFormatButtons.slice(inlineCount).map((btn) => (
                      <button
                        key={btn.key}
                        onClick={() => {
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

      {/* Mobile format button: all buttons in one menu */}
      <div className="lg:hidden relative">
        <button
          onClick={() => setIsMobileFormatMenuOpen(!isMobileFormatMenuOpen)}
          className={`p-2 rounded-md border flex items-center gap-2 text-xs font-medium ${
            isMobileFormatMenuOpen
              ? buttonActive
              : isLight
                ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700'
                : 'bg-brand-gray-900 border-brand-gray-700 text-brand-gray-300'
          }`}
        >
          <Type size={16} />
          <span>Format</span>
        </button>

        {isMobileFormatMenuOpen && (
          <>
            <button
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setIsMobileFormatMenuOpen(false)}
              aria-label="Close mobile format menu"
            ></button>
            <div
              className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl shadow-2xl border p-3 z-50 flex flex-wrap gap-1 ${
                isLight
                  ? 'bg-brand-gray-50 border-brand-gray-200'
                  : 'bg-brand-gray-900 border-brand-gray-700'
              }`}
            >
              {allFormatButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => {
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

      <div className="hidden lg:flex items-center space-x-1">
        <div className={`w-px h-4 mx-2 ${dividerColor}`}></div>
        <div
          className={`flex items-center rounded-md p-1 space-x-1 border ${
            isLight
              ? 'bg-brand-gray-100 border-brand-gray-200'
              : 'bg-brand-gray-800 border-brand-gray-700'
          }`}
        >
          <span className="hidden 2xl:inline text-[10px] text-brand-gray-500 font-bold uppercase px-2">
            Chapter AI
          </span>
          <div
            className={`hidden 2xl:block w-px h-4 ${isLight ? 'bg-brand-gray-300' : 'bg-brand-gray-700'}`}
          ></div>
          <Button
            theme={currentTheme}
            size="sm"
            variant="ghost"
            className="text-xs h-6"
            onClick={() => handleAiAction('chapter', 'extend')}
            disabled={chapterExtendDisabled}
            icon={<Wand2 size={12} />}
            title={
              !isWritingAvailable
                ? writingUnavailableReason
                : 'Extend Chapter (WRITING model)'
            }
          >
            <span className="hidden 2xl:inline">Extend</span>
          </Button>
          <Button
            theme={currentTheme}
            size="sm"
            variant="ghost"
            className="text-xs h-6"
            onClick={() => handleAiAction('chapter', 'rewrite')}
            disabled={chapterRewriteDisabled}
            icon={<FileEdit size={12} />}
            title={
              !isWritingAvailable
                ? writingUnavailableReason
                : isChapterEmpty
                  ? 'Chapter is empty; cannot rewrite existing text.'
                  : 'Rewrite Chapter (WRITING model)'
            }
          >
            <span className="hidden 2xl:inline">Rewrite</span>
          </Button>
        </div>
      </div>

      {/* Model selectors: dropdown button at 2xl, fully inline at 2xl+ */}
      <div
        className={`hidden 2xl:flex items-center ml-2 pl-2 border-l h-8 ${
          isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
        }`}
      >
        {/* Compact dropdown for xl–2xl */}
        <div className="2xl:hidden relative" ref={modelMenuRef}>
          <button
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-brand-gray-50 border-brand-gray-200 text-brand-gray-700 hover:bg-brand-gray-100'
                : 'bg-brand-gray-800 border-brand-gray-700 text-brand-gray-300 hover:bg-brand-gray-700'
            }`}
            title="Model settings"
          >
            <Cpu size={13} />
            <span>Models</span>
            <ChevronDown size={10} className="opacity-60" />
          </button>
          {isModelMenuOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setIsModelMenuOpen(false)}
                aria-label="Close model menu"
              ></button>
              <div
                className={`absolute top-full right-0 mt-2 w-72 rounded-lg shadow-xl border p-3 z-20 flex flex-col gap-3 ${
                  isLight
                    ? 'bg-brand-gray-50 border-brand-gray-200'
                    : 'bg-brand-gray-900 border-brand-gray-700'
                }`}
              >
                <ModelSelector
                  label="Writing"
                  value={appSettings.activeWritingProviderId}
                  onSelectorClick={() => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeWritingProviderId
                    );
                  }}
                  onChange={(value) =>
                    updateAppSettings({
                      ...appSettings,
                      activeWritingProviderId: value,
                    })
                  }
                  options={appSettings.providers}
                  theme={currentTheme}
                  connectionStatus={modelConnectionStatus}
                  detectedCapabilities={detectedCapabilities}
                  labelColorClass={isLight ? 'text-violet-600' : 'text-violet-400'}
                />
                <ModelSelector
                  label="Editing"
                  value={appSettings.activeEditingProviderId}
                  onSelectorClick={() => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeEditingProviderId
                    );
                  }}
                  onChange={(value) =>
                    updateAppSettings({
                      ...appSettings,
                      activeEditingProviderId: value,
                    })
                  }
                  options={appSettings.providers}
                  theme={currentTheme}
                  connectionStatus={modelConnectionStatus}
                  detectedCapabilities={detectedCapabilities}
                  labelColorClass={isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}
                />
                <ModelSelector
                  label="Chat"
                  value={appSettings.activeChatProviderId}
                  onSelectorClick={() => {
                    void recheckUnavailableProviderIfStale(
                      appSettings.activeChatProviderId
                    );
                  }}
                  onChange={(value) =>
                    updateAppSettings({
                      ...appSettings,
                      activeChatProviderId: value,
                    })
                  }
                  options={appSettings.providers}
                  theme={currentTheme}
                  connectionStatus={modelConnectionStatus}
                  detectedCapabilities={detectedCapabilities}
                  labelColorClass={isLight ? 'text-blue-600' : 'text-blue-400'}
                />
              </div>
            </>
          )}
        </div>

        {/* Fully inline at 2xl+ */}
        <div className="hidden 2xl:flex items-center space-x-3">
          <ModelSelector
            label="Writing"
            value={appSettings.activeWritingProviderId}
            onSelectorClick={() => {
              void recheckUnavailableProviderIfStale(
                appSettings.activeWritingProviderId
              );
            }}
            onChange={(value) =>
              updateAppSettings({
                ...appSettings,
                activeWritingProviderId: value,
              })
            }
            options={appSettings.providers}
            theme={currentTheme}
            connectionStatus={modelConnectionStatus}
            detectedCapabilities={detectedCapabilities}
            labelColorClass={isLight ? 'text-violet-600' : 'text-violet-400'}
          />
          <ModelSelector
            label="Editing"
            value={appSettings.activeEditingProviderId}
            onSelectorClick={() => {
              void recheckUnavailableProviderIfStale(
                appSettings.activeEditingProviderId
              );
            }}
            onChange={(value) =>
              updateAppSettings({
                ...appSettings,
                activeEditingProviderId: value,
              })
            }
            options={appSettings.providers}
            theme={currentTheme}
            connectionStatus={modelConnectionStatus}
            detectedCapabilities={detectedCapabilities}
            labelColorClass={isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}
          />
          <ModelSelector
            label="Chat"
            value={appSettings.activeChatProviderId}
            onSelectorClick={() => {
              void recheckUnavailableProviderIfStale(appSettings.activeChatProviderId);
            }}
            onChange={(value) =>
              updateAppSettings({
                ...appSettings,
                activeChatProviderId: value,
              })
            }
            options={appSettings.providers}
            theme={currentTheme}
            connectionStatus={modelConnectionStatus}
            detectedCapabilities={detectedCapabilities}
            labelColorClass={isLight ? 'text-blue-600' : 'text-blue-400'}
          />
        </div>
      </div>
    </div>
  );
};
