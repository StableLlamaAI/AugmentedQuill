import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Infer default language from browser
export const detectBrowserLanguage = () => {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language;
    return lang.split('-')[0] || 'en';
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        Settings: 'Settings',
        'GUI Language': 'GUI Language',
        Projects: 'Projects',
        'Machine Settings': 'Machine Settings',
        General: 'General',
        About: 'About',
        'General Settings': 'General Settings',
        'Select the interface language. Story writing language is set in Project Settings.':
          'Select the interface language. Story writing language is set in Project Settings.',
        'System Default': 'System Default',
        English: 'English',
        German: 'German',
        French: 'French',
        Spanish: 'Spanish',
      },
    },
    de: {
      translation: {
        Settings: 'Einstellungen',
        'GUI Language': 'Oberflächensprache',
        Projects: 'Projekte',
        'Machine Settings': 'Maschineneinstellungen',
        General: 'Allgemein',
        About: 'Info',
        'General Settings': 'Allgemeine Einstellungen',
        'Select the interface language. Story writing language is set in Project Settings.':
          'Wählen Sie die Oberflächensprache aus. Die Sprache zum Schreiben von Geschichten wird in den Projekteinstellungen festgelegt.',
        'System Default': 'Systemstandard',
        English: 'Englisch',
        German: 'Deutsch',
        French: 'Französisch',
        Spanish: 'Spanisch',
      },
    },
    fr: {
      translation: {
        Settings: 'Paramètres',
        'GUI Language': 'Langue de l’interface',
        Projects: 'Projets',
        'Machine Settings': 'Paramètres de la machine',
        General: 'Général',
        About: 'À propos',
        'General Settings': 'Paramètres généraux',
        'Select the interface language. Story writing language is set in Project Settings.':
          'Sélectionnez la langue de l’interface. La langue d’écriture de l’histoire est définie dans les paramètres du projet.',
        'System Default': 'Paramètre système',
        English: 'Anglais',
        German: 'Allemand',
        French: 'Français',
        Spanish: 'Espagnol',
      },
    },
    es: {
      translation: {
        Settings: 'Configuración',
        'GUI Language': 'Idioma de la interfaz',
        Projects: 'Proyectos',
        'Machine Settings': 'Configuración de la máquina',
        General: 'General',
        About: 'Acerca de',
        'General Settings': 'Configuración general',
        'Select the interface language. Story writing language is set in Project Settings.':
          'Seleccione el idioma de la interfaz. El idioma de escritura de historias se establece en la configuración del proyecto.',
        'System Default': 'Predeterminado del sistema',
        English: 'Inglés',
        German: 'Alemán',
        French: 'Francés',
        Spanish: 'Español',
      },
    },
  },
  lng: detectBrowserLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
