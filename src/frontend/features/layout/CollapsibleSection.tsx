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
  const {
    sectionRef,
    headerRef,
    isResizing,
    minHeaderHeight,
    startResizing,
    handleResizerKeyDown,
  } = useCollapsibleSectionResize({
    height,
    isCollapsed,
    onHeightChange,
  });

  const {
    borderClass,
    headerBg,
    textColor,
    resizerBase,
    resizerHover,
    resizerActive,
    gripDefault,
    gripActive,
  } = getCollapsibleSectionClassNames(isLight, isResizing);

  const sectionId = useId();
  const contentId = `${sectionId}-content`;

  const handleHeaderKeyDown = getHeaderKeyDownHandler(onToggle);

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
          onMouseDown={startResizing}
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

interface CollapsibleSectionResizeParams {
  height?: number;
  isCollapsed: boolean;
  onHeightChange?: (height: number) => void;
}

interface CollapsibleSectionResizeResult {
  sectionRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLButtonElement | null>;
  isResizing: boolean;
  minHeaderHeight: number;
  startResizing: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  handleResizerKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

function useCollapsibleSectionResize(
  params: CollapsibleSectionResizeParams
): CollapsibleSectionResizeResult {
  const { height, isCollapsed, onHeightChange } = params;
  const [isResizing, setIsResizing] = useState(false);
  const [minHeaderHeight, setMinHeaderHeight] = useState(50);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const heightRef = useRef<number | undefined>(height);
  const startTopRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const applyHeight = useCallback(
    (next: number): void => {
      const clamped = Math.max(minHeaderHeight, next);
      if (sectionRef.current) {
        sectionRef.current.style.height = `${clamped}px`;
      }
    },
    [minHeaderHeight]
  );

  const updateMinHeight = useCallback((): void => {
    if (!headerRef.current) return;
    const headerHeight = Math.round(headerRef.current.getBoundingClientRect().height);
    setMinHeaderHeight(Math.max(50, headerHeight));
  }, []);

  useEffect((): (() => void) => {
    updateMinHeight();
    window.addEventListener('resize', updateMinHeight);
    return (): void => window.removeEventListener('resize', updateMinHeight);
  }, [updateMinHeight]);

  const startResizing = useCallback(
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);
      startTopRef.current = sectionRef.current?.getBoundingClientRect().top ?? null;
    },
    []
  );

  const stopResizing = useCallback((): void => {
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
    (e: MouseEvent): void => {
      if (!isResizing || !sectionRef.current || !onHeightChange) return;
      const top = startTopRef.current ?? sectionRef.current.getBoundingClientRect().top;
      const nextHeight = Math.max(minHeaderHeight, e.clientY - top);
      heightRef.current = nextHeight;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame((): void => {
        rafRef.current = null;
        if (!isResizing) return;
        applyHeight(nextHeight);
      });
    },
    [applyHeight, isResizing, minHeaderHeight, onHeightChange]
  );

  useEffect((): void => {
    if (!sectionRef.current) return;

    sectionRef.current.style.minHeight = `${minHeaderHeight}px`;

    if (isCollapsed) {
      sectionRef.current.style.height = '';
      return;
    }

    if (!isResizing && typeof height === 'number') {
      applyHeight(height);
      heightRef.current = height;
    }
  }, [height, isCollapsed, isResizing, minHeaderHeight, applyHeight]);

  useEffect((): (() => void) => {
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

    return (): void => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  const handleResizerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (!sectionRef.current) return;
      const currentHeight = sectionRef.current.getBoundingClientRect().height;
      const step = 10;

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
        return;
      }

      e.preventDefault();
      const next = Math.max(
        minHeaderHeight,
        currentHeight + (e.key === 'ArrowUp' ? -step : step)
      );
      applyHeight(next);
      heightRef.current = next;
      onHeightChange?.(next);
    },
    [applyHeight, minHeaderHeight, onHeightChange]
  );

  return {
    sectionRef,
    headerRef,
    isResizing,
    minHeaderHeight,
    startResizing,
    handleResizerKeyDown,
  };
}

const getCollapsibleSectionClassNames = (
  isLight?: boolean,
  _isResizing?: boolean
): {
  borderClass: string;
  headerBg: string;
  textColor: string;
  resizerBase: string;
  resizerHover: string;
  resizerActive: string;
  gripDefault: string;
  gripActive: string;
} => {
  const isLightTheme = Boolean(isLight);

  return {
    borderClass: isLightTheme ? 'border-brand-gray-200' : 'border-brand-gray-800',
    headerBg: isLightTheme ? 'bg-brand-gray-100/50' : 'bg-brand-gray-800/30',
    textColor: isLightTheme ? 'text-brand-gray-600' : 'text-brand-gray-400',
    resizerBase: isLightTheme ? 'bg-brand-gray-200/18' : 'bg-brand-gray-800/20',
    resizerHover: isLightTheme
      ? 'hover:bg-brand-gray-300/30'
      : 'hover:bg-brand-gray-700/30',
    resizerActive: isLightTheme ? 'bg-brand-gray-300/38' : 'bg-brand-gray-700/38',
    gripDefault: isLightTheme ? 'text-amber-500' : 'text-amber-400',
    gripActive: isLightTheme ? 'text-amber-600' : 'text-rose-300',
  };
};

const getHeaderKeyDownHandler =
  (onToggle: () => void): ((e: React.KeyboardEvent<HTMLButtonElement>) => void) =>
  (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
