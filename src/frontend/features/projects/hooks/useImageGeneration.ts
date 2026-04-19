// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate AI-based image description and prompt generation for ProjectImages.
 */

import { useState } from 'react';
import { AppSettings } from '../../../types';
import { generateSimpleContent } from '../../../services/openaiService';

interface ImageEntry {
  filename: string;
  url: string | null;
  description: string;
  title?: string;
  is_placeholder: boolean;
}

export interface PromptPopupState {
  isOpen: boolean;
  content: string;
  loading: boolean;
}

export interface UseImageGenerationArgs {
  images: ImageEntry[];
  imageStyle: string;
  imageAdditionalInfo: string;
  imageActionsAvailable: boolean;
  settings: AppSettings;
  prompts?: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  onMetadataChange: (
    filename: string,
    field: 'description' | 'title',
    val: string
  ) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  setError: (msg: string | null) => void;
}

/** Custom React hook that manages image generation. */
export function useImageGeneration({
  images,
  imageStyle,
  imageAdditionalInfo,
  imageActionsAvailable,
  settings,
  prompts,
  onMetadataChange,
  getErrorMessage,
  setError,
}: UseImageGenerationArgs): {
  generating: string | null;
  promptPopup: PromptPopupState;
  setPromptPopup: import('react').Dispatch<
    import('react').SetStateAction<PromptPopupState>
  >;
  copied: boolean;
  setCopied: import('react').Dispatch<import('react').SetStateAction<boolean>>;
  handleGenerateDescription: (img: ImageEntry) => Promise<void>;
  handleCreatePrompt: (img: ImageEntry) => Promise<void>;
  handleGenerateAllPrompts: () => Promise<void>;
} {
  const [generating, setGenerating] = useState<string | null>(null);
  const [promptPopup, setPromptPopup] = useState<PromptPopupState>({
    isOpen: false,
    content: '',
    loading: false,
  });
  const [copied, setCopied] = useState(false);

  const buildImagePromptText = (img: ImageEntry) => {
    const title = img.title?.trim() || '(untitled)';
    const description = img.description?.trim() || '(no description)';
    const style = imageStyle?.trim() || '(none)';
    const extraInfo = imageAdditionalInfo?.trim() || '(none)';
    return [
      `Title: ${title}`,
      `Description: ${description}`,
      `Project Image Style: ${style}`,
      `Additional Information: ${extraInfo}`,
      'Generate one single-line production-ready image prompt in English.',
    ].join('\n');
  };

  const generateImagePrompt = async (
    img: ImageEntry,
    activeProvider: AppSettings['providers'][number],
    system: string,
    onUpdate: (text: string) => void
  ) => {
    const prompt = buildImagePromptText(img);
    return generateSimpleContent(prompt, system, activeProvider, 'EDITING', {
      tool_choice: 'none',
      onUpdate,
    });
  };

  const handleGenerateDescription = async (img: ImageEntry) => {
    if (!imageActionsAvailable) return;
    if (generating) return;
    setGenerating(img.filename);
    setError(null);
    try {
      const activeProvider = settings.providers.find(
        (p: import('../../../types').LLMConfig) =>
          p.id === settings.activeChatProviderId
      );
      if (!activeProvider) throw new Error('No active chat provider configured');

      const promptTemplate = prompts?.user_prompts?.image_describer_prompt || '';
      const system = prompts?.system_messages?.image_describer || '';

      if (!promptTemplate || !system) {
        throw new Error('Prompts not loaded');
      }

      const prompt = promptTemplate.replace(/{filename}/g, img.filename);

      const result = await generateSimpleContent(
        prompt,
        system,
        activeProvider,
        'EDITING',
        { tool_choice: 'none' }
      );

      if (result) {
        onMetadataChange(img.filename, 'description', result);
      }
    } catch (err: unknown) {
      setError('Generation failed: ' + getErrorMessage(err, 'Unknown error'));
    } finally {
      setGenerating(null);
    }
  };

  const handleCreatePrompt = async (img: ImageEntry) => {
    if (!imageActionsAvailable) return;
    if (!img.description) return;

    setPromptPopup({ isOpen: true, content: '', loading: true });

    try {
      const activeProvider = settings.providers.find(
        (p: import('../../../types').LLMConfig) =>
          p.id === settings.activeChatProviderId
      );

      if (!activeProvider) throw new Error('No active chat provider configured');

      const system = prompts?.system_messages?.image_prompt_generator || '';

      await generateImagePrompt(img, activeProvider, system, (text: string) => {
        setPromptPopup((prev: PromptPopupState) => ({ ...prev, content: text }));
      });

      setPromptPopup((prev: PromptPopupState) => ({ ...prev, loading: false }));
    } catch (err: unknown) {
      setPromptPopup((prev: PromptPopupState) => ({
        ...prev,
        content: 'Error creating prompt: ' + getErrorMessage(err, 'Unknown error'),
        loading: false,
      }));
    }
  };

  const handleGenerateAllPrompts = async () => {
    if (!imageActionsAvailable) return;
    const placeholders = images.filter((i: ImageEntry) => i.is_placeholder);
    if (placeholders.length === 0) return;

    setPromptPopup({ isOpen: true, content: '', loading: true });

    try {
      const activeProvider = settings.providers.find(
        (p: import('../../../types').LLMConfig) =>
          p.id === settings.activeChatProviderId
      );
      if (!activeProvider) throw new Error('No active chat provider configured');

      let completedOutput = '';

      for (const img of placeholders) {
        if (!img.description) continue;

        const system = prompts?.system_messages?.image_prompt_generator || '';

        let currentItemText = '';
        await generateImagePrompt(img, activeProvider, system, (text: string) => {
          currentItemText = text.replace(/[\r\n]+/g, ' ');
          setPromptPopup((prev: PromptPopupState) => ({
            ...prev,
            content: completedOutput + currentItemText,
          }));
        });

        completedOutput += currentItemText + '\n';
        setPromptPopup((prev: PromptPopupState) => ({
          ...prev,
          content: completedOutput,
        }));
      }
      setPromptPopup((prev: PromptPopupState) => ({
        ...prev,
        content: prev.content.trimEnd(),
        loading: false,
      }));
    } catch (err: unknown) {
      setPromptPopup((prev: PromptPopupState) => ({
        ...prev,
        content: prev.content + '\nError: ' + getErrorMessage(err, 'Unknown error'),
        loading: false,
      }));
    }
  };

  return {
    generating,
    promptPopup,
    setPromptPopup,
    copied,
    setCopied,
    handleGenerateDescription,
    handleCreatePrompt,
    handleGenerateAllPrompts,
  };
}
