// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app layout unit so this responsibility stays isolated, testable, and easy to evolve.
 * Renders the full provider + component tree for the application. All logic lives in App.tsx;
 * this file is pure JSX, making the render tree easy to scan without hook noise.
 */

import React from 'react';
import { AppDialogs } from './AppDialogs';
import { AppHeader } from './AppHeader';
import { AppMainLayout } from './AppMainLayout';
import { ConfirmDialog } from './ConfirmDialog';
import { ConfirmDialogProvider, ConfirmFn } from './ConfirmDialogContext';
import { ThemeProvider } from './ThemeContext';
import { DebugLogs } from '../debug/DebugLogs';
import { ToolCallLimitDialog } from '../chat/ToolCallLimitDialog';
import { ToolCallLoopDialogState } from '../app/useToolCallGate';
import { SearchReplaceDialog } from '../search/SearchReplaceDialog';
import { SearchHighlightProvider } from '../search/SearchHighlightContext';
import { AppTheme } from '../../types';

// ---------------------------------------------------------------------------
// Prop type aliases derived from child components so this file stays in sync
// automatically when those components evolve.
// ---------------------------------------------------------------------------

type AppDialogsProps = React.ComponentProps<typeof AppDialogs>;
type AppHeaderProps = React.ComponentProps<typeof AppHeader>;
type AppMainLayoutProps = React.ComponentProps<typeof AppMainLayout>;
type SearchReplaceDialogProps = React.ComponentProps<typeof SearchReplaceDialog>;
type SearchHighlightValue = React.ComponentProps<
  typeof SearchHighlightProvider
>['value'];

interface ConfirmDialogState {
  isOpen: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: string;
  alertOnly?: boolean;
}

interface AppLayoutProps {
  // Context providers
  confirm: ConfirmFn;
  searchHighlightValue: SearchHighlightValue;
  currentTheme: AppTheme;

  // ConfirmDialog
  confirmDialogState: ConfirmDialogState;
  handleConfirm: () => void;
  handleCancel: () => void;

  // Outer wrapper styles
  bgMain: string;
  textMain: string;
  sidebarWidth: number;

  // Grouped component props (spread onto child components)
  appDialogsProps: AppDialogsProps;
  appHeaderProps: AppHeaderProps;
  appMainLayoutProps: AppMainLayoutProps;

  // DebugLogs
  isDebugLogsOpen: boolean;
  setIsDebugLogsOpen: (open: boolean) => void;

  // ToolCallLimitDialog
  toolCallLoopDialog: ToolCallLoopDialogState | null;

  // SearchReplaceDialog (always provided; rendered only when searchState.isOpen)
  searchReplaceDialogProps: SearchReplaceDialogProps;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  confirm,
  searchHighlightValue,
  currentTheme,
  confirmDialogState,
  handleConfirm,
  handleCancel,
  bgMain,
  textMain,
  sidebarWidth,
  appDialogsProps,
  appHeaderProps,
  appMainLayoutProps,
  isDebugLogsOpen,
  setIsDebugLogsOpen,
  toolCallLoopDialog,
  searchReplaceDialogProps,
}) => (
  <ConfirmDialogProvider value={confirm}>
    <SearchHighlightProvider value={searchHighlightValue}>
      <ThemeProvider currentTheme={currentTheme}>
        <ConfirmDialog
          isOpen={confirmDialogState.isOpen}
          title={confirmDialogState.title}
          message={confirmDialogState.message}
          confirmLabel={confirmDialogState.confirmLabel}
          cancelLabel={confirmDialogState.cancelLabel}
          variant={confirmDialogState.variant as any}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
        <div
          id="aq-app-root"
          className={`flex flex-col h-screen font-sans overflow-hidden ${bgMain} ${textMain}`}
          style={
            {
              '--sidebar-width': `${sidebarWidth}px`,
            } as React.CSSProperties
          }
        >
          <AppDialogs {...appDialogsProps} />

          <AppHeader {...appHeaderProps} />

          <AppMainLayout {...appMainLayoutProps} />

          {isDebugLogsOpen && (
            <DebugLogs
              isOpen={isDebugLogsOpen}
              onClose={() => setIsDebugLogsOpen(false)}
              theme={currentTheme}
            />
          )}

          <ToolCallLimitDialog
            isOpen={!!toolCallLoopDialog}
            count={toolCallLoopDialog?.count ?? 0}
            theme={currentTheme}
            onResolve={(choice) => toolCallLoopDialog?.resolver(choice)}
          />

          {searchReplaceDialogProps.searchState.isOpen && (
            <SearchReplaceDialog {...searchReplaceDialogProps} />
          )}
        </div>
      </ThemeProvider>
    </SearchHighlightProvider>
  </ConfirmDialogProvider>
);
