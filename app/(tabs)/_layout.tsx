import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { communityService } from '../../services/communityService';
import { footballAPI } from '../../services/footballApi';
import { newsAPI } from '../../services/newsApi';

export default function TabLayout() {
  const prefetchHomeData = () => {
    void footballAPI.getLiveMatches();
    void footballAPI.getUpcomingMatches();
    void footballAPI.getRecentFinishedFixtures(8);
    void newsAPI.getSoccerNews();
  };

  const prefetchNewsPage = () => {
    void newsAPI.getSoccerNewsPage(1, 20);
  };

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
        listeners={{
          tabPress: () => {
            prefetchHomeData();
          },
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
          tabPress: () => prefetchNewsPage(),
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
