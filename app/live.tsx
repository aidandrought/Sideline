import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadow } from '../components/styleUtils';
import { BrandedLoading } from '../components/BrandedLoading';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { useAuth } from '../context/AuthContext';
import { reloadApp } from '../services/appReload';
import { getCachedValue, getCachedValueAsync } from '../services/cacheService';
import { filterMatchesForFeed, getFeedSelections } from '../services/feedPreferences';
import { footballAPI, Match } from '../services/footballApi';
import { formatCompetitionLabel } from '../constants/footballCompetitions';
import { getMatchPhase } from '../services/matchPhase';
import { formatKickoffLabel, isPregameWindow } from '../services/matchTime';
import { prefetchMatchOpenData } from '../services/matchRoutePrefetch';
import { buildMatchRouteDescriptor } from '../services/matchNavigation';
import { presenceService } from '../services/presenceService';
import { teamPrimaryColor } from '../services/teamTint';
import { getPrefetchedAppData } from '../services/prefetchService';
import { chatService } from '../services/chatService';
import { useTheme } from '../context/ThemeContext';

const isMarqueeMatch = (match: Match) => {
  const league = (match.league || '').toLowerCase();
  if (league.includes('concacaf')) return false;
  return (
    league.includes('champions league') ||
    league.includes('europa league') ||
    league.includes('conference league') ||
    league.includes('world cup') ||
    league.includes('cup final') ||
    league.includes('cup semi') ||
    league.includes('super cup')
  );
};

const mergeDeduped = (primary: Match[], extras: Match[]): Match[] => {
  const ids = new Set(primary.map((m) => m.id));
  return [...primary, ...extras.filter((m) => !ids.has(m.id))];
};

const TEAM_ABBR_MAP: Record<string, string> = {
  'hamburger sv': 'Hamburg',
  hamburger: 'Hamburg',
  'borussia monchengladbach': 'Gladbach',
  'borussia mgladbach': 'Gladbach',
  'manchester united': 'Man United',
  'manchester city': 'Man City',
  'wolverhampton wanderers': 'Wolves',
  'tottenham hotspur': 'Tottenham',
  'paris saint germain': 'PSG',
  'paris saint-germain': 'PSG',
  'inter milan': 'Inter',
  'ac milan': 'Milan',
  'atletico madrid': 'Atletico',
  'eintracht frankfurt': 'Frankfurt',
  'bayer leverkusen': 'Leverkusen',
};

const MAX_TEAM_LINE_CHARS = 11;
const LIVE_CACHE_KEY = 'matches:live:v2';
const LEGACY_LIVE_CACHE_KEY = 'matches:live';
const UPCOMING_CACHE_KEY = 'matches:upcoming:7d:v14';
const LEGACY_UPCOMING_CACHE_KEY = 'matches:upcoming:7d:v13';
const LIVE_TTL_MS = 20 * 1000;
const UPCOMING_TTL_MS = 10 * 60 * 1000;

