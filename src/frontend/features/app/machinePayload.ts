// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Converts AppSettings into the machine-config payload shape expected
 * by the backend API. Pure transformation; no React dependencies.
 */

import { AppSettings } from '../../types';
import { providerToMachineModel } from '../settings/providerAdapter';

export function buildMachinePayload(settings: AppSettings) {
  const providers = settings.providers || [];
  const activeChat =
    providers.find((provider) => provider.id === settings.activeChatProviderId) ||
    providers[0];
  const activeWriting =
    providers.find((provider) => provider.id === settings.activeWritingProviderId) ||
    providers[0];
  const activeEditing =
    providers.find((provider) => provider.id === settings.activeEditingProviderId) ||
    providers[0];

  return {
    gui_language: settings.guiLanguage,
    openai: {
      selected: activeChat?.name || '',
      selected_chat: activeChat?.name || '',
      selected_writing: activeWriting?.name || '',
      selected_editing: activeEditing?.name || '',
      models: providers.map(providerToMachineModel),
    },
  };
}
