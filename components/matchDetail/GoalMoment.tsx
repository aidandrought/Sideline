import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { teamPrimaryColor } from '../../services/teamTint';

type GoalMomentProps = {
  active: boolean;
  teamName?: string;
  teamLogo?: string;
  homeScore: number;
  awayScore: number;
  side: 'home' | 'away' | null;
  onAnimationEnd?: () => void;
  competitionLabel?: string;
};

export function GoalMoment({ active, teamName, teamLogo, homeScore, awayScore, side, onAnimationEnd, competitionLabel }: GoalMomentProps) {
  const animationProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || !side) {
      animationProgress.setValue(0);
      return;
    }

    animationProgress.setValue(0);
    Animated.sequence([
      Animated.timing(animationProgress, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.delay(780),
      Animated.timing(animationProgress, { toValue: 2, duration: 360, useNativeDriver: true }),
    ]).start(() => {
      onAnimationEnd?.();
    });
  }, [active, side, onAnimationEnd, animationProgress]);

  if (!active || !side) return null;

  const opacity = animationProgress.interpolate({ inputRange: [0, 0.2, 0.8, 1, 1.6, 2], outputRange: [0, 1, 1, 1, 0.8, 0] });
  const translateY = animationProgress.interpolate({ inputRange: [0, 1, 2], outputRange: [-30, 0, 20] });
  const scale = animationProgress.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0.8, 1.08, 1, 0.96] });

  const teamColor = teamPrimaryColor(teamName || '');
  const overlayColor = teamColor ? `${teamColor}DD` : 'rgba(25, 25, 30, 0.92)';

  const sideLabel = side === 'home' ? 'HOME' : 'AWAY';
  const title = 'GOAL';

  return (
    <Animated.View
      style={[
        styles.goalMomentWrapper,
        {
          opacity,
          transform: [{ translateY }, { scale }],
          backgroundColor: overlayColor,
        },
      ]}
    >
      <View style={styles.innerRow}>
        <View style={styles.leftSection}>
          {competitionLabel ? <Text style={styles.competitionLabel}>{competitionLabel.toUpperCase()}</Text> : null}
          <Text style={styles.mainLabel}>{title}</Text>
          <Text style={styles.teamName}>{teamName || 'Team'}</Text>
        </View>

        {teamLogo ? (
          <Image source={{ uri: teamLogo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={[styles.logo, { backgroundColor: '#FFFFFF33' }]} />
        )}
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreText}>{`${homeScore} - ${awayScore}`}</Text>
        <View style={styles.sideBadge}>
          <Text style={styles.sideBadgeText}>{sideLabel}</Text>
        </View>
      </View>

      <Text style={styles.subLabel}>{`${teamName || 'They'} have scored!`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  goalMomentWrapper: {
    position: 'relative',
    marginTop: -12,
    marginHorizontal: -16,
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 14,
  },
  innerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flex: 1,
    paddingRight: 8,
  },
  competitionLabel: {
    color: '#EDF2F7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  mainLabel: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 1,
  },
  teamName: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '700',
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#FFFFFF22',
  },
  scoreRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  sideBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  sideBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subLabel: {
    marginTop: 8,
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
});
