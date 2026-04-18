// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings provider validation unit so connectivity and model checks stay isolated.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { LLMConfig, ProviderCapabilities } from '../../types';

type ProviderStatus = 'idle' | 'success' | 'error' | 'loading';

interface UseSettingsDialogProviderValidationParams {
  isOpen: boolean;
  providers: LLMConfig[];
}

const toConnectionTestKey = (provider: LLMConfig): string => {
  const baseUrl = (provider.baseUrl || '').trim();
  const apiKey = (provider.apiKey || '').trim();
  const timeoutS = Math.max(1, Math.round((provider.timeout || 10000) / 1000));
  return `${baseUrl}|${apiKey}|${timeoutS}`;
};

export function useSettingsDialogProviderValidation({
  isOpen,
  providers,
}: UseSettingsDialogProviderValidationParams) {
  const [connectionStatus, setConnectionStatus] = useState<
    Record<string, ProviderStatus>
  >({});
  const [modelStatus, setModelStatus] = useState<Record<string, ProviderStatus>>({});
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [detectedCapabilities, setDetectedCapabilities] = useState<
    Record<string, ProviderCapabilities>
  >({});

  const lastConnTestKeyRef = useRef<Record<string, string>>({});
  const prevModelIdRef = useRef<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!isOpen) return;
    setModelLists({});
    lastConnTestKeyRef.current = {};
    prevModelIdRef.current = {};
  }, [isOpen]);

  // Auto-test connectivity so model selectors can rely on known-good endpoints.
  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    providers.forEach((provider) => {
      const providerId = provider.id;
      const baseUrl = (provider.baseUrl || '').trim();
      const apiKey = (provider.apiKey || '').trim();
      const timeoutS = Math.max(1, Math.round((provider.timeout || 10000) / 1000));
      const testKey = toConnectionTestKey(provider);

      if (!baseUrl || !apiKey) {
        setConnectionStatus((state) => ({ ...state, [providerId]: 'idle' }));
        setModelStatus((state) => ({ ...state, [providerId]: 'idle' }));
        setModelLists((prev) => ({ ...prev, [providerId]: [] }));
        return;
      }

      if (lastConnTestKeyRef.current[providerId] === testKey) {
        return;
      }

      const run = async () => {
        if (cancelled) return;
        setConnectionStatus((state) => ({ ...state, [providerId]: 'loading' }));
        try {
          const response = await api.machine.test({
            base_url: baseUrl,
            api_key: apiKey,
            timeout_s: timeoutS,
          });
          if (cancelled) return;

          lastConnTestKeyRef.current[providerId] = testKey;
          setConnectionStatus((state) => ({
            ...state,
            [providerId]: response?.ok ? 'success' : 'error',
          }));
          setModelLists((prev) => ({
            ...prev,
            [providerId]: response?.ok ? response.models || [] : [],
          }));
        } catch (error) {
          if (cancelled) return;
          console.error('Failed to test machine config', error);
          lastConnTestKeyRef.current[providerId] = testKey;
          setConnectionStatus((state) => ({ ...state, [providerId]: 'error' }));
          setModelLists((prev) => ({ ...prev, [providerId]: [] }));
        }
      };

      timeouts.push(setTimeout(run, 600));
    });

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [isOpen, providers]);

  // Validate selected model IDs only after connectivity succeeds.
  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    providers.forEach((provider) => {
      const providerId = provider.id;
      const modelId = (provider.modelId || '').trim();
      const previousModelId = prevModelIdRef.current[providerId];

      if (
        previousModelId === modelId &&
        modelStatus[providerId] &&
        modelStatus[providerId] !== 'idle'
      ) {
        return;
      }

      if (!modelId) {
        prevModelIdRef.current[providerId] = modelId;
        setModelStatus((state) => ({ ...state, [providerId]: 'idle' }));
        return;
      }

      if (connectionStatus[providerId] !== 'success') {
        return;
      }

      const baseUrl = (provider.baseUrl || '').trim();
      const apiKey = (provider.apiKey || '').trim();
      const timeoutS = Math.max(1, Math.round((provider.timeout || 10000) / 1000));

      const run = async () => {
        if (cancelled) return;
        setModelStatus((state) => ({ ...state, [providerId]: 'loading' }));
        try {
          const response = await api.machine.testModel({
            base_url: baseUrl,
            api_key: apiKey,
            timeout_s: timeoutS,
            model_id: modelId,
          });
          if (cancelled) return;

          prevModelIdRef.current[providerId] = modelId;
          if (response?.capabilities) {
            setDetectedCapabilities((prev) => ({
              ...prev,
              [providerId]: response.capabilities!,
            }));
          }
          setModelStatus((state) => ({
            ...state,
            [providerId]: response?.ok && response?.model_ok ? 'success' : 'error',
          }));
        } catch (error) {
          if (cancelled) return;
          console.error('Failed to test model id', error);
          prevModelIdRef.current[providerId] = modelId;
          setModelStatus((state) => ({ ...state, [providerId]: 'error' }));
        }
      };

      timeouts.push(setTimeout(run, 500));
    });

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [isOpen, providers, connectionStatus, modelStatus]);

  return {
    connectionStatus,
    modelStatus,
    modelLists,
    detectedCapabilities,
  };
}
