// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use editor preferences unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useEffect, useState } from 'react';
import { AppTheme, EditorSettings } from '../../types';

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 18,
  maxWidth: 60,
  brightness: 0.95,
  contrast: 0.9,
  theme: 'mixed',
  sidebarWidth: 320,
  showDiff: true,
};

/** Custom React hook that manages editor preferences. */
export function useEditorPreferences(): {
  editorSettings: EditorSettings;
  setEditorSettings: import('react').Dispatch<
    import('react').SetStateAction<EditorSettings>
  >;
  currentTheme: AppTheme;
  isLight: boolean;
} {
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    const saved = localStorage.getItem('augmentedquill_editor_settings');
    if (!saved) return DEFAULT_EDITOR_SETTINGS;
    try {
      return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_EDITOR_SETTINGS;
    }
  });

  useEffect((): void => {
    localStorage.setItem(
      'augmentedquill_editor_settings',
      JSON.stringify(editorSettings)
    );
  }, [editorSettings]);

  const currentTheme: AppTheme = editorSettings.theme || 'mixed';
  const isLight = currentTheme === 'light';

  useEffect((): void => {
    // Tailwind `dark:` utilities are activated by the `dark` class.
    // Mixed mode should behave like dark mode in the UI, so we map
    // both `dark` and `mixed` to the same body class while preserving
    // the raw theme value in the hook return value.
    document.body.className = isLight ? 'light' : 'dark';
  }, [isLight]);

  return { editorSettings, setEditorSettings, currentTheme, isLight };
}
