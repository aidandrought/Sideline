// components/NewsSkeletonCards.tsx
// Skeleton loading cards for news sections - show while news loads

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface NewsSkeletonCardProps {
  isDark?: boolean;
  count?: number;
}

const SkeletonCard = ({ isDark, shimmerAnim }: { isDark?: boolean; shimmerAnim: Animated.Value }) => {
  const bg = isDark ? '#1C1C1E' : '#F0F0F0';
  const shimmerColor = isDark ? '#2C2C2E' : '#E0E0E0';

  const shimmerInterpolate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [bg, shimmerColor],
  });

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <Animated.View style={[styles.image, { backgroundColor: shimmerInterpolate }]} />
      <View style={styles.content}>
        <Animated.View style={[styles.titleLine, { backgroundColor: shimmerInterpolate }]} />
        <Animated.View style={[styles.titleLineShort, { backgroundColor: shimmerInterpolate }]} />
        <Animated.View style={[styles.metaLine, { backgroundColor: shimmerInterpolate }]} />
      </View>
    </View>
  );
};

export const NewsSkeletonCards: React.FC<NewsSkeletonCardProps> = ({ isDark = false, count = 3 }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`news-skeleton-${index}`} isDark={isDark} shimmerAnim={shimmerAnim} />
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  image: {
    width: 90,
    height: 80,
    borderRadius: 8,
    margin: 10,
  },
  content: {
    flex: 1,
    padding: 10,
    paddingLeft: 4,
    justifyContent: 'center',
    gap: 6,
  },
  titleLine: {
    height: 14,
    borderRadius: 6,
    width: '90%',
  },
  titleLineShort: {
    height: 14,
    borderRadius: 6,
    width: '70%',
  },
  metaLine: {
    height: 10,
    borderRadius: 5,
    width: '40%',
    marginTop: 4,
  },
});
