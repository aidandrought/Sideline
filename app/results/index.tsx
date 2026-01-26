// app/results/index.tsx
// "See All" results screen - improved formatting
// Groups by date, shows leagues, better card design

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { footballAPI, Match } from '../../services/footballApi';
import { getCachedValue, getCachedValueAsync, setCachedValue } from '../../services/cacheService';

const RESULTS_TTL_MS = 10 * 60 * 1000;

interface GroupedMatch extends Match {
  dateLabel: string;
}

interface ResultSection {
  title: string;
  data: GroupedMatch[];
}

const ResultCard = memo(({ match, onPress }: { match: GroupedMatch; onPress: (match: Match) => void }) => (
  <TouchableOpacity style={styles.matchCard} onPress={() => onPress(match)} activeOpacity={0.7}>
    <View style={styles.cardHeader}>
      <Text style={styles.league} numberOfLines={1}>
        {match.league}
      </Text>
      <View style={styles.ftBadge}>
        <Text style={styles.ftText}>FT</Text>
      </View>
    </View>

    <View style={styles.teamsRow}>
      <View style={styles.team}>
        {match.homeLogo ? (
          <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={styles.teamLogoPlaceholder} />
        )}
        <Text style={styles.teamName} numberOfLines={1}>
          {match.home}
        </Text>
      </View>

      <View style={styles.scoreContainer}>
        <Text style={styles.score}>{match.score || '0-0'}</Text>
      </View>

      <View style={styles.team}>
        {match.awayLogo ? (
          <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={styles.teamLogoPlaceholder} />
        )}
        <Text style={styles.teamName} numberOfLines={1}>
          {match.away}
        </Text>
      </View>
    </View>

    <View style={styles.cardFooter}>
      <Text style={styles.timeText}>{match.dateLabel}</Text>
      <View style={styles.viewDetailsRow}>
        <Text style={styles.viewDetailsText}>View Details</Text>
        <Ionicons name="chevron-forward" size={14} color="#0066CC" />
      </View>
    </View>
  </TouchableOpacity>
));

export default function AllResults() {
  const [matches, setMatches] = useState<Match[]>(getCachedValue('results:all', RESULTS_TTL_MS) ?? []);
  const [loading, setLoading] = useState(matches.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = useCallback(async () => {
    const results = await footballAPI.getFinishedFixtures(14); // 14 days of results
    setMatches(results);
    await setCachedValue('results:all', results);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isActive = true;
    const hydrate = async () => {
      const cached = await getCachedValueAsync<Match[]>('results:all', RESULTS_TTL_MS);
      if (cached && isActive) {
        setMatches(cached);
        setLoading(false);
      }
    };
    hydrate();
    fetchResults();
    return () => {
      isActive = false;
    };
  }, [fetchResults]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchResults();
    setRefreshing(false);
  }, [fetchResults]);

  const handleOpenMatch = useCallback((match: Match) => {
    router.push({
      pathname: '/results/[id]',
      params: { id: match.id }
    });
  }, []);

  const renderMatch = useCallback(
    ({ item }: { item: GroupedMatch }) => <ResultCard match={item} onPress={handleOpenMatch} />,
    [handleOpenMatch]
  );

  const sections = useMemo(() => {
    if (matches.length === 0) return [];

    // Group matches by date
    const grouped = new Map<string, GroupedMatch[]>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    matches.forEach((match) => {
      const matchDate = new Date(match.date);
      const matchDay = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());
      
      let dateKey: string;
      let dateLabel: string;
      
      if (matchDay.getTime() === today.getTime()) {
        dateKey = 'Today';
        dateLabel = 'Today';
      } else if (matchDay.getTime() === yesterday.getTime()) {
        dateKey = 'Yesterday';
        dateLabel = 'Yesterday';
      } else {
        const dayNum = matchDate.getDate();
        const month = matchDate.toLocaleDateString('en-US', { month: 'short' });
        dateKey = matchDate.toISOString().split('T')[0];
        dateLabel = `${dayNum} ${month}`;
      }

      const time = matchDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      const groupedMatch: GroupedMatch = {
        ...match,
        dateLabel: time
      };

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(groupedMatch);
    });

    // Convert to sections array
    const sectionsArray: ResultSection[] = [];
    const dateOrder = ['Today', 'Yesterday'];
    
    // Add Today and Yesterday first
    dateOrder.forEach(key => {
      if (grouped.has(key)) {
        sectionsArray.push({
          title: key,
          data: grouped.get(key)!
        });
        grouped.delete(key);
      }
    });

    // Add remaining dates in chronological order (most recent first)
    const remainingDates = Array.from(grouped.keys()).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });

    remainingDates.forEach(dateKey => {
      const match = grouped.get(dateKey)![0];
      const matchDate = new Date(match.date);
      const dayNum = matchDate.getDate();
      const month = matchDate.toLocaleDateString('en-US', { month: 'short' });
      
      sectionsArray.push({
        title: `${dayNum} ${month}`,
        data: grouped.get(dateKey)!
      });
    });

    return sectionsArray;
  }, [matches]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: ResultSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    []
  );

  const keyExtractor = useCallback((item: GroupedMatch) => item.id.toString(), []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Results</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="football" size={64} color="#8E8E93" />
          <Text style={styles.emptyTitle}>No Recent Results</Text>
          <Text style={styles.emptySubtitle}>Check back after matches conclude</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderMatch}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerSpacer: {
    width: 44,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  matchCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  league: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066CC',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ftBadge: {
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ftText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLogo: {
    width: 36,
    height: 36,
  },
  teamLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  scoreContainer: {
    paddingHorizontal: 16,
  },
  score: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
});