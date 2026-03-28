// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the use prompts unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { setSmartQuoteChars } from '../../utils/textUtils';

type PromptsState = {
  system_messages: Record<string, string>;
  user_prompts: Record<string, string>;
  languages?: string[];
};

const EMPTY_PROMPTS: PromptsState = {
  system_messages: {},
  user_prompts: {},
};

export function usePrompts(storyId: string) {
  const [prompts, setPrompts] = useState<PromptsState>(EMPTY_PROMPTS);

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const promptsData = await api.settings.getPrompts();
        const system_messages = promptsData.system_messages || {};

        setPrompts({
          system_messages,
          user_prompts: promptsData.user_prompts || {},
          languages: promptsData.languages,
        });

        // Ensure smart quotes use the project language's typographic quote characters.
        setSmartQuoteChars({
          doubleOpen: system_messages.typographic_quotes_open,
          doubleClose: system_messages.typographic_quotes_close,
          singleOpen: system_messages.typographic_single_quotes_open,
          singleClose: system_messages.typographic_single_quotes_close,
        });
      } catch (error) {
        console.error('Failed to load prompts', error);
        setPrompts(EMPTY_PROMPTS);
        setSmartQuoteChars({});
      }
    };

    fetchPrompts();
  }, [storyId]);

  return prompts;
}
