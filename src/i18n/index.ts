import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

const LANGUAGE_KEY = 'app_language';

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
];

// Get stored language
export const getStoredLanguage = (): string => {
  return localStorage.getItem(LANGUAGE_KEY) || 'en';
};

// Save language preference and update document direction
export const setLanguage = async (lang: string): Promise<void> => {
  localStorage.setItem(LANGUAGE_KEY, lang);
  const isRTL = lang === 'ar';

  // Update document direction for RTL support
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;

  await i18n.changeLanguage(lang);
};

// Get current language
export const getCurrentLanguage = (): string => {
  return i18n.language || getStoredLanguage();
};

// Check if current language is RTL
export const isRTL = (): boolean => {
  return getCurrentLanguage() === 'ar';
};

// Initialize i18n
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
  });

// Set initial document direction based on stored language
const initialLang = getStoredLanguage();
document.documentElement.dir = initialLang === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = initialLang;

export default i18n;
