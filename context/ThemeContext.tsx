import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getThemePreference, hydrateThemePreference, setThemePreference, ThemePreference } from '../services/themePreference';

type ThemeContextValue = {
  themeMode: ThemePreference;
  isDark: boolean;
  setThemeMode: (mode: ThemePreference) => Promise<void>;
  isReady: boolean;
};

const THEME_STORAGE_KEY = '@settings/themeMode';
const THEME_EXPLICIT_KEY = '@settings/themeMode:explicit';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemePreference>(getThemePreference());
  const [isReady, setIsReady] = useState(false);
  const systemScheme = useColorScheme() ?? 'light';

  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemScheme]);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        await hydrateThemePreference();
        const [stored, explicit] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(THEME_EXPLICIT_KEY),
        ]);
        if (!active) return;
        if (explicit !== 'true') {
          setThemeModeState('system');
          await AsyncStorage.setItem(THEME_STORAGE_KEY, 'system');
          await setThemePreference('system');
          return;
        }
        if (stored === 'system' || stored === 'light' || stored === 'dark') {
          setThemeModeState(stored);
        }
      } catch {
        // Ignore hydrate errors.
      } finally {
        if (active) setIsReady(true);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const setThemeMode = async (mode: ThemePreference) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      await AsyncStorage.setItem(THEME_EXPLICIT_KEY, 'true');
    } catch {
      // Ignore persistence errors.
    }
    await setThemePreference(mode);
  };

  const value = useMemo(
    () => ({
      themeMode,
      isDark,
      setThemeMode,
      isReady,
    }),
    [themeMode, isDark, isReady]
  );

  if (!isReady) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
};
