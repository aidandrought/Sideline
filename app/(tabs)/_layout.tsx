import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { communityService } from '../../services/communityService';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        unmountOnBlur: false,
        tabBarActiveTintColor: '#0066CC',
        tabBarInactiveTintColor: '#89898bff',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "home" : "home-outline"} 
              size={26} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "search" : "search-outline"} 
              size={26} 
              color={color} 
            />
          ),
        }}
        listeners={{
          tabPress: () => communityService.prefetchCommunities(),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: 'Communities',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "people" : "people-outline"} 
              size={26} 
              color={color} 
            />
          ),
        }}
        listeners={{
          tabPress: () => communityService.prefetchCommunities(),
        }}
      />
    </Tabs>
  );
}
