// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use confirm dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useState, useCallback, useRef } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Hook that provides a non-blocking, Promise-based confirm() callback backed
 * by a React dialog instead of the synchronous window.confirm().
 */
export const useConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback((input: string | ConfirmOptions): Promise<boolean> => {
    const normalizedOptions: ConfirmOptions =
      typeof input === 'string' ? { message: input } : input;

    return new Promise((resolve) => {
      pendingRef.current = { options: normalizedOptions, resolve };
      setOptions(normalizedOptions);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    pendingRef.current?.resolve(true);
    pendingRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
  }, []);

  return {
    confirm,
    confirmDialogState: {
      isOpen,
      message: options.message,
      title: options.title,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      variant: options.variant,
    },
    handleConfirm,
    handleCancel,
  };
};
