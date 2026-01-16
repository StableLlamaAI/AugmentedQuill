// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Maximize2,
  Minimize2,
  FileText,
  StickyNote,
  Lock,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import { Conflict, AppTheme } from '../types';

interface MetadataParams {
  title?: string;
  summary?: string;
  notes?: string;
  private_notes?: string;
  conflicts?: Conflict[];
}

interface Props {
  type: 'story' | 'book' | 'chapter';
  initialData: MetadataParams;
  onSave: (data: MetadataParams) => Promise<void>;
  onClose: () => void;
  title: string; // Dialog title
  theme?: AppTheme;
}

export function MetadataEditorDialog({
  type,
  initialData,
  onSave,
  onClose,
  title,
  theme = 'mixed',
}: Props) {
  const [data, setData] = useState<MetadataParams>(initialData);
  const [activeTab, setActiveTab] = useState<
    'summary' | 'notes' | 'private' | 'conflicts'
  >('summary');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Refs for autosave
  const onSaveRef = useRef(onSave);
  const isFirstRun = useRef(true);

  // For Conflicts
  const [conflicts, setConflicts] = useState<Conflict[]>(initialData.conflicts || []);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    setData((prev) => ({ ...prev, conflicts }));
  }, [conflicts]);

  // Autosave Logic
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await onSaveRef.current(data);
        setSaveStatus('saved');
      } catch (e) {
        console.error(e);
        setSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [data]);

  const handleClose = async () => {
    // Ensure we save on close if there are pending changes or just to be safe
    // (We assume data is current state)
    if (saveStatus !== 'saved') {
      try {
        await onSave(data);
      } catch (e) {
        console.error('Failed to save on close', e);
      }
    }
    onClose();
  };

  const addConflict = () => {
    setConflicts([
      ...conflicts,
      {
        id: crypto.randomUUID(),
        description: '',
        resolution: '',
      },
    ]);
  };

  const deleteConflict = (id: string) => {
    setConflicts(conflicts.filter((c) => c.id !== id));
  };

  const updateConflict = (id: string, field: keyof Conflict, value: string) => {
    setConflicts(conflicts.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const moveConflict = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newConfigs = [...conflicts];
      [newConfigs[index], newConfigs[index - 1]] = [
        newConfigs[index - 1],
        newConfigs[index],
      ];
      setConflicts(newConfigs);
    } else if (direction === 'down' && index < conflicts.length - 1) {
      const newConfigs = [...conflicts];
      [newConfigs[index], newConfigs[index + 1]] = [
        newConfigs[index + 1],
        newConfigs[index],
      ];
      setConflicts(newConfigs);
    }
  };

  const isDarkMode = theme === 'dark' || theme === 'mixed';

  const modalContent = (
    <div className={isDarkMode ? 'dark' : ''}>
      <div
        className={`${
          isFullscreen
            ? 'fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/50'
            : 'fixed top-14 bottom-0 z-[60] bg-white dark:bg-brand-gray-900 border-r dark:border-brand-gray-800 flex flex-col'
        }`}
        style={!isFullscreen ? { width: 'var(--sidebar-width)', left: 0 } : {}}
      >
        <div
          className={`flex flex-col pointer-events-auto ${
            isFullscreen
              ? 'w-[98vw] h-[95vh] bg-white dark:bg-brand-gray-900 text-brand-gray-800 dark:text-brand-gray-400 rounded-lg shadow-xl border dark:border-brand-gray-800'
              : 'w-full h-full text-brand-gray-800 dark:text-brand-gray-400'
          }`}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b dark:border-brand-gray-800">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold dark:text-brand-gray-300">
                {title}
              </h2>
              <div className="text-xs font-mono">
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-brand-500">
                    <Loader2 size={12} className="animate-spin" /> Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Check size={12} /> Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-red-500">Error saving</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-gray-500 hover:text-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
                title={
                  isFullscreen ? 'Switch to Sidebar View' : 'Switch to Full Screen'
                }
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Title Editor */}
            <div className="p-4 border-b dark:border-brand-gray-800 space-y-2 flex-shrink-0">
              <label className="block text-sm font-medium dark:text-brand-gray-400">
                Title
              </label>
              <input
                value={data.title || ''}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                className="w-full p-2 border rounded dark:bg-brand-gray-950 dark:border-brand-gray-800 text-brand-gray-900 dark:text-brand-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-sans text-sm"
              />
            </div>

            {/* Tabs */}
            <div className="flex border-b dark:border-brand-gray-800 overflow-x-auto flex-shrink-0">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'summary'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <FileText size={16} />
                Summary
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'notes'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <StickyNote size={16} />
                Notes
              </button>
              <button
                onClick={() => setActiveTab('private')}
                className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                  activeTab === 'private'
                    ? 'border-b-2 border-primary text-primary font-semibold'
                    : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                }`}
              >
                <Lock size={16} />
                Private Notes
              </button>
              {type === 'chapter' && (
                <button
                  onClick={() => setActiveTab('conflicts')}
                  className={`px-4 py-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                    activeTab === 'conflicts'
                      ? 'border-b-2 border-primary text-primary font-semibold'
                      : 'text-brand-gray-500 hover:text-brand-gray-700 dark:text-brand-gray-500 dark:hover:text-brand-gray-300'
                  }`}
                >
                  <AlertTriangle size={16} />
                  Conflicts
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 p-4 min-h-[500px]">
              {activeTab === 'summary' && (
                <textarea
                  value={data.summary || ''}
                  onChange={(e) => setData({ ...data, summary: e.target.value })}
                  className="w-full h-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 placeholder-brand-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 font-sans text-sm md:text-base leading-relaxed transition-all"
                  placeholder="Write a public summary..."
                />
              )}
              {activeTab === 'notes' && (
                <div className="h-full flex flex-col">
                  <div className="text-sm text-brand-gray-500 mb-2">Visible to LLM</div>
                  <textarea
                    value={data.notes || ''}
                    onChange={(e) => setData({ ...data, notes: e.target.value })}
                    className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 placeholder-brand-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 font-sans text-sm md:text-base leading-relaxed transition-all"
                    placeholder="Write notes (readable by LLM)..."
                  />
                </div>
              )}
              {activeTab === 'private' && (
                <div className="h-full flex flex-col">
                  <div className="text-sm text-brand-gray-500 mb-2">
                    Not visible to LLM
                  </div>
                  <textarea
                    value={data.private_notes || ''}
                    onChange={(e) =>
                      setData({ ...data, private_notes: e.target.value })
                    }
                    className="flex-1 w-full p-4 border rounded-lg dark:bg-brand-gray-800/40 dark:border-brand-gray-700 text-brand-gray-900 dark:text-brand-gray-300 placeholder-brand-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 font-sans text-sm md:text-base leading-relaxed transition-all"
                    placeholder="Write private notes (hidden from LLM)..."
                  />
                </div>
              )}
              {activeTab === 'conflicts' && (
                <div className="space-y-4">
                  <button
                    onClick={addConflict}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                  >
                    + Add Conflict
                  </button>
                  <div className="space-y-4">
                    {conflicts.map((c, idx) => (
                      <div
                        key={c.id}
                        className="border rounded-lg p-4 bg-gray-50 dark:bg-brand-gray-800/50 dark:border-brand-gray-700 shadow-sm"
                      >
                        <div className="flex justify-between mb-2">
                          <span className="font-semibold text-sm dark:text-brand-gray-300">
                            Conflict #{idx + 1}
                          </span>
                          <div className="space-x-2">
                            <button
                              onClick={() => moveConflict(idx, 'up')}
                              disabled={idx === 0}
                              className="disabled:opacity-30 dark:text-brand-gray-500"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveConflict(idx, 'down')}
                              disabled={idx === conflicts.length - 1}
                              className="disabled:opacity-30 dark:text-brand-gray-500"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => deleteConflict(c.id)}
                              className="text-red-500"
                            >
                              DELETE
                            </button>
                          </div>
                        </div>
                        <div
                          className={`grid gap-4 ${isFullscreen ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}
                        >
                          <div>
                            <label className="block text-xs font-medium mb-1 dark:text-brand-gray-400 uppercase tracking-wide">
                              Conflict Description
                            </label>
                            <textarea
                              value={c.description}
                              onChange={(e) =>
                                updateConflict(c.id, 'description', e.target.value)
                              }
                              className="w-full h-32 p-3 border rounded-lg dark:bg-brand-gray-950 dark:border-brand-gray-800 dark:text-brand-gray-300 placeholder-brand-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 text-sm font-sans transition-all resize-none"
                              placeholder="Describe the conflict..."
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1 dark:text-brand-gray-400 uppercase tracking-wide">
                              Resolution Plan
                            </label>
                            <textarea
                              value={c.resolution}
                              onChange={(e) =>
                                updateConflict(c.id, 'resolution', e.target.value)
                              }
                              className="w-full h-32 p-3 border rounded-lg dark:bg-brand-gray-950 dark:border-brand-gray-800 dark:text-brand-gray-300 placeholder-brand-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 text-sm font-sans transition-all resize-none"
                              placeholder="How will this conflict be resolved?"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer removed for autosave */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
