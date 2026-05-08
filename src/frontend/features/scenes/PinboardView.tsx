// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Infinite-canvas pinboard for scenes.
 * Supports pan (middle-mouse or space+drag), zoom (wheel), free-position cards,
 * Ctrl+drag to create order constraints between scenes, and multi-card
 * selection via Ctrl+click, Shift+click, and lasso drag.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../../types';
import type { ProseDropData } from './types';
import { SceneCard } from './SceneCard';
import { ConstraintArrows } from './ConstraintArrows';
import { useTheme } from '../layout/ThemeContext';

/** Approximate card width matching Tailwind w-48 = 192 px. */
const CARD_WIDTH = 192;
/** Approximate card height used for lasso hit-testing. */
const CARD_APPROX_HEIGHT = 130;

interface LassoRect {
  /** All values are in screen-space pixels relative to the container element. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PinboardViewProps {
  scenes: Scene[];
  /**
   * The single "primary" scene to treat as selected on initial render and
   * whenever the editor cursor sync drives selection from the outside.  The
   * pinboard manages its own extended multi-selection state internally and
   * only calls back with the primary scene id.
   */
  primarySelectedSceneId: string | null;
  /** Called with the primary scene id whenever selection changes. */
  onSelectScene: (id: string | null) => void;
  onMoveScene: (sceneId: string, x: number, y: number) => void;
  onEditScene: (sceneId: string) => void;
  onCreateConstraint: (fromId: string, toId: string) => void;
  onDropProse?: (sceneId: string, data: ProseDropData) => void;
  /** Called whenever the internal multi-selection set changes (including plain single-click). */
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
}

