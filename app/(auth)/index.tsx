// app/(auth)/index.tsx
// Landing screen that redirects to login or tabs based on auth state

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function AuthIndex() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // User is logged in, go to main app
        router.replace('/(tabs)');
      } else {
        // User not logged in, show login
        router.replace('/(auth)/login');
      }
    }
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>Sideline</Text>
        <Text style={styles.tagline}>Connect with fans worldwide</Text>
      </View>
      <ActivityIndicator size="large" color="#0066CC" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    fontSize: 56,
    fontWeight: '800',
    color: '#0066CC',
    marginBottom: 10,
  },
  tagline: {
    fontSize: 18,
    color: '#666',
  },
});