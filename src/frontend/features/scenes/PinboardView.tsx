// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Infinite-canvas pinboard for scenes.
 * Supports pan (middle-mouse or space+drag), zoom (wheel), free-position cards,
 * and Ctrl+drag to create order constraints between scenes.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../../types';
import type { ProseDropData } from './types';
import { SceneCard } from './SceneCard';
import { ConstraintArrows } from './ConstraintArrows';
import { useTheme } from '../layout/ThemeContext';

interface PinboardViewProps {
  scenes: Scene[];
  selectedSceneId: string | null;
  onSelectScene: (id: string | null) => void;
  onMoveScene: (sceneId: string, x: number, y: number) => void;
  onEditScene: (sceneId: string) => void;
  onCreateConstraint: (fromId: string, toId: string) => void;
  onDropProse?: (sceneId: string, data: ProseDropData) => void;
}

export const PinboardView: React.FC<PinboardViewProps> = ({
  scenes,
  selectedSceneId,
  onSelectScene,
  onMoveScene,
  onEditScene,
  onCreateConstraint,
  onDropProse,
}: PinboardViewProps) => {
  const { t } = useTranslation();
  const { isLight } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

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

  // Clicking the canvas div (the transform layer that covers the full viewport)
  // means the user clicked empty background.  SceneCard calls stopPropagation on
  // mousedown, so this only fires when no card was hit.
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget && e.button === 0 && !e.altKey) {
      onSelectScene(null);
    }
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
            onSelect={onSelectScene}
            onEdit={onEditScene}
            onConstraintDragStart={handleConstraintDragStart}
            onConstraintDrop={handleConstraintDrop}
            isConstraintTarget={constraintTarget === scene.id}
            isSelected={selectedSceneId === scene.id}
            onDropProse={onDropProse}
          />
        ))}
      </div>
    </div>
  );
};
