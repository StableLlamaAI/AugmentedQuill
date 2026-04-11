// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebook list unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  BookOpen,
  Book,
  User,
  MapPin,
  Users,
  Package,
  Calendar,
  HelpCircle,
  Image as ImageIcon,
  Check,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SourcebookEntryDialog } from './SourcebookEntryDialog';
import { api } from '../../services/api';
import { AppTheme, SourcebookEntry } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { ProjectImage, SourcebookUpsertPayload } from '../../services/apiTypes';

const CATEGORY_DETAILS: Record<string, { icon: React.ElementType }> = {
  Character: { icon: User },
  Location: { icon: MapPin },
  Organization: { icon: Users },
  Item: { icon: Package },
  Event: { icon: Calendar },
  Lore: { icon: BookOpen },
  Other: { icon: HelpCircle },
};

interface SourcebookListProps {
  theme?: AppTheme;
  externalEntries?: SourcebookEntry[];
  // ids currently checked by the relevance engine or user
  checkedIds?: string[];
  onToggle?: (id: string, checked: boolean) => void;
  isAutoSelectionEnabled?: boolean;
  isAutoSelectionRunning?: boolean;
  onToggleAutoSelection?: (enabled: boolean) => void;
  onMutated?: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  selectedSourcebookEntryId?: string | null;
  language?: string;
  baselineEntries?: SourcebookEntry[];
}

export const resolveExternalSourcebookEntries = (
  externalEntries: SourcebookEntry[] | undefined,
  currentEntries: SourcebookEntry[]
): SourcebookEntry[] => {
  if (Array.isArray(externalEntries)) {
    return externalEntries;
  }
  return currentEntries;
};

export const updateSourcebookEntryInList = (
  entries: SourcebookEntry[],
  previousId: string,
  updated: SourcebookEntry
): SourcebookEntry[] => {
  return entries.map((value) => (value.id === previousId ? updated : value));
};

export const filterSourcebookEntries = (
  entries: SourcebookEntry[],
  query: string
): SourcebookEntry[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => {
    const description = (entry.description || '').toLowerCase();
    if (entry.name.toLowerCase().includes(normalizedQuery)) {
      return true;
    }
    if (
      (entry.synonyms || []).some((syn) => syn.toLowerCase().includes(normalizedQuery))
    ) {
      return true;
    }
    if (
      (entry.keywords || []).some((kw) => kw.toLowerCase().includes(normalizedQuery))
    ) {
      return true;
    }
    if (description.includes(normalizedQuery)) {
      return true;
    }

    // Fallback for natural multi-word queries: require every token to appear
    // in at least one searchable field.
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      return false;
    }

    const fields = [
      entry.name,
      ...(entry.synonyms || []),
      ...(entry.keywords || []),
      entry.description || '',
    ].map((value) => value.toLowerCase());

    return tokens.every((token) => fields.some((field) => field.includes(token)));
  });
};

