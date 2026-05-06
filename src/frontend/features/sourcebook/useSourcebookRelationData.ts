// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Isolate sourcebook relation dialog data loading from rendering.
 */

import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { SourcebookEntry } from '../../types';
import { normalizeProjectType } from '../story/storyMappers';

interface UseSourcebookRelationDataParams {
  isOpen: boolean;
  currentEntryId?: string;
}

export const useSourcebookRelationData = ({
  isOpen,
  currentEntryId,
}: UseSourcebookRelationDataParams): {
  entries: SourcebookEntry[];
  projectType: 'short-story' | 'novel' | 'series';
} => {
  const [entries, setEntries] = useState<SourcebookEntry[]>([]);
  const [projectType, setProjectType] = useState<'short-story' | 'novel' | 'series'>(
    'novel'
  );

  useEffect((): void => {
    if (!isOpen) return;

    api.sourcebook
      .list()
      .then((data: SourcebookEntry[]): void => {
        setEntries(
          data.filter((e: SourcebookEntry): boolean => e.id !== currentEntryId)
        );
      })
      .catch(console.error);

    api.projects
      .list()
      .then((res: import('../../services/apiTypes').ProjectsListResponse): void => {
        const currentName = res.current;
        const allProjects = res.available ?? [];
        const currentProj = allProjects.find(
          (p: import('../../services/apiTypes').ProjectListItem): boolean =>
            p.name === currentName
        );
        if (currentProj && currentProj.type) {
          setProjectType(normalizeProjectType(currentProj.type));
        }
      })
      .catch(console.error);
  }, [isOpen, currentEntryId]);

  return {
    entries,
    projectType,
  };
};
