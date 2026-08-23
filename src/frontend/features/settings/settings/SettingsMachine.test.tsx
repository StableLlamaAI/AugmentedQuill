// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Accessibility tests for the Machine Settings tab (provider list +
 * provider configuration form), the screen where users connect LLM providers.
 */

// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import i18n from '../../app/i18n';
import { ThemeProvider } from '../../layout/ThemeContext';
import { SettingsMachine } from './SettingsMachine';
import type { AppSettings, AppTheme } from '../../../types';

const settings: AppSettings = {
  providers: [
    {
      id: 'default',
      name: 'Local Llama',
      baseUrl: 'http://localhost:8080/v1',
      apiKey: '',
      apiKeyEnabled: false,
      timeout: 30,
      modelId: 'llama3.2',
      temperature: 0.7,
      topP: 0.95,
      maxTokens: 16384,
      presencePenalty: 0,
      frequencyPenalty: 0,
      stop: [],
      seed: undefined,
      topK: undefined,
      minP: undefined,
      extraBody: '',
      presetId: undefined,
      writingWarning: undefined,
      isMultimodal: false,
      supportsFunctionCalling: false,
      suggestLoopGuardEnabled: true,
      suggestLoopGuardNgram: 3,
      suggestLoopGuardMinRepeats: 3,
      suggestLoopGuardMaxRegens: 1,
      prompts: {},
    },
  ],
  activeWritingProviderId: 'default',
  activeEditingProviderId: 'default',
  activeChatProviderId: 'default',
  editor: { theme: 'light', fontSize: 16, lineHeight: 1.4, maxWidth: 80 },
  sidebarOpen: true,
  activeTab: 'editor',
};

const renderMachine = (): ReturnType<typeof render> =>
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider currentTheme="light">
        <SettingsMachine
          localSettings={settings}
          setLocalSettings={vi.fn()}
          editingProviderId="default"
          setEditingProviderId={vi.fn()}
          connectionStatus={{ default: 'success' }}
          modelStatus={{ default: 'success' }}
          detectedCapabilities={{
            default: { is_multimodal: false, supports_function_calling: true },
          }}
          modelLists={{ default: ['llama3.2', 'qwen3'] }}
          modelPresets={[]}
          theme={'light' as AppTheme}
          defaultPrompts={{ system_messages: {}, user_prompts: {} }}
          onAddProvider={vi.fn()}
          onDuplicateProvider={vi.fn()}
          onUpdateProvider={vi.fn()}
          onRemoveProvider={vi.fn()}
        />
      </ThemeProvider>
    </I18nextProvider>
  );

afterEach(() => {
  cleanup();
});

describe('SettingsMachine accessibility', () => {
  it('has no axe accessibility violations with a provider selected', async () => {
    const { container } = renderMachine();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
