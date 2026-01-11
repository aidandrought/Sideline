// app/_layout.tsx
// Root layout with all screen routes

import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Auth Screens */}
        <Stack.Screen name="(auth)/login" />
<Stack.Screen name="(auth)/signup" />

        
        {/* Main Tab Navigation */}
        <Stack.Screen name="(tabs)" />
        
        {/* Match Chat Screen - Each match has unique chat */}
        <Stack.Screen 
          name="chat/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* Community Chat Screen - For team/league communities */}
        <Stack.Screen 
          name="communityChat/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
        
        {/* Profile Screen */}
        <Stack.Screen 
          name="profile" 
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom'
          }}
        />

        {/* Settings Screen */}
        <Stack.Screen 
          name="settings" 
          options={{
            presentation: 'modal',
            animation: 'slide_from_right'
          }}
        />

        {/* Live Matches Screen */}
        <Stack.Screen 
          name="live" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* Upcoming Matches Screen */}
        <Stack.Screen 
          name="upcoming" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* Match Preview (Pre-match info) */}
        <Stack.Screen 
          name="matchPreview/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* News List Screen */}
        <Stack.Screen 
          name="news" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* News Detail Screen */}
        <Stack.Screen 
          name="newsDetail/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />

        {/* Welcome/Onboarding Screen */}
        <Stack.Screen 
          name="welcome" 
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade'
          }}
        />
      </Stack>
    </AuthProvider>
  );
}