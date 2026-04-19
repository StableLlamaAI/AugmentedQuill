// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use project management unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useCallback, useEffect, useState } from 'react';
import { StoryState, ProjectMetadata, ChatSession } from '../../types';
import { api } from '../../services/api';
import { ProjectListItem } from '../../services/apiTypes';
import { mapSelectStoryToState } from '../story/storyMappers';
import { formatError, notifyError } from '../../services/errorNotifier';

type CreateProjectType = 'short-story' | 'novel' | 'series';

type UseProjectManagementParams = {
  story: StoryState;
  refreshStory: () => Promise<void>;
  loadStory: (story: StoryState) => void;
  updateStoryMetadata: (
    title: string,
    summary: string,
    tags: string[],
    notes?: string,
    private_notes?: string,
    conflicts?: StoryState['conflicts'],
    language?: string
  ) => Promise<void>;
  handleSelectChat: (id: string) => Promise<void>;
  handleNewChat: (incognito?: boolean) => void;
  setChatHistoryList: (list: ChatSession[]) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  recordHistoryEntry?: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
};

const mapProjectsList = (projects: ProjectListItem[]) =>
  projects.map((project: ProjectListItem) => ({
    id: project.name,
    title: project.title || project.name,
    type: project.type || 'novel',
    updatedAt: Date.now(),
    language: project.language || 'en',
  }));

