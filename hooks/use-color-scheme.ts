import { useEffect, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { getThemePreference, hydrateThemePreference, subscribeThemePreference } from '@/services/themePreference';

const resolveScheme = (pref: 'system' | 'light' | 'dark', system: ColorSchemeName) =>
  pref === 'system' ? system : pref;

export function useColorScheme() {
  const [preference, setPreference] = useState(getThemePreference());
  const [scheme, setScheme] = useState<ColorSchemeName>(
    resolveScheme(preference, Appearance.getColorScheme() ?? 'light')
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeThemePreference((next) => {
      if (!active) return;
      setPreference(next);
    });
    void hydrateThemePreference();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const system = Appearance.getColorScheme() ?? 'light';
    setScheme(resolveScheme(preference, system));

    if (preference !== 'system') return;
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(resolveScheme(preference, colorScheme ?? 'light'));
    });
    return () => subscription.remove();
  }, [preference]);

  return scheme;
}
