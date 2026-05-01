// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the header appearance controls unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bug,
  LayoutTemplate,
  Monitor,
  Moon,
  Palette,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Sun,
  Type,
  X,
} from 'lucide-react';

import { useFocusTrap } from '../layout/useFocusTrap';
import { Button } from '../../components/ui/Button';
import { AppTheme, EditorSettings } from '../../types';

type HeaderAppearanceControlsProps = {
  appearanceRef: RefObject<HTMLDivElement | null>;
  isAppearanceOpen: boolean;
  setIsAppearanceOpen: (v: boolean) => void;
  isLight: boolean;
  textMain: string;
  buttonActive: string;
  currentTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  editorSettings: EditorSettings;
  setEditorSettings: React.Dispatch<React.SetStateAction<EditorSettings>>;
  sliderClass: string;
  setIsDebugLogsOpen: (v: boolean) => void;
};

const DEFAULT_SIDEBAR_WIDTH_MAX = 600;
const SIDEBAR_MIN_EDITOR_WIDTH = 320;

const getDynamicSidebarWidthMax = (windowWidth: number): number => {
  const availableWidth = Math.max(0, windowWidth - SIDEBAR_MIN_EDITOR_WIDTH);
  const halfWidth = Math.floor(windowWidth * 0.5);
  return Math.max(DEFAULT_SIDEBAR_WIDTH_MAX, Math.min(halfWidth, availableWidth));
};

