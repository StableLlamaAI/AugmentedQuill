// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use provider health unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useCallback, useEffect, useRef, useState, startTransition } from 'react';
import { AppSettings, ConnectionStatus, ProviderCapabilities } from '../../types';
import { api } from '../../services/api';

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
): Record<
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
> {
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
  providers.forEach((provider: import('../../types').LLMConfig) => {
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

/** Custom React hook that manages provider health. */
export function useProviderHealth(appSettings: AppSettings): {
  modelConnectionStatus: Record<string, ConnectionStatus>;
  detectedCapabilities: Record<string, ProviderCapabilities>;
  refreshHealth: () => void;
  recheckUnavailableProviderIfStale: (
    providerId: string,
    minAgeMs?: number
  ) => Promise<void>;
} {
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
  const lastCheckedAt = useRef<Record<string, number>>({});

  const setStatusForProviderIds = useCallback(
    (providerIds: string[], status: ConnectionStatus) => {
      providerIds.forEach((providerId: string) => {
        setModelConnectionStatus((prev: Record<string, ConnectionStatus>) => ({
          ...prev,
          [providerId]: status,
        }));
      });
    },
    []
  );

  const markChecked = useCallback((providerIds: string[]) => {
    const now = Date.now();
    providerIds.forEach((providerId: string) => {
      lastCheckedAt.current[providerId] = now;
    });
  }, []);

  const refreshHealth = () => {
    promiseCache.current = {};
  };

  const recheckUnavailableProviderIfStale = useCallback(
    async (providerId: string, minAgeMs: number = 5000) => {
      if (!providerId) return;

      const status = modelConnectionStatus[providerId] || 'idle';
      if (status !== 'error') return;

      const lastCheck = lastCheckedAt.current[providerId] || 0;
      if (Date.now() - lastCheck < minAgeMs) return;

      const provider = appSettings.providers.find(
        (entry: import('../../types').LLMConfig) => entry.id === providerId
      );
      if (!provider) return;

      const modelId = (provider.modelId || '').trim();
      if (!modelId) {
        setStatusForProviderIds([provider.id], 'idle');
        markChecked([provider.id]);
        return;
      }

      const activeIds = new Set([
        appSettings.activeChatProviderId,
        appSettings.activeWritingProviderId,
        appSettings.activeEditingProviderId,
      ]);
      const groupedProviders = groupProviders(appSettings.providers, activeIds);
      const key = makeProviderKey(provider.baseUrl || '', provider.apiKey, modelId);
      const relatedProviderIds = groupedProviders[key]?.ids || [provider.id];
      const payload = groupedProviders[key]?.payload || {
        base_url: provider.baseUrl,
        api_key: provider.apiKey,
        timeout_s: Math.round((provider.timeout || 10000) / 1000),
        model_id: modelId,
      };

      // Force a fresh network request for this provider key.
      delete promiseCache.current[key];
      setStatusForProviderIds(relatedProviderIds, 'loading');

      try {
        const result = await api.machine.testModel(payload);
        const nextStatus: ConnectionStatus = result.model_ok ? 'success' : 'error';
        setStatusForProviderIds(relatedProviderIds, nextStatus);

        if (result.model_ok && result.capabilities) {
          relatedProviderIds.forEach((id: string) => {
            setDetectedCapabilities((prev: Record<string, ProviderCapabilities>) => ({
              ...prev,
              [id]: result.capabilities!,
            }));
          });
        }
      } catch {
        setStatusForProviderIds(relatedProviderIds, 'error');
      } finally {
        markChecked(relatedProviderIds);
      }
    },
    [
      appSettings.activeChatProviderId,
      appSettings.activeEditingProviderId,
      appSettings.activeWritingProviderId,
      appSettings.providers,
      markChecked,
      modelConnectionStatus,
      setStatusForProviderIds,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    const checkProviders = async () => {
      const activeIds = new Set([
        appSettings.activeChatProviderId,
        appSettings.activeWritingProviderId,
        appSettings.activeEditingProviderId,
      ]);

      // only evaluate providers that are currently active in the UI
      const providersToCheck = appSettings.providers.filter(
        (provider: import('../../types').LLMConfig) => activeIds.has(provider.id)
      );
      const groups = groupProviders(appSettings.providers, activeIds);

      // kick off checks for each group
      await Promise.all(
        Object.entries(groups).map(
          async ([key, { ids, payload }]: [
            string,
            {
              ids: string[];
              payload: {
                base_url: string;
                api_key?: string;
                timeout_s: number;
                model_id: string;
              };
            },
          ]) => {
            if (cancelled) return;

            // set all related providers to loading
            startTransition(() => {
              ids.forEach((pid: string) => {
                setModelConnectionStatus((prev: Record<string, ConnectionStatus>) => ({
                  ...prev,
                  [pid]: 'loading',
                }));
              });
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
              startTransition(() => {
                ids.forEach((pid: string) => {
                  setModelConnectionStatus(
                    (prev: Record<string, ConnectionStatus>) => ({
                      ...prev,
                      [pid]: status,
                    })
                  );
                });

                if (result.model_ok && result.capabilities) {
                  ids.forEach((pid: string) => {
                    setDetectedCapabilities(
                      (prev: Record<string, ProviderCapabilities>) => ({
                        ...prev,
                        [pid]: result.capabilities!,
                      })
                    );
                  });
                }
              });
              markChecked(ids);
            } catch {
              if (cancelled) return;
              startTransition(() => {
                ids.forEach((pid: string) => {
                  setModelConnectionStatus(
                    (prev: Record<string, ConnectionStatus>) => ({
                      ...prev,
                      [pid]: 'error',
                    })
                  );
                });
              });
              markChecked(ids);
            }
          }
        )
      );

      // finally, mark any active providers without a modelId as idle
      // providers without a model ID don’t require a network check; mark idle
      startTransition(() => {
        providersToCheck.forEach((provider: import('../../types').LLMConfig) => {
          if (!provider.modelId?.trim()) {
            setModelConnectionStatus((prev: Record<string, ConnectionStatus>) => ({
              ...prev,
              [provider.id]: 'idle',
            }));
            markChecked([provider.id]);
          }
        });
      });
    };

    // Debounce so rapid provider changes (e.g. typing in settings) don't
    // fire many network requests simultaneously.
    const timer = setTimeout(() => {
      checkProviders();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    appSettings.providers,
    appSettings.activeChatProviderId,
    appSettings.activeEditingProviderId,
    appSettings.activeWritingProviderId,
    markChecked,
  ]);

  return {
    modelConnectionStatus,
    detectedCapabilities,
    refreshHealth,
    recheckUnavailableProviderIfStale,
  };
}
