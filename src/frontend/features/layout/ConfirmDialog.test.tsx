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
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

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

    const labelledby = dialog.getAttribute('aria-labelledby');
    const describedby = dialog.getAttribute('aria-describedby');
    expect(labelledby).toBeTruthy();
    expect(describedby).toBeTruthy();
    expect(labelledby).toMatch(/-confirm-dialog-title$/);
    expect(describedby).toMatch(/-confirm-dialog-description$/);

    if (labelledby) {
      expect(document.getElementById(labelledby)).toBeTruthy();
    }
    if (describedby) {
      expect(document.getElementById(describedby)).toBeTruthy();
    }

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

  it('sets focus inside dialog when opened and traps tab', () => {
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

    const dialogs = screen.getAllByRole('dialog');
    const dialog = dialogs[dialogs.length - 1];
    expect(dialog).toBeTruthy();
    const cancelButton = within(dialog).getByText('Cancel');
    const confirmButton = within(dialog).getByText('OK');

    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('calls onCancel when Escape is pressed', () => {
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

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
