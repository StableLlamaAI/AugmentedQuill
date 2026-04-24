// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the debug unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { DebugLogsResponse } from '../apiTypes';
import { fetchJson, deleteJson } from './shared';

export const debugApi = {
  getLogs: async () => {
    return fetchJson<DebugLogsResponse>(
      '/debug/llm_logs?_t=' + Date.now(),
      undefined,
      'Failed to fetch debug logs'
    );
  },

  clearLogs: async () => {
    return deleteJson<{ status: string }>(
      '/debug/llm_logs?_t=' + Date.now(),
      'Failed to clear debug logs'
    );
  },
};
