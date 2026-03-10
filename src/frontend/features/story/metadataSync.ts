// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Logic for determining which metadata fields should be pulled from an
 * updated `initialData` object when the user is editing the same metadata
 * through the `MetadataEditorDialog`.  The dialog maintains its own local
 * copy of the data, and this helper helps avoid overwriting in-progress
 * user edits when the parent component pushes a new `initialData` (e.g. as a
 * result of an autosave round-trip or AI generation).  Only fields that both
 * changed externally *and* have not been modified locally since the last
 * initial value are returned.
 */

export interface MetadataParams {
  title?: string;
  summary?: string;
  tags?: string[];
  notes?: string;
  private_notes?: string;
  language?: string;
  conflicts?: Array<{ description?: string; resolution?: string }>;
}

/**
 * Given the previous initial data (from the last render), the new incoming
 * initial data, and the current local editor state, return a partial object
 * containing only the fields that should be updated.
 */
export function computeSyncUpdates(
  prevInitial: MetadataParams,
  newInitial: MetadataParams,
  local: MetadataParams
): Partial<MetadataParams> {
  const updates: Partial<MetadataParams> = {};

  const fieldDirty = (field: keyof MetadataParams): boolean => {
    const prevVal = (prevInitial[field] || '') as string;
    const curVal = (local[field] || '') as string;
    return prevVal !== curVal;
  };

  if (newInitial.title !== prevInitial.title && !fieldDirty('title')) {
    updates.title = newInitial.title || '';
  }
  if (newInitial.summary !== prevInitial.summary && !fieldDirty('summary')) {
    updates.summary = newInitial.summary || '';
  }
  if (newInitial.notes !== prevInitial.notes && !fieldDirty('notes')) {
    updates.notes = newInitial.notes || '';
  }
  if (
    newInitial.private_notes !== prevInitial.private_notes &&
    !fieldDirty('private_notes')
  ) {
    updates.private_notes = newInitial.private_notes || '';
  }

  return updates;
}