const buildPregameMatches = (matches: Match[]) => {
  const now = new Date();
  return matches.filter((match) => {
    const kickoff = new Date(match.date);
    return !Number.isNaN(kickoff.getTime()) && isPregameWindow(kickoff, now);
  });
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

export default function LiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const prefetchedAppData = getPrefetchedAppData();
  const initialLiveMatches =
    prefetchedAppData?.liveMatches ??
    getCachedValue<Match[]>(LIVE_CACHE_KEY, LIVE_TTL_MS) ??
    getCachedValue<Match[]>(LEGACY_LIVE_CACHE_KEY, LIVE_TTL_MS) ??
    [];
  const initialUpcomingMatches =
    prefetchedAppData?.upcomingMatches ??
    getCachedValue<Match[]>(UPCOMING_CACHE_KEY, UPCOMING_TTL_MS) ??
    getCachedValue<Match[]>(LEGACY_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS) ??
    [];
  const initialPregameMatches = buildPregameMatches(initialUpcomingMatches);
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const { isDark } = useTheme();
  const [liveMatches, setLiveMatches] = useState<Match[]>(initialLiveMatches);
  const [pregameMatches, setPregameMatches] = useState<Match[]>(initialPregameMatches);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(initialLiveMatches.length === 0 && initialPregameMatches.length === 0);
  const [nowTs, setNowTs] = useState(Date.now());
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const scopedLiveMatches = useMemo(() => {
    const filtered = filterMatchesForFeed(liveMatches, feedSelections);
    if (feedSelections.teams.length === 0 && feedSelections.leagues.length === 0) return filtered;
    return mergeDeduped(filtered, liveMatches.filter(isMarqueeMatch));
  }, [feedSelections, liveMatches]);

  const scopedPregameMatches = useMemo(() => {
    const filtered = filterMatchesForFeed(pregameMatches, feedSelections);
    if (feedSelections.teams.length === 0 && feedSelections.leagues.length === 0) return filtered;
    return mergeDeduped(filtered, pregameMatches.filter(isMarqueeMatch));
  }, [feedSelections, pregameMatches]);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#17191D',
            header: '#121418',
            text: '#F5F7FA',
            subtext: '#98A2B3',
            border: '#23262D',
            searchBg: '#171A20',
            scoreBg: '#20242C',
            accent: '#4DA3FF',
            accentSoft: 'rgba(77,163,255,0.14)',
            liveBg: 'rgba(255,69,58,0.14)',
            liveText: '#FF6B5E',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            header: '#FFFFFF',
            text: '#000000',
            subtext: '#667085',
            border: '#E5E7EB',
            searchBg: '#FFFFFF',
            scoreBg: '#F2F4F7',
            accent: '#0066CC',
            accentSoft: '#E8F1FF',
            liveBg: '#FFF1F0',
            liveText: '#FF3B30',
          },
    [isDark]
  );

  const getDisplayLeagueName = (leagueName: string) => {
    return formatCompetitionLabel(leagueName);
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

  const getDisplayTeamName = (team: { name?: string; short_name?: string; code?: string }) => {
    const fullName = (team.name || '').trim();
    const normalizedFullName = fullName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (normalizedFullName.includes('hamburg')) return 'Hamburg';
    if (fullName && canWrapIntoTwoLines(fullName)) return fullName;

    const shortName = team.short_name?.trim();
    const mapped = TEAM_ABBR_MAP[fullName.toLowerCase()];
    if (shortName && canWrapIntoTwoLines(shortName)) return shortName;
    if (mapped && canWrapIntoTwoLines(mapped)) return mapped;
    const code = team.code?.trim();
    if (code && code.length >= 2 && code.length <= 5) return code;
    if (shortName) return shortName;
    if (mapped) return mapped;
    const words = fullName.split(' ').filter(Boolean);
    if (words.length >= 2) {
      const last = words[words.length - 1];
      return last.length >= 5 ? last : `${words[0]} ${last}`;
    }
    return fullName;
  };

  const loadLiveMatches = useCallback(async (options: { includeUpcoming?: boolean } = {}) => {
    const { includeUpcoming = true } = options;
    try {
      const live = await footballAPI.getLiveMatches();
      const now = new Date();
      const liveOnly = live.filter((match) => {
        const phaseInfo = getMatchPhase({
          kickoffAt: match.date,
          status: match.status,
          now,
        });
        return phaseInfo.phase === 'live';
      });
      setLiveMatches(liveOnly);
      if (includeUpcoming) {
        const upcoming = await footballAPI.getUpcomingMatches();
        const pregame = buildPregameMatches(upcoming);
        setPregameMatches(pregame);
      }
    } catch (error) {
      console.error('Error loading live matches:', error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    let active = true;
    if (initialLiveMatches.length === 0 && initialPregameMatches.length === 0) {
      void Promise.all([
        getCachedValueAsync<Match[]>(LIVE_CACHE_KEY, LIVE_TTL_MS),
        getCachedValueAsync<Match[]>(UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
        getCachedValueAsync<Match[]>(LEGACY_LIVE_CACHE_KEY, LIVE_TTL_MS),
        getCachedValueAsync<Match[]>(LEGACY_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
      ]).then(([cachedLive, cachedUpcoming, legacyLive, legacyUpcoming]) => {
        if (!active) return;
        const nextLive = cachedLive ?? legacyLive ?? [];
        const nextPregame = buildPregameMatches(cachedUpcoming ?? legacyUpcoming ?? []);
        if (nextLive.length > 0) setLiveMatches(nextLive);
        if (nextPregame.length > 0) setPregameMatches(nextPregame);
        if (nextLive.length > 0 || nextPregame.length > 0) setLoading(false);
      });
    }
    loadLiveMatches();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadLiveMatches({ includeUpcoming: false });
    }, 60000);
    return () => clearInterval(interval);
  }, [loadLiveMatches]);

  // Refresh pregame list every 5 min so newly-scheduled matches (e.g. same-day UCL) appear quickly.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadLiveMatches({ includeUpcoming: true });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadLiveMatches]);

  useEffect(() => {
    const all = [...scopedPregameMatches, ...scopedLiveMatches];
    if (all.length === 0) return;
    const unsubscribers: (() => void)[] = [];
    all.forEach(match => {
      const chatId = match.id.toString();
      const unsubscribe = presenceService.listenActiveCount('match', chatId, (count) => {
        setViewerCounts(prev => {
          if (prev[chatId] === count) return prev;
          return { ...prev, [chatId]: count };
        });
      });
      unsubscribers.push(unsubscribe);
    });
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [scopedLiveMatches, scopedPregameMatches]);

  const onRefresh = async () => {
    setRefreshing(true);
    const didReload = await reloadApp(async () => {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      await loadLiveMatches();
    });
    if (!didReload) {
      setRefreshing(false);
    }
  };

  const getMatchRoute = (match: Match) => {
    return buildMatchRouteDescriptor(match, new Date(nowTs));
  };

  const isChatAvailableForMatch = (match: Match) => {
    const kickoffMs = new Date(match.date).getTime();
    if (!Number.isFinite(kickoffMs)) return false;
    const status = match.status === 'finished' ? 'FT' : match.status === 'live' ? 'LIVE' : 'NS';
    return chatService.isChatOpen(kickoffMs, status);
  };

  const renderMatchItem = ({ item, variant }: { item: Match; variant: 'live' | 'pregame' }) => {
    const chatAvailable = isChatAvailableForMatch(item);
    const targetRoute = getMatchRoute(item);
    const isLiveVariant = variant === 'live';
    const statusText = isLiveVariant ? (item.minute || 'LIVE') : 'CHAT OPEN';
    const footerText = isLiveVariant
      ? ((viewerCounts[item.id.toString()] ?? 0) > 0
          ? `${(viewerCounts[item.id.toString()] ?? 0).toLocaleString()} watching`
          : 'Live now')
      : `Starts @ ${formatKickoffLabel(new Date(item.date))}`;
    const scoreLabel = isLiveVariant ? (item.score || '0-0') : 'VS';
    return (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.matchCard,
        { backgroundColor: palette.card, borderColor: palette.border },
        variant === 'live' && !chatAvailable && styles.matchCardDisabled,
      ]}
      onPressIn={() => { void prefetchMatchOpenData(item); }}
      onPress={() => {
        if (variant === 'live' && !chatAvailable) return;
        router.push(targetRoute as any);
      }}
      activeOpacity={variant === 'live' && !chatAvailable ? 1 : 0.7}
    >
      <LinearGradient
        colors={[
          withAlpha(teamPrimaryColor(item.home), isDark ? 0.18 : 0.09),
          withAlpha(teamPrimaryColor(item.home), isDark ? 0.08 : 0.04),
          withAlpha(teamPrimaryColor(item.away), isDark ? 0.07 : 0.03),
          withAlpha(teamPrimaryColor(item.away), isDark ? 0.16 : 0.08),
        ]}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0, y: 0.18 }}
        end={{ x: 1, y: 0.82 }}
        style={styles.liveCardBlend}
      />
      <LinearGradient
        colors={[
          withAlpha(teamPrimaryColor(item.home), isDark ? 0.8 : 0.68),
          withAlpha(teamPrimaryColor(item.away), isDark ? 0.8 : 0.68),
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.liveCardAccentBar}
      />
      <View style={styles.cardHeader}>
        <Text style={[styles.cardLeague, { color: palette.accent }]} numberOfLines={1}>
          {getDisplayLeagueName(item.league)}
        </Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isLiveVariant ? palette.liveBg : palette.accentSoft },
          ]}
        >
          {isLiveVariant ? (
            <View style={styles.liveTagDot} />
          ) : (
            <Ionicons name="chatbubbles" size={11} color={palette.accent} />
          )}
          <Text
            style={[
              styles.statusBadgeText,
              { color: isLiveVariant ? palette.liveText : palette.accent },
            ]}
          >
            {statusText}
          </Text>
        </View>
      </View>

      <View style={styles.cardTeamsRow}>
        <View style={styles.cardTeam}>
          {item.homeLogo ? (
            <Image source={{ uri: item.homeLogo }} style={styles.cardTeamLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.cardTeamLogoPlaceholder, { backgroundColor: palette.border }]} />
          )}
          <Text
            style={[styles.cardTeamName, { color: palette.text }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {getDisplayTeamName({ name: item.home, short_name: item.homeShortName, code: item.homeCode })}
          </Text>
        </View>
        <View style={styles.cardScoreContainer}>
          <Text style={[styles.cardScore, { color: palette.text }]}>{scoreLabel}</Text>
          {isLiveVariant ? (
            <Text style={[styles.cardScoreMeta, { color: palette.subtext }]}>{item.minute || 'Live'}</Text>
          ) : null}
        </View>
        <View style={styles.cardTeam}>
          {item.awayLogo ? (
            <Image source={{ uri: item.awayLogo }} style={styles.cardTeamLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.cardTeamLogoPlaceholder, { backgroundColor: palette.border }]} />
          )}
          <Text
            style={[styles.cardTeamName, { color: palette.text }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {getDisplayTeamName({ name: item.away, short_name: item.awayShortName, code: item.awayCode })}
          </Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: palette.border }]}>
        <View style={styles.cardFooterMeta}>
          <Ionicons
            name={isLiveVariant ? 'people-outline' : 'time-outline'}
            size={14}
            color={palette.subtext}
          />
          <Text
            style={[
              styles.cardFooterMetaText,
              { color: palette.subtext },
            ]}
          >
            {footerText}
          </Text>
        </View>
        <View style={styles.cardActionRow}>
          <Text
            style={[
              styles.cardActionText,
              { color: chatAvailable ? palette.accent : palette.subtext },
            ]}
          >
            {chatAvailable ? 'Join Live Chat' : 'Chat Closed'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={chatAvailable ? palette.accent : palette.subtext} />
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <BrandedLoading variant="launch" dark />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons name="calendar-outline" size={64} color={palette.border} />
        </View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>No Live Matches Right Now</Text>
        <Text style={[styles.emptySubtitle, { color: palette.subtext }]}>Check upcoming matches or come back later when games are live.</Text>
        
        <TouchableOpacity 
          style={[styles.upcomingButton, { backgroundColor: palette.accentSoft }]}
          onPress={() => router.push('/upcoming')}
        >
          <Ionicons name="time-outline" size={20} color={palette.accent} />
          <Text style={[styles.upcomingButtonText, { color: palette.accent }]}>View Upcoming Matches</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const pregameIdSet = useMemo(
    () => new Set(scopedPregameMatches.map((match) => match.id.toString())),
    [scopedPregameMatches]
  );
  const filteredCombinedMatches = useMemo(() => {
    const all = [...scopedPregameMatches, ...scopedLiveMatches];
    if (!normalizedSearch) return all;
    return all.filter((match) =>
      `${match.home} ${match.away} ${match.league}`.toLowerCase().includes(normalizedSearch)
    );
  }, [normalizedSearch, scopedLiveMatches, scopedPregameMatches]);
  useEffect(() => {
    filteredCombinedMatches.slice(0, 6).forEach((match) => {
      void prefetchMatchOpenData(match);
    });
  }, [filteredCombinedMatches]);
  const filteredPregameCount = useMemo(
    () => filteredCombinedMatches.filter((match) => pregameIdSet.has(match.id.toString())).length,
    [filteredCombinedMatches, pregameIdSet]
  );
  const filteredLiveCount = filteredCombinedMatches.length - filteredPregameCount;

  const matchCountTitle = useMemo(() => {
    if (filteredLiveCount > 0 && filteredPregameCount > 0) {
      return `${filteredLiveCount} Live, ${filteredPregameCount} Pre Game`;
    }
    if (filteredLiveCount > 0) {
      return `${filteredLiveCount} ${filteredLiveCount === 1 ? 'Live Match' : 'Live Matches'}`;
    }
    if (filteredPregameCount > 0) {
      return `${filteredPregameCount} Pre Game`;
    }
    return 'Live Matches';
  }, [filteredLiveCount, filteredPregameCount]);

  const liveSummaryText = useMemo(() => {
    if (filteredPregameCount > 0 && filteredLiveCount > 0) {
      return `${filteredLiveCount} live now · ${filteredPregameCount} pre game`;
    }
    if (filteredPregameCount > 0) {
      return `${filteredPregameCount} pre game`;
    }
    if (filteredLiveCount > 0) {
      return `${filteredLiveCount} live now`;
    }
    return '';
  }, [filteredPregameCount, filteredLiveCount]);

  if (loading && liveMatches.length === 0 && pregameMatches.length === 0) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['left', 'right']}>
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top + 8, 48), backgroundColor: palette.header, borderBottomColor: palette.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>
          {matchCountTitle}
        </Text>
        <View style={{ width: 28 }} />
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

      <FlatList
        style={styles.content}
        data={filteredCombinedMatches}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const isPregame = pregameIdSet.has(item.id.toString());
          return renderMatchItem({ item, variant: isPregame ? 'pregame' : 'live' });
        }}
        ListHeaderComponent={filteredCombinedMatches.length > 0 && liveSummaryText ? (
          <View style={[styles.liveHeader, { backgroundColor: palette.background }]}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveText, { color: palette.liveText }]}>{liveSummaryText}</Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={<View style={{ height: 40 }} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  loadingContainer: {
    paddingVertical: 100,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  liveHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  liveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
  },
  matchCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  liveCardBlend: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  liveCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  matchCardDisabled: {
    opacity: 0.72,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardLeague: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTeam: {
    flex: 1,
    alignItems: 'center',
  },
  cardTeamLogo: {
    width: 36,
    height: 36,
    marginBottom: 8,
  },
  cardTeamLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 8,
  },
  cardTeamName: {
    width: '100%',
    minHeight: 34,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardScoreContainer: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  cardScore: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cardScoreMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cardFooterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  cardFooterMetaText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 12,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    paddingVertical: 100,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  upcomingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  upcomingButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0066CC',
  },
});
