// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Centralize conversion between backend machine-model payloads and
 * frontend provider configs so settings logic remains consistent.
 */

import { LLMConfig } from '../../types';
import { MachineModelConfig } from '../../services/apiTypes';

export const normalizeProviderPrompts = (
  prompts?: Record<string, string> | null,
  fallback?: LLMConfig['prompts']
): LLMConfig['prompts'] => {
  const base = fallback || { system: '', continuation: '', summary: '' };
  const incoming = prompts || {};
  return {
    ...base,
    ...incoming,
    system: incoming.system ?? base.system,
    continuation: incoming.continuation ?? base.continuation,
    summary: incoming.summary ?? base.summary,
  };
};

export const toPromptOverrides = (
  prompts?: Record<string, string> | null
): Record<string, string> | undefined => {
  const cleaned = Object.fromEntries(
    Object.entries(prompts || {}).filter(
      ([, value]: [string, string]) => String(value || '').trim() !== ''
    )
  );
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

export const machineModelToProvider = (
  model: MachineModelConfig,
  fallbackProvider: LLMConfig
): LLMConfig => {
  const name = String(model.name || '').trim() || fallbackProvider.name;
  const timeoutS = Number(model.timeout_s ?? 60);

  return {
    ...fallbackProvider,
    id: name,
    name,
    baseUrl: String(model.base_url || '').trim(),
    apiKey: String(model.api_key || ''),
    timeout: Number.isFinite(timeoutS) ? Math.max(1, timeoutS) * 1000 : 60000,
    modelId: String(model.model || '').trim(),
    contextWindowTokens:
      model.context_window_tokens === null || model.context_window_tokens === undefined
        ? undefined
        : Number(model.context_window_tokens),
    temperature:
      model.temperature === null || model.temperature === undefined
        ? fallbackProvider.temperature
        : Number(model.temperature),
    topP:
      model.top_p === null || model.top_p === undefined
        ? fallbackProvider.topP
        : Number(model.top_p),
    maxTokens:
      model.max_tokens === null || model.max_tokens === undefined
        ? fallbackProvider.maxTokens
        : Number(model.max_tokens),
    presencePenalty:
      model.presence_penalty === null || model.presence_penalty === undefined
        ? fallbackProvider.presencePenalty
        : Number(model.presence_penalty),
    frequencyPenalty:
      model.frequency_penalty === null || model.frequency_penalty === undefined
        ? fallbackProvider.frequencyPenalty
        : Number(model.frequency_penalty),
    stop: Array.isArray(model.stop)
      ? model.stop.map((entry: string) => String(entry))
      : [],
    seed:
      model.seed === null || model.seed === undefined ? undefined : Number(model.seed),
    topK:
      model.top_k === null || model.top_k === undefined
        ? undefined
        : Number(model.top_k),
    minP:
      model.min_p === null || model.min_p === undefined
        ? undefined
        : Number(model.min_p),
    extraBody: String(model.extra_body || ''),
    presetId: model.preset_id || null,
    writingWarning: model.writing_warning || null,
    isMultimodal: model.is_multimodal === null ? undefined : model.is_multimodal,
    supportsFunctionCalling:
      model.supports_function_calling === null
        ? undefined
        : model.supports_function_calling,
    prompts: normalizeProviderPrompts(model.prompt_overrides, fallbackProvider.prompts),
  };
};

export const providerToMachineModel = (provider: LLMConfig): MachineModelConfig => ({
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
  is_multimodal: provider.isMultimodal ?? undefined,
  supports_function_calling: provider.supportsFunctionCalling ?? undefined,
  prompt_overrides: toPromptOverrides(provider.prompts),
});
