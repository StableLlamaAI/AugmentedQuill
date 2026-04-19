// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Centralised confirm dialog context so the entire app can share the
 * same non-blocking modal confirmation dialog.
 */

import React, { createContext, useContext } from 'react';
import { ConfirmOptions } from './useConfirmDialog';

export type ConfirmFn = (input: string | ConfirmOptions) => Promise<boolean>;

const fallbackConfirm: ConfirmFn = async (input: string | ConfirmOptions) => {
  const normalized = typeof input === 'string' ? { message: input } : input;
  // This only runs when a component is rendered outside <ConfirmDialogProvider>.
  // Signal the issue clearly so it is not silently swallowed.
  console.error(
    '[ConfirmDialog] useConfirm() was called outside a <ConfirmDialogProvider>. ' +
      'Falling back to window.confirm. Wrap the component tree in ConfirmDialogProvider.'
  );
  return Promise.resolve(window.confirm(normalized.message));
};

const ConfirmDialogContext = createContext<ConfirmFn>(fallbackConfirm);

export const ConfirmDialogProvider = ConfirmDialogContext.Provider;

export const useConfirm = (): ConfirmFn => useContext(ConfirmDialogContext);
