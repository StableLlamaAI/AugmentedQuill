// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the machine unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { MachineConfigResponse, MachinePresetsResponse } from '../apiTypes';
import { fetchJson, putJson, postJson } from './shared';

export const machineApi = {
  get: async () => {
    return fetchJson<MachineConfigResponse>(
      '/machine',
      undefined,
      'Failed to load machine config'
    );
  },
  save: async (machine: MachineConfigResponse) => {
    return putJson<{ ok: boolean; detail?: string }>(
      '/machine',
      machine,
      'Failed to save machine config'
    );
  },
  test: async (payload: { base_url: string; api_key?: string; timeout_s?: number }) => {
    return postJson<{ ok: boolean; models: string[]; detail?: string }>(
      '/machine/test',
      payload,
      'Failed to test connection'
    );
  },
  testModel: async (payload: {
    base_url: string;
    api_key?: string;
    timeout_s?: number;
    model_id: string;
  }) => {
    return postJson<{
      ok: boolean;
      model_ok: boolean;
      models: string[];
      detail?: string;
      capabilities?: {
        is_multimodal: boolean;
        supports_function_calling: boolean;
      };
    }>('/machine/test_model', payload, 'Failed to test model');
  },
  getPresets: async () => {
    return fetchJson<MachinePresetsResponse>(
      '/machine/presets',
      undefined,
      'Failed to load model presets'
    );
  },
};
