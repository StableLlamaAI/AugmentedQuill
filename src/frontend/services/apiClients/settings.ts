// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { fetchJson, projectEndpoint } from './shared';

export interface SettingsApi {
  getPrompts: (modelName?: string) => Promise<{
    ok: boolean;
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
    languages?: string[];
    project_language?: string;
  }>;
}

export const createSettingsApi = (projectName: string): SettingsApi => ({
  getPrompts: async (modelName?: string) => {
    const path = modelName
      ? `${projectEndpoint(projectName, '/prompts')}?model_name=${encodeURIComponent(modelName)}`
      : projectEndpoint(projectName, '/prompts');
    return fetchJson<{
      ok: boolean;
      system_messages: Record<string, string>;
      user_prompts: Record<string, string>;
      languages?: string[];
      project_language?: string;
    }>(path, undefined, 'Failed to fetch prompts');
  },
});

export const settingsApi = createSettingsApi('');
