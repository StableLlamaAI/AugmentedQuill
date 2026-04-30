// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings machine unit so this responsibility stays isolated, testable, and easy to evolve.
 * Delegates list rendering to ProviderListPanel and form rendering to ProviderConfigForm.
 */

import React from 'react';
import { AppTheme, AppSettings, LLMConfig } from '../../../types';
import { useThemeClasses } from '../../layout/ThemeContext';
import { ModelPresetEntry } from '../../../services/apiTypes';
import { ProviderListPanel } from './ProviderListPanel';
import { ProviderConfigForm } from './ProviderConfigForm';

interface SettingsMachineProps {
  localSettings: AppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  editingProviderId: string | null;
  setEditingProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  connectionStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  modelStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  detectedCapabilities: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  modelLists: Record<string, string[]>;
  modelPresets: ModelPresetEntry[];
  theme: AppTheme;
  defaultPrompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  onAddProvider: () => void;
  onDuplicateProvider: (id: string) => void;
  onUpdateProvider: (id: string, updates: Partial<LLMConfig>) => void;
  onRemoveProvider: (id: string) => void;
}

export const SettingsMachine: React.FC<SettingsMachineProps> = ({
  localSettings,
  setLocalSettings,
  editingProviderId,
  setEditingProviderId,
  connectionStatus,
  modelStatus,
  detectedCapabilities,
  modelLists,
  modelPresets,
  theme,
  defaultPrompts,
  onAddProvider,
  onDuplicateProvider,
  onUpdateProvider,
  onRemoveProvider,
}: SettingsMachineProps) => {
  const { isLight } = useThemeClasses();

  const activeProvider = localSettings.providers.find(
    (p: LLMConfig): boolean => p.id === editingProviderId
  );
  const isActiveProviderAvailable =
    !!activeProvider &&
    !!(activeProvider.modelId || '').trim() &&
    modelStatus[activeProvider.id] === 'success';

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6 min-h-0">
        <ProviderListPanel
          providers={localSettings.providers}
          editingProviderId={editingProviderId}
          activeWritingProviderId={localSettings.activeWritingProviderId}
          activeEditingProviderId={localSettings.activeEditingProviderId}
          activeChatProviderId={localSettings.activeChatProviderId}
          connectionStatus={connectionStatus}
          modelStatus={modelStatus}
          detectedCapabilities={detectedCapabilities}
          isLight={isLight}
          onSelectProvider={setEditingProviderId}
          onAddProvider={onAddProvider}
          onDuplicateProvider={onDuplicateProvider}
        />
        <ProviderConfigForm
          activeProvider={activeProvider}
          isActiveProviderAvailable={isActiveProviderAvailable}
          activeWritingProviderId={localSettings.activeWritingProviderId}
          activeEditingProviderId={localSettings.activeEditingProviderId}
          activeChatProviderId={localSettings.activeChatProviderId}
          connectionStatus={connectionStatus}
          modelStatus={modelStatus}
          detectedCapabilities={detectedCapabilities}
          modelLists={modelLists}
          modelPresets={modelPresets}
          theme={theme}
          defaultPrompts={defaultPrompts}
          isLight={isLight}
          onSetActiveWritingProvider={(id: string) =>
            setLocalSettings((s: AppSettings) => ({
              ...s,
              activeWritingProviderId: id,
            }))
          }
          onSetActiveEditingProvider={(id: string) =>
            setLocalSettings((s: AppSettings) => ({
              ...s,
              activeEditingProviderId: id,
            }))
          }
          onSetActiveChatProvider={(id: string) =>
            setLocalSettings((s: AppSettings) => ({ ...s, activeChatProviderId: id }))
          }
          onUpdateProvider={onUpdateProvider}
          onRemoveProvider={onRemoveProvider}
        />
      </div>
    </div>
  );
};

export default SettingsMachine;
