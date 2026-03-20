// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the model selector unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Eye, Wand2, AlertTriangle, Loader2 } from 'lucide-react';
import { LLMConfig, AppTheme } from '../../types';
import { useThemeClasses } from '../layout/ThemeContext';

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onSelectorClick?: () => void;
  options: LLMConfig[];
  label: string;
  theme: AppTheme;
  connectionStatus?: Record<string, 'idle' | 'success' | 'error' | 'loading'>;
  detectedCapabilities?: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  labelColorClass?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  onSelectorClick,
  options,
  label,
  theme,
  connectionStatus = {},
  detectedCapabilities = {},
  labelColorClass = 'text-brand-gray-500',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLight } = useThemeClasses();

  const selectedOption = options.find((o) => o.id === value);

  // If the provided value (ID) is not in our current options (e.g., after duplication or name change),
  // but we find an option with the same name, we should probably switch to that ID.
  // This helps when the backend/dialog uses names as IDs but the UI uses stable IDs or vice-versa.
  useEffect(() => {
    if (value && options.length > 0 && !selectedOption) {
      // Try finding by name if ID mismatch (common if names are used as human-readable IDs in some places)
      const byName = options.find((o) => o.name === value);
      if (byName && byName.id !== value) {
        onChange(byName.id);
      }
    }
  }, [value, options, selectedOption, onChange]);

  const activeOption = selectedOption || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getStatusIcon = (id: string) => {
    const status = connectionStatus[id] || 'idle';
    if (status === 'loading')
      return <Loader2 size={10} className="animate-spin text-brand-500" />;
    if (status === 'success')
      return <div className="w-2 h-2 rounded-full bg-emerald-500" />;
    if (status === 'error') return <div className="w-2 h-2 rounded-full bg-red-500" />;
    return (
      <div className="w-2 h-2 rounded-full bg-brand-gray-300 dark:bg-brand-gray-700" />
    );
  };

  const hasCapability = (
    opt: LLMConfig,
    cap: 'isMultimodal' | 'supportsFunctionCalling',
    detectedKey: 'is_multimodal' | 'supports_function_calling'
  ) => {
    if (opt[cap] === true) return true;
    if (opt[cap] === false) return false;
    // Auto (null/undefined)
    return !!detectedCapabilities[opt.id]?.[detectedKey];
  };

  return (
    <div className="flex flex-col justify-center relative" ref={containerRef}>
      <div className="flex items-center space-x-1 mb-0.5">
        <label
          className={`text-[8px] font-bold uppercase leading-none ${labelColorClass}`}
        >
          {label}
        </label>
        {activeOption &&
          hasCapability(activeOption, 'isMultimodal', 'is_multimodal') && (
            <Eye size={8} className={labelColorClass} title="Multimodal" />
          )}
        {activeOption &&
          hasCapability(
            activeOption,
            'supportsFunctionCalling',
            'supports_function_calling'
          ) && <Wand2 size={8} className={labelColorClass} title="Function Calling" />}
        {label === 'Writing' && activeOption?.writingWarning && (
          <AlertTriangle
            size={8}
            className="text-amber-500"
            title={activeOption.writingWarning}
          />
        )}
      </div>

      <button
        onClick={() => {
          onSelectorClick?.();
          setIsOpen(!isOpen);
        }}
        className={`text-[10px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer w-24 flex items-center justify-start font-medium truncate ${
          isLight
            ? 'text-brand-gray-600 hover:text-brand-gray-900'
            : 'text-brand-gray-300 hover:text-brand-gray-100'
        }`}
        title={`Selected: ${activeOption?.name}`}
      >
        {getStatusIcon(value)}
        <span className="truncate ml-1">{activeOption?.name || 'Select...'}</span>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-1 w-48 rounded-md shadow-lg border z-50 max-h-60 overflow-y-auto ${
            isLight
              ? 'bg-white border-brand-gray-200'
              : 'bg-brand-gray-900 border-brand-gray-700'
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center justify-between group ${
                value === opt.id
                  ? isLight
                    ? 'bg-brand-50 text-brand-900'
                    : 'bg-brand-900/50 text-brand-100'
                  : isLight
                    ? 'hover:bg-brand-gray-50'
                    : 'hover:bg-brand-gray-800'
              }`}
            >
              <div className="flex flex-col truncate pr-2">
                <span
                  className={`font-medium truncate ${isLight ? 'text-brand-gray-700' : 'text-brand-gray-200'}`}
                >
                  {opt.name}
                </span>
                <div className="flex items-center space-x-1 mt-0.5">
                  {hasCapability(opt, 'isMultimodal', 'is_multimodal') && (
                    <span className="flex items-center text-[9px] text-brand-gray-400">
                      <Eye size={8} className="mr-0.5" /> Vision
                    </span>
                  )}
                  {hasCapability(
                    opt,
                    'supportsFunctionCalling',
                    'supports_function_calling'
                  ) && (
                    <span className="flex items-center text-[9px] text-brand-gray-400">
                      <Wand2 size={8} className="mr-0.5" /> Fn
                    </span>
                  )}
                  {label === 'Writing' && opt.writingWarning && (
                    <span
                      className="flex items-center text-[9px] text-amber-500"
                      title={opt.writingWarning}
                    >
                      <AlertTriangle size={8} className="mr-0.5" /> Warn
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center">{getStatusIcon(opt.id)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
