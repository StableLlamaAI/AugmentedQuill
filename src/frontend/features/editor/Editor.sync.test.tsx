// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Tests for Editor synchronization during AI streaming and diff highlighting.
 * Verifies that localContent and highlighting logic react to chapter updates.
 */

// @vitest-environment jsdom

import React from 'react';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor';
import { WritingUnit } from '../../types';

afterEach(() => {
  cleanup();
});

vi.mock('../../services/api', () => ({
  api: {
    chapters: {
      updateContent: vi.fn(),
    },
    story: {
      updateContent: vi.fn(),
    },
  },
}));

const mockChapter: WritingUnit = {
  id: '1',
  scope: 'chapter',
  title: 'Chapter 1',
  content: 'Original content',
  summary: '',
  filename: 'ch1.md',
};

const defaultProps = {
  chapter: mockChapter,
  baselineContent: 'Original content',
  settings: {
    theme: 'mixed' as const,
    brightness: 1,
    contrast: 1,
    fontSize: 16,
    maxWidth: 800,
    sidebarWidth: 320,
    showDiff: true,
  },
  viewMode: 'raw' as const,
  showWhitespace: false,
  onToggleShowWhitespace: vi.fn(),
  onChange: vi.fn(),
  aiControls: {
    onAiAction: vi.fn(),
    isAiLoading: false,
    isWritingAvailable: true,
    onCancelAiAction: vi.fn(),
    isProseStreaming: false,
  },
  suggestionControls: {
    continuations: [],
    isSuggesting: false,
    onTriggerSuggestions: vi.fn(),
    onAcceptContinuation: vi.fn(),
    isSuggestionMode: false,
    onKeyboardSuggestionAction: vi.fn(),
  },
};

describe('Editor diff highlighting', () => {
  it('shows diff decoration when AI inserts text (baseline differs from content)', async () => {
    const aiChapter = { ...mockChapter, content: 'Original content with AI paragraph' };

    const { rerender } = render(<Editor {...defaultProps} />);

    await act(async () => {
      rerender(
        <Editor
          {...defaultProps}
          chapter={aiChapter}
          baselineContent="Original content"
        />
      );
    });

    const cmContent = document.querySelector('.cm-content');
    expect(cmContent?.textContent).toContain('with AI paragraph');
    expect(cmContent?.innerHTML).toContain('diff-inserted');
  });

  it('shows no diff decoration when baseline equals chapter content', async () => {
    const { container } = render(
      <Editor {...defaultProps} baselineContent="Original content" />
    );

    const cmContent = container.querySelector('.cm-content');
    expect(cmContent?.innerHTML).not.toContain('diff-inserted');
  });

  it('forces content sync and shows diff decoration when streaming even if editor is focused', async () => {
    const { rerender } = render(<Editor {...defaultProps} />);

    const cmContent = document.querySelector('.cm-content');
    if (cmContent) (cmContent as HTMLElement).focus();

    const updatedChapter = { ...mockChapter, content: 'Original content with AI' };

    await act(async () => {
      rerender(
        <Editor
          {...defaultProps}
          chapter={updatedChapter}
          aiControls={{ ...defaultProps.aiControls, isProseStreaming: true }}
        />
      );
    });

    const updated = document.querySelector('.cm-content');
    expect(updated?.textContent).toContain('with AI');
    expect(updated?.innerHTML).toContain('diff-inserted');
  });

  it('calls the external onChange with user-modified content', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    const { rerender } = render(
      <Editor
        {...defaultProps}
        chapter={{ ...mockChapter, content: 'AI inserted this' }}
        baselineContent="Original content"
        onChange={onChange}
      />
    );

    // Verify diff IS visible initially (baseline ≠ content)
    const cmContent = document.querySelector('.cm-content');
    expect(cmContent?.innerHTML).toContain('diff-inserted');

    // Simulate the parent clearing the baseline once the user's edit is
    // acknowledged (i.e., baselineContent advances to match the new content).
    await act(async () => {
      rerender(
        <Editor
          {...defaultProps}
          chapter={{ ...mockChapter, content: 'AI inserted this' }}
          baselineContent="AI inserted this"
          onChange={onChange}
        />
      );
    });

    // When baseline equals current content, no diff should be shown.
    const cmContentAfter = document.querySelector('.cm-content');
    expect(cmContentAfter?.innerHTML).not.toContain('diff-inserted');

    vi.useRealTimers();
  });

  it('renders a visible tab marker in wysiwyg whitespace mode', async () => {
    const { container } = render(
      <Editor
        {...defaultProps}
        viewMode="wysiwyg"
        chapter={{ ...mockChapter, content: 'a\tb' }}
        showWhitespace={true}
      />
    );

    await act(async () => {});

    const marker = container.querySelector('#wysiwyg-editor .cm-ws-marker');
    expect(marker).toBeDefined();
    expect(marker?.textContent).toBe('→');
  });

  it('uses pre-wrap whitespace handling in wysiwyg whitespace mode', async () => {
    const { container } = render(
      <Editor
        {...defaultProps}
        viewMode="wysiwyg"
        chapter={{ ...mockChapter, content: 'a  b' }}
        showWhitespace={true}
      />
    );

    await act(async () => {});

    const editor = container.querySelector('#wysiwyg-editor');
    expect(editor).toBeDefined();
    expect(editor?.getAttribute('style')).toContain('white-space: pre-wrap');
  });

  it('re-shows diff decoration when a new baselineContent prop arrives after user cleared it', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Editor
        {...defaultProps}
        chapter={{ ...mockChapter, content: 'User typed text' }}
        baselineContent="User typed text"
        onChange={onChange}
      />
    );

    // No diff visible
    let cmContent = document.querySelector('.cm-content');
    expect(cmContent?.innerHTML).not.toContain('diff-inserted');

    // AI pushes new content and parent updates both chapter and baselineContent
    await act(async () => {
      rerender(
        <Editor
          {...defaultProps}
          chapter={{ ...mockChapter, content: 'User typed text and AI added this' }}
          baselineContent="User typed text"
          onChange={onChange}
        />
      );
    });

    cmContent = document.querySelector('.cm-content');
    expect(cmContent?.innerHTML).toContain('diff-inserted');
  });

  it('inserts a tab character in wysiwyg mode instead of moving focus', async () => {
    const originalExecCommand = document.execCommand;
    const execCommandMock = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      value: execCommandMock,
      configurable: true,
    });

    const { container } = render(
      <Editor
        {...defaultProps}
        viewMode="wysiwyg"
        chapter={{ ...mockChapter, content: 'Line one' }}
      />
    );

    const wysiwyg = container.querySelector('#wysiwyg-editor');
    expect(wysiwyg).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(wysiwyg as HTMLElement, {
        key: 'Tab',
        code: 'Tab',
        keyCode: 9,
        charCode: 9,
      });
    });

    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, '\t');
    Object.defineProperty(document, 'execCommand', {
      value: originalExecCommand,
      configurable: true,
    });
  });
});
