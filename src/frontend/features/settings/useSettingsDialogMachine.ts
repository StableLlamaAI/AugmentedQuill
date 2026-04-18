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

export function useSettingsDialogMachine({
  isOpen,
  settings,
}: UseSettingsDialogMachineParams) {
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
