import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Persistence } from 'firebase/auth';
import { forceLongPolling, getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || '',
};

if (__DEV__) {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    console.warn(`[firebase] Missing env keys: ${missingKeys.join(', ')}`);
  }
}

const app = initializeApp(firebaseConfig);

const getSidelineReactNativePersistence = (
  storage: typeof ReactNativeAsyncStorage
): Persistence => {
  class ReactNativePersistence {
    static type = 'LOCAL' as const;
    readonly type = 'LOCAL' as const;

    async _isAvailable() {
      try {
        const testKey = 'sideline:firebase:persistence_available';
        await storage.setItem(testKey, '1');
        await storage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return storage.setItem(key, JSON.stringify(value));
    }

    async _get<T>(key: string): Promise<T | null> {
      const value = await storage.getItem(key);
      return value ? JSON.parse(value) : null;
    }

    _remove(key: string) {
      return storage.removeItem(key);
    }

    _addListener() {
      return;
    }

    _removeListener() {
      return;
    }
  }

  return ReactNativePersistence as unknown as Persistence;
};

if (Platform.OS === 'web') {
  forceLongPolling();
  try {
    globalThis?.localStorage?.removeItem('firebase:previous_websocket_failure');
  } catch {
    // Ignore browser storage access failures.
  }
}

export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getSidelineReactNativePersistence(ReactNativeAsyncStorage),
      });

export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);