/** Custom React hook that manages project management. */
export function useProjectManagement({
  story,
  refreshStory,
  loadStory,
  updateStoryMetadata,
  handleSelectChat,
  handleNewChat,
  setChatHistoryList,
  getErrorMessage,
  isSettingsOpen,
  setIsSettingsOpen,
  recordHistoryEntry,
}: UseProjectManagementParams): {
  projects: ProjectMetadata[];
  setProjects: import('react').Dispatch<
    import('react').SetStateAction<ProjectMetadata[]>
  >;
  refreshProjects: () => Promise<void>;
  isCreateProjectOpen: boolean;
  setIsCreateProjectOpen: import('react').Dispatch<
    import('react').SetStateAction<boolean>
  >;
  instructionLanguages: string[];
  handleLoadProject: (id: string) => Promise<void>;
  handleImportProject: (file: File) => Promise<void>;
  handleCreateProject: () => void;
  handleCreateProjectConfirm: (
    name: string,
    type: CreateProjectType,
    language?: string
  ) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  handleRenameProject: (id: string, newName: string, newLang?: string) => void;
} {
  const [projects, setProjects] = useState<ProjectMetadata[]>(() => {
    const saved = localStorage.getItem('augmentedquill_projects_meta');
    return saved
      ? JSON.parse(saved)
      : [{ id: story.id, title: story.title, updatedAt: Date.now() }];
  });
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [instructionLanguages, setInstructionLanguages] = useState<string[]>(['en']);

  const refreshProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      if (data.available) {
        const listedProjects = mapProjectsList(data.available);
        setProjects((prev: ProjectMetadata[]) => {
          const hasActiveStory = listedProjects.some(
            (project: {
              id: string;
              title: string;
              type: 'short-story' | 'novel' | 'series';
              updatedAt: number;
              language: string;
            }) => project.id === story.id
          );
          if (hasActiveStory) {
            return listedProjects;
          }
          const activeFromPreviousState = prev.find(
            (project: ProjectMetadata) => project.id === story.id
          );
          return activeFromPreviousState
            ? [...listedProjects, activeFromPreviousState]
            : listedProjects;
        });
      }
    } catch (error) {
      console.error('Failed to fetch projects', error);
    }
  }, [story.id]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    localStorage.setItem('augmentedquill_projects_meta', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (!story || !story.id) return;

    localStorage.setItem(`project_${story.id}`, JSON.stringify(story));
    setProjects((prev: ProjectMetadata[]) => {
      const exists = prev.find((project: ProjectMetadata) => project.id === story.id);
      const language = story.language || 'en';
      if (
        exists &&
        exists.title === story.title &&
        exists.type === story.projectType &&
        exists.language === language
      ) {
        return prev.map((project: ProjectMetadata) =>
          project.id === story.id ? { ...project, updatedAt: Date.now() } : project
        );
      }
      if (exists) {
        return prev.map((project: ProjectMetadata) =>
          project.id === story.id
            ? {
                ...project,
                title: story.title,
                type: story.projectType,
                language,
                updatedAt: Date.now(),
              }
            : project
        );
      }
      return [
        ...prev,
        {
          id: story.id,
          title: story.title,
          type: story.projectType,
          language,
          updatedAt: Date.now(),
        },
      ];
    });
  }, [story.id, story.title, story.projectType, story.language]);

  const handleLoadProject = useCallback(
    async (id: string) => {
      try {
        const response = await api.projects.select(id);
        if (!response.ok) return;

        await refreshStory();
        const chats = await api.chat.list();
        setChatHistoryList(chats);
        if (chats.length > 0) {
          await handleSelectChat(chats[0].id);
        } else {
          handleNewChat();
        }
      } catch (error) {
        console.error('Failed to load project', error);
      }
    },
    [refreshStory, setChatHistoryList, handleSelectChat, handleNewChat]
  );

  const handleImportProject = useCallback(
    async (file: File) => {
      try {
        const previousActiveProjectId = story.id;
        const importedFileSnapshot = file;
        const knownProjectIds = new Set(
          projects.map((project: ProjectMetadata) => project.id)
        );
        const response = await api.projects.import(file);
        if (response.ok && response.available) {
          setProjects(mapProjectsList(response.available));

          const importedNameFromList = response.available
            .map((project: ProjectListItem) => project.name)
            .find((name: string) => !knownProjectIds.has(name));
          const importedNameFromMessage =
            typeof response.message === 'string'
              ? response.message.match(/Imported as\s+(.+)$/)?.[1]?.trim()
              : undefined;
          const importedProjectName =
            importedNameFromList || importedNameFromMessage || null;

          if (importedProjectName) {
            recordHistoryEntry?.({
              label: `Import project: ${importedProjectName}`,
              onUndo: async () => {
                await api.projects.delete(importedProjectName);
                await refreshProjects();
                if (previousActiveProjectId) {
                  await handleLoadProject(previousActiveProjectId);
                }
              },
              onRedo: async () => {
                await api.projects.import(importedFileSnapshot);
                await refreshProjects();
                await handleLoadProject(importedProjectName);
              },
            });
          }
        }
      } catch (error) {
        notifyError(`Import failed: ${getErrorMessage(error, 'Unknown error')}`, error);
      }
    },
    [
      story.id,
      projects,
      recordHistoryEntry,
      refreshProjects,
      handleLoadProject,
      getErrorMessage,
    ]
  );

  const handleCreateProject = useCallback(() => {
    setIsCreateProjectOpen(true);
  }, []);

  // gather languages from the instructions endpoint so the create dialog can
  // populate its dropdown
  useEffect(() => {
    const loadLangs = async () => {
      try {
        const data = await api.settings.getPrompts();
        if (data.languages) setInstructionLanguages(data.languages);
      } catch (e) {
        console.error('unable to load instruction languages', e);
        setInstructionLanguages(['en']);
      }
    };
    loadLangs();
  }, []);

  const handleCreateProjectConfirm = useCallback(
    async (name: string, type: CreateProjectType, language: string = 'en') => {
      try {
        const previousProjectId = story.id;
        const result = await api.projects.create(name, type, language);
        if (!result.ok) return;

        const listing = await api.projects.list();
        if (listing.projects) {
          setProjects(mapProjectsList(listing.projects));
        }

        if (result.story) {
          const mappedStory: StoryState = mapSelectStoryToState(
            name,
            result.story,
            (result.story.chapters || []).map(
              (
                chapter: {
                  title?: string;
                  summary?: string;
                  filename?: string;
                  book_id?: string;
                  notes?: string;
                  private_notes?: string;
                  conflicts?: import('../../types').Conflict[];
                },
                index: number
              ) => ({
                id: String(index + 1),
                title: chapter.title || '',
                summary: chapter.summary || '',
                content: '',
                filename: chapter.filename,
                book_id: chapter.book_id,
                notes: chapter.notes,
                private_notes: chapter.private_notes,
                conflicts: chapter.conflicts,
              })
            ),
            null,
            []
          );

          if (type === 'short-story') {
            mappedStory.draft = {
              id: 'story',
              scope: 'story',
              title: mappedStory.title,
              summary: mappedStory.summary,
              content: '',
              notes: mappedStory.notes,
              private_notes: mappedStory.private_notes,
              conflicts: mappedStory.conflicts,
              filename: 'content.md',
            };
            mappedStory.currentChapterId = null;
          }

          loadStory(mappedStory);
          handleNewChat(false);

          recordHistoryEntry?.({
            label: `Create project: ${name}`,
            onUndo: async () => {
              await api.projects.delete(name);
              await refreshProjects();
              if (previousProjectId && previousProjectId !== name) {
                await handleLoadProject(previousProjectId);
              }
            },
            onRedo: async () => {
              await api.projects.create(name, type, language);
              await refreshProjects();
              await handleLoadProject(name);
            },
          });
        }

        setIsCreateProjectOpen(false);
        if (isSettingsOpen) setIsSettingsOpen(false);
      } catch (error) {
        notifyError(`Failed to create project: ${formatError(error)}`, error);
      }
    },
    [
      story.id,
      loadStory,
      handleNewChat,
      refreshProjects,
      handleLoadProject,
      recordHistoryEntry,
      isSettingsOpen,
      setIsSettingsOpen,
    ]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (projects.length <= 1) return;

      try {
        let exported: Blob | null = null;
        try {
          exported = await api.projects.export(id);
        } catch (snapshotError) {
          console.warn('Project export snapshot failed before delete', snapshotError);
        }

        await api.projects.delete(id);
        const newProjects = projects.filter(
          (project: ProjectMetadata) => project.id !== id
        );
        setProjects(newProjects);
        localStorage.removeItem(`project_${id}`);

        if (id === story.id && newProjects.length > 0) {
          await handleLoadProject(newProjects[0].id);
        }

        if (exported) {
          recordHistoryEntry?.({
            label: `Delete project: ${id}`,
            onUndo: async () => {
              const snapshotFile = new File([exported as Blob], `${id}.zip`, {
                type: 'application/zip',
              });
              await api.projects.import(snapshotFile);
              await refreshProjects();
              await handleLoadProject(id);
            },
            onRedo: async () => {
              await api.projects.delete(id);
              await refreshProjects();
            },
          });
        }
      } catch (error) {
        notifyError(
          `Failed to delete project: ${getErrorMessage(error, 'Unknown error')}`,
          error
        );
      }
    },
    [
      projects,
      story.id,
      handleLoadProject,
      refreshProjects,
      recordHistoryEntry,
      getErrorMessage,
    ]
  );

  const handleRenameProject = useCallback(
    (id: string, newName: string, newLang?: string) => {
      if (id === story.id) {
        // if the active project is renamed, update story metadata
        updateStoryMetadata(
          newName,
          story.summary,
          story.styleTags,
          undefined,
          undefined,
          story.conflicts,
          newLang
        );
        return;
      }

      setProjects((prev: ProjectMetadata[]) =>
        prev.map((project: ProjectMetadata) =>
          project.id === id
            ? { ...project, title: newName, language: newLang || project.language }
            : project
        )
      );
      const saved = localStorage.getItem(`project_${id}`);
      if (!saved) return;
      const loaded = JSON.parse(saved);
      loaded.title = newName;
      if (newLang) loaded.language = newLang;
      localStorage.setItem(`project_${id}`, JSON.stringify(loaded));
    },
    [story.id, story.summary, story.styleTags, updateStoryMetadata]
  );

  return {
    projects,
    setProjects,
    refreshProjects,
    isCreateProjectOpen,
    setIsCreateProjectOpen,
    instructionLanguages,
    handleLoadProject,
    handleImportProject,
    handleCreateProject,
    handleCreateProjectConfirm,
    handleDeleteProject,
    handleRenameProject,
  };
}
