// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Collapsible sidebar section with a drag-to-resize handle.
 *
 * Extracted from AppMainLayout to give this distinct component its own file.
 */

import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  height?: number;
  onHeightChange?: (height: number) => void;
  isLast?: boolean;
  isLight?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isCollapsed,
  onToggle,
  children,
  height,
  onHeightChange,
  isLast,
  isLight,
}: CollapsibleSectionProps) => {
  const [isResizing, setIsResizing] = useState(false);
  const [minHeaderHeight, setMinHeaderHeight] = useState(50);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const heightRef = useRef<number | undefined>(height);
  const startTopRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const applyHeight = (value: number) => {
    const clamped = Math.max(minHeaderHeight, value);
    if (sectionRef.current) {
      sectionRef.current.style.height = `${clamped}px`;
    }
  };

  const updateMinHeight = useCallback(() => {
    if (!headerRef.current) return;
    const h = Math.round(headerRef.current.getBoundingClientRect().height);
    setMinHeaderHeight(Math.max(50, h));
  }, []);

  useEffect(() => {
    updateMinHeight();
    window.addEventListener('resize', updateMinHeight);
    return () => window.removeEventListener('resize', updateMinHeight);
  }, [updateMinHeight]);

  const startResizing = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    startTopRef.current = sectionRef.current?.getBoundingClientRect().top ?? null;
  };

  const stopResizing = useCallback(() => {
    if (isResizing && onHeightChange && heightRef.current) {
      onHeightChange(Math.max(minHeaderHeight, heightRef.current));
    }
    setIsResizing(false);
    startTopRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [isResizing, minHeaderHeight, onHeightChange]);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !sectionRef.current || !onHeightChange) return;
      const top = startTopRef.current ?? sectionRef.current.getBoundingClientRect().top;
      const newHeight = Math.max(minHeaderHeight, e.clientY - top);
      heightRef.current = newHeight;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (!isResizing) return;
        applyHeight(newHeight);
      });
    },
    [isResizing, minHeaderHeight, onHeightChange]
  );

  useEffect(() => {
    if (!sectionRef.current) return;

    // Keep min-height in sync with what the header actually renders as.
    sectionRef.current.style.minHeight = `${minHeaderHeight}px`;

    if (isCollapsed) {
      sectionRef.current.style.height = '';
      return;
    }

    if (!isResizing && typeof height === 'number') {
      applyHeight(height);
      heightRef.current = height;
    }
  }, [height, isCollapsed, isResizing, minHeaderHeight]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  const borderClass = isLight ? 'border-brand-gray-200' : 'border-brand-gray-800';
  const headerBg = isLight ? 'bg-brand-gray-100/50' : 'bg-brand-gray-800/30';
  const textColor = isLight ? 'text-brand-gray-600' : 'text-brand-gray-400';

  const resizerBase = isLight ? 'bg-brand-gray-200/18' : 'bg-brand-gray-800/20';
  const resizerHover = isLight
    ? 'hover:bg-brand-gray-300/30'
    : 'hover:bg-brand-gray-700/30';
  const resizerActive = isLight ? 'bg-brand-gray-300/38' : 'bg-brand-gray-700/38';

  const gripDefault = isLight ? 'text-amber-500' : 'text-amber-400';
  const gripActive = isLight ? 'text-amber-600' : 'text-rose-300';

  const sectionId = useId();
  const contentId = `${sectionId}-content`;

  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleResizerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!sectionRef.current) return;
    const currentHeight = sectionRef.current.getBoundingClientRect().height;
    const step = 10;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(minHeaderHeight, currentHeight - step);
      applyHeight(next);
      heightRef.current = next;
      onHeightChange?.(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(minHeaderHeight, currentHeight + step);
      applyHeight(next);
      heightRef.current = next;
      onHeightChange?.(next);
    }
  };

  return (
    <div
      ref={sectionRef}
      className={`flex flex-col overflow-hidden ${isLast ? 'flex-1' : ''} ${!isLast ? `border-b ${borderClass}` : ''}`}
      style={!isLast && !isCollapsed && height ? { height: `${height}px` } : {}}
    >
      <button
        ref={headerRef}
        id={`${sectionId}-header`}
        type="button"
        className={`flex items-center justify-between px-4 py-2 cursor-pointer select-none shrink-0 ${headerBg}`}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight size={16} className={textColor} />
          ) : (
            <ChevronDown size={16} className={textColor} />
          )}
          <h2
            className={`text-[11px] font-bold uppercase tracking-widest ${textColor}`}
          >
            {title}
          </h2>
        </div>
      </button>
      {!isCollapsed && (
        <div id={contentId} className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      )}
      {!isLast && !isCollapsed && (
        <button
          type="button"
          className={`h-1.5 w-full flex items-center justify-center transition-colors shrink-0 group ${resizerBase} ${resizerHover} ${isResizing ? resizerActive : ''}`}
          style={{ cursor: 'row-resize' }}
          onMouseDown={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.preventDefault();
            startResizing(e);
          }}
          onKeyDown={handleResizerKeyDown}
          tabIndex={0}
          aria-label={`Resize ${title} section`}
          aria-valuemin={minHeaderHeight}
          aria-valuemax={Math.max(minHeaderHeight, height ?? minHeaderHeight)}
          aria-valuenow={
            sectionRef.current?.getBoundingClientRect().height ??
            height ??
            minHeaderHeight
          }
          aria-orientation="horizontal"
          role="slider"
        >
          <GripHorizontal
            size={12}
            className={`${isResizing ? gripActive : gripDefault} opacity-70 group-hover:opacity-100 transition-opacity`}
          />
        </button>
      )}
    </div>
  );
};
