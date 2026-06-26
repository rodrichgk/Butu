import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import frTranslations from './locales/fr.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      fr: { translation: frTranslations },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    nonExplicitSupportedLngs: true, // map en-US → en, fr-FR → fr
    load: 'languageOnly',
    detection: {
      // Default to the BROWSER language (never location/IP); a manual choice from the in-app
      // language switcher persists in localStorage. supportedLngs maps en-US → en, fr-FR → fr,
      // so an English browser gets English. (Cookie/path/subdomain detection is dropped.)
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
  });

export default i18n;
