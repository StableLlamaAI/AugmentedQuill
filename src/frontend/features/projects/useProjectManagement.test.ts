// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for useProjectManagement so project list sync and rename persistence remain stable.
 */

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectManagement } from './useProjectManagement';
import { api } from '../../services/api';
import { StoryState } from '../../types';

vi.mock('../../services/api', () => ({
  api: {
    projects: {
      list: vi.fn(),
      select: vi.fn(),
      import: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      export: vi.fn(),
    },
    settings: {
      getPrompts: vi.fn(),
    },
    chat: {
      list: vi.fn(),
    },
  },
}));

const baseStory: StoryState = {
  id: 'active-story',
  title: 'Active Story',
  summary: '',
  styleTags: [],
  chapters: [],
  projectType: 'novel',
  currentChapterId: null,
  image_style: '',
  image_additional_info: '',
  books: [],
  sourcebook: [],
};

describe('useProjectManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) {
          delete store[key];
        }
      },
    });
    vi.mocked(api.projects.list).mockResolvedValue({
      available: [{ name: 'p1', title: 'Project One', type: 'novel', language: 'en' }],
    } as any);
    vi.mocked(api.settings.getPrompts).mockResolvedValue({
      languages: ['en', 'de'],
    } as any);
  });

  it('loads project list and instruction languages on mount', async () => {
    const { result } = renderHook(() =>
      useProjectManagement({
        story: baseStory,
        refreshStory: vi.fn().mockResolvedValue(undefined),
        loadStory: vi.fn(),
        updateStoryMetadata: vi.fn().mockResolvedValue(undefined),
        handleSelectChat: vi.fn().mockResolvedValue(undefined),
        handleNewChat: vi.fn(),
        setChatHistoryList: vi.fn(),
        getErrorMessage: () => 'error',
        isSettingsOpen: false,
        setIsSettingsOpen: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.projects.some((project) => project.id === 'p1')).toBe(true);
    });
    expect(result.current.instructionLanguages).toEqual(['en', 'de']);
  });

  it('resets undo history when the user switches projects', async () => {
    vi.mocked(api.projects.select).mockResolvedValue({ ok: true } as any);
    vi.mocked(api.chat.list).mockResolvedValue([] as any);

    const refreshStory = vi.fn().mockResolvedValue(undefined);
    const handleNewChat = vi.fn();

    const { result } = renderHook(() =>
      useProjectManagement({
        story: baseStory,
        refreshStory,
        loadStory: vi.fn(),
        updateStoryMetadata: vi.fn().mockResolvedValue(undefined),
        handleSelectChat: vi.fn().mockResolvedValue(undefined),
        handleNewChat,
        setChatHistoryList: vi.fn(),
        getErrorMessage: () => 'error',
        isSettingsOpen: false,
        setIsSettingsOpen: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleLoadProject('p1');
    });

    expect(refreshStory).toHaveBeenCalledWith(undefined, true);
    expect(handleNewChat).toHaveBeenCalled();
  });

  it('renames a non-active project and persists language to local storage', async () => {
    localStorage.setItem(
      'project_other',
      JSON.stringify({ id: 'other', title: 'Old', language: 'en' })
    );

    const { result } = renderHook(() =>
      useProjectManagement({
        story: baseStory,
        refreshStory: vi.fn().mockResolvedValue(undefined),
        loadStory: vi.fn(),
        updateStoryMetadata: vi.fn().mockResolvedValue(undefined),
        handleSelectChat: vi.fn().mockResolvedValue(undefined),
        handleNewChat: vi.fn(),
        setChatHistoryList: vi.fn(),
        getErrorMessage: () => 'error',
        isSettingsOpen: false,
        setIsSettingsOpen: vi.fn(),
      })
    );

    act(() => {
      result.current.setProjects([
        {
          id: 'other',
          title: 'Old',
          type: 'novel',
          updatedAt: Date.now(),
          language: 'en',
        },
      ]);
    });

    act(() => {
      result.current.handleRenameProject('other', 'Renamed', 'de');
    });

    expect(result.current.projects[0].title).toBe('Renamed');
    expect(result.current.projects[0].language).toBe('de');

    const persisted = JSON.parse(localStorage.getItem('project_other') || '{}');
    expect(persisted.title).toBe('Renamed');
    expect(persisted.language).toBe('de');
  });

  it('syncs active project language when story metadata updates', async () => {
    const initialStory = {
      ...baseStory,
      language: 'en',
    };
    const { result, rerender } = renderHook(
      ({ story }) =>
        useProjectManagement({
          story,
          refreshStory: vi.fn().mockResolvedValue(undefined),
          loadStory: vi.fn(),
          updateStoryMetadata: vi.fn().mockResolvedValue(undefined),
          handleSelectChat: vi.fn().mockResolvedValue(undefined),
          handleNewChat: vi.fn(),
          setChatHistoryList: vi.fn(),
          getErrorMessage: () => 'error',
          isSettingsOpen: false,
          setIsSettingsOpen: vi.fn(),
        }),
      { initialProps: { story: initialStory } }
    );

    await waitFor(() => {
      expect(
        result.current.projects.some((project) => project.id === 'active-story')
      ).toBe(true);
    });

    act(() => {
      rerender({
        story: {
          ...initialStory,
          language: 'de',
        },
      });
    });

    expect(
      result.current.projects.find((project) => project.id === 'active-story')?.language
    ).toBe('de');
  });
});
