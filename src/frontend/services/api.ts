// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the api unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { machineApi } from './apiClients/machine';
import { projectsApi } from './apiClients/projects';
import { createBooksApi } from './apiClients/books';
import { createChaptersApi } from './apiClients/chapters';
import { createStoryApi } from './apiClients/story';
import { createSettingsApi } from './apiClients/settings';
import { createChatApi } from './apiClients/chat';
import { createSourcebookApi } from './apiClients/sourcebook';
import { debugApi } from './apiClients/debug';
import { createCheckpointsApi } from './apiClients/checkpoints';
import { createSearchApi } from './apiClients/search';
import { useStoryStore } from '../stores/storyStore';

type ProjectApiClients = {
  books: ReturnType<typeof createBooksApi>;
  chapters: ReturnType<typeof createChaptersApi>;
  story: ReturnType<typeof createStoryApi>;
  settings: ReturnType<typeof createSettingsApi>;
  chat: ReturnType<typeof createChatApi>;
  sourcebook: ReturnType<typeof createSourcebookApi>;
  checkpoints: ReturnType<typeof createCheckpointsApi>;
  search: ReturnType<typeof createSearchApi>;
};

const projectApiCache = new Map<string, ProjectApiClients>();
const unscopedSettingsApi = createSettingsApi('');
const unscopedChaptersApi = createChaptersApi('');
const unscopedStoryApi = createStoryApi('');

function getCurrentProjectName(): string {
  return useStoryStore.getState().story.id;
}

function requireCurrentProjectName(): string {
  const projectName = getCurrentProjectName();
  if (!projectName) {
    throw new Error('No active project selected');
  }
  return projectName;
}

function forProject(projectName: string): ProjectApiClients {
  const cached = projectApiCache.get(projectName);
  if (cached) return cached;

  const scoped: ProjectApiClients = {
    books: createBooksApi(projectName),
    chapters: createChaptersApi(projectName),
    story: createStoryApi(projectName),
    settings: createSettingsApi(projectName),
    chat: createChatApi(projectName),
    sourcebook: createSourcebookApi(projectName),
    checkpoints: createCheckpointsApi(projectName),
    search: createSearchApi(projectName),
  };
  projectApiCache.set(projectName, scoped);
  return scoped;
}

const currentProjectApi = (): ProjectApiClients =>
  forProject(requireCurrentProjectName());

