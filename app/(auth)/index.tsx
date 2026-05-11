// app/(auth)/index.tsx
// Landing screen that redirects to login or tabs based on auth state

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function AuthIndex() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      // Always go to tabs — unauthenticated users can browse freely.
      // Login is prompted lazily when they try to use chat.
      router.replace('/(tabs)');
    }
  }, [loading, router]);

  return (
    <View style={styles.container} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060B14',
  },
});
