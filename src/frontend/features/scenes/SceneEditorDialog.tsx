// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Near full-screen modal for editing scene properties.
 * Includes sourcebook-aware tag inputs and Temporal-based timeline time.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Scene, SceneBeat, SceneProseLink, SourcebookEntry } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import { useScenes, useStoryLanguage, useStoryStore } from '../../stores/storyStore';
import type { StoryStoreState } from '../../stores/storyStore';
import { SourcebookHoverCard } from '../sourcebook/SourcebookHoverCard';
import { listProjectImages } from '../sourcebook/sourcebookApi';
import { ProjectImage } from '../../services/apiTypes';
import { SceneTemporalDialog } from './SceneTemporalDialog';
import {
  parseZonedDateTime,
  toDisplayString,
  toInternationalDisplayString,
} from '../../utils/temporal';

const COLOR_TAGS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
];
const COLOR_SWATCH: Record<string, string> = {
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  teal: 'bg-teal-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
};
const EMPTY_SOURCEBOOK: SourcebookEntry[] = [];

type DirtySnapshot = {
  summary: string;
  beats: string;
  active: string[];
  passive: string[];
  sourcebookIds: string[];
  colorTag: string | null;
  status: Scene['status'];
  sceneTimeValue: string | null;
};

interface SceneEditorDialogProps {
  scene: Scene;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Omit<Scene, 'id'>>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Removes the causal link between fromId and toId (updates both sides). */
  onDeleteCause?: (fromId: string, toId: string) => Promise<void>;
  /** Returns the current prose text for a given link, or null if unavailable. */
  getLinkedProseText?: (link: SceneProseLink) => string | null;
  /** Saves new prose content back to the file at the link range. */
  onSaveProseContent?: (text: string) => Promise<void>;
  /** Open sourcebook dialog for an entry id. */
  onOpenSourcebookEntry?: (entryId: string) => void;
}

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const mapCategoryLabel = (category: string | undefined): string => {
  if (!category) return 'OTHER';
  return category.toUpperCase();
};

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length &&
  a.every((value: string, index: number) => value === b[index]);

