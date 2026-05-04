// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests width-priority behavior for editor mobile toolbar overflow handling.
 */

// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EditorProvider, type EditorContextValue } from './EditorContext';
import { EditorMobileToolbar } from './EditorMobileToolbar';

const onAiAction = vi.fn();

const baseContext: EditorContextValue = {
  theme: 'light',
  toolbarBg: 'bg-white',
  footerBg: 'bg-white',
  textMuted: 'text-brand-gray-600',
  chapterScope: 'chapter',
  isAiLoading: false,
  isWritingAvailable: true,
  writingUnavailableReason: 'Unavailable',
  isChapterEmpty: false,
  onAiAction,
  shouldShowContinuationPanel: false,
  displayedContinuations: [],
  suggestionMode: 'continuation',
  onSuggestionModeChange: vi.fn(),
  isSuggesting: false,
  localContentRef: { current: '' },
  onSuggestionButtonClick: vi.fn(),
  onAcceptContinuation: vi.fn(),
  onRegenerate: vi.fn(),
};

let measuredWidth = 480;

const rectFromWidth = (width: number): DOMRect =>
  ({
    width,
    height: 56,
    top: 0,
    left: 0,
    bottom: 56,
    right: width,
    x: 0,
    y: 0,
    toJSON: (): Record<string, never> => ({}),
  }) as DOMRect;

const renderToolbar = (): void => {
  render(
    <EditorProvider value={baseContext}>
      <EditorMobileToolbar />
    </EditorProvider>
  );
};

describe('EditorMobileToolbar', () => {
  beforeEach(() => {
    onAiAction.mockReset();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      (): DOMRect => rectFromWidth(measuredWidth)
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps full layout on wide widths', async () => {
    measuredWidth = 500;
    renderToolbar();

    await waitFor(() => {
      expect(screen.getByText('Chapter AI')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Extend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();
  });

  it('drops the label before dropping action buttons', async () => {
    measuredWidth = 340;
    renderToolbar();

    await waitFor(() => {
      expect(screen.queryByText('Chapter AI')).toBeNull();
    });

    expect(screen.getByRole('button', { name: 'Extend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();
  });

  it('moves rewrite into overflow menu at split widths', async () => {
    measuredWidth = 280;
    renderToolbar();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Rewrite' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'More AI actions' }));

    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    expect(onAiAction).toHaveBeenCalledWith('chapter', 'rewrite');
  });

  it('keeps both actions accessible in menu-only mode', async () => {
    measuredWidth = 220;
    renderToolbar();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Rewrite' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));

    expect(screen.getByRole('button', { name: 'Extend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onAiAction).toHaveBeenCalledWith('chapter', 'extend');
  });

  it('recomputes layout after resize events when ResizeObserver is unavailable', async () => {
    measuredWidth = 500;
    renderToolbar();

    await waitFor(() => {
      expect(screen.getByText('Chapter AI')).toBeTruthy();
    });

    measuredWidth = 220;
    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(screen.queryByText('Chapter AI')).toBeNull();
      expect(screen.getByRole('button', { name: 'AI' })).toBeTruthy();
    });
  });
});
