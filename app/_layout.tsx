import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Auth Screens */}
        <Stack.Screen name="(auth)" />
        
        {/* Main Tab Navigation */}
        <Stack.Screen name="(tabs)" />
        
        {/* Individual Screens */}
        <Stack.Screen 
          name="chat/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="profile" 
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom'
          }}
        />
        <Stack.Screen 
          name="settings" 
          options={{
            presentation: 'modal',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="live" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="upcoming" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="news" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen 
          name="newsDetail/[id]" 
          options={{
            presentation: 'card',
            animation: 'slide_from_right'
          }}
        />
      </Stack>
    </AuthProvider>
  );
}