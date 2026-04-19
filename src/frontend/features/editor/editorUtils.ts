// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Pure utility functions for the editor feature.
 *
 * Extracted from Editor.tsx so these small helpers can be tested and reused
 * without importing the full component tree.
 */

/**
 * Returns true when the given URL is safe to embed in Markdown image syntax.
 * Blocks javascript:, data:, and vbscript: protocols. Allows https?://, and
 * relative paths starting with /, ./, or ../.
 */
export const isSafeImageUrl = (src: string): boolean => {
  const value = src?.trim();
  if (!value) return false;

  if (/^(?:javascript|data|vbscript):/i.test(value)) return false;

  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value);
    } catch {
      return false;
    }
    return true;
  }

  return (
    (value.startsWith('/') && !value.startsWith('//')) ||
    value.startsWith('./') ||
    value.startsWith('../')
  );
};
