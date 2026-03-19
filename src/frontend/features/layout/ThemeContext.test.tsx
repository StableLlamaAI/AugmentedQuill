// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Tests for useThemeClasses() to verify correct class tokens per theme.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useThemeClasses } from './ThemeContext';

describe('useThemeClasses', () => {
  it('returns light-mode class tokens for "light" theme', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider currentTheme="light">{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeClasses(), { wrapper });

    expect(result.current.isLight).toBe(true);
    expect(result.current.bg).toBe('bg-white');
    expect(result.current.text).toBe('text-brand-gray-900');
    expect(result.current.border).toBe('border-brand-gray-200');
    expect(result.current.input).toBe('bg-white');
    expect(result.current.card).toBe('bg-brand-gray-50');
    expect(result.current.surface).toBe('bg-brand-gray-50');
    expect(result.current.muted).toBe('text-brand-gray-600');
  });

  it('returns dark-mode class tokens for "mixed" theme', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider currentTheme="mixed">{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeClasses(), { wrapper });

    expect(result.current.isLight).toBe(false);
    expect(result.current.bg).toBe('bg-brand-gray-900');
    expect(result.current.text).toBe('text-brand-gray-100');
    expect(result.current.border).toBe('border-brand-gray-800');
    expect(result.current.input).toBe('bg-brand-gray-950/50');
    expect(result.current.card).toBe('bg-brand-gray-800');
    expect(result.current.surface).toBe('bg-brand-gray-900');
    expect(result.current.muted).toBe('text-brand-gray-400');
  });

  it('returns dark-mode class tokens for "dark" theme', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider currentTheme="dark">{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeClasses(), { wrapper });

    expect(result.current.isLight).toBe(false);
    expect(result.current.bg).toBe('bg-brand-gray-900');
  });
});
