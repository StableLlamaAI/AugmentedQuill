// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate sourcebook dialog open/close lifecycle driven by external triggers.
 */

import React, { useEffect } from 'react';
import { SourcebookEntry } from '../../../types';
import { entryDiffSignature } from '../sourcebookUtils';
import { listSourcebookEntries } from '../sourcebookApi';
import { useSourcebookDialog, useUIStore } from '../../../stores/uiStore';

export interface UseSourcebookDialogLifecycleArgs {
  entries: SourcebookEntry[];
  setEntries: React.Dispatch<React.SetStateAction<SourcebookEntry[]>>;
  setSelectedEntry: React.Dispatch<React.SetStateAction<SourcebookEntry | null>>;
  setDialogOpenedViaTrigger: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  externalEntries?: SourcebookEntry[];
  isDialogOpen: boolean;
  selectedEntry: SourcebookEntry | null;
  setDialogKey: React.Dispatch<React.SetStateAction<number>>;
}

/** Custom React hook that manages sourcebook dialog lifecycle. */
export function useSourcebookDialogLifecycle({
  entries,
  setEntries,
  setSelectedEntry,
  setDialogOpenedViaTrigger,
  setIsDialogOpen,
  externalEntries,
  isDialogOpen,
  selectedEntry,
  setDialogKey,
}: UseSourcebookDialogLifecycleArgs): void {
  const sourcebookDialog = useSourcebookDialog();

  useEffect(() => {
    if (!sourcebookDialog.isOpen || !sourcebookDialog.entryId) {
      return;
    }

    let cancelled = false;
    const entryId = sourcebookDialog.entryId;
    const findEntry = (entriesToSearch: SourcebookEntry[]) =>
      entriesToSearch.find((entry: SourcebookEntry) => entry.id === entryId);

    const openTriggeredEntry = async () => {
      const existing = findEntry(entries);
      if (existing) {
        setSelectedEntry(existing);
        setDialogOpenedViaTrigger(true);
        setIsDialogOpen(true);
        return;
      }

      try {
        const all = await listSourcebookEntries();
        if (cancelled) {
          return;
        }
        setEntries(all);
        const target = findEntry(all);
        if (target) {
          setSelectedEntry(target);
          setDialogOpenedViaTrigger(true);
          setIsDialogOpen(true);
        }
      } catch (error) {
        console.error('Failed to load sourcebook entry for trigger', error);
      }
    };

    openTriggeredEntry();
    return () => {
      cancelled = true;
    };
  }, [
    entries,
    setDialogOpenedViaTrigger,
    setEntries,
    setIsDialogOpen,
    setSelectedEntry,
    sourcebookDialog.isOpen,
    sourcebookDialog.entryId,
    sourcebookDialog.version,
  ]);

  useEffect(() => {
    if (!sourcebookDialog.isOpen) {
      setIsDialogOpen(false);
    }
  }, [sourcebookDialog.isOpen, setIsDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen || !selectedEntry || !Array.isArray(externalEntries)) {
      return;
    }

    const updated = externalEntries.find(
      (entry: SourcebookEntry) => entry.id === selectedEntry.id
    );
    if (!updated) {
      setIsDialogOpen(false);
      setSelectedEntry(null);
      setDialogOpenedViaTrigger(false);
      return;
    }
    if (entryDiffSignature(updated) !== entryDiffSignature(selectedEntry)) {
      setSelectedEntry(updated);
      setDialogKey((value: number) => value + 1);
    }
  }, [
    externalEntries,
    isDialogOpen,
    selectedEntry,
    setDialogKey,
    setDialogOpenedViaTrigger,
    setIsDialogOpen,
    setSelectedEntry,
  ]);
}
