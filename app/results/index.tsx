// app/results/index.tsx
// "See All" results screen - improved formatting
// Groups by date, shows leagues, better card design

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { BrandedLoading } from '../../components/BrandedLoading';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { formatCompetitionLabel } from '../../constants/footballCompetitions';
import { footballAPI, Match } from '../../services/footballApi';
import { teamPrimaryColor } from '../../services/teamTint';
import { reloadApp } from '../../services/appReload';
import { getCachedValue, getCachedValueAsync, setCachedValue } from '../../services/cacheService';
import { useAuth } from '../../context/AuthContext';
import { filterMatchesForFeed, getFeedSelections } from '../../services/feedPreferences';
import { useTheme } from '../../context/ThemeContext';
import { buildMatchRouteDescriptor } from '../../services/matchNavigation';
import { prefetchMatchOpenData } from '../../services/matchRoutePrefetch';
import { getPrefetchedAppData } from '../../services/prefetchService';
import { isLikelyFinishedFromLive } from '../../services/matchPhase';

const RESULTS_TTL_MS = 10 * 60 * 1000;
const RESULTS_CACHE_KEY = 'results:all:v4';

interface GroupedMatch extends Match {
  dateLabel: string;
}

interface ResultSection {
  title: string;
  data: GroupedMatch[];
}

const MAX_TEAM_LINE_CHARS = 11;
const TEAM_LABEL_MAP: Record<string, string> = {
  'hamburger sv': 'Hamburg',
  hamburger: 'Hamburg',
};

const canWrapIntoTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  let lineCount = 1;
  let lineLength = 0;
  for (const word of words) {
    if (word.length > maxCharsPerLine) return false;
    if (lineLength === 0) {
      lineLength = word.length;
      continue;
    }
    if (lineLength + 1 + word.length <= maxCharsPerLine) {
      lineLength += 1 + word.length;
      continue;
    }
    lineCount += 1;
    if (lineCount > 2) return false;
    lineLength = word.length;
  }
  return true;
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getResultLeagueLabel = (league: string) => {
  return formatCompetitionLabel(league);
};

const getResultTeamLabel = (match: Match, side: 'home' | 'away') => {
  const rawFullName = (side === 'home' ? match.home : match.away)?.trim() || '';
  const normalizedFullName = rawFullName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (normalizedFullName.includes('hamburg')) return 'Hamburg';
  const fullName = TEAM_LABEL_MAP[rawFullName.toLowerCase()] || rawFullName;
  const shortName = (side === 'home' ? match.homeShortName : match.awayShortName)?.trim();
  const code = (side === 'home' ? match.homeCode : match.awayCode)?.trim();
  if (fullName && canWrapIntoTwoLines(fullName)) return fullName;
  if (shortName && canWrapIntoTwoLines(shortName)) return shortName;
  if (shortName) return shortName;
  if (code && code.length >= 2 && code.length <= 5) return code;
  return fullName;
};