export const SourcebookList: React.FC<SourcebookListProps> = ({
  theme = 'mixed',
  externalEntries,
  checkedIds = [],
  onToggle,
  isAutoSelectionEnabled = true,
  isAutoSelectionRunning = false,
  onToggleAutoSelection,
  onMutated,
  selectedSourcebookEntryId,
  language = 'en',
  baselineEntries,
}) => {
  const [entries, setEntries] = useState<SourcebookEntry[]>(
    resolveExternalSourcebookEntries(externalEntries, [])
  );
  const [search, setSearch] = useState('');
  const externalEntriesRef = useRef<SourcebookEntry[] | undefined>(undefined);
  const [selectedEntry, setSelectedEntry] = useState<SourcebookEntry | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  // Keep hover preview state local so list rendering stays stateless.
  const [hoveredEntry, setHoveredEntry] = useState<SourcebookEntry | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { isLight } = useThemeClasses();

  const loadEntries = async (query?: string) => {
    try {
      const data = await api.sourcebook.list(query, 'extensive', false);
      setEntries(data);
    } catch (e) {
      console.error('Failed to load sourcebook', e);
    }
  };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const hasQuery = search.trim().length > 0;

    // In embedded/external mode we still rely on backend search for non-empty
    // queries so filtering uses canonical sourcebook data (including generated keywords).
    if (Array.isArray(externalEntries) && !hasQuery) {
      const externalChanged = externalEntriesRef.current !== externalEntries;
      if (externalChanged) {
        externalEntriesRef.current = externalEntries;
        setEntries(filterSourcebookEntries(externalEntries, search));
      }
    } else {
      timeoutId = setTimeout(() => {
        loadEntries(search);
      }, 300);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [externalEntries, search]);

  useEffect(() => {
    if (!selectedSourcebookEntryId) return;

    let cancelled = false;

    const openSelectedEntry = async () => {
      const findEntry = (entriesToSearch: SourcebookEntry[]) =>
        entriesToSearch.find((entry) => entry.id === selectedSourcebookEntryId);

      const existing = findEntry(entries);
      if (existing) {
        setSelectedEntry(existing);
        setIsDialogOpen(true);
        return;
      }

      try {
        const all = await api.sourcebook.list();
        if (cancelled) return;
        setEntries(all);
        const target = findEntry(all);
        if (target) {
          setSelectedEntry(target);
          setIsDialogOpen(true);
        }
      } catch (e) {
        console.error('Failed to load sourcebook entry for selection', e);
      }
    };

    openSelectedEntry();
    return () => {
      cancelled = true;
    };
  }, [selectedSourcebookEntryId, entries]);

  const syncEntries = async (
    updater?: (previous: SourcebookEntry[]) => SourcebookEntry[]
  ) => {
    if (Array.isArray(externalEntries)) {
      if (search.trim()) {
        await loadEntries(search);
        return;
      }
      if (updater) {
        setEntries((prev) => filterSourcebookEntries(updater(prev), search));
      } else {
        setEntries((prev) => {
          const resolved = resolveExternalSourcebookEntries(externalEntries, prev);
          return filterSourcebookEntries(resolved, search);
        });
      }
      return;
    }
    await loadEntries();
  };

  const handleCreate = async (entry: SourcebookUpsertPayload) => {
    const created = await api.sourcebook.create(entry);
    await syncEntries((prev) => [...prev, created]);
    let createdId = created.id;
    onMutated?.({
      label: `Create sourcebook entry: ${entry.name}`,
      onUndo: async () => {
        await api.sourcebook.delete(createdId);
        await loadEntries();
      },
      onRedo: async () => {
        const recreated = await api.sourcebook.create(entry);
        createdId = recreated.id;
        await loadEntries();
      },
    });
  };

  const handleUpdate = async (entry: SourcebookUpsertPayload) => {
    const previous = entries.find((value) => value.id === entry.id);
    const previousId = entry.id;
    const updated = await api.sourcebook.update(entry.id, entry);
    await syncEntries((prev) => updateSourcebookEntryInList(prev, previousId, updated));
    if (selectedEntry?.id === previousId) {
      setSelectedEntry(updated);
    }
    if (!previous) return;

    let activeId = updated.id;
    onMutated?.({
      label: `Update sourcebook entry: ${entry.name}`,
      onUndo: async () => {
        const reverted = await api.sourcebook.update(activeId, {
          name: previous.name,
          synonyms: previous.synonyms,
          category: previous.category,
          description: previous.description,
          images: previous.images,
        });
        activeId = reverted.id;
        await loadEntries();
      },
      onRedo: async () => {
        const redone = await api.sourcebook.update(activeId, {
          name: entry.name,
          synonyms: entry.synonyms,
          category: entry.category,
          description: entry.description,
          images: entry.images,
        });
        activeId = redone.id;
        await loadEntries();
      },
    });
  };

  const handleDelete = async (id: string) => {
    const deletedEntry = entries.find((entry) => entry.id === id);
    await api.sourcebook.delete(id);
    await syncEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (!deletedEntry) return;

    let activeId = deletedEntry.id;
    onMutated?.({
      label: `Delete sourcebook entry: ${deletedEntry.name}`,
      onUndo: async () => {
        const restored = await api.sourcebook.create({
          id: deletedEntry.id,
          name: deletedEntry.name,
          synonyms: deletedEntry.synonyms,
          category: deletedEntry.category,
          description: deletedEntry.description,
          images: deletedEntry.images,
        });
        activeId = restored.id;
        await loadEntries();
      },
      onRedo: async () => {
        await api.sourcebook.delete(activeId);
        await loadEntries();
      },
    });
  };

  const handleMouseEnter = (e: React.MouseEvent, entry: SourcebookEntry) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.right + 10;
    // Clamp tooltip origin so previews remain visible on short viewports.
    const y = Math.min(rect.top, window.innerHeight - 200);
    setTooltipPos({ x, y });
    setHoveredEntry(entry);
  };

  const borderClass = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const textHeaderClass = isLight ? 'text-brand-gray-500' : 'text-brand-gray-400';
  const textClass = isLight ? 'text-brand-gray-900' : 'text-brand-gray-200';
  const subTextClass = isLight ? 'text-brand-gray-500' : 'text-brand-gray-400';
  const itemHoverClass = isLight
    ? 'hover:bg-brand-gray-100'
    : 'hover:bg-brand-gray-800';
  const inputBg = isLight ? 'bg-white' : 'bg-brand-gray-950/50';
  const inputBorder = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const inputPlace = 'placeholder-brand-gray-500';
  const btnHover = isLight
    ? 'hover:bg-brand-gray-200 text-brand-gray-500 hover:text-brand-gray-700'
    : 'hover:bg-brand-gray-800 text-brand-gray-500 hover:text-brand-gray-300';

  // Resolve image metadata lazily to avoid extra API traffic during normal list browsing.
  const [availableImages, setAvailableImages] = useState<ProjectImage[]>([]);
  useEffect(() => {
    if (hoveredEntry && hoveredEntry.images?.length > 0) {
      api.projects.listImages().then((data) => {
        setAvailableImages(data.images || []);
      });
    }
  }, [hoveredEntry]);

  const getEntryImage = (entry: SourcebookEntry) => {
    if (!entry.images || entry.images.length === 0) return null;
    // Preview only the primary linked image to keep the hover card lightweight.
    const firstImgName = entry.images[0];
    const imgData = availableImages.find((image) => image.filename === firstImgName);
    return imgData;
  };

  return (
    <div
      id="sourcebook-list"
      className={'flex flex-col mt-0 flex-1 min-h-0 bg-opacity-50'}
    >
      {/* Title Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-transparent gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3
            className={`text-sm font-semibold uppercase tracking-wider ${textHeaderClass} flex items-center gap-2`}
          >
            SOURCEBOOK
          </h3>
          <button
            onClick={() => {
              setSelectedEntry(null);
              setIsDialogOpen(true);
            }}
            className={`p-1 rounded-full transition-colors ${btnHover}`}
            title="Add Entry"
          >
            <Plus size={18} />
          </button>
        </div>

        <div
          className={`flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide ${subTextClass}`}
          title="Enable automatic sourcebook entry selection. While enabled, the AI picks relevant entries and manual entry checkboxes are locked. Disable to stop this AI helper and choose entries manually."
        >
          <span className="whitespace-nowrap">AUTO SELECTION</span>
          {isAutoSelectionRunning && (
            <LoaderCircle
              size={12}
              className="animate-spin text-brand-500"
              title="Automatic sourcebook selection is running"
            />
          )}
          <button
            type="button"
            onClick={() => onToggleAutoSelection?.(!isAutoSelectionEnabled)}
            className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
              isAutoSelectionEnabled
                ? 'bg-brand-500 border-brand-500 text-white'
                : `${isLight ? 'border-brand-gray-300' : 'border-brand-gray-600'} hover:border-brand-500`
            }`}
            title="Toggle automatic sourcebook selection"
            aria-label="Toggle automatic sourcebook selection"
            aria-pressed={isAutoSelectionEnabled}
          >
            {isAutoSelectionEnabled && <Check size={10} strokeWidth={4} />}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 mb-2 pt-2">
        <div className="relative">
          <Search size={12} className={`absolute left-2.5 top-2 ${subTextClass}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter entries..."
            className={`w-full pl-8 pr-2 py-1.5 text-xs rounded border ${inputBorder} ${inputBg} ${textClass} ${inputPlace} focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors`}
          />
        </div>
      </div>

      {/* List */}
      <div className="relative flex-1 overflow-y-auto px-1 pb-2">
        {isLoadingEntry && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-white/90 px-6 py-4 shadow-lg">
              <LoaderCircle className="animate-spin" size={24} />
              <span className="text-sm font-medium text-brand-gray-900">
                Loading entry…
              </span>
            </div>
          </div>
        )}
        {entries.length === 0 && (
          <div className={`text-center py-4 text-xs ${subTextClass}`}>
            No entries yet.
          </div>
        )}

        {entries.length > 0 && (
          <div className="space-y-0.5" role="list">
            {entries.map((e) => {
              const CategoryIcon =
                (e.category && CATEGORY_DETAILS[e.category]?.icon) || HelpCircle;
              const isChecked = checkedIds.includes(e.id);
              return (
                <div
                  key={e.id}
                  className={`group px-3 py-2 rounded-md transition-colors ${itemHoverClass} flex items-center gap-2 select-none ${
                    isLoadingEntry ? 'pointer-events-none opacity-70' : ''
                  }`}
                  role="listitem"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoadingEntry(true);
                      try {
                        const all = await api.sourcebook.list();
                        const full = all.find((x) => x.id === e.id) || e;
                        setEntries(all);
                        setSelectedEntry(full);
                        setIsDialogOpen(true);
                      } finally {
                        setIsLoadingEntry(false);
                      }
                    }}
                    onMouseEnter={(evt) => handleMouseEnter(evt, e)}
                    onMouseLeave={() => setHoveredEntry(null)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <CategoryIcon
                      size={14}
                      className={`flex-shrink-0 ${subTextClass} group-hover:text-brand-500 transition-colors`}
                    />
                    <div className={`text-sm truncate ${textClass}`}>{e.name}</div>
                  </button>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (isAutoSelectionEnabled) return;
                      onToggle?.(e.id, !isChecked);
                    }}
                    disabled={isAutoSelectionEnabled}
                    className={`ml-auto w-4 h-4 rounded border transition-all flex items-center justify-center ${
                      isAutoSelectionEnabled ? 'opacity-40 cursor-not-allowed' : ''
                    } ${
                      isChecked
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : `${isLight ? 'border-brand-gray-300' : 'border-brand-gray-600'} hover:border-brand-500`
                    }`}
                    title={
                      isAutoSelectionEnabled
                        ? 'Automatic selection is enabled; disable Auto to change this manually'
                        : isChecked
                          ? 'Exclude from context'
                          : 'Include in context'
                    }
                  >
                    {isChecked && <Check size={10} strokeWidth={4} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SourcebookEntryDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        entry={selectedEntry}
        allEntries={entries}
        language={language}
        onSave={selectedEntry ? handleUpdate : handleCreate}
        onDelete={selectedEntry ? handleDelete : undefined}
        theme={theme}
        baselineEntry={baselineEntries?.find((e) => e.id === selectedEntry?.id) ?? null}
      />

      {/* Portal Tooltip */}
      {hoveredEntry &&
        createPortal(
          <div
            style={{
              top: tooltipPos.y,
              left: tooltipPos.x,
              maxWidth: '300px',
            }}
            className={`fixed z-[100] p-3 rounded-lg shadow-xl border ${borderClass} ${isLight ? 'bg-white' : 'bg-brand-gray-900'} animate-in fade-in zoom-in-95 duration-100`}
          >
            <div className="flex items-center gap-2 mb-2">
              <h4 className={`font-bold text-sm ${textClass}`}>{hoveredEntry.name}</h4>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${borderClass} ${subTextClass}`}
              >
                {hoveredEntry.category}
              </span>
            </div>

            {/* Image Preview if exists */}
            {(() => {
              const img = getEntryImage(hoveredEntry);
              if (img) {
                return (
                  <div className="mb-2 rounded overflow-hidden border border-brand-500/20 bg-black/5 aspect-video flex items-center justify-center">
                    {img.is_placeholder || !img.url ? (
                      <div className="text-gray-400 flex flex-col items-center">
                        <ImageIcon size={24} />
                      </div>
                    ) : (
                      <img
                        src={img.url}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {hoveredEntry.description ? (
              <p
                className={`text-xs ${isLight ? 'text-brand-gray-700' : 'text-brand-gray-300'} line-clamp-6 leading-relaxed`}
              >
                {hoveredEntry.description}
              </p>
            ) : (
              <p className={`text-xs italic ${subTextClass}`}>
                No description provided.
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
