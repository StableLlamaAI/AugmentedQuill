// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the checkpoints API unit so this responsibility stays isolated, testable, and easy to evolve.
 */
import { fetchJson, postJson, projectEndpoint } from './shared';

export interface CheckpointInfo {
  timestamp: string;
}

export interface CheckpointListResponse {
  checkpoints: CheckpointInfo[];
}

export const createCheckpointsApi = (projectName: string) => ({
  list: async (): Promise<CheckpointListResponse> => {
    return fetchJson<CheckpointListResponse>(
      projectEndpoint(projectName, '/checkpoints'),
      undefined,
      'Failed to fetch checkpoints'
    );
  },

  create: async (): Promise<{ ok: boolean; timestamp: string }> => {
    return postJson<{ ok: boolean; timestamp: string }>(
      projectEndpoint(projectName, '/checkpoints/create'),
      {},
      'Failed to create checkpoint'
    );
  },

  load: async (timestamp: string): Promise<{ ok: boolean }> => {
    return postJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/checkpoints/load'),
      { timestamp },
      'Failed to load checkpoint'
    );
  },

  delete: async (timestamp: string): Promise<{ ok: boolean }> => {
    return postJson<{ ok: boolean }>(
      projectEndpoint(projectName, '/checkpoints/delete'),
      { timestamp },
      'Failed to delete checkpoint'
    );
  },
});

export const checkpointsApi = createCheckpointsApi('');