const ResultCard = memo(
  ({
    match,
    onPress,
    palette
  }: {
    match: GroupedMatch;
    onPress: (match: Match) => void;
    palette: {
      card: string;
      text: string;
      subtext: string;
      accent: string;
      border: string;
      placeholder: string;
      badgeBg: string;
      badgeText: string;
    };
  }) => (
    <TouchableOpacity
      style={[
        styles.matchCard,
        { backgroundColor: palette.card, borderColor: palette.border },
      ]}
      onPressIn={() => { void prefetchMatchOpenData(match); }}
      onPress={() => onPress(match)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={[
          withAlpha(teamPrimaryColor(match.home), 0.34),
          withAlpha(teamPrimaryColor(match.away), 0.3),
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.resultCardAccentBar}
      />
      <LinearGradient
        colors={[
          withAlpha(teamPrimaryColor(match.home), 0.06),
          'rgba(0,0,0,0)',
          withAlpha(teamPrimaryColor(match.away), 0.05),
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.resultCardTint}
      />
    <View style={styles.cardHeader}>
      <Text style={[styles.league, { color: palette.accent }]} numberOfLines={1}>
        {getResultLeagueLabel(match.league)}
      </Text>
      <Text style={[styles.timeText, { color: palette.subtext }]}>{match.dateLabel}</Text>
    </View>

    <View style={styles.teamsRow}>
      <View style={styles.team}>
        {match.homeLogo ? (
          <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.teamLogoPlaceholder, { backgroundColor: palette.placeholder }]} />
        )}
        <Text
          style={[styles.teamName, { color: palette.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {getResultTeamLabel(match, 'home')}
        </Text>
      </View>

      <View style={styles.scoreContainer}>
        <Text style={[styles.score, { color: palette.text }]}>{match.score || '0-0'}</Text>
      </View>

      <View style={styles.team}>
        {match.awayLogo ? (
          <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.teamLogoPlaceholder, { backgroundColor: palette.placeholder }]} />
        )}
        <Text
          style={[styles.teamName, { color: palette.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {getResultTeamLabel(match, 'away')}
        </Text>
      </View>
    </View>

    <View style={[styles.cardFooter, { borderTopColor: palette.border }]}>
      <View style={[styles.ftBadge, { backgroundColor: palette.badgeBg }]}>
        <Text style={[styles.ftText, { color: palette.badgeText }]}>FT</Text>
      </View>
      <View style={styles.viewDetailsRow}>
        <Text style={[styles.viewDetailsText, { color: palette.accent }]}>View Details</Text>
        <Ionicons name="chevron-forward" size={14} color={palette.accent} />
      </View>
    </View>
  </TouchableOpacity>
  )
);
ResultCard.displayName = 'ResultCard';

export default function AllResults() {
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const initialMatches =
    getCachedValue<Match[]>(RESULTS_CACHE_KEY, RESULTS_TTL_MS) ??
    getPrefetchedAppData()?.resultsMatches ??
    [];
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const { isDark } = useTheme();
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#FFFFFF',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            border: '#2C2C2E',
            placeholder: '#2F2F31',
            badgeBg: '#2C2C2E',
            badgeText: '#A1A1A6',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5EA',
            placeholder: '#E5E7EB',
            badgeBg: '#F5F5F7',
            badgeText: '#8E8E93',
          },
    [isDark]
  );
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [loading, setLoading] = useState(initialMatches.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Strict feed filter — only show results for the user's selected teams/leagues.
  // When no selections exist (new user), show all recent results.
  const scopedMatches = useMemo(() => {
    if (feedSelections.teams.length === 0 && feedSelections.leagues.length === 0) {
      return [...matches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return filterMatchesForFeed(matches, feedSelections)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [feedSelections, matches]);

  const getFinishedFromLive = useCallback((liveMatches: Match[], activeLiveIds?: Set<string>) => {
    const now = new Date();
    return liveMatches.filter((match) => isLikelyFinishedFromLive(match, now, activeLiveIds));
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const cachedRecent = await footballAPI.getCachedRecentResults(400);
      const [results, pastUpcoming, cachedLive, cachedExploreLive] = await Promise.all([
        footballAPI.getRecentFinishedFixtures(400),
        footballAPI.getResultsFromPastUpcomingCache(),
        getCachedValueAsync<Match[]>('matches:live:v2', 4 * 60 * 60 * 1000),
        getCachedValueAsync<Match[]>('explore:live:v2', 4 * 60 * 60 * 1000),
      ]);
      const forcedFinished = getFinishedFromLive(
        [...(cachedLive ?? []), ...(cachedExploreLive ?? [])],
        new Set(
          (cachedLive ?? [])
            .filter((match) => !isLikelyFinishedFromLive(match))
            .map((match) => String(match.id))
        )
      );
      const activeLiveIds = new Set(
        [...(cachedLive ?? []), ...(cachedExploreLive ?? [])]
          .filter((match) => !isLikelyFinishedFromLive(match))
          .map((match) => String(match.id))
      );
      const resultsCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentCachedResults = cachedRecent.filter((m) => m?.date && new Date(m.date).getTime() >= resultsCutoff);
      const primarySource = results.length > 0 ? results : cachedRecent;
      const nextResults = Array.from(
        new Map(
          [...primarySource, ...recentCachedResults, ...forcedFinished, ...pastUpcoming]
            .filter((match) => !activeLiveIds.has(String(match.id)))
            .map((match) => [match.id, match])
        ).values()
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (nextResults.length > 0) {
        setMatches(nextResults);
        await setCachedValue(RESULTS_CACHE_KEY, nextResults);
      }
    } catch (error) {
      console.error('Failed to load results:', error);
      const fallback = await getCachedValueAsync<Match[]>(RESULTS_CACHE_KEY, RESULTS_TTL_MS) ?? await footballAPI.getCachedRecentResults(120);
      if (fallback && fallback.length > 0) {
        setMatches(fallback);
      }
    } finally {
      setLoading(false);
    }
  }, [getFinishedFromLive]);

  useEffect(() => {
    let isActive = true;
    const hydrate = async () => {
      const cached = await getCachedValueAsync<Match[]>(RESULTS_CACHE_KEY, RESULTS_TTL_MS);
      if (cached && isActive) {
        setMatches(cached);
        setLoading(false);
        return;
      }
      const prefetched = getPrefetchedAppData()?.resultsMatches ?? [];
      if (prefetched.length > 0 && isActive) {
        setMatches(prefetched);
        setLoading(false);
      }
    };
    hydrate();
    fetchResults();
    return () => {
      isActive = false;
    };
  }, [fetchResults]);

  // Re-fetch whenever the user navigates back to this screen so newly finished
  // games (written to Firestore by the live Cloud Function) appear immediately.
  useFocusEffect(
    useCallback(() => {
      fetchResults();
    }, [fetchResults])
  );

  useEffect(() => {
    matches.slice(0, 8).forEach((match) => {
      void prefetchMatchOpenData(match);
    });
  }, [matches]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const didReload = await reloadApp(async () => {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      await fetchResults();
    });
    if (!didReload) {
      setRefreshing(false);
    }
  }, [bootstrapApp, fetchResults, userProfile?.uid]);

  const handleOpenMatch = useCallback((match: Match) => {
    router.push(buildMatchRouteDescriptor({ ...match, status: 'finished' }) as any);
  }, []);

  const renderMatch = useCallback(
    ({ item }: { item: GroupedMatch }) => (
      <ResultCard match={item} onPress={handleOpenMatch} palette={palette} />
    ),
    [handleOpenMatch, palette]
  );

  const filteredMatches = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searched = !normalizedSearch
      ? scopedMatches
      : scopedMatches.filter((match) =>
      `${match.home} ${match.away} ${match.league}`.toLowerCase().includes(normalizedSearch)
    );
    return searched
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [scopedMatches, searchQuery]);

  const sections = useMemo(() => {
    if (filteredMatches.length === 0) return [];

    // Group matches by date
    const grouped = new Map<string, GroupedMatch[]>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredMatches.forEach((match) => {
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

      const groupedMatch: GroupedMatch = {
        ...match,
        dateLabel
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
  }, [filteredMatches]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: ResultSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{section.title}</Text>
      </View>
    ),
    [palette.text]
  );

  const keyExtractor = useCallback((item: GroupedMatch) => item.id.toString(), []);

  if (loading && matches.length === 0) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Results</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={[styles.searchWrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Ionicons name="search" size={18} color={palette.subtext} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search teams or leagues..."
          placeholderTextColor={palette.subtext}
          style={[styles.searchInput, { color: palette.text }]}
        />
      </View>

      {matches.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="football" size={64} color={palette.subtext} />
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No Recent Results</Text>
          <Text style={[styles.emptySubtitle, { color: palette.subtext }]}>Check back after matches conclude</Text>
        </View>
      ) : filteredMatches.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="search" size={64} color={palette.subtext} />
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No matches found</Text>
          <Text style={[styles.emptySubtitle, { color: palette.subtext }]}>Try a different team or league search</Text>
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
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  resultCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  resultCardTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    lineHeight: 17,
    minHeight: 34,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    width: '100%',
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