/* eslint-disable complexity, max-lines-per-function */
export const SceneEditorDialog: React.FC<SceneEditorDialogProps> = ({
  scene,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onDeleteCause,
  getLinkedProseText,
  onSaveProseContent,
  onOpenSourcebookEntry,
}: SceneEditorDialogProps) => {
  const { t, i18n } = useTranslation();
  const tc = useThemeClasses();
  const isLight = !tc.bg.includes('dark');
  const storyLanguage = useStoryLanguage();
  const allScenes = useScenes();
  const sourcebookEntriesMaybe = useStoryStore(
    (s: StoryStoreState): SourcebookEntry[] => s.story.sourcebook ?? []
  );
  const sourcebookEntries = Array.isArray(sourcebookEntriesMaybe)
    ? sourcebookEntriesMaybe
    : EMPTY_SOURCEBOOK;
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef, onClose);

  const entryById = useMemo(
    (): Map<string, SourcebookEntry> =>
      new Map(sourcebookEntries.map((entry: SourcebookEntry) => [entry.id, entry])),
    [sourcebookEntries]
  );
  const entryByName = useMemo((): Map<string, SourcebookEntry> => {
    const map = new Map<string, SourcebookEntry>();
    sourcebookEntries.forEach((entry: SourcebookEntry): void => {
      map.set(normalizeToken(entry.name), entry);
      (entry.synonyms ?? []).forEach((synonym: string): void => {
        map.set(normalizeToken(synonym), entry);
      });
    });
    return map;
  }, [sourcebookEntries]);

  const [summary, setSummary] = useState(scene.summary);
  const [beats, setBeats] = useState<SceneBeat[]>(scene.beats);
  const [activeChars, setActiveChars] = useState<string[]>(scene.active_characters);
  const [activeInput, setActiveInput] = useState('');
  const [passiveChars, setPassiveChars] = useState<string[]>(scene.passive_characters);
  const [passiveInput, setPassiveInput] = useState('');
  const [sourcebookIds, setSourcebookIds] = useState<string[]>(
    scene.sourcebook_entry_ids ?? []
  );
  const [sourcebookInput, setSourcebookInput] = useState('');
  const [sceneTimeValue, setSceneTimeValue] = useState<string | null>(
    scene.scene_time?.temporal_zoned_datetime ?? null
  );
  const [isTemporalDialogOpen, setIsTemporalDialogOpen] = useState(false);
  const [colorTag, setColorTag] = useState<string | null>(scene.color_tag ?? null);
  const [status, setStatus] = useState(scene.status);
  const [proseLink, setProseLink] = useState<SceneProseLink | null>(
    scene.prose_link ?? null
  );
  const [localProseText, setLocalProseText] = useState('');
  const [proseDirty, setProseDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSourcebookEntryId, setPendingSourcebookEntryId] = useState<
    string | null
  >(null);
  const [hoveredEntry, setHoveredEntry] = useState<SourcebookEntry | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [availableImages, setAvailableImages] = useState<ProjectImage[]>([]);

  const initialSnapshotRef = useRef<DirtySnapshot | null>(null);

  useEffect((): void => {
    if (!isOpen) return;

    const inheritedIds = new Set(scene.sourcebook_entry_ids ?? []);

    setSummary(scene.summary);
    setBeats(scene.beats);
    setActiveChars(scene.active_characters);
    setActiveInput('');
    setPassiveChars(scene.passive_characters);
    setPassiveInput('');
    setSourcebookIds(Array.from(inheritedIds));
    setSourcebookInput('');
    setSceneTimeValue(scene.scene_time?.temporal_zoned_datetime ?? null);
    setIsTemporalDialogOpen(false);
    setColorTag(scene.color_tag ?? null);
    setStatus(scene.status);
    setProseLink(scene.prose_link ?? null);
    setLocalProseText(
      scene.prose_link && getLinkedProseText
        ? (getLinkedProseText(scene.prose_link) ?? '')
        : ''
    );
    setProseDirty(false);
    setConfirmDelete(false);
    setPendingSourcebookEntryId(null);
    setHoveredEntry(null);

    initialSnapshotRef.current = {
      summary: scene.summary,
      beats: JSON.stringify(scene.beats),
      active: [...scene.active_characters],
      passive: [...scene.passive_characters],
      sourcebookIds: Array.from(inheritedIds),
      colorTag: scene.color_tag ?? null,
      status: scene.status,
      sceneTimeValue: scene.scene_time?.temporal_zoned_datetime ?? null,
    };
  }, [isOpen, scene, getLinkedProseText]);

  useEffect((): void => {
    if (hoveredEntry && availableImages.length === 0) {
      void listProjectImages().then((images: ProjectImage[]): void => {
        setAvailableImages(images);
      });
    }
  }, [hoveredEntry, availableImages.length]);

  if (!isOpen) return null;

  const otherScenes = allScenes.filter((s: Scene) => s.id !== scene.id);
  const previousSceneTimeValue = (() => {
    for (const candidateId of scene.order_after) {
      const linked = allScenes.find((s: Scene): boolean => s.id === candidateId);
      if (linked?.scene_time?.temporal_zoned_datetime) {
        return linked.scene_time.temporal_zoned_datetime;
      }
    }
    const sceneIndex = allScenes.findIndex((s: Scene): boolean => s.id === scene.id);
    if (sceneIndex <= 0) return null;
    for (let idx = sceneIndex - 1; idx >= 0; idx -= 1) {
      const maybe = allScenes[idx]?.scene_time?.temporal_zoned_datetime;
      if (maybe) return maybe;
    }
    return null;
  })();
  const parsedSceneTime = parseZonedDateTime(sceneTimeValue);
  const displayLocale = storyLanguage || i18n.resolvedLanguage || i18n.language;
  const inputCls = `w-full px-3 py-2 rounded-md border ${tc.border} ${tc.input} ${tc.text} text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`;
  const labelCls = `block text-xs font-semibold uppercase tracking-wide ${tc.muted} mb-1`;
  const sectionCls = `space-y-2 pb-4 border-b ${tc.border}`;

  const hasUnsavedChanges = (() => {
    const snapshot = initialSnapshotRef.current;
    if (!snapshot) return false;
    return (
      summary !== snapshot.summary ||
      JSON.stringify(beats) !== snapshot.beats ||
      !arraysEqual(activeChars, snapshot.active) ||
      !arraysEqual(passiveChars, snapshot.passive) ||
      !arraysEqual(sourcebookIds, snapshot.sourcebookIds) ||
      colorTag !== snapshot.colorTag ||
      status !== snapshot.status ||
      sceneTimeValue !== snapshot.sceneTimeValue ||
      proseDirty
    );
  })();

  const addCharacterToken = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ): void => {
    const token = value.trim();
    if (!token) return;
    setter((prev: string[]): string[] =>
      prev.includes(token) ? prev : [...prev, token]
    );
  };

  const activeSuggestions = sourcebookEntries.filter(
    (entry: SourcebookEntry): boolean => {
      if (!activeInput.trim()) return false;
      const query = normalizeToken(activeInput);
      const inName = normalizeToken(entry.name).includes(query);
      const inSyn = (entry.synonyms ?? []).some((synonym: string): boolean =>
        normalizeToken(synonym).includes(query)
      );
      return (inName || inSyn) && !activeChars.includes(entry.name);
    }
  );

  const passiveSuggestions = sourcebookEntries.filter(
    (entry: SourcebookEntry): boolean => {
      if (!passiveInput.trim()) return false;
      const query = normalizeToken(passiveInput);
      const inName = normalizeToken(entry.name).includes(query);
      const inSyn = (entry.synonyms ?? []).some((synonym: string): boolean =>
        normalizeToken(synonym).includes(query)
      );
      return (inName || inSyn) && !passiveChars.includes(entry.name);
    }
  );

  const sourcebookSuggestions = sourcebookEntries.filter(
    (entry: SourcebookEntry): boolean => {
      if (!sourcebookInput.trim()) return false;
      const query = normalizeToken(sourcebookInput);
      const inName = normalizeToken(entry.name).includes(query);
      const inSyn = (entry.synonyms ?? []).some((synonym: string): boolean =>
        normalizeToken(synonym).includes(query)
      );
      return (inName || inSyn) && !sourcebookIds.includes(entry.id);
    }
  );

  const openHoverForEntry = (
    event: React.MouseEvent<HTMLElement>,
    entry: SourcebookEntry
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverPos({ x: rect.right + 8, y: Math.max(8, rect.top) });
    setHoveredEntry(entry);
  };

  const closeHoverCard = (): void => {
    setHoveredEntry(null);
  };

  const doOpenSourcebookEntry = (entryId: string): void => {
    if (!onOpenSourcebookEntry) return;
    onOpenSourcebookEntry(entryId);
  };

  const handleTagDoubleClick = (entryId: string): void => {
    if (!onOpenSourcebookEntry) return;
    if (!hasUnsavedChanges) {
      doOpenSourcebookEntry(entryId);
      onClose();
      return;
    }
    setPendingSourcebookEntryId(entryId);
  };

  const performSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      if (proseDirty && proseLink && onSaveProseContent) {
        await onSaveProseContent(localProseText);
      }
      await onSave({
        summary,
        beats,
        active_characters: activeChars,
        passive_characters: passiveChars,
        sourcebook_entry_ids: sourcebookIds,
        scene_time: sceneTimeValue ? { temporal_zoned_datetime: sceneTimeValue } : null,
        color_tag: colorTag,
        status,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    await performSave();
    onClose();
  };

  const handleDelete = async (): Promise<void> => {
    await onDelete();
    onClose();
  };

  const addBeat = (): void => {
    setBeats((prev: SceneBeat[]) => [
      ...prev,
      { id: `beat-${Date.now()}`, text: '', prose_link: null },
    ]);
  };

  const updateBeat = (idx: number, text: string): void => {
    setBeats((prev: SceneBeat[]) => {
      const next = [...prev];
      next[idx] = { ...next[idx], text };
      return next;
    });
  };

  const deleteBeat = (idx: number): void => {
    setBeats((prev: SceneBeat[]) =>
      prev.filter((_: SceneBeat, i: number) => i !== idx)
    );
  };

  const onStatusChange = (e: React.ChangeEvent<HTMLSelectElement>): void =>
    setStatus(e.target.value as Scene['status']);
  const onProseTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setLocalProseText(e.target.value);
    setProseDirty(true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('Edit Scene')}
        className={`relative flex flex-col w-[96vw] h-[96vh] max-w-none rounded-xl shadow-2xl border ${tc.border} ${tc.bg} overflow-hidden`}
      >
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${tc.border} flex-shrink-0`}
        >
          <h2 className={`text-base font-semibold ${tc.text}`}>{t('Edit Scene')}</h2>
          <button
            type="button"
            aria-label={t('Close scene editor')}
            onClick={onClose}
            className={`p-1.5 rounded-md hover:bg-brand-gray-100 dark:hover:bg-brand-gray-800 ${tc.text}`}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className={sectionCls}>
            <label className={labelCls}>{t('Scene Summary')}</label>
            <textarea
              className={inputCls}
              rows={3}
              placeholder={t('Scene summary...')}
              value={summary}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
                setSummary(e.target.value)
              }
            />
          </div>

          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <label className={labelCls}>{t('Beats')}</label>
              <button
                type="button"
                onClick={addBeat}
                className="text-xs text-brand-500 hover:text-brand-600 font-medium"
              >
                + {t('Add Beat')}
              </button>
            </div>
            {beats.map((beat: SceneBeat, idx: number) => (
              <div key={beat.id} className="flex gap-2 items-start">
                <textarea
                  className={`${inputCls} flex-1`}
                  rows={2}
                  placeholder={t('Beat text...')}
                  value={beat.text}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
                    updateBeat(idx, e.target.value)
                  }
                />
                <button
                  type="button"
                  aria-label={t('Delete Beat')}
                  onClick={(): void => deleteBeat(idx)}
                  className={`mt-1 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 ${tc.muted}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className={sectionCls}>
            <div>
              <label className={labelCls}>{t('Active Characters')}</label>
              <div className={`rounded-md border ${tc.border} ${tc.input} p-2`}>
                <div className="flex flex-wrap gap-2">
                  {activeChars.map((token: string) => {
                    const matched = entryByName.get(normalizeToken(token));
                    return (
                      <div
                        key={`active-${token}`}
                        role="button"
                        tabIndex={0}
                        onDoubleClick={(): void =>
                          matched && handleTagDoubleClick(matched.id)
                        }
                        onKeyDown={(
                          event: React.KeyboardEvent<HTMLDivElement>
                        ): void => {
                          if ((event.key === 'Enter' || event.key === ' ') && matched) {
                            event.preventDefault();
                            handleTagDoubleClick(matched.id);
                          }
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>): void =>
                          matched ? openHoverForEntry(e, matched) : undefined
                        }
                        onMouseLeave={closeHoverCard}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${matched ? 'bg-brand-500/10 border-brand-500/40' : `${tc.bg} ${tc.border}`}`}
                        title={
                          matched
                            ? t('Double click to open sourcebook entry')
                            : undefined
                        }
                      >
                        <span className={tc.text}>{token}</span>
                        {matched && (
                          <span
                            className={`px-1 py-0.5 rounded text-[10px] border ${tc.border} ${tc.muted}`}
                          >
                            {mapCategoryLabel(matched.category)}
                          </span>
                        )}
                        <button
                          type="button"
                          className={tc.muted}
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            event.stopPropagation();
                            setActiveChars((prev: string[]): string[] =>
                              prev.filter((value: string): boolean => value !== token)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <input
                    type="text"
                    className={`min-w-[180px] flex-1 bg-transparent text-sm ${tc.text} focus:outline-none`}
                    placeholder={t('Type and press Enter')}
                    value={activeInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      setActiveInput(e.target.value)
                    }
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>): void => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        if (activeSuggestions.length > 0) {
                          addCharacterToken(activeSuggestions[0].name, setActiveChars);
                        } else {
                          addCharacterToken(activeInput, setActiveChars);
                        }
                        setActiveInput('');
                      }
                      if (
                        e.key === 'Backspace' &&
                        !activeInput &&
                        activeChars.length > 0
                      ) {
                        setActiveChars((prev: string[]): string[] => prev.slice(0, -1));
                      }
                    }}
                  />
                </div>
              </div>
              {activeSuggestions.length > 0 && (
                <div
                  className={`mt-1 rounded-md border ${tc.border} ${tc.bg} max-h-32 overflow-y-auto`}
                >
                  {activeSuggestions.slice(0, 8).map((entry: SourcebookEntry) => (
                    <button
                      key={`active-sug-${entry.id}`}
                      type="button"
                      className={`w-full text-left px-2 py-1.5 text-xs ${tc.text} hover:bg-brand-500/10`}
                      onClick={(): void => {
                        addCharacterToken(entry.name, setActiveChars);
                        setActiveInput('');
                      }}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>{t('Passive Characters')}</label>
              <div className={`rounded-md border ${tc.border} ${tc.input} p-2`}>
                <div className="flex flex-wrap gap-2">
                  {passiveChars.map((token: string) => {
                    const matched = entryByName.get(normalizeToken(token));
                    return (
                      <div
                        key={`passive-${token}`}
                        role="button"
                        tabIndex={0}
                        onDoubleClick={(): void =>
                          matched && handleTagDoubleClick(matched.id)
                        }
                        onKeyDown={(
                          event: React.KeyboardEvent<HTMLDivElement>
                        ): void => {
                          if ((event.key === 'Enter' || event.key === ' ') && matched) {
                            event.preventDefault();
                            handleTagDoubleClick(matched.id);
                          }
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>): void =>
                          matched ? openHoverForEntry(e, matched) : undefined
                        }
                        onMouseLeave={closeHoverCard}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${matched ? 'bg-brand-500/10 border-brand-500/40' : `${tc.bg} ${tc.border}`}`}
                        title={
                          matched
                            ? t('Double click to open sourcebook entry')
                            : undefined
                        }
                      >
                        <span className={tc.text}>{token}</span>
                        {matched && (
                          <span
                            className={`px-1 py-0.5 rounded text-[10px] border ${tc.border} ${tc.muted}`}
                          >
                            {mapCategoryLabel(matched.category)}
                          </span>
                        )}
                        <button
                          type="button"
                          className={tc.muted}
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            event.stopPropagation();
                            setPassiveChars((prev: string[]): string[] =>
                              prev.filter((value: string): boolean => value !== token)
                            );
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <input
                    type="text"
                    className={`min-w-[180px] flex-1 bg-transparent text-sm ${tc.text} focus:outline-none`}
                    placeholder={t('Type and press Enter')}
                    value={passiveInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      setPassiveInput(e.target.value)
                    }
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>): void => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        if (passiveSuggestions.length > 0) {
                          addCharacterToken(
                            passiveSuggestions[0].name,
                            setPassiveChars
                          );
                        } else {
                          addCharacterToken(passiveInput, setPassiveChars);
                        }
                        setPassiveInput('');
                      }
                      if (
                        e.key === 'Backspace' &&
                        !passiveInput &&
                        passiveChars.length > 0
                      ) {
                        setPassiveChars((prev: string[]): string[] =>
                          prev.slice(0, -1)
                        );
                      }
                    }}
                  />
                </div>
              </div>
              {passiveSuggestions.length > 0 && (
                <div
                  className={`mt-1 rounded-md border ${tc.border} ${tc.bg} max-h-32 overflow-y-auto`}
                >
                  {passiveSuggestions.slice(0, 8).map((entry: SourcebookEntry) => (
                    <button
                      key={`passive-sug-${entry.id}`}
                      type="button"
                      className={`w-full text-left px-2 py-1.5 text-xs ${tc.text} hover:bg-brand-500/10`}
                      onClick={(): void => {
                        addCharacterToken(entry.name, setPassiveChars);
                        setPassiveInput('');
                      }}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={sectionCls}>
            <label className={labelCls}>{t('Sourcebook')}</label>
            <div className={`rounded-md border ${tc.border} ${tc.input} p-2`}>
              <div className="flex flex-wrap gap-2">
                {sourcebookIds.map((entryId: string) => {
                  const entry = entryById.get(entryId);
                  if (!entry) return null;
                  return (
                    <div
                      key={`sourcebook-${entry.id}`}
                      role="button"
                      tabIndex={0}
                      onDoubleClick={(): void => handleTagDoubleClick(entry.id)}
                      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>): void => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleTagDoubleClick(entry.id);
                        }
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>): void =>
                        openHoverForEntry(e, entry)
                      }
                      onMouseLeave={closeHoverCard}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs bg-brand-500/10 border-brand-500/40"
                      title={t('Double click to open sourcebook entry')}
                    >
                      <span className={tc.text}>{entry.name}</span>
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] border ${tc.border} ${tc.muted}`}
                      >
                        {mapCategoryLabel(entry.category)}
                      </span>
                      <button
                        type="button"
                        className={tc.muted}
                        onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                          event.stopPropagation();
                          setSourcebookIds((prev: string[]): string[] =>
                            prev.filter((value: string): boolean => value !== entry.id)
                          );
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <input
                  type="text"
                  className={`min-w-[220px] flex-1 bg-transparent text-sm ${tc.text} focus:outline-none`}
                  placeholder={t('Search sourcebook entries...')}
                  value={sourcebookInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                    setSourcebookInput(e.target.value)
                  }
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>): void => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const firstSuggestion = sourcebookSuggestions[0];
                    if (firstSuggestion) {
                      setSourcebookIds((prev: string[]): string[] =>
                        prev.includes(firstSuggestion.id)
                          ? prev
                          : [...prev, firstSuggestion.id]
                      );
                      setSourcebookInput('');
                      return;
                    }
                    const match = entryByName.get(normalizeToken(sourcebookInput));
                    if (match) {
                      setSourcebookIds((prev: string[]): string[] =>
                        prev.includes(match.id) ? prev : [...prev, match.id]
                      );
                      setSourcebookInput('');
                    }
                  }}
                />
              </div>
            </div>
            {sourcebookSuggestions.length > 0 && (
              <div
                className={`mt-1 rounded-md border ${tc.border} ${tc.bg} max-h-40 overflow-y-auto`}
              >
                {sourcebookSuggestions.slice(0, 10).map((entry: SourcebookEntry) => (
                  <button
                    key={`sourcebook-sug-${entry.id}`}
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs ${tc.text} hover:bg-brand-500/10 flex items-center justify-between`}
                    onClick={(): void => {
                      setSourcebookIds((prev: string[]): string[] =>
                        prev.includes(entry.id) ? prev : [...prev, entry.id]
                      );
                      setSourcebookInput('');
                    }}
                  >
                    <span>{entry.name}</span>
                    <span className={tc.muted}>{mapCategoryLabel(entry.category)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={sectionCls}>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>{t('Time')}</label>
              <div className="flex gap-2">
                {sceneTimeValue && (
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-md border text-xs ${tc.border} ${tc.text}`}
                    onClick={(): void => setSceneTimeValue(null)}
                  >
                    {t('Clear')}
                  </button>
                )}
                <button
                  type="button"
                  className="px-2 py-1 rounded-md text-xs bg-brand-500 text-white"
                  onClick={(): void => setIsTemporalDialogOpen(true)}
                >
                  {sceneTimeValue ? t('Edit') : t('Set Time')}
                </button>
              </div>
            </div>
            {sceneTimeValue ? (
              <div
                className={`rounded-md border ${tc.border} ${tc.input} p-3 space-y-1`}
              >
                <p className={`text-sm ${tc.text}`}>
                  {toDisplayString(sceneTimeValue, displayLocale)}
                </p>
                <p className={`text-xs ${tc.muted}`}>
                  {t('International format: {{value}}', {
                    value:
                      toInternationalDisplayString(sceneTimeValue) || t('Unavailable'),
                  })}
                </p>
                {parsedSceneTime && (
                  <p className={`text-xs ${tc.muted}`}>
                    {t('Calendar: {{calendar}} | Time Zone: {{timeZone}}', {
                      calendar: parsedSceneTime.calendarId,
                      timeZone: parsedSceneTime.timeZoneId,
                    })}
                  </p>
                )}
              </div>
            ) : (
              <p className={`text-xs italic ${tc.muted}`}>
                {t('No timeline time set for this scene.')}
              </p>
            )}
          </div>

          <div className={sectionCls}>
            <label className={labelCls}>{t('Color Tag')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={(): void => setColorTag(null)}
                className={`w-6 h-6 rounded-full border-2 ${colorTag === null ? 'border-brand-500' : tc.border} bg-brand-gray-200 dark:bg-brand-gray-700`}
                aria-label="none"
              />
              {COLOR_TAGS.map((c: string) => (
                <button
                  key={c}
                  type="button"
                  onClick={(): void => setColorTag(c)}
                  className={`w-6 h-6 rounded-full border-2 ${colorTag === c ? 'border-brand-500' : 'border-transparent'} ${COLOR_SWATCH[c]}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className={sectionCls}>
            <label className={labelCls}>{t('Status')}</label>
            <select
              className={inputCls}
              value={status}
              aria-label={t('Scene status')}
              onChange={onStatusChange}
            >
              <option value="active">{t('active')}</option>
              <option value="draft">{t('draft')}</option>
              <option value="inactive">{t('inactive')}</option>
            </select>
          </div>

          <div className={sectionCls}>
            <label className={labelCls}>{t('Linked Prose')}</label>
            {proseLink ? (
              <>
                {proseLink.is_stale && (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                    ⚠ {t('Stale (file changed externally)')}
                  </p>
                )}
                {getLinkedProseText ? (
                  <textarea
                    className={`${inputCls} font-mono`}
                    rows={6}
                    value={localProseText}
                    onChange={onProseTextChange}
                    aria-label={t('Linked Prose')}
                  />
                ) : (
                  <p className={`text-xs ${tc.muted}`}>
                    {t('Open in split mode to edit linked prose')}
                  </p>
                )}
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-600 font-medium mt-1"
                  onClick={(): void => setProseLink(null)}
                >
                  {t('Unlink prose')}
                </button>
              </>
            ) : (
              <p className={`text-xs italic ${tc.muted}`}>
                {t('Drag prose from the editor to link this scene')}
              </p>
            )}
          </div>

          {(scene.order_before.length > 0 ||
            scene.order_after.length > 0 ||
            otherScenes.length > 0) && (
            <div className={sectionCls}>
              <label className={labelCls}>{t('Causes')}</label>
              {scene.order_before.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-xs font-medium ${tc.muted}`}>
                    {t('Must come before')}:
                  </p>
                  {scene.order_before.map((id: string) => {
                    const name =
                      allScenes.find((s: Scene) => s.id === id)?.summary || id;
                    return (
                      <div key={id} className="flex items-center gap-1 group">
                        <span
                          className={`flex-1 text-xs ${tc.text} truncate`}
                          title={name}
                        >
                          {name}
                        </span>
                        <button
                          type="button"
                          aria-label={t('Delete cause')}
                          onClick={(): void => void onDeleteCause?.(scene.id, id)}
                          className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/40 ${tc.muted} hover:text-red-600 dark:hover:text-red-400 transition-opacity`}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {scene.order_after.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-xs font-medium ${tc.muted}`}>
                    {t('Must come after')}:
                  </p>
                  {scene.order_after.map((id: string) => {
                    const name =
                      allScenes.find((s: Scene) => s.id === id)?.summary || id;
                    return (
                      <div key={id} className="flex items-center gap-1 group">
                        <span
                          className={`flex-1 text-xs ${tc.text} truncate`}
                          title={name}
                        >
                          {name}
                        </span>
                        <button
                          type="button"
                          aria-label={t('Delete cause')}
                          onClick={(): void => void onDeleteCause?.(id, scene.id)}
                          className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/40 ${tc.muted} hover:text-red-600 dark:hover:text-red-400 transition-opacity`}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className={`text-xs italic ${tc.muted}`}>
                {t('Alt+drag to create cause')}
              </p>
            </div>
          )}
        </div>

        <div
          className={`flex items-center justify-between px-5 py-3 border-t ${tc.border} flex-shrink-0`}
        >
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className={`text-sm ${tc.text}`}>
                  {t('Are you sure you want to delete this scene?')}
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                >
                  {t('Delete Scene')}
                </button>
                <button
                  type="button"
                  onClick={(): void => setConfirmDelete(false)}
                  className={`px-3 py-1.5 rounded-md border ${tc.border} ${tc.text} text-sm`}
                >
                  {t('Cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(): void => setConfirmDelete(true)}
                className="px-3 py-1.5 rounded-md text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {t('Delete Scene')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-1.5 rounded-md border ${tc.border} ${tc.text} text-sm hover:bg-brand-gray-100 dark:hover:bg-brand-gray-800`}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={(): void => void handleSave()}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {t('Save')}
            </button>
          </div>
        </div>

        {pendingSourcebookEntryId && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center p-4 z-10">
            <div
              className={`w-full max-w-lg rounded-lg border ${tc.border} ${tc.bg} p-4 space-y-3`}
            >
              <h3 className={`text-sm font-semibold ${tc.text}`}>
                {t('Unsaved changes')}
              </h3>
              <p className={`text-sm ${tc.muted}`}>
                {t(
                  'You have unsaved scene changes. Save, discard, or cancel before opening the sourcebook entry.'
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md border ${tc.border} ${tc.text} text-sm`}
                  onClick={(): void => setPendingSourcebookEntryId(null)}
                >
                  {t('Abort')}
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md border ${tc.border} ${tc.text} text-sm`}
                  onClick={(): void => {
                    const entryId = pendingSourcebookEntryId;
                    setPendingSourcebookEntryId(null);
                    if (entryId) {
                      doOpenSourcebookEntry(entryId);
                      onClose();
                    }
                  }}
                >
                  {t('Discard')}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md bg-brand-500 text-white text-sm"
                  onClick={async (): Promise<void> => {
                    const entryId = pendingSourcebookEntryId;
                    if (!entryId) return;
                    await performSave();
                    setPendingSourcebookEntryId(null);
                    doOpenSourcebookEntry(entryId);
                    onClose();
                  }}
                >
                  {t('Save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {hoveredEntry && (
        <SourcebookHoverCard
          entry={hoveredEntry}
          position={hoverPos}
          isLight={isLight}
          borderClass={tc.border}
          textClass={tc.text}
          subTextClass={tc.muted}
          availableImages={availableImages}
        />
      )}

      <SceneTemporalDialog
        isOpen={isTemporalDialogOpen}
        value={sceneTimeValue}
        previousValue={previousSceneTimeValue}
        onClose={(): void => setIsTemporalDialogOpen(false)}
        onApply={(value: string | null): void => setSceneTimeValue(value)}
      />
    </div>,
    document.body
  );
};
/* eslint-enable complexity, max-lines-per-function */
