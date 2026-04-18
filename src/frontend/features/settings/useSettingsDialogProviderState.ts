// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings provider state unit so machine-config sync and provider CRUD stay isolated.
 */

import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { MachineModelConfig, ModelPresetEntry } from '../../services/apiTypes';
import { AppSettings, DEFAULT_LLM_CONFIG, LLMConfig } from '../../types';
import { machineModelToProvider } from './providerAdapter';

interface UseSettingsDialogProviderStateParams {
  isOpen: boolean;
  settings: AppSettings;
}

const resolveProviderId = (
  providers: LLMConfig[],
  fallbackId: string,
  currentId: string | undefined,
  selectedId: string | undefined
): string => {
  if (currentId && providers.some((provider) => provider.id === currentId)) {
    return currentId;
  }
  if (selectedId && providers.some((provider) => provider.id === selectedId)) {
    return selectedId;
  }
  return fallbackId;
};

export function useSettingsDialogProviderState({
  isOpen,
  settings,
}: UseSettingsDialogProviderStateParams) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [modelPresets, setModelPresets] = useState<ModelPresetEntry[]>([]);

  useEffect(() => {
    if (!isOpen) return undefined;

    setLocalSettings(settings);
    setEditingProviderId(settings.activeChatProviderId);

    let cancelled = false;
    (async () => {
      try {
        const [machine, presetsResponse] = await Promise.all([
          api.machine.get(),
          api.machine.getPresets(),
        ]);
        const openai = machine?.openai || {};
        setModelPresets(
          Array.isArray(presetsResponse?.presets) ? presetsResponse.presets : []
        );

        const models = Array.isArray(openai?.models) ? openai.models : [];
        const selectedName = (openai?.selected || '') as string;
        const providers: LLMConfig[] = models
          .filter((model): model is MachineModelConfig =>
            Boolean(model && typeof model === 'object')
          )
          .map((model) => machineModelToProvider(model, DEFAULT_LLM_CONFIG));

        if (cancelled || providers.length === 0) return;

        const fallbackId =
          providers.find((provider) => provider.id === selectedName)?.id ||
          providers[0].id;

        setLocalSettings((prev) => {
          const selectedChat = openai.selected_chat;
          const selectedWriting = openai.selected_writing;
          const selectedEditing = openai.selected_editing;

          const nextChatId = resolveProviderId(
            providers,
            fallbackId,
            prev.activeChatProviderId,
            selectedChat
          );

          setEditingProviderId((currentEditId) => {
            if (
              currentEditId &&
              providers.some((provider) => provider.id === currentEditId)
            ) {
              return currentEditId;
            }
            return nextChatId;
          });

          return {
            ...prev,
            providers,
            activeChatProviderId: nextChatId,
            activeWritingProviderId: resolveProviderId(
              providers,
              fallbackId,
              prev.activeWritingProviderId,
              selectedWriting
            ),
            activeEditingProviderId: resolveProviderId(
              providers,
              fallbackId,
              prev.activeEditingProviderId,
              selectedEditing
            ),
          };
        });
      } catch (error) {
        console.error('Failed to load machine config', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, settings]);

  const addProvider = () => {
    const newProvider: LLMConfig = {
      ...DEFAULT_LLM_CONFIG,
      id: Date.now().toString(),
      name: 'New Provider',
    };

    setLocalSettings((prev) => ({
      ...prev,
      providers: [...prev.providers, newProvider],
      activeChatProviderId: prev.activeChatProviderId || newProvider.id,
      activeWritingProviderId: prev.activeWritingProviderId || newProvider.id,
      activeEditingProviderId: prev.activeEditingProviderId || newProvider.id,
    }));
    setEditingProviderId(newProvider.id);
  };

  const duplicateProvider = (id: string) => {
    setLocalSettings((prev) => {
      const source = prev.providers.find((provider) => provider.id === id);
      if (!source) return prev;

      const newProvider: LLMConfig = {
        ...source,
        id: Date.now().toString(),
        name: `${source.name} (Copy)`,
      };
      setEditingProviderId(newProvider.id);
      return {
        ...prev,
        providers: [...prev.providers, newProvider],
      };
    });
  };

  const updateProvider = (id: string, updates: Partial<LLMConfig>) => {
    setLocalSettings((prev) => ({
      ...prev,
      providers: prev.providers.map((provider) =>
        provider.id === id ? { ...provider, ...updates } : provider
      ),
    }));
  };

  const removeProvider = (id: string) => {
    setLocalSettings((prev) => {
      const remainingProviders = prev.providers.filter(
        (provider) => provider.id !== id
      );
      const fallbackId = remainingProviders[0]?.id || '';

      return {
        ...prev,
        providers: remainingProviders,
        activeChatProviderId:
          prev.activeChatProviderId === id ? fallbackId : prev.activeChatProviderId,
        activeWritingProviderId:
          prev.activeWritingProviderId === id
            ? fallbackId
            : prev.activeWritingProviderId,
        activeEditingProviderId:
          prev.activeEditingProviderId === id
            ? fallbackId
            : prev.activeEditingProviderId,
      };
    });
    setEditingProviderId((current) => (current === id ? null : current));
  };

  return {
    localSettings,
    setLocalSettings,
    editingProviderId,
    setEditingProviderId,
    modelPresets,
    addProvider,
    duplicateProvider,
    updateProvider,
    removeProvider,
  };
}
