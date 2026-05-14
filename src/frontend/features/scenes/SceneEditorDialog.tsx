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
import { Clock } from 'lucide-react';
import type {
  Scene,
  SceneBeat,
  SceneProseLink,
  SceneTagPersonalDatetime,
  SourcebookEntry,
} from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import { useScenes, useStoryLanguage, useStoryStore } from '../../stores/storyStore';
import type { StoryStoreState } from '../../stores/storyStore';
import { SourcebookHoverCard } from '../sourcebook/SourcebookHoverCard';
import { listProjectImages } from '../sourcebook/sourcebookApi';
import { ProjectImage } from '../../services/apiTypes';
import { SceneTemporalDialog } from './SceneTemporalDialog';
import { getSceneEpochNanoseconds } from './sceneSortUtils';
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

type CharToken = {
  name: string;
  personal_age: string | null;
};

type AgeEditTarget =
  | { type: 'active_tag'; index: number }
  | { type: 'passive_tag'; index: number }
  | { type: 'sourcebook_tag'; entryId: string };

type TemporalEditTarget = { type: 'scene' };

type DirtySnapshot = {
  summary: string;
  beats: string;
  activeTokens: string;
  passiveTokens: string;
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
  const [activeTokens, setActiveTokens] = useState<CharToken[]>(
    scene.active_characters.map((name: string): CharToken => {
      const dt = scene.tag_personal_datetimes?.find(
        (t: SceneTagPersonalDatetime) =>
          t.role === 'active' &&
          t.ref === name &&
          t.index === scene.active_characters.indexOf(name)
      );
      return { name, personal_age: dt?.personal_age ?? null };
    })
  );
  const [activeInput, setActiveInput] = useState('');
  const [passiveTokens, setPassiveTokens] = useState<CharToken[]>(
    scene.passive_characters.map((name: string): CharToken => {
      const dt = scene.tag_personal_datetimes?.find(
        (t: SceneTagPersonalDatetime) =>
          t.role === 'passive' &&
          t.ref === name &&
          t.index === scene.passive_characters.indexOf(name)
      );
      return { name, personal_age: dt?.personal_age ?? null };
    })
  );
  const [passiveInput, setPassiveInput] = useState('');
  const [sourcebookTags, setSourcebookTags] = useState<
    Array<{ id: string; personal_age: string | null }>
  >(
    (scene.sourcebook_entry_ids ?? []).map((id: string) => {
      const dt = scene.tag_personal_datetimes?.find(
        (t: SceneTagPersonalDatetime) => t.role === 'sourcebook' && t.ref === id
      );
      return { id, personal_age: dt?.personal_age ?? null };
    })
  );
  const [sourcebookInput, setSourcebookInput] = useState('');
  const [sceneTimeValue, setSceneTimeValue] = useState<string | null>(
    scene.scene_time?.temporal_zoned_datetime ?? null
  );
  const [temporalEditTarget, setTemporalEditTarget] =
    useState<TemporalEditTarget | null>(null);
  const [ageEditTarget, setAgeEditTarget] = useState<AgeEditTarget | null>(null);
  const [ageEditValue, setAgeEditValue] = useState('');

  /**
   * Time Travel sourcebook entries that create a new timeline AND whose departure
   * (i.e. at least one scene referencing them) happens at or before this scene's time.
   * Each element represents one additional active timeline branch.
   */
  const activeBranchTimelines = useMemo((): SourcebookEntry[] => {
    const currentEpoch = getSceneEpochNanoseconds(scene);

    const ttEntries = sourcebookEntries.filter(
      (e: SourcebookEntry) => e.category === 'Time Travel' && e.creates_new_timeline
    );

    return ttEntries.filter((entry: SourcebookEntry) =>
      allScenes.some((s: Scene) => {
        // A TT branch is "active" at this scene if a departure scene for this entry
        // exists at or before this scene's chronological position.
        // NOTE: the current scene itself is intentionally included so that the
        // departure scene (which IS the TT event) also shows the clock icon.
        if (!(s.sourcebook_entry_ids ?? []).includes(entry.id)) return false;
        // If either scene has no epoch time, be inclusive rather than hiding the option.
        if (currentEpoch === null) return true;
        const sEpoch = getSceneEpochNanoseconds(s);
        if (sEpoch === null) return true;
        return sEpoch <= currentEpoch;
      })
    );
  }, [scene, allScenes, sourcebookEntries]);

  /** Total number of timelines active at this scene (main + branches). */
  const activeTimelinesAtScene = activeBranchTimelines.length + 1;

  /**
   * Collect known personal_age values per timeline context.
   * Key format: `tl:{timelineId}::{role}::{ref}` for branch timelines,
   * `main::{role}::{ref}` for the main timeline.
   */
  const knownAgesForRef = useMemo((): Map<string, string[]> => {
    const branchIds = new Set(activeBranchTimelines.map((e: SourcebookEntry) => e.id));
    const map = new Map<string, string[]>();

    allScenes.forEach((s: Scene): void => {
      // Determine which branch timeline (if any) this scene belongs to.
      const sceneEntryIds = new Set(s.sourcebook_entry_ids ?? []);
      const branchId =
        [...branchIds].find((id: string) => sceneEntryIds.has(id)) ?? null;
      const tlPrefix = branchId ? `tl:${branchId}` : 'main';

      (s.tag_personal_datetimes ?? []).forEach(
        (tpd: SceneTagPersonalDatetime): void => {
          if (!tpd.personal_age) return;
          const key = `${tlPrefix}::${tpd.role}::${tpd.ref}`;
          const existing = map.get(key) ?? [];
          if (!existing.includes(tpd.personal_age)) {
            map.set(key, [...existing, tpd.personal_age]);
          }
        }
      );
    });
    return map;
  }, [allScenes, activeBranchTimelines]);

  /**
   * Age options per timeline for the current age edit target.
   * Returns [{timelineLabel, ages}] — one entry per active timeline.
   */
  const ageOptionsByTimeline = useMemo((): Array<{ label: string; ages: string[] }> => {
    if (!ageEditTarget) return [];

    let role: string;
    let ref: string;
    if (ageEditTarget.type === 'active_tag') {
      role = 'active';
      ref = activeTokens[ageEditTarget.index]?.name ?? '';
    } else if (ageEditTarget.type === 'passive_tag') {
      role = 'passive';
      ref = passiveTokens[ageEditTarget.index]?.name ?? '';
    } else {
      role = 'sourcebook';
      ref = ageEditTarget.entryId;
    }

    const result: Array<{ label: string; ages: string[] }> = [
      {
        label: t('Main Timeline'),
        ages: knownAgesForRef.get(`main::${role}::${ref}`) ?? [],
      },
    ];

    for (const entry of activeBranchTimelines) {
      result.push({
        label: entry.name,
        ages: knownAgesForRef.get(`tl:${entry.id}::${role}::${ref}`) ?? [],
      });
    }

    return result;
  }, [
    ageEditTarget,
    activeTokens,
    passiveTokens,
    activeBranchTimelines,
    knownAgesForRef,
    t,
  ]);
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

    setSummary(scene.summary);
    setBeats(scene.beats);
    setActiveTokens(
      scene.active_characters.map((name: string, i: number): CharToken => {
        const dt = scene.tag_personal_datetimes?.find(
          (t: SceneTagPersonalDatetime) =>
            t.role === 'active' && t.ref === name && t.index === i
        );
        return { name, personal_age: dt?.personal_age ?? null };
      })
    );
    setActiveInput('');
    setPassiveTokens(
      scene.passive_characters.map((name: string, i: number): CharToken => {
        const dt = scene.tag_personal_datetimes?.find(
          (t: SceneTagPersonalDatetime) =>
            t.role === 'passive' && t.ref === name && t.index === i
        );
        return { name, personal_age: dt?.personal_age ?? null };
      })
    );
    setPassiveInput('');
    setSourcebookTags(
      (scene.sourcebook_entry_ids ?? []).map((id: string) => {
        const dt = scene.tag_personal_datetimes?.find(
          (t: SceneTagPersonalDatetime) => t.role === 'sourcebook' && t.ref === id
        );
        return { id, personal_age: dt?.personal_age ?? null };
      })
    );
    setSourcebookInput('');
    setSceneTimeValue(scene.scene_time?.temporal_zoned_datetime ?? null);
    setTemporalEditTarget(null);
    setAgeEditTarget(null);
    setAgeEditValue('');
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
      activeTokens: JSON.stringify(scene.active_characters),
      passiveTokens: JSON.stringify(scene.passive_characters),
      sourcebookIds: scene.sourcebook_entry_ids ?? [],
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
      JSON.stringify(activeTokens.map((t: CharToken) => t.name)) !==
        snapshot.activeTokens ||
      JSON.stringify(passiveTokens.map((t: CharToken) => t.name)) !==
        snapshot.passiveTokens ||
      !arraysEqual(
        sourcebookTags.map((t: { id: string; personal_age: string | null }) => t.id),
        snapshot.sourcebookIds
      ) ||
      colorTag !== snapshot.colorTag ||
      status !== snapshot.status ||
      sceneTimeValue !== snapshot.sceneTimeValue ||
      proseDirty
    );
  })();

  const addActiveToken = (name: string): void => {
    const token = name.trim();
    if (!token) return;
    setActiveTokens((prev: CharToken[]) => [
      ...prev,
      { name: token, personal_age: null },
    ]);
  };

  const addPassiveToken = (name: string): void => {
    const token = name.trim();
    if (!token) return;
    setPassiveTokens((prev: CharToken[]) => [
      ...prev,
      { name: token, personal_age: null },
    ]);
  };

  type SourcebookTag = { id: string; personal_age: string | null };
  const addSourcebookTag = (id: string): void => {
    setSourcebookTags((prev: SourcebookTag[]) =>
      prev.some((t: SourcebookTag) => t.id === id)
        ? prev
        : [...prev, { id, personal_age: null }]
    );
  };

  const activeSuggestions = sourcebookEntries.filter(
    (entry: SourcebookEntry): boolean => {
      if (!activeInput.trim()) return false;
      if (normalizeToken(entry.category ?? '') !== 'character') return false;
      const query = normalizeToken(activeInput);
      const inName = normalizeToken(entry.name).includes(query);
      const inSyn = (entry.synonyms ?? []).some((synonym: string): boolean =>
        normalizeToken(synonym).includes(query)
      );
      return inName || inSyn;
    }
  );

  const passiveSuggestions = sourcebookEntries.filter(
    (entry: SourcebookEntry): boolean => {
      if (!passiveInput.trim()) return false;
      if (normalizeToken(entry.category ?? '') !== 'character') return false;
      const query = normalizeToken(passiveInput);
      const inName = normalizeToken(entry.name).includes(query);
      const inSyn = (entry.synonyms ?? []).some((synonym: string): boolean =>
        normalizeToken(synonym).includes(query)
      );
      return inName || inSyn;
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
      return (
        (inName || inSyn) &&
        !sourcebookTags.some((t: SourcebookTag) => t.id === entry.id)
      );
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
      const tagPersonalDatetimes: SceneTagPersonalDatetime[] = [
        ...activeTokens.flatMap(
          (t: CharToken, i: number): SceneTagPersonalDatetime[] =>
            t.personal_age
              ? [
                  {
                    role: 'active',
                    ref: t.name,
                    index: i,
                    personal_age: t.personal_age,
                  },
                ]
              : []
        ),
        ...passiveTokens.flatMap(
          (t: CharToken, i: number): SceneTagPersonalDatetime[] =>
            t.personal_age
              ? [
                  {
                    role: 'passive',
                    ref: t.name,
                    index: i,
                    personal_age: t.personal_age,
                  },
                ]
              : []
        ),
        ...sourcebookTags.flatMap((t: SourcebookTag): SceneTagPersonalDatetime[] =>
          t.personal_age
            ? [
                {
                  role: 'sourcebook',
                  ref: t.id,
                  index: 0,
                  personal_age: t.personal_age,
                },
              ]
            : []
        ),
      ];
      await onSave({
        summary,
        beats,
        active_characters: activeTokens.map((t: CharToken) => t.name),
        passive_characters: passiveTokens.map((t: CharToken) => t.name),
        sourcebook_entry_ids: sourcebookTags.map((t: SourcebookTag) => t.id),
        scene_time: sceneTimeValue ? { temporal_zoned_datetime: sceneTimeValue } : null,
        color_tag: colorTag,
        status,
        tag_personal_datetimes: tagPersonalDatetimes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getTemporalDialogCurrentValue = (): string | null => {
    if (!temporalEditTarget) return null;
    return sceneTimeValue;
  };

  const applyTemporalDialogValue = (value: string | null): void => {
    if (!temporalEditTarget) return;
    setSceneTimeValue(value);
    setTemporalEditTarget(null);
  };

  const openAgeEdit = (target: AgeEditTarget): void => {
    let currentAge: string | null = null;
    if (target.type === 'active_tag')
      currentAge = activeTokens[target.index]?.personal_age ?? null;
    else if (target.type === 'passive_tag')
      currentAge = passiveTokens[target.index]?.personal_age ?? null;
    else if (target.type === 'sourcebook_tag') {
      const found = sourcebookTags.find((t: SourcebookTag) => t.id === target.entryId);
      currentAge = found?.personal_age ?? null;
    }
    setAgeEditValue(currentAge ?? '');
    setAgeEditTarget(target);
  };

  const applyAgeEdit = (explicitValue?: string): void => {
    if (!ageEditTarget) return;
    const trimmed =
      (explicitValue !== undefined ? explicitValue : ageEditValue).trim() || null;
    if (ageEditTarget.type === 'active_tag') {
      const { index } = ageEditTarget;
      setActiveTokens((prev: CharToken[]) => {
        const next = [...prev];
        next[index] = { ...next[index], personal_age: trimmed };
        return next;
      });
    } else if (ageEditTarget.type === 'passive_tag') {
      const { index } = ageEditTarget;
      setPassiveTokens((prev: CharToken[]) => {
        const next = [...prev];
        next[index] = { ...next[index], personal_age: trimmed };
        return next;
      });
    } else if (ageEditTarget.type === 'sourcebook_tag') {
      const { entryId } = ageEditTarget;
      setSourcebookTags((prev: SourcebookTag[]) =>
        prev.map((t: SourcebookTag) =>
          t.id === entryId ? { ...t, personal_age: trimmed } : t
        )
      );
    }
    setAgeEditTarget(null);
    setAgeEditValue('');
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
                  {activeTokens.map((token: CharToken, idx: number) => {
                    const matched = entryByName.get(normalizeToken(token.name));
                    return (
                      <div
                        key={`active-${idx}`}
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
                        <span className={tc.text}>{token.name}</span>
                        {token.personal_age && (
                          <span className={`text-[10px] ${tc.muted}`}>
                            {token.personal_age}
                          </span>
                        )}
                        {matched && activeTimelinesAtScene > 1 && (
                          <button
                            type="button"
                            aria-label={t('Set personal age at this scene')}
                            title={t('Set personal age at this scene')}
                            className={`${tc.muted} hover:text-brand-500`}
                            onClick={(e: React.MouseEvent): void => {
                              e.stopPropagation();
                              openAgeEdit({ type: 'active_tag', index: idx });
                            }}
                          >
                            <Clock size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={tc.muted}
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            event.stopPropagation();
                            setActiveTokens((prev: CharToken[]) =>
                              prev.filter((_: CharToken, i: number) => i !== idx)
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
                          addActiveToken(activeSuggestions[0].name);
                        } else {
                          addActiveToken(activeInput);
                        }
                        setActiveInput('');
                      }
                      if (
                        e.key === 'Backspace' &&
                        !activeInput &&
                        activeTokens.length > 0
                      ) {
                        setActiveTokens((prev: CharToken[]) => prev.slice(0, -1));
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
                        addActiveToken(entry.name);
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
                  {passiveTokens.map((token: CharToken, idx: number) => {
                    const matched = entryByName.get(normalizeToken(token.name));
                    return (
                      <div
                        key={`passive-${idx}`}
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
                        <span className={tc.text}>{token.name}</span>
                        {token.personal_age && (
                          <span className={`text-[10px] ${tc.muted}`}>
                            {token.personal_age}
                          </span>
                        )}
                        {matched && activeTimelinesAtScene > 1 && (
                          <button
                            type="button"
                            aria-label={t('Set personal age at this scene')}
                            title={t('Set personal age at this scene')}
                            className={`${tc.muted} hover:text-brand-500`}
                            onClick={(e: React.MouseEvent): void => {
                              e.stopPropagation();
                              openAgeEdit({ type: 'passive_tag', index: idx });
                            }}
                          >
                            <Clock size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={tc.muted}
                          onClick={(
                            event: React.MouseEvent<HTMLButtonElement>
                          ): void => {
                            event.stopPropagation();
                            setPassiveTokens((prev: CharToken[]) =>
                              prev.filter((_: CharToken, i: number) => i !== idx)
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
                          addPassiveToken(passiveSuggestions[0].name);
                        } else {
                          addPassiveToken(passiveInput);
                        }
                        setPassiveInput('');
                      }
                      if (
                        e.key === 'Backspace' &&
                        !passiveInput &&
                        passiveTokens.length > 0
                      ) {
                        setPassiveTokens((prev: CharToken[]) => prev.slice(0, -1));
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
                        addPassiveToken(entry.name);
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
                {sourcebookTags.map((tag: SourcebookTag) => {
                  const entry = entryById.get(tag.id);
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
                      {tag.personal_age && (
                        <span className={`text-[10px] ${tc.muted}`}>
                          {tag.personal_age}
                        </span>
                      )}
                      {activeTimelinesAtScene > 1 && (
                        <button
                          type="button"
                          aria-label={t('Set personal age at this scene')}
                          title={t('Set personal age at this scene')}
                          className={`${tc.muted} hover:text-brand-500`}
                          onClick={(e: React.MouseEvent): void => {
                            e.stopPropagation();
                            openAgeEdit({ type: 'sourcebook_tag', entryId: entry.id });
                          }}
                        >
                          <Clock size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={tc.muted}
                        onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                          event.stopPropagation();
                          setSourcebookTags((prev: SourcebookTag[]) =>
                            prev.filter((t: SourcebookTag) => t.id !== entry.id)
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
                      addSourcebookTag(firstSuggestion.id);
                      setSourcebookInput('');
                      return;
                    }
                    const match = entryByName.get(normalizeToken(sourcebookInput));
                    if (match) {
                      addSourcebookTag(match.id);
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
                      addSourcebookTag(entry.id);
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
                  onClick={(): void => setTemporalEditTarget({ type: 'scene' })}
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
          bgClass={tc.bg}
          borderClass={tc.border}
          textClass={tc.text}
          subTextClass={tc.muted}
          availableImages={availableImages}
        />
      )}

      <SceneTemporalDialog
        isOpen={temporalEditTarget !== null}
        value={getTemporalDialogCurrentValue()}
        previousValue={
          temporalEditTarget?.type === 'scene' ? previousSceneTimeValue : sceneTimeValue
        }
        onClose={(): void => setTemporalEditTarget(null)}
        onApply={applyTemporalDialogValue}
      />

      {/* Age picker modal */}
      {ageEditTarget !== null && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40"
          role="presentation"
        >
          <button
            type="button"
            aria-label={t('Close')}
            className="absolute inset-0"
            onClick={(): void => setAgeEditTarget(null)}
          />
          <div
            className={`relative rounded-xl shadow-xl border ${tc.border} ${tc.bg} p-5 w-80 space-y-3`}
            role="dialog"
            aria-label={t('Set personal age at this scene')}
          >
            <p className={`text-sm font-semibold ${tc.text}`}>
              {t('Set personal age at this scene')}
            </p>
            {ageOptionsByTimeline.map(
              ({ label, ages }: { label: string; ages: string[] }) => (
                <div key={label} className="space-y-1">
                  <p className={`text-xs font-medium ${tc.muted}`}>{label}</p>
                  {ages.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {ages.map((age: string) => (
                        <button
                          key={age}
                          type="button"
                          onClick={(): void => {
                            setAgeEditValue(age);
                            applyAgeEdit(age);
                          }}
                          className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                            ageEditValue === age
                              ? 'bg-brand-500 text-white border-brand-600'
                              : `${tc.border} ${tc.text} hover:border-brand-500`
                          }`}
                        >
                          {age}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-xs italic ${tc.muted}`}>
                      {t('No age recorded')}
                    </p>
                  )}
                </div>
              )
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md border text-xs ${tc.border} ${tc.text}`}
                onClick={(): void => {
                  setAgeEditValue('');
                  applyAgeEdit('');
                }}
              >
                {t('Clear')}
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md border text-xs ${tc.border} ${tc.text}`}
                onClick={(): void => setAgeEditTarget(null)}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
/* eslint-enable complexity, max-lines-per-function */
