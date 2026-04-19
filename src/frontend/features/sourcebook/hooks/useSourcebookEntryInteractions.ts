// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate sourcebook entry hover, click, toggle, and image-loading interactions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SourcebookEntry } from '../../../types';
import { ProjectImage } from '../../../services/apiTypes';
import { listProjectImages, listSourcebookEntries } from '../sourcebookApi';

export interface UseSourcebookEntryInteractionsArgs {
  isAutoSelectionEnabled: boolean;
  onToggle?: (id: string, checked: boolean) => void;
  createdEntryIdsRef: React.MutableRefObject<Set<string>>;
  setEntries: React.Dispatch<React.SetStateAction<SourcebookEntry[]>>;
  setSelectedEntry: React.Dispatch<React.SetStateAction<SourcebookEntry | null>>;
  setDialogOpenedViaTrigger: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Custom React hook that manages sourcebook entry interactions. */
export function useSourcebookEntryInteractions({
  isAutoSelectionEnabled,
  onToggle,
  createdEntryIdsRef,
  setEntries,
  setSelectedEntry,
  setDialogOpenedViaTrigger,
  setIsDialogOpen,
}: UseSourcebookEntryInteractionsArgs): {
  isLoadingEntry: boolean;
  hoveredEntry: SourcebookEntry | null;
  tooltipPos: { x: number; y: number };
  availableImages: ProjectImage[];
  handleEntryHover: (
    event: React.MouseEvent<HTMLButtonElement>,
    entry: SourcebookEntry
  ) => void;
  handleEntryHoverLeave: () => void;
  handleEntryClick: (entry: SourcebookEntry) => Promise<void>;
  handleToggleEntry: (id: string, checked: boolean) => void;
} {
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [hoveredEntry, setHoveredEntry] = useState<SourcebookEntry | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [availableImages, setAvailableImages] = useState<ProjectImage[]>([]);

  const handleEntryHover = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SourcebookEntry) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = rect.right + 10;
      const y = Math.min(rect.top, window.innerHeight - 200);
      setTooltipPos({ x, y });
      setHoveredEntry(entry);
    },
    []
  );

  const handleEntryHoverLeave = useCallback(() => {
    setHoveredEntry(null);
  }, []);

  const handleEntryClick = useCallback(
    async (entry: SourcebookEntry) => {
      setIsLoadingEntry(true);
      try {
        const all = await listSourcebookEntries();
        const full = all.find((x: SourcebookEntry) => x.id === entry.id) || entry;
        setEntries(all);
        setSelectedEntry(full);
        setDialogOpenedViaTrigger(createdEntryIdsRef.current.has(entry.id));
        setIsDialogOpen(true);
      } finally {
        setIsLoadingEntry(false);
      }
    },
    [
      createdEntryIdsRef,
      setDialogOpenedViaTrigger,
      setEntries,
      setIsDialogOpen,
      setSelectedEntry,
    ]
  );

  const handleToggleEntry = useCallback(
    (id: string, checked: boolean) => {
      if (isAutoSelectionEnabled) {
        return;
      }
      onToggle?.(id, checked);
    },
    [isAutoSelectionEnabled, onToggle]
  );

  useEffect(() => {
    if (hoveredEntry && hoveredEntry.images?.length > 0) {
      listProjectImages().then((images: ProjectImage[]) => {
        setAvailableImages(images);
      });
    }
  }, [hoveredEntry]);

  return {
    isLoadingEntry,
    hoveredEntry,
    tooltipPos,
    availableImages,
    handleEntryHover,
    handleEntryHoverLeave,
    handleEntryClick,
    handleToggleEntry,
  };
}
