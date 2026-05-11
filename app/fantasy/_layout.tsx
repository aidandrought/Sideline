import { Redirect, Stack } from 'expo-router';
import { FEATURE_FLAGS } from '../../constants/featureFlags';

export default function FantasyLayout() {
  if (!FEATURE_FLAGS.fantasyEnabled) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

