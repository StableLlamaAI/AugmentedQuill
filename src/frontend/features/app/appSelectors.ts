// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines app selectors so App component orchestration stays focused and testable.
 */

import {
  AppSettings,
  ConnectionStatus,
  LLMConfig,
  ProviderCapabilities,
} from '../../types';

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function resolveActiveProviderConfigs(appSettings: AppSettings): {
  activeChatConfig: LLMConfig;
  activeWritingConfig: LLMConfig;
  activeEditingConfig: LLMConfig;
} {
  const fallback = appSettings.providers[0];
  return {
    activeChatConfig:
      appSettings.providers.find((p) => p.id === appSettings.activeChatProviderId) ||
      fallback,
    activeWritingConfig:
      appSettings.providers.find((p) => p.id === appSettings.activeWritingProviderId) ||
      fallback,
    activeEditingConfig:
      appSettings.providers.find((p) => p.id === appSettings.activeEditingProviderId) ||
      fallback,
  };
}

export function resolveRoleAvailability(
  appSettings: AppSettings,
  modelConnectionStatus: Record<string, ConnectionStatus>
): {
  writing: boolean;
  editing: boolean;
  chat: boolean;
} {
  const byId = new Map(
    appSettings.providers.map((provider) => [provider.id, provider])
  );
  const isAvailable = (providerId: string) => {
    const provider = byId.get(providerId);
    if (!provider) return false;
    if (!(provider.modelId || '').trim()) return false;
    return modelConnectionStatus[provider.id] === 'success';
  };

  return {
    writing: isAvailable(appSettings.activeWritingProviderId),
    editing: isAvailable(appSettings.activeEditingProviderId),
    chat: isAvailable(appSettings.activeChatProviderId),
  };
}

export function supportsImageActions(
  appSettings: AppSettings,
  detectedCapabilities: Record<string, ProviderCapabilities>,
  modelConnectionStatus: Record<string, ConnectionStatus>
): boolean {
  const activeChatProvider = appSettings.providers.find(
    (provider) => provider.id === appSettings.activeChatProviderId
  );
  if (!activeChatProvider) return false;
  if (modelConnectionStatus[activeChatProvider.id] !== 'success') return false;

  if (activeChatProvider.isMultimodal === true) return true;
  if (activeChatProvider.isMultimodal === false) return false;

  return !!detectedCapabilities[activeChatProvider.id]?.is_multimodal;
}
