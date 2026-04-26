// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the error notifier unit so this responsibility stays isolated, testable, and easy to evolve.
 */

export function formatError(
  error: unknown,
  fallback: string = 'Unknown error'
): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/**
 * Module-level toast dispatcher.
 * Wired up by calling `setErrorDispatcher` once the toast provider is mounted.
 */
let _dispatch: ((message: string) => void) | null = null;

/** Set error dispatcher. */
export function setErrorDispatcher(fn: (message: string) => void): void {
  _dispatch = fn;
}

/** Helper for error. */
export function notifyError(message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(message, error);
  } else {
    console.error(message);
  }

  if (_dispatch) {
    _dispatch(message);
    return;
  }

  if (typeof globalThis.alert === 'function') {
    globalThis.alert(message);
  }
}
