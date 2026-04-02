// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the checkpoints menu unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Save, ChevronDown, Download, Trash2, Plus } from 'lucide-react';
import { useTheme } from '../layout/ThemeContext';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { useConfirmDialog } from '../layout/useConfirmDialog';
import { CheckpointInfo } from '../../services/apiClients/checkpoints';

interface CheckpointsMenuProps {
  onStateChange?: () => void;
  hasUnsavedChanges?: boolean;
  confirm: (input: string | any) => Promise<boolean>;
}

export const CheckpointsMenu: React.FC<CheckpointsMenuProps> = ({
  onStateChange,
  hasUnsavedChanges = false,
  confirm,
}) => {
  const { isLight, currentTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isStateAlreadyBackedUpInSession, setIsStateAlreadyBackedUpInSession] =
    useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const fetchCheckpoints = async () => {
    try {
      const res = await api.checkpoints.list();
      setCheckpoints(res.checkpoints || []);
    } catch (err) {
      console.error('Failed to list checkpoints', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCheckpoints();
    }
  }, [isOpen]);

  useEffect(() => {
    // If external state indicates no changes, reset our session backup flag.
    // This handles cases where user undoes everything manually.
    if (!hasUnsavedChanges) {
      setIsStateAlreadyBackedUpInSession(false);
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await api.checkpoints.create();
      setIsStateAlreadyBackedUpInSession(true);
      await fetchCheckpoints();
      if (onStateChange) onStateChange();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLoad = async (timestamp: string) => {
    const reallyHasUnsavedWork = hasUnsavedChanges && !isStateAlreadyBackedUpInSession;
    if (reallyHasUnsavedWork) {
      const sure = await confirm({
        title: 'Load Checkpoint',
        message:
          "The current state isn't saved as a checkpoint. Are you sure you want to load? Unsaved information could be lost.",
        confirmLabel: 'Load',
        variant: 'danger',
      });
      if (!sure) return;
    }

    try {
      await api.checkpoints.load(timestamp);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to load checkpoint');
    }
  };

  const handleDelete = async (e: React.MouseEvent, timestamp: string) => {
    e.stopPropagation();
    const sure = await confirm({
      title: 'Delete Checkpoint',
      message: 'Are you sure you want to delete this checkpoint?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!sure) return;

    try {
      await api.checkpoints.delete(timestamp);
      await fetchCheckpoints();
    } catch (err) {
      console.error(err);
    }
  };

  const menuContainerClass = isLight
    ? 'absolute left-0 top-full z-[90] mt-1 w-64 rounded-md border border-brand-gray-200 bg-white shadow-lg'
    : 'absolute left-0 top-full z-[90] mt-1 w-64 rounded-md border border-brand-gray-700 bg-brand-gray-900 shadow-lg';
  const menuButtonClass = isLight
    ? 'w-full px-3 py-2 text-left text-xs text-brand-gray-700 hover:bg-brand-gray-100 flex items-center justify-between'
    : 'w-full px-3 py-2 text-left text-xs text-brand-gray-300 hover:bg-brand-gray-800 flex items-center justify-between';

  return (
    <div className="relative flex ml-1" ref={menuRef}>
      <Button
        theme={currentTheme}
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((open) => !open)}
        title="Checkpoints"
        className="px-2 border-l"
      >
        <Save size={14} className="mr-1" />
        <ChevronDown size={12} />
      </Button>

      {isOpen && (
        <div className={menuContainerClass}>
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-70 border-b border-brand-gray-200 dark:border-brand-gray-700">
            Checkpoints
          </div>

          <button
            type="button"
            className={`${menuButtonClass} border-b border-brand-gray-200 dark:border-brand-gray-700 font-medium`}
            onClick={handleCreate}
            disabled={isCreating}
          >
            <span>{isCreating ? 'Saving...' : 'Store Current State'}</span>
            <Plus size={14} />
          </button>

          <div className="max-h-60 overflow-y-auto" role="list">
            {checkpoints.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center opacity-50">
                No checkpoints yet
              </div>
            ) : (
              checkpoints.map((cp) => (
                <div key={cp.timestamp} className={menuButtonClass} role="listitem">
                  <button
                    type="button"
                    className="flex flex-col truncate w-full pr-2 text-left"
                    onClick={() => handleLoad(cp.timestamp)}
                    title={`Load checkpoint ${cp.timestamp}`}
                  >
                    <span className="truncate">{cp.timestamp}</span>
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:text-red-500 rounded-full flex-shrink-0"
                    onClick={(e) => handleDelete(e, cp.timestamp)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
