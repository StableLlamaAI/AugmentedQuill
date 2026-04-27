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
import { render, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor';
import { WritingUnit } from '../../types';
import { useStoryStore, resetStoryStore } from '../../stores/storyStore';

if (typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(0), 0);
}
if (typeof window.cancelAnimationFrame !== 'function') {
  window.cancelAnimationFrame = window.clearTimeout;
}

afterEach(() => {
  cleanup();
  resetStoryStore();
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
    suggestionMode: 'guided' as const,
    setSuggestionMode: vi.fn(),
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

  it('resets diff baseline when switching to a new chapter with no baseline', async () => {
    const firstChapter = { ...mockChapter, content: 'Original content with AI' };
    const secondChapter = {
      ...mockChapter,
      id: '2',
      title: 'Chapter 2',
      content: 'Second chapter text',
    };

    const { rerender } = render(
      <Editor
        {...defaultProps}
        chapter={firstChapter}
        baselineContent="Original content"
      />
    );

    await act(async () => {
      rerender(
        <Editor {...defaultProps} chapter={secondChapter} baselineContent={undefined} />
      );
    });

    const cmContent = document.querySelector('.cm-content');
    expect(cmContent?.innerHTML).not.toContain('diff-inserted');
  });

  it('shows streaming content from store slot with correct diff during streaming', async () => {
    const { rerender } = render(<Editor {...defaultProps} />);

    const cmContent = document.querySelector('.cm-content');
    if (cmContent) (cmContent as HTMLElement).focus();

    // Simulate a rewrite streaming: entirely new text, nothing in common with baseline.
    // The streaming slot is used so only this editor re-renders.
    await act(async () => {
      useStoryStore.getState().setStreamingContent({
        chapterId: mockChapter.id,
        content: 'Brand new text with AI',
      });
      rerender(
        <Editor
          {...defaultProps}
          aiControls={{ ...defaultProps.aiControls, isProseStreaming: true }}
        />
      );
    });

    const updated = document.querySelector('.cm-content');
    // Streamed text must reach the editor.
    expect(updated?.textContent).toContain('Brand new text with AI');
    // Common-prefix streaming diff: all streamed content is inserted (green).
    expect(updated?.innerHTML).toContain('diff-inserted');
    // Deleted baseline is shown as a red widget.
    expect(updated?.innerHTML).toContain('diff-deleted');
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
});

describe('Editor diff highlighting – smart-quote regression', () => {
  it('preserves full diff after typographic quote replacement (smart-quote regression)', async () => {
    // Baseline: original content with typographic quotes already.
    // After streaming (raw quotes in the new text), then after lazy-load applies
    // typographic quotes to server content, the diff must still show the FULL
    // new text — not only the quote-position changes.
    const baseline = 'He said \u201Chello.\u201D';
    const rawContent = 'He said \u201Chello.\u201D\n\nShe replied "goodbye."';
    const typographicChapter = {
      ...mockChapter,
      content: 'He said \u201Chello.\u201D\n\nShe replied \u201Cgoodbye.\u201D',
    };

    const { rerender } = render(<Editor {...defaultProps} />);

    // Simulate streaming preview via the dedicated store slot.  chapter.content
    // stays at the pre-AI baseline while streaming is active; diff is suppressed.
    await act(async () => {
      useStoryStore.getState().setStreamingContent({
        chapterId: mockChapter.id,
        content: rawContent,
      });
      rerender(
        <Editor
          {...defaultProps}
          baselineContent={baseline}
          aiControls={{ ...defaultProps.aiControls, isProseStreaming: true }}
        />
      );
    });

    let cmContent = document.querySelector('.cm-content');
    // Streaming text must reach the editor.
    expect(cmContent?.textContent).toContain('goodbye');
    // Common-prefix streaming diff: the common prefix ('He said "hello."') is
    // white, the new paragraph ('\n\nShe replied ...') is shown as inserted.
    expect(cmContent?.innerHTML).toContain('diff-inserted');

    // Simulate lazy-load replacing content with typographic version from server
    // and streaming ending.
    await act(async () => {
      useStoryStore.getState().setStreamingContent(null);
      rerender(
        <Editor
          {...defaultProps}
          chapter={typographicChapter}
          baselineContent={baseline}
          aiControls={{ ...defaultProps.aiControls, isProseStreaming: false }}
        />
      );
    });

    cmContent = document.querySelector('.cm-content');
    expect(cmContent?.innerHTML).toContain('diff-inserted');
    // The highlighted region must contain the new paragraph text, not shrink to
    // just the quote-character positions.
    expect(cmContent?.innerHTML).toContain('goodbye');
    // Verify the post-streaming diff decorates a meaningful amount of content.
    const countInserted = (html: string) =>
      (html.match(/class="cm-diff-inserted"/g) ?? []).length;
    expect(countInserted(cmContent?.innerHTML ?? '')).toBeGreaterThan(0);
  });
});
