// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * SVG overlay that draws bezier arrows between scene cards to represent order constraints.
 * Rendered as a sibling of the card container inside the pinboard canvas.
 */

import React from 'react';
import type { Scene } from '../../types';
import { useTheme } from '../layout/ThemeContext';

const CARD_WIDTH = 192; // matches w-48 (12rem × 16px)
const CARD_HEIGHT = 80; // approximate half-height for center calculation

type Arrow = { x1: number; y1: number; x2: number; y2: number; key: string };

interface ConstraintArrowsProps {
  scenes: Scene[];
}

export const ConstraintArrows: React.FC<ConstraintArrowsProps> = ({
  scenes,
}: ConstraintArrowsProps) => {
  const { isLight } = useTheme();
  const color = isLight ? '#6366f1' : '#818cf8'; // indigo-500 / indigo-400

  // Build a lookup from id → position
  const byId = new Map<string, Scene>(scenes.map((s: Scene) => [s.id, s]));

  const arrows: Arrow[] = [];

  for (const scene of scenes) {
    for (const beforeId of scene.order_before) {
      const target = byId.get(beforeId);
      if (!target) continue;
      arrows.push({
        key: `${scene.id}->${beforeId}`,
        x1: scene.pinboard_x + CARD_WIDTH / 2,
        y1: scene.pinboard_y + CARD_HEIGHT / 2,
        x2: target.pinboard_x + CARD_WIDTH / 2,
        y2: target.pinboard_y + CARD_HEIGHT / 2,
      });
    }
  }

  if (arrows.length === 0) return null;

  // Compute bounding box for the SVG so it only covers needed area
  const allX = arrows.flatMap((a: Arrow) => [a.x1, a.x2]);
  const allY = arrows.flatMap((a: Arrow) => [a.y1, a.y2]);
  const maxX = Math.max(...allX) + 20;
  const maxY = Math.max(...allY) + 20;

  return (
    <svg
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
      width={maxX}
      height={maxY}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill={color} />
        </marker>
      </defs>
      {arrows.map((a: Arrow) => {
        const cx = (a.x1 + a.x2) / 2;
        const cy1 = a.y1;
        const cy2 = a.y2;
        return (
          <path
            key={a.key}
            d={`M ${a.x1} ${a.y1} C ${cx} ${cy1}, ${cx} ${cy2}, ${a.x2} ${a.y2}`}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="5,4"
            markerEnd="url(#arrowhead)"
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
};