// eslint-disable-next-line max-lines-per-function
export const HeaderAppearanceControls: React.FC<HeaderAppearanceControlsProps> = ({
  appearanceRef,
  isAppearanceOpen,
  setIsAppearanceOpen,
  isLight,
  textMain,
  buttonActive,
  currentTheme,
  setAppTheme,
  editorSettings,
  setEditorSettings,
  sliderClass,
  setIsDebugLogsOpen,
}: HeaderAppearanceControlsProps) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isAppearanceOpen, panelRef, (): void => setIsAppearanceOpen(false));

  const [windowWidth, setWindowWidth] = useState<number>((): number =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  const sidebarWidthMax = useMemo(
    (): number => getDynamicSidebarWidthMax(windowWidth),
    [windowWidth]
  );

  useEffect((): (() => void) | undefined => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = (): void => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect((): void => {
    if (editorSettings.sidebarWidth > sidebarWidthMax) {
      setEditorSettings((prev: EditorSettings) => ({
        ...prev,
        sidebarWidth: sidebarWidthMax,
      }));
    }
  }, [editorSettings.sidebarWidth, sidebarWidthMax, setEditorSettings]);

  const renderSlider = (
    icon: React.ReactNode,
    label: string,
    valueDisplay: string,
    min: string,
    max: string,
    step: string | undefined,
    value: number,
    onChange: (val: number) => void
  ): import('react/jsx-runtime').JSX.Element => (
    <div className="space-y-2">
      <div className={`flex justify-between items-center text-sm ${textMain}`}>
        <span className="flex items-center gap-2">
          {icon} {label}
        </span>
        <span className="font-mono text-xs text-brand-gray-500">{valueDisplay}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        {...(step ? { step } : {})}
        value={value}
        onChange={(
          event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
        ): void => onChange(Number(event.target.value))}
        className={sliderClass}
      />
    </div>
  );

  const renderToggle = (
    label: string,
    enabled: boolean,
    onChange: (enabled: boolean) => void
  ): import('react/jsx-runtime').JSX.Element => (
    <div className="space-y-2">
      <div className={`flex justify-between items-center text-sm ${textMain}`}>
        <span>{label}</span>
      </div>
      <div className="flex rounded-lg overflow-hidden border border-brand-gray-700">
        <button
          type="button"
          onClick={(): void => onChange(true)}
          className={`flex-1 py-1.5 text-xs font-medium ${
            enabled
              ? buttonActive
              : isLight
                ? 'bg-brand-gray-100 text-brand-gray-500 hover:text-brand-gray-700'
                : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-gray-300'
          }`}
        >
          Enabled
        </button>
        <button
          type="button"
          onClick={(): void => onChange(false)}
          className={`flex-1 py-1.5 text-xs font-medium ${
            !enabled
              ? buttonActive
              : isLight
                ? 'bg-brand-gray-100 text-brand-gray-500 hover:text-brand-gray-700'
                : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-gray-300'
          }`}
        >
          Disabled
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={appearanceRef}>
      <Button
        theme={currentTheme}
        variant={isAppearanceOpen ? 'secondary' : 'ghost'}
        size="sm"
        onClick={(): void => setIsAppearanceOpen(!isAppearanceOpen)}
        icon={<SlidersHorizontal size={16} />}
        title={t('Page Appearance')}
        className="hidden sm:inline-flex"
      />

      {isAppearanceOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="page-appearance-title"
          className={`absolute top-full right-0 mt-2 w-80 border rounded-lg shadow-2xl p-5 z-50 ${
            isLight
              ? 'bg-brand-gray-50 border-brand-gray-200'
              : 'bg-brand-gray-900 border-brand-gray-700'
          }`}
        >
          <div
            className={`flex justify-between items-center mb-4 border-b pb-2 ${
              isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
            }`}
          >
            <h3
              id="page-appearance-title"
              className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider"
            >
              {t('Page Appearance')}
            </h3>
            <button
              onClick={(): void => setIsAppearanceOpen(false)}
              className="text-brand-gray-500 hover:text-brand-gray-400"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <div className={`flex justify-between items-center text-sm ${textMain}`}>
                <span className="flex items-center gap-2">
                  <Palette size={14} /> Design Mode
                </span>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-brand-gray-700">
                <button
                  onClick={(): void => setAppTheme('light')}
                  className={`flex-1 py-1.5 text-xs font-medium flex justify-center items-center gap-1 ${
                    currentTheme === 'light'
                      ? buttonActive
                      : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-gray-300'
                  }`}
                >
                  <Sun size={12} /> Light
                </button>
                <button
                  onClick={(): void => setAppTheme('mixed')}
                  className={`flex-1 py-1.5 text-xs font-medium flex justify-center items-center gap-1 ${
                    currentTheme === 'mixed'
                      ? buttonActive
                      : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-gray-300'
                  }`}
                >
                  <LayoutTemplate size={12} /> Mixed
                </button>
                <button
                  onClick={(): void => setAppTheme('dark')}
                  className={`flex-1 py-1.5 text-xs font-medium flex justify-center items-center gap-1 ${
                    currentTheme === 'dark'
                      ? buttonActive
                      : 'bg-brand-gray-800 text-brand-gray-400 hover:text-brand-gray-300'
                  }`}
                >
                  <Moon size={12} /> Dark
                </button>
              </div>
            </div>
            {renderSlider(
              <Sun size={14} />,
              'Brightness',
              `${Math.round(editorSettings.brightness * 100)}%`,
              '50',
              '100',
              undefined,
              editorSettings.brightness * 100,
              (val: number) =>
                setEditorSettings({ ...editorSettings, brightness: val / 100 })
            )}
            {renderSlider(
              <Moon size={14} />,
              'Contrast',
              `${Math.round(editorSettings.contrast * 100)}%`,
              '50',
              '100',
              undefined,
              editorSettings.contrast * 100,
              (val: number) =>
                setEditorSettings({ ...editorSettings, contrast: val / 100 })
            )}
            {renderSlider(
              <Type size={14} />,
              'Font Size',
              `${editorSettings.fontSize}px`,
              '12',
              '32',
              undefined,
              editorSettings.fontSize,
              (val: number) => setEditorSettings({ ...editorSettings, fontSize: val })
            )}
            {renderSlider(
              <Monitor size={14} />,
              'Line Width',
              `${editorSettings.maxWidth}ch`,
              '40',
              '100',
              undefined,
              editorSettings.maxWidth,
              (val: number) => setEditorSettings({ ...editorSettings, maxWidth: val })
            )}
            {renderSlider(
              <SplitSquareHorizontal size={14} />,
              'Sidebar Width',
              `${editorSettings.sidebarWidth}px`,
              '200',
              `${sidebarWidthMax}`,
              '10',
              editorSettings.sidebarWidth,
              (val: number) =>
                setEditorSettings({ ...editorSettings, sidebarWidth: val })
            )}
            {renderToggle('Diff View', editorSettings.showDiff, (enabled: boolean) =>
              setEditorSettings({ ...editorSettings, showDiff: enabled })
            )}
          </div>
        </div>
      )}
      <Button
        theme={currentTheme}
        variant="ghost"
        size="sm"
        onClick={(): void => setIsDebugLogsOpen(true)}
        title={t('Debug Logs')}
        className="mr-1"
      >
        <Bug size={18} />
      </Button>
    </div>
  );
};
