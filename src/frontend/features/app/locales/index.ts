// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Language-specific translation resource registry.
 */

import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';

export const resources = {
  en,
  de,
  fr,
  es,
};

export const supportedLanguages = Object.keys(resources) as Array<
  keyof typeof resources
>;
