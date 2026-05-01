// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use app settings unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useEffect, useState, startTransition } from 'react';
import i18n, { detectBrowserLanguage } from '../app/i18n';
import { AppSettings, LLMConfig } from '../../types';
import { api } from '../../services/api';
import { MachineModelConfig } from '../../services/apiTypes';
import { machineModelToProvider } from './providerAdapter';

function loadSavedAppSettings(defaultSettings: AppSettings): AppSettings {
  const saved = localStorage.getItem('augmentedquill_settings');
  if (!saved) return defaultSettings;

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...defaultSettings, ...parsed };

    if (parsed.activeStoryProviderId && !parsed.activeWritingProviderId) {
      merged.activeWritingProviderId = parsed.activeStoryProviderId;
      merged.activeEditingProviderId = parsed.activeStoryProviderId;
    }
    if (parsed.activeProviderId && !parsed.activeChatProviderId) {
      merged.activeChatProviderId = parsed.activeProviderId;
      merged.activeWritingProviderId = parsed.activeProviderId;
      merged.activeEditingProviderId = parsed.activeProviderId;
    }

    return merged;
  } catch {
    return defaultSettings;
  }
}

function applyMachineOpenAISelection(
  prev: AppSettings,
  providers: LLMConfig[],
  selectedName: string,
  selectedChat: string,
  selectedWriting: string,
  selectedEditing: string,
  guiLanguage?: string
): AppSettings {
  const next = { ...prev, providers };

  if (!next.activeChatProviderId || next.activeChatProviderId === 'default') {
    if (selectedChat) next.activeChatProviderId = selectedChat;
  }
  if (!next.activeWritingProviderId || next.activeWritingProviderId === 'default') {
    if (selectedWriting) next.activeWritingProviderId = selectedWriting;
  }
  if (!next.activeEditingProviderId || next.activeEditingProviderId === 'default') {
    if (selectedEditing) next.activeEditingProviderId = selectedEditing;
  }

  if (guiLanguage) {
    next.guiLanguage = guiLanguage;
  }

  const exists = (id: string): boolean =>
    providers.some((provider: LLMConfig): boolean => provider.id === id);

  if (!exists(next.activeChatProviderId)) {
    next.activeChatProviderId = providers[0].id;
  }
  if (!exists(next.activeWritingProviderId)) {
    next.activeWritingProviderId = providers[0].id;
  }
  if (!exists(next.activeEditingProviderId)) {
    next.activeEditingProviderId = providers[0].id;
  }

  return next;
}

/** Custom React hook that manages app settings. */
export function useAppSettings(defaultSettings: AppSettings): {
  appSettings: AppSettings;
  setAppSettings: import('react').Dispatch<import('react').SetStateAction<AppSettings>>;
} {
  const [appSettings, setAppSettings] = useState<AppSettings>(() =>
    loadSavedAppSettings(defaultSettings)
  );

  useEffect((): void => {
    const syncWithBackend = async (): Promise<void> => {
      try {
        const machine = await api.machine.get();
        const openai = machine?.openai || {};
        const models = Array.isArray(openai?.models) ? openai.models : [];

        if (models.length > 0) {
          const fallbackProvider = defaultSettings.providers[0] as LLMConfig;
          const providers: LLMConfig[] = (models as MachineModelConfig[]).map(
            (model: MachineModelConfig): LLMConfig =>
              machineModelToProvider(model, fallbackProvider)
          );

          const selectedName = (openai?.selected || '') as string;
          const selectedChat = (openai?.selected_chat || selectedName) as string;
          const selectedWriting = (openai?.selected_writing || selectedName) as string;
          const selectedEditing = (openai?.selected_editing || selectedName) as string;

          startTransition((): void =>
            setAppSettings((prev: AppSettings) =>
              applyMachineOpenAISelection(
                prev,
                providers,
                selectedName,
                selectedChat,
                selectedWriting,
                selectedEditing,
                machine?.gui_language ?? undefined
              )
            )
          );
        }
      } catch (error) {
        console.error('Failed to sync settings with backend', error);
      }
    };

    syncWithBackend();
  }, [defaultSettings]);

  useEffect((): void => {
    localStorage.setItem('augmentedquill_settings', JSON.stringify(appSettings));
    const targetLanguage =
      appSettings.guiLanguage || detectBrowserLanguage() || undefined;
    if (i18n.language !== targetLanguage) {
      i18n.changeLanguage(targetLanguage);
    }
  }, [appSettings]);

  return { appSettings, setAppSettings };
}
