// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Full-screen-ish modal for editing all scene properties.
 * Sections: summary, beats, characters, location, time, color, prose link, order constraints, status.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Scene, SceneBeat, SceneProseLink } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import { useScenes } from '../../stores/storyStore';

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

interface SceneEditorDialogProps {
  scene: Scene;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Omit<Scene, 'id'>>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Removes the causal link between fromId and toId (updates both sides). */
  onDeleteCause: (fromId: string, toId: string) => Promise<void>;
  /** Returns the current prose text for a given link, or null if unavailable. */
  getLinkedProseText?: (link: SceneProseLink) => string | null;
  /** Saves new prose content back to the file at the link range. */
  onSaveProseContent?: (text: string) => Promise<void>;
}

export const SceneEditorDialog: React.FC<SceneEditorDialogProps> = ({
  scene,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onDeleteCause,
  getLinkedProseText,
  onSaveProseContent,
}: SceneEditorDialogProps) => {
  const { t } = useTranslation();
  const tc = useThemeClasses();
  const allScenes = useScenes();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef, onClose);

  // ---- local form state mirroring the scene ----
  const [summary, setSummary] = useState(scene.summary);
  const [beats, setBeats] = useState<SceneBeat[]>(scene.beats);
  const [activeChars, setActiveChars] = useState(scene.active_characters.join(', '));
  const [passiveChars, setPassiveChars] = useState(scene.passive_characters.join(', '));
  const [location, setLocation] = useState(scene.location ?? '');
  const [time, setTime] = useState(scene.time ?? '');
  const [colorTag, setColorTag] = useState<string | null>(scene.color_tag ?? null);
  const [status, setStatus] = useState(scene.status);
  const [proseLink, setProseLink] = useState<SceneProseLink | null>(
    scene.prose_link ?? null
  );
  const [localProseText, setLocalProseText] = useState('');
  const [proseDirty, setProseDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset when scene changes (e.g. user closes and reopens for different scene)
  useEffect((): void => {
    if (isOpen) {
      setSummary(scene.summary);
      setBeats(scene.beats);
      setActiveChars(scene.active_characters.join(', '));
      setPassiveChars(scene.passive_characters.join(', '));
      setLocation(scene.location ?? '');
      setTime(scene.time ?? '');
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
    }
  }, [isOpen, scene]);

  if (!isOpen) return null;

  const splitChars = (s: string): string[] =>
    s
      .split(',')
      .map((c: string) => c.trim())
      .filter(Boolean);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      if (proseDirty && proseLink && onSaveProseContent) {
        await onSaveProseContent(localProseText);
      }
      await onSave({
        summary,
        beats,
        active_characters: splitChars(activeChars),
        passive_characters: splitChars(passiveChars),
        location: location.trim() || null,
        time: time.trim() || null,
        color_tag: colorTag,
        status,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    await onDelete();
    onClose();
  };

  // ---- Beat helpers ----
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

  const otherScenes = allScenes.filter((s: Scene) => s.id !== scene.id);

  const inputCls = `w-full px-3 py-2 rounded-md border ${tc.border} ${tc.input} ${tc.text} text-sm focus:outline-none focus:ring-2 focus:ring-brand-500`;
  const labelCls = `block text-xs font-semibold uppercase tracking-wide ${tc.muted} mb-1`;
  const sectionCls = `space-y-2 pb-4 border-b ${tc.border}`;

  // Named handlers avoid repetitive inline type annotations required by ESLint typedef rule
  type InputEvt = React.ChangeEvent<HTMLInputElement>;
  type TextAreaEvt = React.ChangeEvent<HTMLTextAreaElement>;
  type SelectEvt = React.ChangeEvent<HTMLSelectElement>;

  const onSummaryChange = (e: TextAreaEvt): void => setSummary(e.target.value);
  const onActiveCharsChange = (e: InputEvt): void => setActiveChars(e.target.value);
  const onPassiveCharsChange = (e: InputEvt): void => setPassiveChars(e.target.value);
  const onLocationChange = (e: InputEvt): void => setLocation(e.target.value);
  const onTimeChange = (e: InputEvt): void => setTime(e.target.value);
  const onStatusChange = (e: SelectEvt): void =>
    setStatus(e.target.value as Scene['status']);
  const onProseTextChange = (e: TextAreaEvt): void => {
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
        className={`relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl border ${tc.border} ${tc.bg} overflow-hidden`}
      >
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Summary */}
          <div className={sectionCls}>
            <label className={labelCls}>{t('Scene Summary')}</label>
            <textarea
              className={inputCls}
              rows={3}
              placeholder={t('Scene summary...')}
              value={summary}
              onChange={onSummaryChange}
            />
          </div>

          {/* Beats */}
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
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateBeat(idx, e.target.value)
                  }
                />
                <button
                  type="button"
                  aria-label={t('Delete Beat')}
                  onClick={() => deleteBeat(idx)}
                  className={`mt-1 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 ${tc.muted}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Characters */}
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>{t('Active Characters')}</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Alice, Bob"
                value={activeChars}
                onChange={onActiveCharsChange}
              />
            </div>
            <div>
              <label className={labelCls}>{t('Passive Characters')}</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Carol, Dave"
                value={passiveChars}
                onChange={onPassiveCharsChange}
              />
            </div>
          </div>

          {/* Location + Time */}
          <div className={sectionCls}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('Location')}</label>
                <input
                  type="text"
                  className={inputCls}
                  value={location}
                  onChange={onLocationChange}
                />
              </div>
              <div>
                <label className={labelCls}>{t('Time')}</label>
                <input
                  type="text"
                  className={inputCls}
                  value={time}
                  onChange={onTimeChange}
                />
              </div>
            </div>
          </div>

          {/* Color tag */}
          <div className={sectionCls}>
            <label className={labelCls}>{t('Color Tag')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColorTag(null)}
                className={`w-6 h-6 rounded-full border-2 ${colorTag === null ? 'border-brand-500' : tc.border} bg-brand-gray-200 dark:bg-brand-gray-700`}
                aria-label="none"
              />
              {COLOR_TAGS.map((c: string) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorTag(c)}
                  className={`w-6 h-6 rounded-full border-2 ${colorTag === c ? 'border-brand-500' : 'border-transparent'} ${COLOR_SWATCH[c]}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {/* Status */}
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

          {/* Linked Prose */}
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
                  onClick={() => setProseLink(null)}
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

          {/* Causes — list with per-entry delete; Alt+drag on board creates new ones */}
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
                          onClick={() => void onDeleteCause(scene.id, id)}
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
                          onClick={() => void onDeleteCause(id, scene.id)}
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

        {/* Footer */}
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
                  onClick={() => setConfirmDelete(false)}
                  className={`px-3 py-1.5 rounded-md border ${tc.border} ${tc.text} text-sm`}
                >
                  {t('Cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
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
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {t('Save')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
