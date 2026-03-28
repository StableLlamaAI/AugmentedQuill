// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines machine API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { machineApi } from './machine';
import { fetchJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('machineApi', () => {
  it('calls GET /machine for machine config', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ openai: {} });

    await machineApi.get();

    expect(fetchJson).toHaveBeenCalledWith(
      '/machine',
      undefined,
      'Failed to load machine config'
    );
  });

  it('calls PUT /machine with serialized payload', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true });

    const payload = {
      openai: {
        models: [
          {
            name: 'demo',
            base_url: 'https://example.invalid/v1',
            model: 'gpt-demo',
            timeout_s: 10,
          },
        ],
        selected: 'demo',
      },
    };

    await machineApi.save(payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/machine',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to save machine config'
    );
  });

  it('calls POST /machine/test with connectivity payload', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ ok: true, models: ['gpt-demo'] });

    const payload = {
      base_url: 'https://example.invalid/v1',
      api_key: 'x',
      timeout_s: 10,
    };

    await machineApi.test(payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/machine/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to test connection'
    );
  });

  it('calls POST /machine/test_model with model payload', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      ok: true,
      model_ok: true,
      models: ['gpt-demo'],
    });

    const payload = {
      base_url: 'https://example.invalid/v1',
      api_key: 'x',
      timeout_s: 10,
      model_id: 'gpt-demo',
    };

    await machineApi.testModel(payload);

    expect(fetchJson).toHaveBeenCalledWith(
      '/machine/test_model',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Failed to test model'
    );
  });

  it('calls GET /machine/presets for preset database', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ presets: [] });

    await machineApi.getPresets();

    expect(fetchJson).toHaveBeenCalledWith(
      '/machine/presets',
      undefined,
      'Failed to load model presets'
    );
  });
});