export const api = {
  forProject,
  machine: machineApi,
  projects: projectsApi,
  books: {
    create: (...args: Parameters<ProjectApiClients['books']['create']>) =>
      currentProjectApi().books.create(...args),
    delete: (...args: Parameters<ProjectApiClients['books']['delete']>) =>
      currentProjectApi().books.delete(...args),
    restore: (...args: Parameters<ProjectApiClients['books']['restore']>) =>
      currentProjectApi().books.restore(...args),
    reorder: (...args: Parameters<ProjectApiClients['books']['reorder']>) =>
      currentProjectApi().books.reorder(...args),
    updateBookMetadata: (
      ...args: Parameters<ProjectApiClients['books']['updateBookMetadata']>
    ) => currentProjectApi().books.updateBookMetadata(...args),
  },
  chapters: {
    list: (...args: Parameters<ProjectApiClients['chapters']['list']>) =>
      getCurrentProjectName()
        ? currentProjectApi().chapters.list(...args)
        : unscopedChaptersApi.list(...args),
    get: (...args: Parameters<ProjectApiClients['chapters']['get']>) =>
      currentProjectApi().chapters.get(...args),
    create: (...args: Parameters<ProjectApiClients['chapters']['create']>) =>
      currentProjectApi().chapters.create(...args),
    updateContent: (
      ...args: Parameters<ProjectApiClients['chapters']['updateContent']>
    ) => currentProjectApi().chapters.updateContent(...args),
    updateTitle: (...args: Parameters<ProjectApiClients['chapters']['updateTitle']>) =>
      currentProjectApi().chapters.updateTitle(...args),
    updateSummary: (
      ...args: Parameters<ProjectApiClients['chapters']['updateSummary']>
    ) => currentProjectApi().chapters.updateSummary(...args),
    updateMetadata: (
      ...args: Parameters<ProjectApiClients['chapters']['updateMetadata']>
    ) => currentProjectApi().chapters.updateMetadata(...args),
    delete: (...args: Parameters<ProjectApiClients['chapters']['delete']>) =>
      currentProjectApi().chapters.delete(...args),
    reorder: (...args: Parameters<ProjectApiClients['chapters']['reorder']>) =>
      currentProjectApi().chapters.reorder(...args),
  },
  story: {
    updateTitle: (...args: Parameters<ProjectApiClients['story']['updateTitle']>) =>
      currentProjectApi().story.updateTitle(...args),
    updateSummary: (...args: Parameters<ProjectApiClients['story']['updateSummary']>) =>
      currentProjectApi().story.updateSummary(...args),
    updateTags: (...args: Parameters<ProjectApiClients['story']['updateTags']>) =>
      currentProjectApi().story.updateTags(...args),
    updateSettings: (
      ...args: Parameters<ProjectApiClients['story']['updateSettings']>
    ) => currentProjectApi().story.updateSettings(...args),
    updateMetadata: (
      ...args: Parameters<ProjectApiClients['story']['updateMetadata']>
    ) => currentProjectApi().story.updateMetadata(...args),
    getContent: (...args: Parameters<ProjectApiClients['story']['getContent']>) =>
      getCurrentProjectName()
        ? currentProjectApi().story.getContent(...args)
        : unscopedStoryApi.getContent(...args),
    updateContent: (...args: Parameters<ProjectApiClients['story']['updateContent']>) =>
      currentProjectApi().story.updateContent(...args),
    computeSourcebookRelevance: (
      ...args: Parameters<ProjectApiClients['story']['computeSourcebookRelevance']>
    ) => currentProjectApi().story.computeSourcebookRelevance(...args),
  },
  settings: {
    getPrompts: (...args: Parameters<ProjectApiClients['settings']['getPrompts']>) =>
      getCurrentProjectName()
        ? currentProjectApi().settings.getPrompts(...args)
        : unscopedSettingsApi.getPrompts(...args),
  },
  chat: {
    list: (...args: Parameters<ProjectApiClients['chat']['list']>) =>
      currentProjectApi().chat.list(...args),
    load: (...args: Parameters<ProjectApiClients['chat']['load']>) =>
      currentProjectApi().chat.load(...args),
    save: (...args: Parameters<ProjectApiClients['chat']['save']>) =>
      currentProjectApi().chat.save(...args),
    delete: (...args: Parameters<ProjectApiClients['chat']['delete']>) =>
      currentProjectApi().chat.delete(...args),
    deleteAll: (...args: Parameters<ProjectApiClients['chat']['deleteAll']>) =>
      currentProjectApi().chat.deleteAll(...args),
    executeTools: (...args: Parameters<ProjectApiClients['chat']['executeTools']>) =>
      currentProjectApi().chat.executeTools(...args),
    undoToolBatch: (...args: Parameters<ProjectApiClients['chat']['undoToolBatch']>) =>
      currentProjectApi().chat.undoToolBatch(...args),
    redoToolBatch: (...args: Parameters<ProjectApiClients['chat']['redoToolBatch']>) =>
      currentProjectApi().chat.redoToolBatch(...args),
  },
  sourcebook: {
    list: (...args: Parameters<ProjectApiClients['sourcebook']['list']>) =>
      currentProjectApi().sourcebook.list(...args),
    create: (...args: Parameters<ProjectApiClients['sourcebook']['create']>) =>
      currentProjectApi().sourcebook.create(...args),
    update: (...args: Parameters<ProjectApiClients['sourcebook']['update']>) =>
      currentProjectApi().sourcebook.update(...args),
    delete: (...args: Parameters<ProjectApiClients['sourcebook']['delete']>) =>
      currentProjectApi().sourcebook.delete(...args),
    generateKeywords: (
      ...args: Parameters<ProjectApiClients['sourcebook']['generateKeywords']>
    ) => currentProjectApi().sourcebook.generateKeywords(...args),
  },
  debug: debugApi,
  checkpoints: {
    list: (...args: Parameters<ProjectApiClients['checkpoints']['list']>) =>
      currentProjectApi().checkpoints.list(...args),
    create: (...args: Parameters<ProjectApiClients['checkpoints']['create']>) =>
      currentProjectApi().checkpoints.create(...args),
    load: (...args: Parameters<ProjectApiClients['checkpoints']['load']>) =>
      currentProjectApi().checkpoints.load(...args),
    delete: (...args: Parameters<ProjectApiClients['checkpoints']['delete']>) =>
      currentProjectApi().checkpoints.delete(...args),
  },
  search: {
    search: (...args: Parameters<ProjectApiClients['search']['search']>) =>
      currentProjectApi().search.search(...args),
    replaceAll: (...args: Parameters<ProjectApiClients['search']['replaceAll']>) =>
      currentProjectApi().search.replaceAll(...args),
    replaceSingle: (
      ...args: Parameters<ProjectApiClients['search']['replaceSingle']>
    ) => currentProjectApi().search.replaceSingle(...args),
  },
};
