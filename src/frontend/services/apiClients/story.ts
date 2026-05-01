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

export interface StoryApi {
  updateTitle: (title: string) => Promise<{ ok: boolean; detail?: string | undefined }>;
  updateSummary: (
    summary: string
  ) => Promise<{ ok: boolean; summary?: string | undefined }>;
  updateTags: (tags: string[]) => Promise<{ ok: boolean }>;
  updateSettings: (settings: {
    image_style?: string;
    image_additional_info?: string;
  }) => Promise<{ ok: boolean; story?: unknown }>;
  updateMetadata: (data: {
    title?: string;
    summary?: string;
    tags?: string[];
    notes?: string;
    private_notes?: string;
    conflicts?: Array<{ id?: string; description?: string; resolution?: string }>;
    language?: string;
  }) => Promise<{ ok: boolean; detail?: string | undefined }>;
  getContent: () => Promise<{ ok: boolean; content: string }>;
  updateContent: (content: string) => Promise<{ ok: boolean }>;
  computeSourcebookRelevance: (
    chapId: string,
    currentText: string
  ) => Promise<{ relevant: string[] }>;
}

export const createStoryApi = (projectName: string): StoryApi => ({
  updateTitle: async (
    title: string
  ): Promise<{ ok: boolean; detail?: string | undefined }> => {
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

  updateSummary: async (
    summary: string
  ): Promise<{ ok: boolean; summary?: string | undefined }> => {
    return putJson<{ ok: boolean; summary?: string }>(
      projectEndpoint(projectName, '/story/summary'),
      { summary },
      'Failed to update story summary'
    );
  },

  updateTags: async (tags: string[]): Promise<{ ok: boolean }> => {
    return putJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/story/tags'),
      { tags },
      'Failed to update story tags'
    );
  },

  updateSettings: async (settings: {
    image_style?: string;
    image_additional_info?: string;
  }): Promise<{ ok: boolean; story?: unknown }> => {
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
  }): Promise<{ ok: boolean; detail?: string | undefined }> => {
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

  getContent: async (): Promise<{ ok: boolean; content: string }> => {
    return fetchJson<StoryContentResponse>(
      projectEndpoint(projectName, '/story/content'),
      undefined,
      'Failed to get story content'
    );
  },

  updateContent: async (content: string): Promise<{ ok: boolean }> => {
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

  computeSourcebookRelevance: async (
    chapId: string,
    currentText: string
  ): Promise<{ relevant: string[] }> => {
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
