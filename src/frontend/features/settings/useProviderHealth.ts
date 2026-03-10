// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use provider health unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useEffect, useState, useRef } from 'react';
import { AppSettings } from '../../types';
import { api } from '../../services/api';

type ConnectionStatus = 'idle' | 'success' | 'error' | 'loading';
type ProviderCapabilities = {
  is_multimodal: boolean;
  supports_function_calling: boolean;
};

/**
 * Construct a stable string key from provider connection fields.
 *
 * The value is used for grouping and caching; it must change only when
 * one of the inputs does.  Whitespace is trimmed to avoid accidental
 * duplicates.
 */
export function makeProviderKey(
  baseUrl: string,
  apiKey?: string,
  modelId?: string
): string {
  const b = (baseUrl || '').trim();
  const k = (apiKey || '').trim();
  const m = (modelId || '').trim();
  return `${b}||${k}||${m}`;
}

/**
 * Group active providers by identical runtime configuration.
 *
 * Returns a map from key -> { ids, payload } where ``ids`` is the list of
 * provider identifiers sharing the same baseUrl/apiKey/modelId and ``payload``
 * is the body to send to ``machine.testModel``.  Empty or inactive providers
 * are skipped.
 */
export function groupProviders(
  providers: AppSettings['providers'],
  activeIds: Set<string>
) {
  const groups: Record<
    string,
    {
      ids: string[];
      payload: {
        base_url: string;
        api_key?: string;
        timeout_s: number;
        model_id: string;
      };
    }
  > = {};
  providers.forEach((provider) => {
    if (!activeIds.has(provider.id)) return;
    const modelId = (provider.modelId || '').trim();
    if (!modelId) return;
    const key = makeProviderKey(provider.baseUrl || '', provider.apiKey, modelId);
    if (!groups[key]) {
      groups[key] = {
        ids: [],
        payload: {
          base_url: provider.baseUrl,
          api_key: provider.apiKey,
          timeout_s: Math.round((provider.timeout || 10000) / 1000),
          model_id: modelId,
        },
      };
    }
    groups[key].ids.push(provider.id);
  });
  return groups;
}

export function useProviderHealth(appSettings: AppSettings) {
  const [modelConnectionStatus, setModelConnectionStatus] = useState<
    Record<string, ConnectionStatus>
  >({});
  const [detectedCapabilities, setDetectedCapabilities] = useState<
    Record<string, ProviderCapabilities>
  >({});

  // cache promises for unique baseUrl/apiKey/model combinations.  this
  // prevents duplicate network calls when several providers share the same
  // configuration.  useRef allows the cache to persist across renders.
  const promiseCache = useRef<
    Record<
      string,
      Promise<{
        model_ok: boolean;
        capabilities?: ProviderCapabilities;
      }>
    >
  >({});

  useEffect(() => {
    let cancelled = false;

    const checkProviders = async () => {
      const activeIds = new Set([
        appSettings.activeChatProviderId,
        appSettings.activeWritingProviderId,
        appSettings.activeEditingProviderId,
      ]);

      // only evaluate providers that are currently active in the UI
      const providersToCheck = appSettings.providers.filter((provider) =>
        activeIds.has(provider.id)
      );

      // group providers by key so we only perform one request per unique
      // combination of baseUrl/apiKey/modelId
      const groups: Record<
        string,
        {
          ids: string[];
          payload: {
            base_url: string;
            api_key?: string;
            timeout_s: number;
            model_id: string;
          };
        }
      > = {};

      providersToCheck.forEach((provider) => {
        const modelId = (provider.modelId || '').trim();
        if (!modelId) return; // we'll mark them idle later

        const key = `${provider.baseUrl || ''}||${provider.apiKey || ''}||${modelId}`;
        if (!groups[key]) {
          groups[key] = {
            ids: [],
            payload: {
              base_url: provider.baseUrl,
              api_key: provider.apiKey,
              timeout_s: Math.round((provider.timeout || 10000) / 1000),
              model_id: modelId,
            },
          };
        }
        groups[key].ids.push(provider.id);
      });

      // kick off checks for each group
      await Promise.all(
        Object.entries(groups).map(async ([key, { ids, payload }]) => {
          if (cancelled) return;

          // set all related providers to loading
          ids.forEach((pid) => {
            setModelConnectionStatus((prev) => ({ ...prev, [pid]: 'loading' }));
          });

          let promise = promiseCache.current[key];
          if (!promise) {
            promise = api.machine.testModel(payload);
            promiseCache.current[key] = promise;
          }

          try {
            const result = await promise;
            if (cancelled) return;

            const status: ConnectionStatus = result.model_ok ? 'success' : 'error';
            ids.forEach((pid) => {
              setModelConnectionStatus((prev) => ({ ...prev, [pid]: status }));
            });

            if (result.model_ok && result.capabilities) {
              ids.forEach((pid) => {
                setDetectedCapabilities((prev) => ({
                  ...prev,
                  [pid]: result.capabilities!,
                }));
              });
            }
          } catch {
            if (cancelled) return;
            ids.forEach((pid) => {
              setModelConnectionStatus((prev) => ({ ...prev, [pid]: 'error' }));
            });
          }
        })
      );

      // finally, mark any active providers without a modelId as idle
      // providers without a model ID don’t require a network check; mark idle
      providersToCheck.forEach((provider) => {
        if (!provider.modelId?.trim()) {
          setModelConnectionStatus((prev) => ({ ...prev, [provider.id]: 'idle' }));
        }
      });
    };

    checkProviders();

    return () => {
      cancelled = true;
    };
  }, [
    appSettings.providers,
    appSettings.activeChatProviderId,
    appSettings.activeEditingProviderId,
    appSettings.activeWritingProviderId,
  ]);

  return { modelConnectionStatus, detectedCapabilities };
}