export const PinboardView: React.FC<PinboardViewProps> = ({
  scenes,
  primarySelectedSceneId,
  onSelectScene,
  onMoveScene,
  onEditScene,
  onCreateConstraint,
  onDropProse,
  onSelectionChange,
}: PinboardViewProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Keep refs in sync so async handlers always have current values.
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // ---- Multi-selection state ----
  const [selectedSceneIds, setSelectedSceneIds] = useState<ReadonlySet<string>>(
    primarySelectedSceneId ? new Set([primarySelectedSceneId]) : new Set()
  );
  // Anchor for shift-range-select: the last scene that was primary-clicked.
  const anchorIdRef = useRef<string | null>(primarySelectedSceneId);

  // When the external primary selection changes (driven by editor cursor sync),
  // reset internal multi-selection to just that one scene.
  const prevPrimaryRef = useRef(primarySelectedSceneId);
  useEffect(() => {
    if (primarySelectedSceneId === prevPrimaryRef.current) return;
    prevPrimaryRef.current = primarySelectedSceneId;
    setSelectedSceneIds(
      primarySelectedSceneId ? new Set([primarySelectedSceneId]) : new Set()
    );
    anchorIdRef.current = primarySelectedSceneId;
  }, [primarySelectedSceneId]);

  // Notify parent whenever the full selection set changes so it can update
  // multi-highlights in the editor.
  useEffect((): void => {
    onSelectionChange?.(selectedSceneIds);
  }, [selectedSceneIds, onSelectionChange]);

  // ---- Lasso selection overlay ----
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);

  // Constraint drag state
  const constraintSourceRef = useRef<string | null>(null);
  const [constraintTarget, setConstraintTarget] = useState<string | null>(null);

  // Pan via middle-mouse
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const handleWheel = useCallback((e: WheelEvent): void => {
    e.preventDefault();
    setZoom((prev: number) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      return Math.min(3, Math.max(0.3, prev + delta));
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ---- Card multi-selection handler ----
  // Called by SceneCard.onSelect with the native MouseEvent so modifier keys
  // are accessible.
  const handleCardSelect = useCallback(
    (sceneId: string, e: MouseEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && !shift) {
        // Ctrl+click: toggle this card in the selection.
        setSelectedSceneIds((prev: ReadonlySet<string>) => {
          const next = new Set(prev);
          if (next.has(sceneId)) {
            next.delete(sceneId);
          } else {
            next.add(sceneId);
          }
          return next;
        });
        anchorIdRef.current = sceneId;
        prevPrimaryRef.current = sceneId; // prevent useEffect reset
        onSelectScene(sceneId);
      } else if (shift) {
        // Shift+click: extend selection from anchor to this card by scenes-array order.
        const anchorIdx = scenes.findIndex(
          (s: Scene) => s.id === (anchorIdRef.current ?? sceneId)
        );
        const clickIdx = scenes.findIndex((s: Scene) => s.id === sceneId);
        if (anchorIdx === -1 || clickIdx === -1) {
          setSelectedSceneIds(new Set([sceneId]));
          anchorIdRef.current = sceneId;
          prevPrimaryRef.current = sceneId; // prevent useEffect reset
          onSelectScene(sceneId);
          return;
        }
        const lo = Math.min(anchorIdx, clickIdx);
        const hi = Math.max(anchorIdx, clickIdx);
        const rangeIds = scenes.slice(lo, hi + 1).map((s: Scene) => s.id);
        setSelectedSceneIds((prev: ReadonlySet<string>) => {
          const next = new Set(prev);
          rangeIds.forEach((id: string) => next.add(id));
          return next;
        });
        // Anchor stays; only update primary callback.
        prevPrimaryRef.current = sceneId; // prevent useEffect reset
        onSelectScene(sceneId);
      } else {
        // Plain click: select only this card.
        setSelectedSceneIds(new Set([sceneId]));
        anchorIdRef.current = sceneId;
        prevPrimaryRef.current = sceneId; // prevent useEffect reset
        onSelectScene(sceneId);
      }
    },
    [scenes, onSelectScene]
  );

  // ---- Background click / lasso drag ----
  // Clicking the canvas div (the transform layer that covers the full viewport)
  // means the user clicked empty background.  SceneCard calls stopPropagation on
  // mousedown, so this only fires when no card was hit.
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0 || e.altKey) return;

    const containerEl = containerRef.current;
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();

    const startX = e.clientX - containerRect.left;
    const startY = e.clientY - containerRect.top;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;

    let dragged = false;

    const onMove = (me: MouseEvent): void => {
      const curX = me.clientX - containerRect.left;
      const curY = me.clientY - containerRect.top;
      if (!dragged && Math.abs(curX - startX) + Math.abs(curY - startY) > 4) {
        dragged = true;
      }
      if (dragged) {
        setLassoRect({ x1: startX, y1: startY, x2: curX, y2: curY });
      }
    };

    const onUp = (me: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setLassoRect(null);

      if (dragged) {
        // Convert lasso corners from screen-space (relative to container) into
        // canvas space by undoing the pan+zoom transform.
        const curX = me.clientX - containerRect.left;
        const curY = me.clientY - containerRect.top;
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const toCanvas = (sx: number, sy: number): { cx: number; cy: number } => ({
          cx: (sx - currentPan.x) / currentZoom,
          cy: (sy - currentPan.y) / currentZoom,
        });
        const tl = toCanvas(Math.min(startX, curX), Math.min(startY, curY));
        const br = toCanvas(Math.max(startX, curX), Math.max(startY, curY));

        const inLasso = scenes
          .filter(
            (s: Scene) =>
              s.pinboard_x < br.cx &&
              s.pinboard_x + CARD_WIDTH > tl.cx &&
              s.pinboard_y < br.cy &&
              s.pinboard_y + CARD_APPROX_HEIGHT > tl.cy
          )
          .map((s: Scene) => s.id);

        if (additive) {
          setSelectedSceneIds((prev: ReadonlySet<string>) => {
            const next = new Set(prev);
            inLasso.forEach((id: string) => next.add(id));
            return next;
          });
        } else {
          setSelectedSceneIds(new Set(inLasso));
        }
        const primary = inLasso[0] ?? null;
        if (primary) anchorIdRef.current = primary;
        prevPrimaryRef.current = primary; // prevent useEffect reset
        onSelectScene(primary);
      } else {
        // Plain click on background: clear selection.
        if (!additive) {
          setSelectedSceneIds(new Set());
          anchorIdRef.current = null;
          prevPrimaryRef.current = null; // prevent useEffect reset
          onSelectScene(null);
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };

      const onMove = (me: MouseEvent): void => {
        if (!isPanning.current) return;
        setPan({
          x: panStart.current.panX + (me.clientX - panStart.current.mouseX),
          y: panStart.current.panY + (me.clientY - panStart.current.mouseY),
        });
      };
      const onUp = (): void => {
        isPanning.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
  };

  // Constraint drag
  const handleConstraintDragStart = (sceneId: string): void => {
    constraintSourceRef.current = sceneId;
    setConstraintTarget(null);

    const onUp = (): void => {
      if (constraintSourceRef.current && constraintTarget !== null) {
        onCreateConstraint(constraintSourceRef.current, constraintTarget);
      }
      constraintSourceRef.current = null;
      setConstraintTarget(null);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mouseup', onUp);
  };

  const handleConstraintDrop = (targetId: string): void => {
    if (constraintSourceRef.current && constraintSourceRef.current !== targetId) {
      setConstraintTarget(targetId);
    }
  };

  const bgClass = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-950';
  const dotColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none ${bgClass}`}
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
      }}
      onMouseDown={handleMouseDown}
      aria-label={t('Pinboard')}
      role="region"
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          type="button"
          aria-label={t('Zoom In')}
          onClick={() => setZoom((z: number) => Math.min(3, z + 0.2))}
          className="w-7 h-7 rounded-md border border-brand-gray-300 dark:border-brand-gray-700 bg-white dark:bg-brand-gray-800 text-brand-gray-700 dark:text-brand-gray-200 text-sm font-bold hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700 flex items-center justify-center shadow-sm"
        >
          +
        </button>
        <button
          type="button"
          aria-label={t('Zoom Out')}
          onClick={() => setZoom((z: number) => Math.max(0.3, z - 0.2))}
          className="w-7 h-7 rounded-md border border-brand-gray-300 dark:border-brand-gray-700 bg-white dark:bg-brand-gray-800 text-brand-gray-700 dark:text-brand-gray-200 text-sm font-bold hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700 flex items-center justify-center shadow-sm"
        >
          −
        </button>
        <button
          type="button"
          aria-label={t('Reset Zoom')}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="w-7 h-7 rounded-md border border-brand-gray-300 dark:border-brand-gray-700 bg-white dark:bg-brand-gray-800 text-brand-gray-700 dark:text-brand-gray-200 text-xs hover:bg-brand-gray-100 dark:hover:bg-brand-gray-700 flex items-center justify-center shadow-sm"
        >
          ↺
        </button>
      </div>

      {/* Canvas — covers the full viewport; direct clicks (not on a card) deselect */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          inset: 0,
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        {/* Constraint arrows drawn under the cards */}
        <ConstraintArrows scenes={scenes} />

        {scenes.map((scene: Scene, idx: number) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            index={idx}
            onMove={onMoveScene}
            onSelect={handleCardSelect}
            onEdit={onEditScene}
            onConstraintDragStart={handleConstraintDragStart}
            onConstraintDrop={handleConstraintDrop}
            isConstraintTarget={constraintTarget === scene.id}
            isSelected={selectedSceneIds.has(scene.id)}
            onDropProse={onDropProse}
          />
        ))}
      </div>

      {/* Lasso selection rectangle overlay — rendered in screen space */}
      {lassoRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: Math.min(lassoRect.x1, lassoRect.x2),
            top: Math.min(lassoRect.y1, lassoRect.y2),
            width: Math.abs(lassoRect.x2 - lassoRect.x1),
            height: Math.abs(lassoRect.y2 - lassoRect.y1),
            border: '1.5px dashed #6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.07)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
};
