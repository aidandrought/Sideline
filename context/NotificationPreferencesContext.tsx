import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SETTINGS_STORAGE_KEY = 'settings:preferences:v1';

export type NotificationPreferences = {
  notificationsEnabled: boolean;
  liveScoresEnabled: boolean;
  chatNotifications: boolean;
};

type NotificationPreferencesContextValue = {
  preferences: NotificationPreferences;
  updatePreferences: (overrides: Partial<NotificationPreferences>) => Promise<void>;
  ready: boolean;
};

const defaultPreferences: NotificationPreferences = {
  notificationsEnabled: true,
  liveScoresEnabled: true,
  chatNotifications: true,
};

const NotificationPreferencesContext = createContext<NotificationPreferencesContextValue | undefined>(undefined);

export const NotificationPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPreferences = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
          if (mounted) {
            setPreferences({ ...defaultPreferences, ...parsed });
          }
        }
      } catch {
        // Ignore load errors.
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    };

    void loadPreferences();
    return () => {
      mounted = false;
    };
  }, []);

  const updatePreferences = async (overrides: Partial<NotificationPreferences>) => {
    const next = { ...preferences, ...overrides };
    setPreferences(next);
    try {
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  const value = useMemo(
    () => ({
      preferences,
      updatePreferences,
      ready,
    }),
    [preferences, ready]
  );

  return (
    <NotificationPreferencesContext.Provider value={value}>
      {children}
    </NotificationPreferencesContext.Provider>
  );
};

export const useNotificationPreferences = () => {
  const context = useContext(NotificationPreferencesContext);
  if (!context) {
    throw new Error('useNotificationPreferences must be used within NotificationPreferencesProvider');
  }
  return context;
};
