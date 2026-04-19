// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings dialog machine state unit so provider synchronization and validation stay isolated from rendering.
 */

import { AppSettings } from '../../types';
import { useSettingsDialogProviderState } from './useSettingsDialogProviderState';
import { useSettingsDialogProviderValidation } from './useSettingsDialogProviderValidation';

interface UseSettingsDialogMachineParams {
  isOpen: boolean;
  settings: AppSettings;
}

/** Custom React hook that manages settings dialog machine. */
export function useSettingsDialogMachine({
  isOpen,
  settings,
}: UseSettingsDialogMachineParams): {
  connectionStatus: Record<string, 'error' | 'idle' | 'success' | 'loading'>;
  modelStatus: Record<string, 'error' | 'idle' | 'success' | 'loading'>;
  modelLists: Record<string, string[]>;
  detectedCapabilities: Record<string, import('../../types').ProviderCapabilities>;
  localSettings: AppSettings;
  setLocalSettings: import('react').Dispatch<
    import('react').SetStateAction<AppSettings>
  >;
  editingProviderId: string | null;
  setEditingProviderId: import('react').Dispatch<
    import('react').SetStateAction<string | null>
  >;
  modelPresets: import('../../services/apiTypes').ModelPresetEntry[];
  addProvider: () => void;
  duplicateProvider: (id: string) => void;
  updateProvider: (
    id: string,
    updates: Partial<import('../../types').LLMConfig>
  ) => void;
  removeProvider: (id: string) => void;
} {
  const providerState = useSettingsDialogProviderState({ isOpen, settings });
  const validationState = useSettingsDialogProviderValidation({
    isOpen,
    providers: providerState.localSettings.providers,
  });

  return {
    ...providerState,
    ...validationState,
  };
}
