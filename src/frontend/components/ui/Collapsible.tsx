// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Headless collapsible primitive that centralises controlled/uncontrolled
 * expand-collapse state so collapsible components share one implementation.
 */

import { useState, useCallback } from 'react';

export interface CollapsibleState {
  /** Whether the section is currently expanded. */
  isExpanded: boolean;
  /** Flip the expanded state. */
  toggle: () => void;
  /** Explicitly set the expanded state. */
  setIsExpanded: (expanded: boolean) => void;
}

/**
 * Headless hook for controlled/uncontrolled collapsible state.
 *
 * In uncontrolled mode, pass no arguments and use the returned state.
 * In controlled mode, pass `isExpanded` and `onExpandedChange` and the hook
 * becomes a thin adapter — its `toggle` calls `onExpandedChange`.
 *
 * @param defaultExpanded  Initial expanded state (uncontrolled mode only).
 * @param isExpandedProp   Controlled expanded value (opt).
 * @param onExpandedChange Controlled change handler (opt).
 */
export function useCollapsible(
  defaultExpanded: boolean = false,
  isExpandedProp?: boolean,
  onExpandedChange?: (expanded: boolean) => void
): CollapsibleState {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = isExpandedProp !== undefined;
  const isExpanded = isControlled ? (isExpandedProp as boolean) : internalExpanded;

  const toggle = useCallback(() => {
    const next = !isExpanded;
    if (onExpandedChange) onExpandedChange(next);
    if (!isControlled) setInternalExpanded(next);
  }, [isExpanded, isControlled, onExpandedChange]);

  const setIsExpanded = useCallback(
    (expanded: boolean) => {
      if (onExpandedChange) onExpandedChange(expanded);
      if (!isControlled) setInternalExpanded(expanded);
    },
    [isControlled, onExpandedChange]
  );

  return { isExpanded, toggle, setIsExpanded };
}
