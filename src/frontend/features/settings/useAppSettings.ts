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

export function useAppSettings(defaultSettings: AppSettings) {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('augmentedquill_settings');
    const base = defaultSettings;
    if (!saved) return base;

    try {
      const parsed = JSON.parse(saved);
      const merged = { ...base, ...parsed };

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
      return base;
    }
  });

  useEffect(() => {
    const syncWithBackend = async () => {
      try {
        const machine = await api.machine.get();
        const openai = machine?.openai || {};
        const models = Array.isArray(openai?.models) ? openai.models : [];

        if (models.length > 0) {
          const fallbackProvider = defaultSettings.providers[0] as LLMConfig;
          const providers: LLMConfig[] = (models as MachineModelConfig[]).map((model) =>
            machineModelToProvider(model, fallbackProvider)
          );

          startTransition(() =>
            setAppSettings((prev) => {
              const next = { ...prev, providers };
              const selectedName = (openai?.selected || '') as string;
              const selectedChat = (openai?.selected_chat || selectedName) as string;
              const selectedWriting = (openai?.selected_writing ||
                selectedName) as string;
              const selectedEditing = (openai?.selected_editing ||
                selectedName) as string;

              if (
                !next.activeChatProviderId ||
                next.activeChatProviderId === 'default'
              ) {
                if (selectedChat) next.activeChatProviderId = selectedChat;
              }
              if (
                !next.activeWritingProviderId ||
                next.activeWritingProviderId === 'default'
              ) {
                if (selectedWriting) next.activeWritingProviderId = selectedWriting;
              }
              if (
                !next.activeEditingProviderId ||
                next.activeEditingProviderId === 'default'
              ) {
                if (selectedEditing) next.activeEditingProviderId = selectedEditing;
              }

              if (machine?.gui_language) {
                next.guiLanguage = machine.gui_language;
              }

              const exists = (id: string) =>
                providers.some((provider) => provider.id === id);
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
            })
          );
        }
      } catch (error) {
        console.error('Failed to sync settings with backend', error);
      }
    };

    syncWithBackend();
  }, [defaultSettings]);

  useEffect(() => {
    localStorage.setItem('augmentedquill_settings', JSON.stringify(appSettings));
    const targetLanguage = appSettings.guiLanguage || detectBrowserLanguage();
    if (i18n.language !== targetLanguage) {
      i18n.changeLanguage(targetLanguage);
    }
  }, [appSettings]);

  return { appSettings, setAppSettings };
}
