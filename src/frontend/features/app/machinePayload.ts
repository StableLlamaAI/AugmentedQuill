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
      models: providers.map((provider) => ({
        name: (provider.name || '').trim(),
        base_url: (provider.baseUrl || '').trim(),
        api_key: provider.apiKey || '',
        timeout_s: Math.max(1, Math.round((provider.timeout || 10000) / 1000)),
        model: (provider.modelId || '').trim(),
        context_window_tokens: provider.contextWindowTokens,
        temperature: provider.temperature,
        top_p: provider.topP,
        max_tokens: provider.maxTokens,
        presence_penalty: provider.presencePenalty,
        frequency_penalty: provider.frequencyPenalty,
        stop: provider.stop || [],
        seed: provider.seed,
        top_k: provider.topK,
        min_p: provider.minP,
        extra_body: provider.extraBody || '',
        preset_id: provider.presetId || undefined,
        writing_warning: provider.writingWarning || undefined,
        is_multimodal: provider.isMultimodal,
        supports_function_calling: provider.supportsFunctionCalling,
        prompt_overrides: provider.prompts || undefined,
      })),
    },
  };
}
