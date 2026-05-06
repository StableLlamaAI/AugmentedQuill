// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the i18n unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './locales/index';

// Infer default language from browser
export const detectBrowserLanguage = (): string => {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language;
    return lang.split('-')[0] || 'en';
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: detectBrowserLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
