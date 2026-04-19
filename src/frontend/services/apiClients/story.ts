// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the story unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { StoryContentResponse } from '../apiTypes';
import { fetchJson, putJson, projectEndpoint } from './shared';

export const createStoryApi = (projectName: string) => ({
  updateTitle: async (title: string) => {
    return fetchJson<{ ok: boolean; detail?: string }>(
      projectEndpoint(projectName, '/story/title'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      },
      'Failed to update story title'
    );
  },

  updateSummary: async (summary: string) => {
    return putJson<{ ok: boolean; summary?: string }>(
      projectEndpoint(projectName, '/story/summary'),
      { summary },
      'Failed to update story summary'
    );
  },

  updateTags: async (tags: string[]) => {
    return putJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/story/tags'),
      { tags },
      'Failed to update story tags'
    );
  },

  updateSettings: async (settings: {
    image_style?: string;
    image_additional_info?: string;
  }) => {
    return fetchJson<{ ok: boolean; story?: unknown }>(
      projectEndpoint(projectName, '/story/settings'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      },
      'Failed to update story settings'
    );
  },

  updateMetadata: async (data: {
    title?: string;
    summary?: string;
    tags?: string[];
    notes?: string;
    private_notes?: string;
    conflicts?: Array<{ id?: string; description?: string; resolution?: string }>;
    language?: string;
  }) => {
    return fetchJson<{ ok: boolean; detail?: string }>(
      projectEndpoint(projectName, '/story/metadata'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to update story metadata'
    );
  },

  getContent: async () => {
    return fetchJson<StoryContentResponse>(
      projectEndpoint(projectName, '/story/content'),
      undefined,
      'Failed to get story content'
    );
  },

  updateContent: async (content: string) => {
    return fetchJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/story/content'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
      'Failed to update story content'
    );
  },

  computeSourcebookRelevance: async (chapId: string, currentText: string) => {
    return fetchJson<{ relevant: string[] }>(
      projectEndpoint(projectName, '/story/sourcebook/relevance'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: chapId === 'story' ? 'story' : 'chapter',
          chap_id: chapId === 'story' ? undefined : Number(chapId),
          current_text: currentText,
        }),
      },
      'Failed to compute sourcebook relevance'
    );
  },
});

export const storyApi = createStoryApi('');
