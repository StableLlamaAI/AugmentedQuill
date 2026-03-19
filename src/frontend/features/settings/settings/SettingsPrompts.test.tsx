// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines SettingsPrompts unit tests to ensure prompt overrides behave correctly.
 */

// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';

import { SettingsPrompts } from './SettingsPrompts';
import { DEFAULT_LLM_CONFIG } from '../../../types';

describe('SettingsPrompts', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not render empty prompt overrides from the default provider defaults', () => {
    const onUpdateProvider = vi.fn();

    const provider = {
      ...DEFAULT_LLM_CONFIG,
      prompts: {
        system: '',
        continuation: '',
        summary: '',
        custom_prompt: 'custom value',
      },
    };

    render(
      <SettingsPrompts
        activeProvider={provider}
        defaultPrompts={{
          system_messages: {
            system: 'System (Default)',
            continuation: 'Continuation (Default)',
            summary: 'Summary (Default)',
            custom_prompt: 'Custom Prompt',
          },
          user_prompts: {},
        }}
        onUpdateProvider={onUpdateProvider}
        theme="light"
      />
    );

    // Only the non-empty override should be rendered (empty strings are ignored)
    expect(screen.queryByText(/system \(default\)/i)).toBeNull();
    expect(screen.queryByText(/continuation \(default\)/i)).toBeNull();
    expect(screen.queryByText(/summary \(default\)/i)).toBeNull();

    // The custom override should be visible (one textarea only)
    expect(screen.getByText(/custom_prompt/i)).toBeTruthy();
    expect(screen.getByDisplayValue('custom value')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('allows adding a prompt from the selector and renders it as an override', () => {
    const onUpdateProvider = vi.fn();

    const provider = {
      ...DEFAULT_LLM_CONFIG,
      prompts: {},
    };

    render(
      <SettingsPrompts
        activeProvider={provider}
        defaultPrompts={{
          system_messages: {
            custom_prompt: 'Custom Prompt',
            another_prompt: 'Another Prompt',
          },
          user_prompts: {},
        }}
        onUpdateProvider={onUpdateProvider}
        theme="light"
      />
    );

    const labels = screen.getAllByText(/add prompt override/i);
    const label = labels[0];
    const selector = label.parentElement?.querySelector('select');
    const addButton = screen.getByRole('button', { name: /add/i });

    // Pick a prompt to override and add it
    expect(selector).toBeTruthy();
    fireEvent.change(selector as HTMLSelectElement, {
      target: { value: 'custom_prompt' },
    });
    fireEvent.click(addButton);

    expect(onUpdateProvider).toHaveBeenCalledTimes(1);
    expect(onUpdateProvider).toHaveBeenCalledWith(provider.id, {
      prompts: {
        custom_prompt: 'Custom Prompt',
      },
    });
  });
});
