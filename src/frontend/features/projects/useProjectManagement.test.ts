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

const baseStory = {
  id: 'active-story',
  title: 'Active Story',
  projectType: 'novel' as const,
  language: 'en' as string | undefined,
  summary: '',
  styleTags: [] as string[],
  conflicts: [] as import('../../types').Conflict[],
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
    } as unknown as Awaited<ReturnType<typeof api.projects.list>>);
    vi.mocked(api.settings.getPrompts).mockResolvedValue({
      languages: ['en', 'de'],
    } as unknown as Awaited<ReturnType<typeof api.settings.getPrompts>>);
  });

  it('loads project list and instruction languages on mount', async () => {
    const { result } = renderHook(() =>
      useProjectManagement({
        storyId: baseStory.id,
        storyTitle: baseStory.title,
        storyProjectType: baseStory.projectType,
        storyLanguage: baseStory.language ?? 'en',
        storySummary: baseStory.summary,
        storyStyleTags: baseStory.styleTags,
        storyConflicts: baseStory.conflicts,
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
      expect(
        result.current.projects.some(
          (project: import('../../types').ProjectMetadata) => project.id === 'p1'
        )
      ).toBe(true);
    });
    expect(result.current.instructionLanguages).toEqual(['en', 'de']);
  });

  it('resets undo history when the user switches projects', async () => {
    vi.mocked(api.projects.select).mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<typeof api.projects.select>
    >);
    vi.mocked(api.chat.list).mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof api.chat.list>>
    );

    const refreshStory = vi.fn().mockResolvedValue(undefined);
    const handleNewChat = vi.fn();

    const { result } = renderHook(() =>
      useProjectManagement({
        storyId: baseStory.id,
        storyTitle: baseStory.title,
        storyProjectType: baseStory.projectType,
        storyLanguage: baseStory.language ?? 'en',
        storySummary: baseStory.summary,
        storyStyleTags: baseStory.styleTags,
        storyConflicts: baseStory.conflicts,
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
        storyId: baseStory.id,
        storyTitle: baseStory.title,
        storyProjectType: baseStory.projectType,
        storyLanguage: baseStory.language ?? 'en',
        storySummary: baseStory.summary,
        storyStyleTags: baseStory.styleTags,
        storyConflicts: baseStory.conflicts,
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
    const initialProps = {
      storyId: baseStory.id,
      storyTitle: baseStory.title,
      storyProjectType: baseStory.projectType,
      storyLanguage: 'en',
      storySummary: baseStory.summary,
      storyStyleTags: baseStory.styleTags,
      storyConflicts: baseStory.conflicts,
    };
    const { result, rerender } = renderHook(
      ({
        storyId,
        storyTitle,
        storyProjectType,
        storyLanguage,
        storySummary,
        storyStyleTags,
        storyConflicts,
      }: {
        storyId: string;
        storyTitle: string;
        storyProjectType: 'short-story' | 'novel' | 'series';
        storyLanguage: string;
        storySummary: string;
        storyStyleTags: string[];
        storyConflicts: import('../../types').Conflict[];
      }) =>
        useProjectManagement({
          storyId,
          storyTitle,
          storyProjectType,
          storyLanguage,
          storySummary,
          storyStyleTags,
          storyConflicts,
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
      { initialProps }
    );

    await waitFor(() => {
      expect(
        result.current.projects.some(
          (project: import('../../types').ProjectMetadata) =>
            project.id === 'active-story'
        )
      ).toBe(true);
    });

    act(() => {
      rerender({
        storyId: baseStory.id,
        storyTitle: baseStory.title,
        storyProjectType: baseStory.projectType,
        storyLanguage: 'de',
        storySummary: baseStory.summary,
        storyStyleTags: baseStory.styleTags,
        storyConflicts: baseStory.conflicts,
      });
    });

    expect(
      result.current.projects.find(
        (project: import('../../types').ProjectMetadata) =>
          project.id === 'active-story'
      )?.language
    ).toBe('de');
  });

  it('does not resync project metadata when only non-tracked fields change', async () => {
    const initialProps = {
      storyId: baseStory.id,
      storyTitle: baseStory.title,
      storyProjectType: baseStory.projectType,
      storyLanguage: 'en',
      storySummary: baseStory.summary,
      storyStyleTags: baseStory.styleTags,
      storyConflicts: baseStory.conflicts,
    };

    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(3000)
      .mockReturnValueOnce(4000)
      .mockReturnValueOnce(5000);

    const { result, rerender } = renderHook(
      ({
        storyId,
        storyTitle,
        storyProjectType,
        storyLanguage,
        storySummary,
        storyStyleTags,
        storyConflicts,
      }: {
        storyId: string;
        storyTitle: string;
        storyProjectType: 'short-story' | 'novel' | 'series';
        storyLanguage: string;
        storySummary: string;
        storyStyleTags: string[];
        storyConflicts: import('../../types').Conflict[];
      }) =>
        useProjectManagement({
          storyId,
          storyTitle,
          storyProjectType,
          storyLanguage,
          storySummary,
          storyStyleTags,
          storyConflicts,
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
      { initialProps }
    );

    await waitFor(() => {
      expect(
        result.current.projects.some(
          (project: import('../../types').ProjectMetadata) =>
            project.id === 'active-story'
        )
      ).toBe(true);
    });

    const before = result.current.projects.find(
      (project: import('../../types').ProjectMetadata) => project.id === 'active-story'
    );

    // Rerender with same metadata values — no change should be applied.
    act(() => {
      rerender({ ...initialProps });
    });

    const after = result.current.projects.find(
      (project: import('../../types').ProjectMetadata) => project.id === 'active-story'
    );
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(after?.title).toBe(before?.title);
    expect(after?.language).toBe(before?.language);
  });
});
