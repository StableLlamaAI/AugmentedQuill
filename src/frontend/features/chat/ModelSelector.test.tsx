// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for ModelSelector so option reconciliation and selection stay reliable.
 */

// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelSelector } from './ModelSelector';
import { LLMConfig } from '../../types';

const makeOption = (id: string, name: string): LLMConfig => ({
  id,
  name,
  baseUrl: 'http://example.invalid',
  apiKey: 'key',
  timeout: 1000,
  modelId: id,
  prompts: { system: '', continuation: '', summary: '' },
});

describe('ModelSelector', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reconciles value-by-name to option id when ids differ', () => {
    const onChange = vi.fn();
    const options = [makeOption('model-1', 'Model One')];

    render(
      <ModelSelector
        value="Model One"
        onChange={onChange}
        options={options}
        label="Chat"
        theme="light"
      />
    );

    expect(onChange).toHaveBeenCalledWith('model-1');
  });

  it('opens dropdown and selects an option', () => {
    const onChange = vi.fn();
    const options = [
      makeOption('model-1', 'Model One'),
      makeOption('model-2', 'Model Two'),
    ];

    render(
      <ModelSelector
        value="model-1"
        onChange={onChange}
        options={options}
        label="Chat"
        theme="dark"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /model one/i }));
    fireEvent.click(screen.getByRole('button', { name: /model two/i }));

    expect(onChange).toHaveBeenCalledWith('model-2');
  });
});
