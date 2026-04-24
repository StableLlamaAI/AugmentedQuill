// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for HeaderAppearanceControls escape key behavior.
 */

// @vitest-environment jsdom

import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { HeaderAppearanceControls } from './HeaderAppearanceControls';

describe('HeaderAppearanceControls', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('closes on Escape when panel is open', () => {
    const localRef = React.createRef<HTMLDivElement>();

    const Wrapper: React.FC = () => {
      const [isAppearanceOpen, setIsAppearanceOpen] = useState(true);

      return (
        <HeaderAppearanceControls
          appearanceRef={localRef}
          isAppearanceOpen={isAppearanceOpen}
          setIsAppearanceOpen={setIsAppearanceOpen}
          isLight={true}
          textMain="text-brand-gray-900"
          buttonActive="bg-blue-500 text-white"
          currentTheme="light"
          setAppTheme={() => {}}
          editorSettings={{
            brightness: 1,
            contrast: 1,
            fontSize: 16,
            maxWidth: 80,
            sidebarWidth: 320,
            theme: 'light',
            showDiff: true,
          }}
          setEditorSettings={() => {}}
          sliderClass=""
          setIsDebugLogsOpen={() => {}}
        />
      );
    };

    render(<Wrapper />);

    expect(screen.getByRole('dialog', { name: /Page Appearance/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /Page Appearance/i })).toBeNull();
  });

  it('uses a dynamic max for the sidebar width slider based on window width', () => {
    const localRef = React.createRef<HTMLDivElement>();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1600,
    });

    const Wrapper: React.FC = () => {
      const [isAppearanceOpen, setIsAppearanceOpen] = useState(true);
      const [settings, setSettings] = useState({
        brightness: 1,
        contrast: 1,
        fontSize: 16,
        maxWidth: 80,
        sidebarWidth: 320,
        theme: 'light',
        showDiff: true,
      });

      return (
        <HeaderAppearanceControls
          appearanceRef={localRef}
          isAppearanceOpen={isAppearanceOpen}
          setIsAppearanceOpen={setIsAppearanceOpen}
          isLight={true}
          textMain="text-brand-gray-900"
          buttonActive="bg-blue-500 text-white"
          currentTheme="light"
          setAppTheme={() => {}}
          editorSettings={settings}
          setEditorSettings={setSettings}
          sliderClass=""
          setIsDebugLogsOpen={() => {}}
        />
      );
    };

    render(<Wrapper />);

    const sliders = screen.getAllByRole('slider');
    const sidebarSlider = sliders[sliders.length - 1] as HTMLInputElement;
    expect(sidebarSlider.getAttribute('max')).toBe('800');

    window.innerWidth = 1200;
    fireEvent(window, new Event('resize'));

    expect(sidebarSlider.getAttribute('max')).toBe('600');
  });
});
