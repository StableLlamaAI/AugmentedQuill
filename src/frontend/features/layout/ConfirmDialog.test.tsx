// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Accessibility tests for ConfirmDialog.
 */

// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog accessibility', () => {
  it('renders with appropriate aria attributes and labels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm deletion"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('confirm-dialog-description');

    expect(screen.getByText('Confirm deletion')).toBeTruthy();
    expect(screen.getByText('Are you sure?')).toBeTruthy();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const confirmButton = screen.getByText('OK');
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalled();
  });
});
