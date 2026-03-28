// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for ToolCallLimitDialog so operator choices are wired correctly.
 */

// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToolCallLimitDialog } from './ToolCallLimitDialog';

describe('ToolCallLimitDialog', () => {
  it('does not render when closed', () => {
    render(
      <ToolCallLimitDialog
        isOpen={false}
        count={10}
        theme="light"
        onResolve={vi.fn()}
      />
    );

    expect(screen.queryByText('Tool Call Limit')).toBeNull();
  });

  it('renders count and resolves all actions', () => {
    const onResolve = vi.fn();
    render(
      <ToolCallLimitDialog
        isOpen={true}
        count={12}
        theme="dark"
        onResolve={onResolve}
      />
    );

    expect(screen.getByText('Tool Call Limit')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue (+10 calls)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without limit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop and review' }));

    expect(onResolve).toHaveBeenNthCalledWith(1, 'continue');
    expect(onResolve).toHaveBeenNthCalledWith(2, 'unlimited');
    expect(onResolve).toHaveBeenNthCalledWith(3, 'stop');
  });
});
