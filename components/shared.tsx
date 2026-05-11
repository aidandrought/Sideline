// components/shared.tsx
// Reusable UI components for the app

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

// Loading Spinner
export const LoadingSpinner = ({ message = 'Loading...' }: { message?: string }) => (
  <View style={sharedStyles.loadingContainer}>
    <ActivityIndicator size="large" color="#0066CC" />
    <Text style={sharedStyles.loadingText}>{message}</Text>
  </View>
);

// Empty State
interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}

export const EmptyState = ({ icon = 'disc-outline', title, subtitle }: EmptyStateProps) => (
  <View style={sharedStyles.emptyState}>
    <Ionicons name={icon} size={64} color="#E5E7EB" />
    <Text style={sharedStyles.emptyTitle}>{title}</Text>
    {subtitle && <Text style={sharedStyles.emptySubtitle}>{subtitle}</Text>}
  </View>
);

// Error State
interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
  <View style={sharedStyles.errorState}>
    <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
    <Text style={sharedStyles.errorTitle}>Oops!</Text>
    <Text style={sharedStyles.errorMessage}>{message}</Text>
    {onRetry && (
      <Text style={sharedStyles.retryButton} onPress={onRetry}>
        Tap to retry
      </Text>
    )}
  </View>
);

// Section Header
interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export const SectionHeader = ({ title, onSeeAll }: SectionHeaderProps) => (
  <View style={sharedStyles.sectionHeader}>
    <Text style={sharedStyles.sectionTitle}>{title}</Text>
    {onSeeAll && (
      <Text style={sharedStyles.seeAllButton} onPress={onSeeAll}>
        See All
      </Text>
    )}
  </View>
);

// Live Badge
export const LiveBadge = ({ time }: { time?: string }) => (
  <View style={sharedStyles.liveBadge}>
    <View style={sharedStyles.liveDot} />
    <Text style={sharedStyles.liveText}>{time || 'LIVE'}</Text>
  </View>
);

// Match Score Display
interface MatchScoreProps {
  home: string;
  away: string;
  score?: string;
  league?: string;
  isLive?: boolean;
  minute?: string;
}

export const MatchScore = ({ home, away, score, league, isLive, minute }: MatchScoreProps) => (
  <View style={sharedStyles.matchScore}>
    {isLive && <LiveBadge time={minute} />}
    {score && <Text style={sharedStyles.scoreText}>{score}</Text>}
    <Text style={sharedStyles.teamsText}>{home} vs {away}</Text>
    {league && <Text style={sharedStyles.leagueText}>{league}</Text>}
  </View>
);

const sharedStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF3B30',
    marginTop: 20,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: '700',
    color: '#0066CC',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  seeAllButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066CC',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  liveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF3B30',
  },
  matchScore: {
    alignItems: 'flex-start',
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginBottom: 6,
  },
  teamsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  leagueText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
});