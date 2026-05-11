import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useMemo } from 'react';
import { InteractionManager, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { FEATURE_FLAGS } from '../../constants/featureFlags';
import { useTheme } from '../../context/ThemeContext';
import { getFeedSelections } from '../../services/feedPreferences';
import { getHomeExploreNewsAllocation } from '../../services/newsAllocationService';
import { communityService } from '../../services/communityService';

function BrandTabIcon({
  icon,
  color,
  focused,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconShell, focused && styles.iconShellActive]}>
      <Ionicons name={icon} size={focused ? 19 : 18} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { isDark } = useTheme();
  const { showLoadingScreen } = useAppBootstrap();
  const { userProfile } = useAuth();
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const insets = useSafeAreaInsets();
  const palette = useMemo(
    () =>
      isDark
        ? {
            card: '#071220',
            border: 'rgba(132,178,255,0.16)',
            active: '#9FDBFF',
            inactive: '#7F90AA',
            shadow: '#020712',
          }
        : {
            card: '#F7FBFF',
            border: 'rgba(61,112,185,0.14)',
            active: '#0D6CCF',
            inactive: '#68778E',
            shadow: '#90B6DC',
          },
    [isDark]
  );

  const prefetchHomeData = () => {
    void getHomeExploreNewsAllocation(userProfile?.uid, feedSelections);
  };

  const prefetchNewsPage = () => {
    void getHomeExploreNewsAllocation(userProfile?.uid, feedSelections);
  };

  const deferWarm = (task: () => void) => {
    InteractionManager.runAfterInteractions(() => {
      task();
    });
  };

  return (
    <>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={{
          lazy: false,
          freezeOnBlur: true,
          headerShown: false,
          tabBarActiveTintColor: palette.active,
          tabBarInactiveTintColor: palette.inactive,
          tabBarStyle: {
            backgroundColor: palette.card,
            borderTopWidth: 1,
            borderTopColor: palette.border,
            height: (Platform.OS === 'ios' ? 52 : 58) + Math.max(insets.bottom, 0),
            paddingBottom: Platform.OS === 'ios'
              ? Math.max(6, Math.max(insets.bottom, 0) - 4)
              : Math.max(insets.bottom, 6),
            paddingTop: 6,
            shadowColor: palette.shadow,
            shadowOpacity: isDark ? 0.36 : 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -6 },
            elevation: 14,
            display: showLoadingScreen ? 'none' : 'flex',
          },
          tabBarItemStyle: {
            paddingHorizontal: 2,
          },
          tabBarLabel: ({ children, color, focused }) => (
            <Text
              style={[
                styles.label,
                {
                  color,
                  opacity: focused ? 1 : 0.82,
                },
              ]}
            >
              {children}
            </Text>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <BrandTabIcon
                icon={focused ? 'home' : 'home-outline'}
                color={color}
                focused={focused}
              />
            ),
          }}
          listeners={{
            tabPress: () => {
              deferWarm(prefetchHomeData);
            },
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, focused }) => (
              <BrandTabIcon
                icon={focused ? 'search' : 'search-outline'}
                color={color}
                focused={focused}
              />
            ),
          }}
          listeners={{
            tabPress: () => deferWarm(prefetchNewsPage),
          }}
        />
        <Tabs.Screen
          name="communities"
          options={{
            title: 'Communities',
            tabBarIcon: ({ color, focused }) => (
              <BrandTabIcon
                icon={focused ? 'people' : 'people-outline'}
                color={color}
                focused={focused}
              />
            ),
          }}
          listeners={{
            tabPress: () => deferWarm(() => communityService.prefetchCommunities()),
          }}
        />
        <Tabs.Screen
          name="fantasy"
          options={{
            href: FEATURE_FLAGS.fantasyEnabled ? undefined : null,
            title: 'Fantasy',
            tabBarActiveTintColor: '#10B981',
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconShell, focused && { backgroundColor: 'rgba(255,107,44,0.14)', borderColor: 'rgba(255,107,44,0.28)', borderWidth: 1 }]}>
                <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={focused ? 19 : 18} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    width: 38,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconShellActive: {
    backgroundColor: 'rgba(113, 193, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148, 216, 255, 0.22)',
  },
  label: {
    marginTop: 0,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
