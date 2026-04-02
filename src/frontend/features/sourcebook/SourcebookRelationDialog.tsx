// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebook relation dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ArrowRightLeft } from 'lucide-react';
import { api } from '../../services/api';
import { AppTheme, SourcebookEntry, SourcebookRelation } from '../../types';
import { Button } from '../../components/ui/Button';
import { useThemeClasses } from '../layout/ThemeContext';

interface SourcebookRelationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (relation: SourcebookRelation) => void;
  currentEntryId?: string;
  currentEntryName?: string;
  theme?: AppTheme;
  initialRelation?: SourcebookRelation;
}

export const SourcebookRelationDialog: React.FC<SourcebookRelationDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  currentEntryId,
  currentEntryName,
  theme = 'mixed',
  initialRelation,
}) => {
  const [entries, setEntries] = useState<SourcebookEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [projectType, setProjectType] = useState<'short-story' | 'novel' | 'series'>(
    'novel'
  );

  // Form fields
  const [targetId, setTargetId] = useState('');
  const [relationStatement, setRelationStatement] = useState('');
  const [startChapter, setStartChapter] = useState('');
  const [endChapter, setEndChapter] = useState('');
  const [startBook, setStartBook] = useState('');
  const [endBook, setEndBook] = useState('');
  const [direction, setDirection] = useState<'forward' | 'reverse'>('forward');

  const {
    bg: bgClass,
    text: textClass,
    border: borderClass,
    input: inputBgClass,
  } = useThemeClasses();
  const inputBorderClass = borderClass;

  useEffect(() => {
    if (isOpen) {
      api.sourcebook
        .list()
        .then((data) => {
          setEntries(data.filter((e) => e.id !== currentEntryId));
        })
        .catch(console.error);

      // fetch project type
      api.projects
        .list()
        .then((res) => {
          const currentName = res.current;
          const allProjects = res.projects || res.available || [];
          const currentProj = allProjects.find((p) => p.name === currentName);
          if (currentProj && currentProj.type) {
            setProjectType(currentProj.type);
          }
        })
        .catch(console.error);

      if (initialRelation) {
        setTargetId(initialRelation.target_id);
        setRelationStatement(initialRelation.relation);
        setStartChapter(initialRelation.start_chapter || '');
        setEndChapter(initialRelation.end_chapter || '');
        setStartBook(initialRelation.start_book || '');
        setEndBook(initialRelation.end_book || '');
        setDirection(initialRelation.direction || 'forward');
      } else {
        setTargetId('');
        setRelationStatement('');
        setStartChapter('');
        setEndChapter('');
        setStartBook('');
        setEndBook('');
        setDirection('forward');
      }
      setFilter('');
    }
  }, [isOpen, currentEntryId, initialRelation]);

  if (!isOpen) return null;

  const filteredEntries = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      (e.description && e.description.toLowerCase().includes(filter.toLowerCase()))
  );

  const targetName = entries.find((e) => e.id === targetId)?.name || 'Target Entry';
  const mainName = currentEntryName || 'Current Entry';

  const handleSave = () => {
    if (!targetId || !relationStatement.trim()) return;
    onSave({
      target_id: targetId,
      relation: relationStatement.trim(),
      start_chapter: startChapter.trim() || undefined,
      end_chapter: endChapter.trim() || undefined,
      start_book: startBook.trim() || undefined,
      end_book: endBook.trim() || undefined,
      direction: direction,
    });
    onClose();
  };

  const showChapters = projectType === 'novel' || projectType === 'series';
  const showBooks = projectType === 'series';

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={`${bgClass} ${textClass} w-full max-w-2xl rounded-lg shadow-2xl border ${borderClass} flex flex-col max-h-[90vh]`}
      >
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${borderClass}`}
        >
          <h2 className="text-xl font-semibold">
            {initialRelation ? 'Edit Relation' : 'Add Relation'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close relation dialog"
            title="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Entry</label>
            <div className={`border ${borderClass} rounded-md p-2 space-y-3`}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-400" />
                <input
                  type="text"
                  placeholder="Filter entries..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500`}
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
                {filteredEntries.length === 0 ? (
                  <p className="text-sm text-center py-4 opacity-50">
                    No entries found.
                  </p>
                ) : (
                  filteredEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setTargetId(entry.id)}
                      className={`w-full text-left px-3 py-2 cursor-pointer rounded-md border text-sm transition-colors ${
                        targetId === entry.id
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'border-transparent hover:bg-brand-gray-100 dark:hover:bg-brand-gray-800'
                      }`}
                      aria-label={`Select target entry ${entry.name}`}
                    >
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-xs opacity-70 truncate">
                        {entry.description}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Relation & Direction */}
          <div className="space-y-3 p-4 border rounded-md bg-opacity-50 bg-brand-gray-500/5 border-brand-500/20">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Relation Logic</label>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setDirection((d) => (d === 'forward' ? 'reverse' : 'forward'))
                }
                icon={<ArrowRightLeft className="w-3 h-3" />}
              >
                Swap Direction
              </Button>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
              <div
                className={`flex-1 p-2 text-center rounded-md ${direction === 'forward' ? 'font-semibold text-brand-500 bg-brand-500/10' : 'opacity-80 bg-brand-gray-500/10'}`}
              >
                {direction === 'forward' ? mainName : targetName}
              </div>
              <input
                type="text"
                placeholder="e.g. 'owns', 'is married to'"
                value={relationStatement}
                onChange={(e) => setRelationStatement(e.target.value)}
                className={`w-full md:w-1/3 px-3 flex-shrink-0 text-center py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500`}
              />
              <div
                className={`flex-1 p-2 text-center rounded-md ${direction === 'reverse' ? 'font-semibold text-brand-500 bg-brand-500/10' : 'opacity-80 bg-brand-gray-500/10'}`}
              >
                {direction === 'reverse' ? mainName : targetName}
              </div>
            </div>
            <p className="text-xs opacity-70 text-center">
              How does the left entry relate to the right entry?
            </p>
          </div>

          {/* Time Constraints */}
          {(showChapters || showBooks) && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Constraint</label>
                {showChapters && (
                  <input
                    type="text"
                    placeholder="e.g. Chapter 3"
                    value={startChapter}
                    onChange={(e) => setStartChapter(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2`}
                  />
                )}
                {showBooks && (
                  <input
                    type="text"
                    placeholder="e.g. Book 1"
                    value={startBook}
                    onChange={(e) => setStartBook(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500`}
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">End Constraint</label>
                {showChapters && (
                  <input
                    type="text"
                    placeholder="e.g. Chapter 10"
                    value={endChapter}
                    onChange={(e) => setEndChapter(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2`}
                  />
                )}
                {showBooks && (
                  <input
                    type="text"
                    placeholder="e.g. Book 1"
                    value={endBook}
                    onChange={(e) => setEndBook(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${inputBorderClass} ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-brand-500`}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${borderClass}`}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!targetId || !relationStatement.trim()}
          >
            Save Relation
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
