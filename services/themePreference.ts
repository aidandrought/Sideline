import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = '@settings/themeMode';
let currentPreference: ThemePreference = 'system';
const listeners = new Set<(pref: ThemePreference) => void>();

export const getThemePreference = () => currentPreference;

export const setThemePreference = async (pref: ThemePreference): Promise<void> => {
  currentPreference = pref;
  listeners.forEach(listener => listener(pref));
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, pref);
  } catch {
    // Ignore storage failures; keep in-memory preference.
  }
};

export const hydrateThemePreference = async (): Promise<void> => {
  try {
    const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      currentPreference = stored;
      listeners.forEach(listener => listener(stored));
    }
  } catch {
    // Ignore storage failures.
  }
};

export const subscribeThemePreference = (listener: (pref: ThemePreference) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
