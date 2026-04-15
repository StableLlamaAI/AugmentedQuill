// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app header unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useRef, useState } from 'react';
import { useTheme } from './ThemeContext';
import {
  ChevronDown,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Redo,
  Search,
  Settings as SettingsIcon,
  Undo,
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { HeaderAppearanceControls } from '../editor/HeaderAppearanceControls';
import { HeaderCenterControls } from './header/HeaderCenterControls';
import { CheckpointsMenu } from '../checkpoints/CheckpointsMenu';
import { useConfirm } from './ConfirmDialogContext';
import { useClickOutside } from '../../utils/hooks';
import {
  HeaderAiControls,
  HeaderAppearanceControlsState,
  HeaderChatPanelControls,
  HeaderFormatControls,
  HeaderHistoryControls,
  HeaderModelControls,
  HeaderSearchControls,
  HeaderSettingsControls,
  HeaderSidebarControls,
  HeaderViewControls,
} from './layoutControlTypes';

type AppHeaderProps = {
  storyTitle: string;
  sidebarControls: HeaderSidebarControls;
  settingsControls: HeaderSettingsControls;
  historyControls: HeaderHistoryControls;
  viewControls: HeaderViewControls;
  formatControls: HeaderFormatControls;
  aiControls: HeaderAiControls;
  modelControls: HeaderModelControls;
  appearanceControls: HeaderAppearanceControlsState;
  chatPanelControls: HeaderChatPanelControls;
  searchControls: HeaderSearchControls;
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  storyTitle,
  sidebarControls,
  settingsControls,
  historyControls,
  viewControls,
  formatControls,
  aiControls,
  modelControls,
  appearanceControls,
  chatPanelControls,
  searchControls,
}) => {
  const {
    headerBg,
    iconColor,
    iconHover,
    dividerColor,
    buttonActive,
    textMain,
    isLight,
    currentTheme,
    sliderClass,
  } = useTheme();

  const { isSidebarOpen, setIsSidebarOpen } = sidebarControls;
  const { setIsSettingsOpen, setIsImagesOpen, setIsDebugLogsOpen } = settingsControls;
  const {
    undo,
    redo,
    undoSteps,
    redoSteps,
    undoOptions,
    redoOptions,
    nextUndoLabel,
    nextRedoLabel,
    canUndo,
    canRedo,
  } = historyControls;
  const {
    appearanceRef,
    isAppearanceOpen,
    setIsAppearanceOpen,
    setAppTheme,
    editorSettings,
    setEditorSettings,
  } = appearanceControls;
  const { isChatOpen, setIsChatOpen } = chatPanelControls;
  const { onOpenSearch } = searchControls;
  const [isUndoMenuOpen, setIsUndoMenuOpen] = useState(false);
  const [isRedoMenuOpen, setIsRedoMenuOpen] = useState(false);
  const undoMenuRef = useRef<HTMLDivElement | null>(null);
  const redoMenuRef = useRef<HTMLDivElement | null>(null);
  const confirm = useConfirm();

  useClickOutside(undoMenuRef, () => setIsUndoMenuOpen(false), isUndoMenuOpen);
  useClickOutside(redoMenuRef, () => setIsRedoMenuOpen(false), isRedoMenuOpen);

  const menuContainerClass = isLight
    ? 'absolute left-0 top-full z-[90] mt-1 w-80 rounded-md border border-brand-gray-200 bg-white shadow-lg'
    : 'absolute left-0 top-full z-[90] mt-1 w-80 rounded-md border border-brand-gray-700 bg-brand-gray-900 shadow-lg';
  const menuButtonClass = isLight
    ? 'w-full px-3 py-2 text-left text-xs text-brand-gray-700 hover:bg-brand-gray-100'
    : 'w-full px-3 py-2 text-left text-xs text-brand-gray-300 hover:bg-brand-gray-800';

  return (
    <header
      id="aq-header"
      role="banner"
      className={`sm:h-14 py-1.5 sm:py-0 border-b flex flex-wrap sm:flex-nowrap items-center justify-between px-3 md:px-4 shadow-sm z-[80] relative shrink-0 ${headerBg}`}
    >
      <div className="h-11 sm:h-auto order-1 flex items-center space-x-2 md:space-x-4 shrink-0">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`lg:hidden p-1 ${iconColor} ${iconHover}`}
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <Menu size={24} />
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center space-x-2"
          aria-label="Open settings"
        >
          <div
            className={`rounded-md p-1 shadow-lg ${
              isLight
                ? 'bg-brand-gray-100 border border-brand-gray-200 shadow-brand-900/10'
                : 'bg-brand-gray-600 border border-brand-gray-500 shadow-none'
            }`}
          >
            <img
              src="/static/images/icon.svg"
              className="w-6 h-6"
              alt="AugmentedQuill Logo"
            />
          </div>
          <div className="flex flex-col">
            <span
              className={`font-bold tracking-tight leading-none hidden lg:inline ${textMain}`}
            >
              AugmentedQuill
            </span>
            <span className="text-[10px] text-brand-gray-500 font-mono leading-none hidden lg:inline">
              {storyTitle}
            </span>
          </div>
        </button>

        <div className={`h-6 w-px hidden lg:block ${dividerColor}`}></div>

        <div className="flex space-x-1">
          <div className="relative flex" ref={undoMenuRef}>
            <Button
              theme={currentTheme}
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              title={nextUndoLabel ? `Undo: ${nextUndoLabel}` : 'Undo'}
              aria-label={nextUndoLabel ? `Undo: ${nextUndoLabel}` : 'Undo'}
              className="rounded-r-none"
            >
              <Undo size={16} />
            </Button>
            <Button
              theme={currentTheme}
              variant="ghost"
              size="sm"
              onClick={() => setIsUndoMenuOpen((open) => !open)}
              disabled={!canUndo}
              title="Undo multiple actions"
              aria-label="Open undo actions list"
              aria-haspopup="menu"
              aria-expanded={isUndoMenuOpen}
              className="px-2 rounded-l-none border-l"
            >
              <ChevronDown size={12} />
            </Button>
            {isUndoMenuOpen && canUndo && (
              <div className={menuContainerClass} role="menu" aria-label="Undo actions">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                  Undo Actions
                </div>
                {undoOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={menuButtonClass}
                    onClick={() => {
                      undoSteps(option.steps);
                      setIsUndoMenuOpen(false);
                    }}
                    title={option.label}
                  >
                    Undo {option.steps}: {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex" ref={redoMenuRef}>
            <Button
              theme={currentTheme}
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              title={nextRedoLabel ? `Redo: ${nextRedoLabel}` : 'Redo'}
              aria-label={nextRedoLabel ? `Redo: ${nextRedoLabel}` : 'Redo'}
              className="rounded-r-none"
            >
              <Redo size={16} />
            </Button>
            <Button
              theme={currentTheme}
              variant="ghost"
              size="sm"
              onClick={() => setIsRedoMenuOpen((open) => !open)}
              disabled={!canRedo}
              title="Redo multiple actions"
              aria-label="Open redo actions list"
              aria-haspopup="menu"
              aria-expanded={isRedoMenuOpen}
              className="px-2 rounded-l-none border-l"
            >
              <ChevronDown size={12} />
            </Button>
            {isRedoMenuOpen && canRedo && (
              <div className={menuContainerClass} role="menu" aria-label="Redo actions">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                  Redo Actions
                </div>
                {redoOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={menuButtonClass}
                    onClick={() => {
                      redoSteps(option.steps);
                      setIsRedoMenuOpen(false);
                    }}
                    title={option.label}
                  >
                    Redo {option.steps}: {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <CheckpointsMenu hasUnsavedChanges={canUndo} confirm={confirm} />
          <Button
            theme={currentTheme}
            variant="ghost"
            size="sm"
            onClick={onOpenSearch}
            title="Search and Replace (Ctrl+F)"
            aria-label="Search and Replace"
            className="ml-1"
          >
            <Search size={18} />
          </Button>
        </div>
      </div>

      <HeaderCenterControls
        viewControls={viewControls}
        formatControls={formatControls}
        aiControls={aiControls}
        modelControls={modelControls}
        themeTokens={{
          isLight,
          iconColor,
          iconHover,
          dividerColor,
          buttonActive,
          currentTheme,
        }}
      />

      <div className="h-11 sm:h-auto order-2 sm:order-3 flex items-center space-x-2 shrink-0">
        <Button
          theme={currentTheme}
          variant="ghost"
          size="sm"
          onClick={() => setIsSettingsOpen(true)}
          title="Settings"
          className="mr-1"
        >
          <SettingsIcon size={18} />
        </Button>
        <HeaderAppearanceControls
          appearanceRef={appearanceRef}
          isAppearanceOpen={isAppearanceOpen}
          setIsAppearanceOpen={setIsAppearanceOpen}
          isLight={isLight}
          textMain={textMain}
          buttonActive={buttonActive}
          currentTheme={currentTheme}
          setAppTheme={setAppTheme}
          editorSettings={editorSettings}
          setEditorSettings={setEditorSettings}
          sliderClass={sliderClass}
          setIsDebugLogsOpen={setIsDebugLogsOpen}
        />

        <Button
          theme={currentTheme}
          variant="secondary"
          size="sm"
          onClick={() => setIsChatOpen(!isChatOpen)}
          icon={
            isChatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />
          }
        >
          {isChatOpen ? 'Hide' : 'AI'}
        </Button>
      </div>
    </header>
  );
};
