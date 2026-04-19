// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Wraps the save-settings flow so App.tsx doesn't own the undo/redo
 * entry creation or the API call for machine config persistence.
 */

import { Dispatch, SetStateAction, useCallback } from 'react';
import { api } from '../../services/api';
import { AppSettings } from '../../types';
import { buildMachinePayload } from './machinePayload';

type UseSettingsPersistenceParams = {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  pushExternalHistoryEntry: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  refreshHealth: () => void;
};

/** Custom React hook that manages settings persistence. */
export function useSettingsPersistence({
  appSettings,
  setAppSettings,
  pushExternalHistoryEntry,
  refreshHealth,
}: UseSettingsPersistenceParams): {
  handleSaveSettings: (nextSettings: AppSettings) => Promise<void>;
} {
  const handleSaveSettings = useCallback(
    async (nextSettings: AppSettings) => {
      const previousSettings = structuredClone(appSettings);
      const nextSettingsSnapshot = structuredClone(nextSettings);
      const previousPayload = buildMachinePayload(previousSettings);
      const nextPayload = buildMachinePayload(nextSettingsSnapshot);

      await api.machine.save(nextPayload);
      setAppSettings(nextSettingsSnapshot);
      refreshHealth();

      pushExternalHistoryEntry({
        label: 'Update machine settings',
        onUndo: async () => {
          await api.machine.save(previousPayload);
          setAppSettings(previousSettings);
          refreshHealth();
        },
        onRedo: async () => {
          await api.machine.save(nextPayload);
          setAppSettings(nextSettingsSnapshot);
          refreshHealth();
        },
      });
    },
    [appSettings, pushExternalHistoryEntry, setAppSettings, refreshHealth]
  );

  return { handleSaveSettings };
}
