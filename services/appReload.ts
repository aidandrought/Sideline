import { DevSettings, Platform } from 'react-native';

export const reloadApp = async (fallback?: () => Promise<void> | void): Promise<boolean> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
    return true;
  }

  if (fallback) {
    await fallback();
  }

  return false;
};
