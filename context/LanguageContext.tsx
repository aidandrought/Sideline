import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

type LanguageContextValue = {
  language: string;
  setLanguage: (code: string) => Promise<void>;
  isReady: boolean;
};

const LANGUAGE_STORAGE_KEY = '@settings/language';
const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState('en');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const nextLang = stored || 'en';
        if (!active) return;
        setLanguageState(nextLang);
        await i18n.changeLanguage(nextLang);
      } catch {
        // Ignore.
      } finally {
        if (active) setIsReady(true);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = async (code: string) => {
    setLanguageState(code);
    await i18n.changeLanguage(code);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // Ignore storage failures.
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      isReady,
    }),
    [language, isReady]
  );

  if (!isReady) {
    return null;
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  const { t } = useTranslation();
  return { ...ctx, t };
};
