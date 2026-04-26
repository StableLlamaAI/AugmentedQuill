// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralize sourcebook feature API calls outside TSX components.
 */

import { api } from '../../services/api';
import { ProjectImage, SourcebookUpsertPayload } from '../../services/apiTypes';
import { SourcebookEntry } from '../../types';

export const listSourcebookEntries = async (
  query?: string,
  mode: 'extensive' | 'direct' = 'extensive'
): Promise<SourcebookEntry[]> => api.sourcebook.list(query, mode, false);

export const createSourcebookEntry = async (
  payload: SourcebookUpsertPayload
): Promise<SourcebookEntry> => api.sourcebook.create(payload);

export const updateSourcebookEntry = async (
  id: string,
  payload: SourcebookUpsertPayload
): Promise<SourcebookEntry> => api.sourcebook.update(id, payload);

export const deleteSourcebookEntry = async (id: string): Promise<void> => {
  await api.sourcebook.delete(id);
};

export const listProjectImages = async (): Promise<ProjectImage[]> => {
  const data = await api.projects.listImages();
  return data.images || [];
};
