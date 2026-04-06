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

const fallbackConfirm: ConfirmFn = async (input) => {
  const normalized = typeof input === 'string' ? { message: input } : input;
  return Promise.resolve(window.confirm(normalized.message));
};

const ConfirmDialogContext = createContext<ConfirmFn>(fallbackConfirm);

export const ConfirmDialogProvider = ConfirmDialogContext.Provider;

export const useConfirm = (): ConfirmFn => useContext(ConfirmDialogContext);
