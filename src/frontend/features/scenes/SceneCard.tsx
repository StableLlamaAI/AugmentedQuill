// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Draggable scene card for the Pinboard view.
 * Supports free positioning, color tags, and Ctrl+drag to create order constraints.
 */

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, SceneBeat } from '../../types';
import type { ProseDropData } from './types';
import { useTheme } from '../layout/ThemeContext';

// Color tag palette — matches tailwind classes so purge doesn't strip them.
const COLOR_TAG_CLASSES: Record<string, { bg: string; border: string }> = {
  red: {
    bg: 'bg-red-100 dark:bg-red-900/40',
    border: 'border-red-400 dark:border-red-600',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    border: 'border-orange-400 dark:border-orange-600',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/40',
    border: 'border-yellow-400 dark:border-yellow-600',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/40',
    border: 'border-green-400 dark:border-green-600',
  },
  teal: {
    bg: 'bg-teal-100 dark:bg-teal-900/40',
    border: 'border-teal-400 dark:border-teal-600',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    border: 'border-blue-400 dark:border-blue-600',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    border: 'border-purple-400 dark:border-purple-600',
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-900/40',
    border: 'border-pink-400 dark:border-pink-600',
  },
};

const DEFAULT_CARD = {
  bg: 'bg-white dark:bg-brand-gray-800',
  border: 'border-brand-gray-200 dark:border-brand-gray-700',
};

interface SceneCardProps {
  scene: Scene;
  index: number;
  /** Called when the user finishes dragging to a new position. */
  onMove: (sceneId: string, x: number, y: number) => void;
  /** Called on single click to select this card. */
  onSelect: (sceneId: string) => void;
  /** Called on double-click to open the editor. */
  onEdit: (sceneId: string) => void;
  /** Called when Ctrl+drag starts – provides the source scene id. */
  onConstraintDragStart: (sceneId: string) => void;
  /** Called when Ctrl+drag ends over this card – provides the target scene id. */
  onConstraintDrop: (targetSceneId: string) => void;
  /** Whether this card is the target of an ongoing constraint drag. */
  isConstraintTarget: boolean;
  /** Whether this card is currently selected. */
  isSelected: boolean;
  /** Called when prose text is dropped onto this card. */
  onDropProse?: (sceneId: string, data: ProseDropData) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  onMove,
  onSelect,
  onEdit,
  onConstraintDragStart,
  onConstraintDrop,
  isConstraintTarget,
  isSelected,
  onDropProse,
}: SceneCardProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();

  const colorKey = scene.color_tag ?? '';
  const colorClasses = COLOR_TAG_CLASSES[colorKey] ?? DEFAULT_CARD;

  // ---------- drag state ----------
  const dragStart = useRef<{
    mouseX: number;
    mouseY: number;
    cardX: number;
    cardY: number;
  } | null>(null);
  const moved = useRef(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+drag → constraint mode
      onConstraintDragStart(scene.id);
      return;
    }

    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardX: scene.pinboard_x,
      cardY: scene.pinboard_y,
    };
    moved.current = false;

    const onMouseMove = (me: MouseEvent): void => {
      if (!dragStart.current) return;
      const dx = me.clientX - dragStart.current.mouseX;
      const dy = me.clientY - dragStart.current.mouseY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      // Optimistically move the card via CSS while dragging (parent handles final position)
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-scene-card]');
      if (el) {
        el.style.left = `${dragStart.current.cardX + dx}px`;
        el.style.top = `${dragStart.current.cardY + dy}px`;
      }
    };

    const onMouseUp = (me: MouseEvent): void => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (dragStart.current && moved.current) {
        const dx = me.clientX - dragStart.current.mouseX;
        const dy = me.clientY - dragStart.current.mouseY;
        const newX = Math.max(0, dragStart.current.cardX + dx);
        const newY = Math.max(0, dragStart.current.cardY + dy);
        onMove(scene.id, newX, newY);
      } else if (!moved.current) {
        onSelect(scene.id);
      }
      dragStart.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleMouseEnter = (e: React.MouseEvent): void => {
    if (e.buttons === 1 && (e.ctrlKey || e.metaKey)) {
      onConstraintDrop(scene.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onEdit(scene.id);
  };

  const handleDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('application/aq-prose-selection')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
    }
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/aq-prose-selection');
    if (!raw || !onDropProse) return;
    try {
      const data = JSON.parse(raw) as ProseDropData;
      onDropProse(scene.id, data);
    } catch {
      // ignore malformed data
    }
  };

  const statusDot =
    scene.status === 'active'
      ? 'bg-green-400'
      : scene.status === 'draft'
        ? 'bg-yellow-400'
        : 'bg-brand-gray-400';

  const hasStaleLink =
    scene.prose_link?.is_stale ||
    scene.beats.some((b: SceneBeat) => b.prose_link?.is_stale);

  return (
    <div
      data-scene-card={scene.id}
      role="button"
      tabIndex={0}
      aria-label={t('Scene {{index}}', { index: index + 1 })}
      onKeyDown={(e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') onEdit(scene.id);
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ left: scene.pinboard_x, top: scene.pinboard_y }}
      className={[
        'absolute w-48 min-h-16 rounded-lg border-2 shadow-md cursor-grab active:cursor-grabbing select-none',
        'transition-shadow hover:shadow-lg',
        colorClasses.bg,
        isConstraintTarget
          ? 'ring-2 ring-brand-500'
          : isSelected
            ? 'ring-2 ring-brand-400 ' + colorClasses.border
            : colorClasses.border,
        scene.status === 'inactive' ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* color stripe at top */}
      {colorKey && (
        <div
          className={`h-1.5 rounded-t-md ${colorClasses.border.replace('border-', 'bg-').split(' ')[0]}`}
        />
      )}

      <div className="p-3">
        {/* status dot + stale warning */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`}
            title={t('Scene status')}
          />
          {hasStaleLink && (
            <span
              className={`text-xs font-semibold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}
              title={t('Stale (file changed externally)')}
            >
              ⚠
            </span>
          )}
        </div>

        {/* summary */}
        <p
          className={`text-sm font-medium leading-snug line-clamp-3 ${isLight ? 'text-brand-gray-900' : 'text-brand-gray-100'}`}
        >
          {scene.summary || t('Scene {{index}}', { index: index + 1 })}
        </p>

        {/* beats count */}
        {scene.beats.length > 0 && (
          <p
            className={`text-xs mt-1.5 ${isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}`}
          >
            {scene.beats.length} {t('Beats').toLowerCase()}
          </p>
        )}

        {/* characters */}
        {scene.active_characters.length > 0 && (
          <p
            className={`text-xs mt-0.5 truncate ${isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}`}
          >
            {scene.active_characters.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
};
