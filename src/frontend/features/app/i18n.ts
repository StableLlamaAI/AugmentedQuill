import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Infer default language from browser
const detectBrowserLanguage = () => {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language;
    return lang.split('-')[0] || 'en';
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { Settings: 'Settings', 'GUI Language': 'GUI Language' } },
    de: {
      translation: { Settings: 'Einstellungen', 'GUI Language': 'Oberflächensprache' },
    },
    fr: {
      translation: { Settings: 'Paramètres', 'GUI Language': 'Langue de l’interface' },
    },
    es: {
      translation: {
        Settings: 'Configuración',
        'GUI Language': 'Idioma de la interfaz',
      },
    },
  },
  lng: detectBrowserLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
