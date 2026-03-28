// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests app selector helpers used by top-level app orchestration.
 */

import { describe, expect, it } from 'vitest';
import { AppSettings } from '../../types';
import {
  getErrorMessage,
  resolveActiveProviderConfigs,
  resolveRoleAvailability,
  supportsImageActions,
} from './appSelectors';

const appSettings: AppSettings = {
  providers: [
    {
      id: 'a',
      name: 'A',
      baseUrl: 'http://a',
      apiKey: 'a',
      timeout: 1,
      modelId: 'a-model',
      prompts: { system: '', continuation: '', summary: '' },
    },
    {
      id: 'b',
      name: 'B',
      baseUrl: 'http://b',
      apiKey: 'b',
      timeout: 1,
      modelId: 'b-model',
      prompts: { system: '', continuation: '', summary: '' },
    },
  ],
  activeWritingProviderId: 'b',
  activeChatProviderId: 'a',
  activeEditingProviderId: 'missing',
  editor: {
    fontSize: 16,
    maxWidth: 60,
    brightness: 1,
    contrast: 1,
    theme: 'mixed',
    sidebarWidth: 320,
  },
  sidebarOpen: false,
  activeTab: 'chat',
};

describe('appSelectors', () => {
  it('selects requested providers and falls back for missing ids', () => {
    const resolved = resolveActiveProviderConfigs(appSettings);
    expect(resolved.activeChatConfig.id).toBe('a');
    expect(resolved.activeWritingConfig.id).toBe('b');
    expect(resolved.activeEditingConfig.id).toBe('a');
  });

  it('extracts error message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('uses fallback for non-error values', () => {
    expect(getErrorMessage({ bad: true }, 'fallback')).toBe('fallback');
  });

  it('computes role availability from model connection status', () => {
    const availability = resolveRoleAvailability(appSettings, {
      a: 'success',
      b: 'error',
    });
    expect(availability.chat).toBe(true);
    expect(availability.writing).toBe(false);
    expect(availability.editing).toBe(false);
  });

  it('requires multimodal support for image actions', () => {
    const settingsWithVision: AppSettings = {
      ...appSettings,
      activeChatProviderId: 'a',
      providers: [
        {
          ...appSettings.providers[0],
          isMultimodal: true,
        },
        appSettings.providers[1],
      ],
    };

    expect(
      supportsImageActions(
        settingsWithVision,
        {
          a: { is_multimodal: true, supports_function_calling: true },
        },
        { a: 'success' }
      )
    ).toBe(true);

    expect(
      supportsImageActions(
        {
          ...settingsWithVision,
          providers: [
            {
              ...settingsWithVision.providers[0],
              isMultimodal: false,
            },
            settingsWithVision.providers[1],
          ],
        },
        {
          a: { is_multimodal: false, supports_function_calling: true },
        },
        { a: 'success' }
      )
    ).toBe(false);
  });
});
