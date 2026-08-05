import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';

const LANGUAGE_STORAGE_KEY = 'chez-nous:language';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (storedLanguage === 'en' || storedLanguage === 'fr') {
          setLanguageState(storedLanguage);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setLanguage = (nextLanguage) => {
    setLanguageState(nextLanguage);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const resetLanguage = () => {
    setLanguageState(null);
    AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
  };

  const value = useMemo(() => {
    const activeLanguage = language ?? 'fr';
    return {
      language,
      isLoading,
      setLanguage,
      resetLanguage,
      t: (key, params) => {
        const template = translations[activeLanguage][key] ?? key;
        if (!params) return template;
        return Object.keys(params).reduce(
          (result, paramKey) => result.replace(`{${paramKey}}`, params[paramKey]),
          template,
        );
      },
    };
  }, [language, isLoading]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
