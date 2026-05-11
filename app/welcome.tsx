// app/welcome.tsx
// First-time user welcome/onboarding screen

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');

const ONBOARDING_SCREENS = [
  {
    icon: 'chatbubbles',
    title: 'Live Match Chat',
    description: 'Join thousands of fans discussing matches in real-time. React, reply, and connect with football lovers worldwide.',
    color: '#0066CC',
  },
  {
    icon: 'stats-chart',
    title: 'Live Stats & Lineups',
    description: 'Get instant updates on goals, cards, and substitutions. View team lineups and formations during matches.',
    color: '#34C759',
  },
  {
    icon: 'newspaper',
    title: 'Latest News',
    description: 'Stay updated with breaking football news from top sources. Never miss transfer rumors or match analysis.',
    color: '#FF9500',
  },
  {
    icon: 'people',
    title: 'Join Communities',
    description: 'Connect with fans of your favorite teams and leagues. Share passion, predictions, and celebrations together.',
    color: '#FF3B30',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);

  const handleScroll = (event: any) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentPage(page);
  };

  const handleGetStarted = () => {
    router.replace('/(auth)/login');
  };

  const handleSkip = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Scrollable Content */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {ONBOARDING_SCREENS.map((screen, index) => (
          <View key={index} style={styles.page}>
            <View style={[styles.iconCircle, { backgroundColor: screen.color }]}>
              <Ionicons name={screen.icon as any} size={80} color="#FFF" />
            </View>
            <Text style={styles.title}>{screen.title}</Text>
            <Text style={styles.description}>{screen.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {ONBOARDING_SCREENS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentPage === index ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      {/* Get Started Button */}
      <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
        <Text style={styles.buttonText}>
          {currentPage === ONBOARDING_SCREENS.length - 1 ? 'Get Started' : 'Next'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  page: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    lineHeight: 26,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  dotActive: {
    backgroundColor: '#0066CC',
    width: 30,
  },
  dotInactive: {
    backgroundColor: '#E5E7EB',
  },
  button: {
    backgroundColor: '#0066CC',
    marginHorizontal: 20,
    marginBottom: 50,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});