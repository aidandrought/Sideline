// app/_layout.tsx
// Root layout with all screen routes

import { Asset } from 'expo-asset';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BrandedLoading } from '../components/BrandedLoading';
import { AuthProvider } from '../context/AuthContext';
import { AppBootstrapProvider, useAppBootstrap } from '../context/AppBootstrapContext';
import { LanguageProvider } from '../context/LanguageContext';
import { NotificationPreferencesProvider } from '../context/NotificationPreferencesContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

const isFontObserverTimeoutError = (value: unknown): boolean => {
  const text = String(value ?? '').toLowerCase();
  return (
    text.includes('timeout exceeded') &&
    (text.includes('fontfaceobserver') || text.includes('6000ms'))
  );
};

LogBox.ignoreLogs([
  '"shadow*" style props are deprecated. Use "boxShadow".',
  'shadow* style props are deprecated. Use "boxShadow".',
  '"textShadow*" style props are deprecated. Use "textShadow".',
  'textShadow* style props are deprecated. Use "textShadow".',
  '[expo-notifications] Listening to push token changes is not yet fully supported on web. Adding a listener will have no effect.',
  'Listening to push token changes is not yet fully supported on web.',
]);

function DeepLinkNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getLastNotificationResponseAsync().then((r) => {
      const link = r?.notification.request.content.data?.deepLink;
      if (typeof link === 'string') {
        const path = link.replace('sideline://', '/');
        router.push(path as any);
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = r.notification.request.content.data?.deepLink;
      if (typeof link === 'string') {
        const path = link.replace('sideline://', '/');
        router.push(path as any);
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

function RootNavigator() {
  const { showLoadingScreen } = useAppBootstrap();

  if (showLoadingScreen) {
    return (
      <View style={styles.loadingOverlay}>
        <BrandedLoading variant="launch" dark />
      </View>
    );
  }

  return (
    <>
      <DeepLinkNotificationHandler />
      <NativeNotifiers />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/signup" />
        <Stack.Screen name="(auth)/setup" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="communityChat/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="editProfile"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="changePassword"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="privacySecurity"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="live"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="upcoming"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="results/index"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="results/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="matchPreview/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="news"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="newsDetail/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="news/reader"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="legal/privacy"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="legal/terms"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="legal/affiliation"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="support"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="support/help"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="support/contact"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="welcome"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="fantasy/pro"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="fantasy/league/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/team/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/special/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/scoring"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/browse"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/join"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/player/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/create/step1-name"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/create/step2-competitions"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/create/step3-rules"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/create/success"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/team/[id]/transfers"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="fantasy/team/[id]/chips"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="leaderboard"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}

function NativeNotifiers() {
  if (Platform.OS === 'web') return null;
  const LiveScoreNotifier = require('../components/LiveScoreNotifier').default;
  const MatchEventNotifier = require('../components/MatchEventNotifier').default;
  const TransferNewsNotifier = require('../components/TransferNewsNotifier').default;
  return (
    <>
      <LiveScoreNotifier />
      <MatchEventNotifier />
      <TransferNewsNotifier />
    </>
  );
}

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#060B14' : '#F7FBFF'} />;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const onUnhandledRejection = (event: any) => {
      if (isFontObserverTimeoutError(event.reason)) {
        event.preventDefault();
      }
    };

    const onError = (event: any) => {
      const message = event.message || event.error;
      if (isFontObserverTimeoutError(message)) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const launchLogoAsset = require('../assets/images/Official logo.png');
    const appLogoAsset = require('../assets/images/Official Sideline App Logo.png');

    const prepare = async () => {
      try {
        await Asset.loadAsync([launchLogoAsset, appLogoAsset]);
        await SplashScreen.hideAsync();
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    };

    void prepare();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <GestureHandlerRootView style={styles.loadingRoot}>
        <View style={styles.loadingScreen}>
          <BrandedLoading variant="launch" dark />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <AppStatusBar />
        <LanguageProvider>
          <NotificationPreferencesProvider>
            <AuthProvider>
              <AppBootstrapProvider>
                <RootNavigator />
              </AppBootstrapProvider>
            </AuthProvider>
          </NotificationPreferencesProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#060B14',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#060B14',
  },
});
