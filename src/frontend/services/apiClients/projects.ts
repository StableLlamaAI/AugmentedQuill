// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the projects unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import {
  ListImagesResponse,
  ProjectMutationResponse,
  ProjectsListResponse,
  ProjectSelectResponse,
} from '../apiTypes';
import { fetchBlob, fetchJson, postJson } from './shared';

export const projectsApi = {
  list: async () =>
    fetchJson<ProjectsListResponse>('/projects', undefined, 'Failed to list projects'),

  select: async (name: string) => {
    return postJson<ProjectSelectResponse>(
      '/projects/select',
      { name },
      'Failed to select project'
    );
  },

  create: async (name: string, type: 'short-story' | 'novel' | 'series') => {
    return postJson<ProjectMutationResponse>(
      '/projects/create',
      { name, type },
      'Failed to create project'
    );
  },

  convert: async (new_type: string) => {
    return postJson<ProjectMutationResponse>(
      '/projects/convert',
      { new_type },
      'Failed to convert project'
    );
  },

  delete: async (name: string) => {
    return postJson<ProjectMutationResponse>(
      '/projects/delete',
      { name },
      'Failed to delete project'
    );
  },

  export: async (name?: string) => {
    const path = name
      ? `/projects/export?name=${encodeURIComponent(name)}`
      : '/projects/export';
    return fetchBlob(path, undefined, 'Failed to export project');
  },

  updateConfig: async () => {
    return fetchJson<{ ok?: boolean; detail?: string }>(
      '/settings/update_story_config',
      { method: 'POST' },
      'Failed to update story config'
    );
  },

  import: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson<ProjectMutationResponse>(
      '/projects/import',
      {
        method: 'POST',
        body: formData,
      },
      'Failed to import project'
    );
  },

  uploadImage: async (file: File, targetName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const path = targetName
      ? `/projects/images/upload?target_name=${encodeURIComponent(targetName)}`
      : '/projects/images/upload';
    return fetchJson<{ ok: boolean; filename: string; url: string }>(
      path,
      { method: 'POST', body: formData },
      'Failed to upload image'
    );
  },

  updateImage: async (filename: string, description?: string, title?: string) => {
    return postJson<{ ok: boolean }>(
      '/projects/images/update_description',
      { filename, description, title },
      'Failed to update image metadata'
    );
  },

  createImagePlaceholder: async (description: string, title?: string) => {
    return postJson<{ ok: boolean; filename: string }>(
      '/projects/images/create_placeholder',
      { description, title },
      'Failed to create placeholder'
    );
  },

  listImages: async () => {
    return fetchJson<ListImagesResponse>(
      '/projects/images/list',
      undefined,
      'Failed to list images'
    );
  },

  deleteImage: async (filename: string) => {
    return postJson<{ ok: boolean }>(
      '/projects/images/delete',
      { filename },
      'Failed to delete image'
    );
  },
};
