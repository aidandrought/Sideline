// app/upcoming.tsx
// IMPROVED: Date grouping, better organization

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandedLoading } from '../components/BrandedLoading';
import { shadow } from '../components/styleUtils';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { CORE_LEAGUE_COMPETITIONS, FEATURED_TOURNAMENT_COMPETITIONS, formatCompetitionLabel } from '../constants/footballCompetitions';
import { auth, db } from '../config/firebase';
import { analyticsService } from '../services/analyticsService';
import { reloadApp } from '../services/appReload';
import { getCachedValue, getCachedValueAsync, getOrFetchCached, setCachedValue } from '../services/cacheService';
import { filterMatchesForFeed, getFeedSelections } from '../services/feedPreferences';
import { monitoringService } from '../services/monitoringService';
import { footballAPI, Match } from '../services/footballApi';
import { teamPrimaryColor } from '../services/teamTint';
import { buildMatchRouteDescriptor } from '../services/matchNavigation';
import { prefetchMatchOpenData } from '../services/matchRoutePrefetch';
import { getMatchPhase } from '../services/matchPhase';
import { getPrefetchedAppData } from '../services/prefetchService';

interface GroupedMatches {
  [key: string]: Match[];
}
type MatchTypeFilter = 'all' | 'league' | 'tournament';
type DateRangeFilter = 'all' | 'today' | '7d' | '30d';
type MatchNotifyPrefs = {
  goals: boolean;
  cards: boolean;
  halftime: boolean;
  matchStart: boolean;
  fulltime: boolean;
  transferNews: boolean;
};
type TeamNotifyOverrides = Record<string, MatchNotifyPrefs>;

const DEFAULT_MATCH_NOTIFY_PREFS: MatchNotifyPrefs = {
  goals: true,
  cards: true,
  halftime: true,
  matchStart: true,
  fulltime: true,
  transferNews: true,
};

const MAX_TEAM_LINE_CHARS = 11;
const UPCOMING_CACHE_KEY = 'matches:upcoming:7d:v14';
const LEGACY_UPCOMING_CACHE_KEY = 'matches:upcoming:7d:v13';
const UPCOMING_TTL_MS = 10 * 60 * 1000;
const MATCH_NOTIFICATION_IDS_TTL_MS = 2 * 60 * 1000;
const UPCOMING_FEED_RESCUE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const UPCOMING_FEED_TOO_FAR_MS = 2 * 24 * 60 * 60 * 1000;
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

const getUpcomingTeamLabel = (team: { name?: string; short_name?: string; code?: string }) => {
  const rawFullName = (team.name || '').trim();
  const normalizedFullName = rawFullName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (normalizedFullName.includes('hamburg')) return 'Hamburg';
  const fullName = TEAM_LABEL_MAP[rawFullName.toLowerCase()] || rawFullName;
  const shortName = team.short_name?.trim();
  const code = team.code?.trim();
  if (fullName && canWrapIntoTwoLines(fullName)) return fullName;
  if (shortName && canWrapIntoTwoLines(shortName)) return shortName;
  if (shortName) return shortName;
  if (code && code.length >= 2 && code.length <= 5) return code;
  return fullName;
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

const isTomorrowDate = (dateValue: Date | string) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
  return date >= tomorrowStart && date < tomorrowEnd;
};

const getUpcomingLeagueLabel = (league: string, tomorrow: boolean) => {
  const base = formatCompetitionLabel(league);
  if (/concacaf|concacaf champions|concacaf cl|ccl/i.test(league) || /^(CCL|Concacaf Champions|Concacaf CL)$/i.test(base)) {
    return 'CCL';
  }

  if (tomorrow && /^(Champions|Conference) League$/i.test(base)) {
    return base;
  }

  if (tomorrow && base.length > 16) {
    return base
      .split(' ')
      .map((word) => word[0]?.toUpperCase() || '')
      .slice(0, 3)
      .join('');
  }
  return base;
};

const normalizeLeagueName = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isMarqueeUpcomingMatch = (match: Pick<Match, 'league'>) => {
  const league = normalizeLeagueName(match.league);
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

const sortByKickoffAsc = (items: Match[]) =>
  items.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const mergeUpcomingMatches = (primary: Match[], secondary: Match[]) => {
  const byId = new Map<string, Match>();
  [...primary, ...secondary].forEach((match) => byId.set(String(match.id), match));
  return sortByKickoffAsc(Array.from(byId.values()));
};

export default function UpcomingScreen() {
  const router = useRouter();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const initialMatches =
    getPrefetchedAppData()?.upcomingMatches ??
    getCachedValue<Match[]>(UPCOMING_CACHE_KEY, UPCOMING_TTL_MS) ??
    getCachedValue<Match[]>(LEGACY_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS) ??
    [];
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(initialMatches.length === 0);
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());
  const [loadingNotify, setLoadingNotify] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [notifyPrefsModalVisible, setNotifyPrefsModalVisible] = useState(false);
  const [typeFilter, setTypeFilter] = useState<MatchTypeFilter>('all');
  const [competitionFilter, setCompetitionFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNotifyMatchId, setActiveNotifyMatchId] = useState<string | null>(null);
  const [pendingPrefs, setPendingPrefs] = useState<MatchNotifyPrefs>(DEFAULT_MATCH_NOTIFY_PREFS);
  const [savedDefaultPrefs, setSavedDefaultPrefs] = useState<MatchNotifyPrefs>(DEFAULT_MATCH_NOTIFY_PREFS);
  const [teamNotifyOverrides, setTeamNotifyOverrides] = useState<TeamNotifyOverrides>({});
  // Strict feed filter — only show matches the user has selected teams/leagues for.
  // When no selections exist (new user), show everything.
  const scopedMatches = useMemo(() => {
    const sortedMatches = sortByKickoffAsc(matches);
    if (feedSelections.teams.length === 0 && feedSelections.leagues.length === 0) return sortedMatches;
    const now = Date.now();
    const filtered = sortByKickoffAsc(filterMatchesForFeed(sortedMatches, feedSelections));
    const firstFilteredKickoff = filtered[0] ? new Date(filtered[0].date).getTime() : Number.POSITIVE_INFINITY;
    // Always surface marquee matches (UCL, EL, etc.) within the next 3 days regardless of feed.
    const nearTermMarquee = sortedMatches.filter((match) => {
      const kickoff = new Date(match.date).getTime();
      return kickoff > now && kickoff <= now + UPCOMING_FEED_RESCUE_WINDOW_MS && isMarqueeUpcomingMatch(match);
    });
    if (nearTermMarquee.length > 0) {
      return mergeUpcomingMatches(nearTermMarquee, filtered);
    }
    return filtered;
  }, [feedSelections, matches]);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            accentSoft: 'rgba(77,163,255,0.18)',
            border: '#2C2C2E',
            placeholder: '#2C2C2E',
            banner: '#1B2A3D',
            bannerText: '#A9C6FF',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            accentSoft: 'rgba(0,102,204,0.1)',
            border: '#E5E7EB',
            placeholder: '#E5E7EB',
            banner: '#E3F2FD',
            bannerText: '#0066CC',
          },
    [isDark]
  );

  useEffect(() => {
    let active = true;
    if (initialMatches.length === 0) {
      void Promise.all([
        getCachedValueAsync<Match[]>(UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
        getCachedValueAsync<Match[]>(LEGACY_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
      ]).then(([cachedMatches, legacyCachedMatches]) => {
        const nextMatches = cachedMatches ?? legacyCachedMatches;
        if (!active || !nextMatches || nextMatches.length === 0) return;
        setMatches(nextMatches);
        setLoading(false);
      });
    }
    loadMatches();
    return () => {
      active = false;
    };
  }, []);
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      void Promise.all([loadSubscriptions(user.uid), loadNotificationDefaults(user.uid)]);
    });
    return unsub;
  }, []);

  const loadMatches = async (forceRefresh = false) => {
    try {
      if (matches.length === 0) {
        setLoading(true);
      }
      let upcomingMatches = await footballAPI.getUpcomingMatches(forceRefresh ? { preferCache: false } : {});
      const hasNearTermMatches = upcomingMatches.some((match) => {
        const kickoff = new Date(match.date).getTime();
        return kickoff > Date.now() && kickoff <= Date.now() + UPCOMING_FEED_TOO_FAR_MS;
      });
      if (!forceRefresh && !hasNearTermMatches) {
        try {
          const freshUpcomingMatches = await footballAPI.getUpcomingMatches({ preferCache: false });
          if (freshUpcomingMatches.length > 0) {
            upcomingMatches = freshUpcomingMatches;
          }
        } catch {
          // Keep the cached list if direct refresh is unavailable.
        }
      }
      setMatches((prev) => (upcomingMatches.length > 0 ? upcomingMatches : prev));
    } catch (error) {
      console.error('Error loading matches:', error);
      Alert.alert('Error', 'Failed to load upcoming matches');
    } finally {
      setLoading(false);
    }
  };

  const groupMatchesByDate = (matches: Match[]): GroupedMatches => {
    const grouped: GroupedMatches = {};
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    matches.forEach(match => {
      const matchDate = new Date(match.date);
      matchDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((matchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let groupKey: string;
      if (diffDays === 0) {
        groupKey = 'Today';
      } else if (diffDays === 1) {
        groupKey = 'Tomorrow';
      } else if (diffDays <= 6) {
        groupKey = matchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      } else {
        groupKey = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(match);
    });
    
    return grouped;
  };

  const isTournamentCompetition = (leagueName: string) => {
    const value = leagueName.toLowerCase();
    if (value.includes('concacaf')) return true; // still a cup competition, just not marquee
    return (
      value.includes('cup') ||
      value.includes('champions league') ||
      value.includes('europa') ||
      value.includes('conference league') ||
      value.includes('super cup') ||
      value.includes('supercopa') ||
      value.includes('world cup') ||
      value.includes('euro') ||
      value.includes('copa')
    );
  };

  const competitionOptions = useMemo(() => {
    const names = Array.from(new Set(scopedMatches.map(match => match.league))).sort((a, b) => a.localeCompare(b));
    return ['All', ...names];
  }, [scopedMatches]);

  const filteredMatches = useMemo(() => {
    const nowMs = Date.now();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const filtered = scopedMatches.filter(match => {
      // Drop matches that have already kicked off — they belong in results
      if (new Date(match.date).getTime() <= nowMs) return false;
      if (typeFilter === 'league' && isTournamentCompetition(match.league)) return false;
      if (typeFilter === 'tournament' && !isTournamentCompetition(match.league)) return false;
      if (competitionFilter !== 'All' && match.league !== competitionFilter) return false;

      if (dateFilter !== 'all') {
        const matchDate = new Date(match.date);
        const dayStart = new Date(matchDate);
        dayStart.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((dayStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (dateFilter === 'today' && diffDays !== 0) return false;
        if (dateFilter === '7d' && (diffDays < 0 || diffDays > 7)) return false;
        if (dateFilter === '30d' && (diffDays < 0 || diffDays > 30)) return false;
      }

      const normalizedSearch = searchQuery.trim().toLowerCase();
      if (normalizedSearch) {
        const haystack = `${match.home} ${match.away} ${match.league}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });
    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return filtered;
  }, [competitionFilter, dateFilter, scopedMatches, searchQuery, typeFilter]);

  const groupedMatches = useMemo(() => groupMatchesByDate(filteredMatches), [filteredMatches]);

  useEffect(() => {
    filteredMatches.slice(0, 10).forEach((match) => {
      void prefetchMatchOpenData(match);
    });
  }, [filteredMatches]);

  const loadSubscriptions = async (uid: string) => {
    try {
      const cacheKey = `matchNotificationIds:${uid}`;
      const ids = await getOrFetchCached<string[]>(
        cacheKey,
        MATCH_NOTIFICATION_IDS_TTL_MS,
        async () => {
          const q = query(
            collection(db, 'matchNotifications'),
            where('userId', '==', uid)
          );
          const snapshot = await getDocs(q);
          const nextIds: string[] = [];
          snapshot.forEach((docSnap) => {
            nextIds.push(String(docSnap.data().matchId));
          });
          return nextIds;
        }
      );
      setSubscribedMatches(new Set(ids));
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  const loadNotificationDefaults = async (uid: string) => {
    try {
      const defaultsRef = doc(db, 'users', uid, 'notificationDefaults', 'match');
      const snapshot = await getDoc(defaultsRef);
      if (!snapshot.exists()) {
        setSavedDefaultPrefs(DEFAULT_MATCH_NOTIFY_PREFS);
        setTeamNotifyOverrides({});
        return;
      }
      const data = snapshot.data() as {
        matchNotifyDefaults?: Partial<MatchNotifyPrefs>;
        teamNotifyOverrides?: Record<string, Partial<MatchNotifyPrefs>>;
      };
      setSavedDefaultPrefs({
        ...DEFAULT_MATCH_NOTIFY_PREFS,
        ...(data.matchNotifyDefaults || {}),
      });
      const rawTeamOverrides = data.teamNotifyOverrides || {};
      const normalized: TeamNotifyOverrides = {};
      Object.entries(rawTeamOverrides).forEach(([teamName, prefs]) => {
        normalized[teamName] = {
          ...DEFAULT_MATCH_NOTIFY_PREFS,
          ...(prefs || {}),
        };
      });
      setTeamNotifyOverrides(normalized);
    } catch (error) {
      console.error('Error loading default match notification prefs:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const didReload = await reloadApp(async () => {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? auth.currentUser?.uid ?? undefined });
      await loadMatches(true);
      const uid = auth.currentUser?.uid;
      if (uid) {
        await Promise.all([loadSubscriptions(uid), loadNotificationDefaults(uid)]);
      }
    });
    if (!didReload) {
      setRefreshing(false);
    }
  };

  const applyNotificationSubscription = async (
    matchId: string,
    prefs: MatchNotifyPrefs,
    match?: Match
  ) => {
    if (!userProfile?.uid) return;
    const subscriptionRef = doc(db, 'matchNotifications', `${userProfile.uid}_${matchId}`);
    await setDoc(subscriptionRef, {
      userId: userProfile.uid,
      matchId,
      createdAt: serverTimestamp(),
      prefs,
      home: match?.home || null,
      away: match?.away || null,
      league: match?.league || null,
      matchDate: match?.date || null,
    });
  };

  const normalize = (value?: string) => (value || '').trim().toLowerCase();

  const getResolvedNotifyPrefsForMatch = (match: Match): { prefs: MatchNotifyPrefs; source: 'team_override' | 'scope_default' | 'manual' } => {
    const homeKey = normalize(match.home);
    const awayKey = normalize(match.away);
    const teamOverrideEntry = Object.entries(teamNotifyOverrides).find(([teamName]) => {
      const key = normalize(teamName);
      return key === homeKey || key === awayKey;
    });
    if (teamOverrideEntry?.[1]) {
      return { prefs: teamOverrideEntry[1], source: 'team_override' };
    }

    const notificationTeams = (userProfile?.notificationTeams || []).map(normalize);
    const notificationLeagues = (userProfile?.notificationLeagues || []).map(normalize);
    const hasTeamScope = notificationTeams.includes(homeKey) || notificationTeams.includes(awayKey);
    const hasLeagueScope = notificationLeagues.includes(normalize(match.league));
    if (hasTeamScope || hasLeagueScope) {
      return { prefs: savedDefaultPrefs, source: 'scope_default' };
    }

    return { prefs: savedDefaultPrefs, source: 'manual' };
  };

  const handleNotifyMe = async (match: Match) => {
    const matchId = match.id.toString();
    const toggleLocal = (enabled: boolean) => {
      setSubscribedMatches((prev) => {
        const next = new Set(prev);
        if (enabled) next.add(matchId);
        else next.delete(matchId);
        if (userProfile?.uid) {
          void setCachedValue(`matchNotificationIds:${userProfile.uid}`, Array.from(next));
        }
        return next;
      });
    };
    const isSubscribed = subscribedMatches.has(matchId);

    if (!userProfile?.uid) {
      toggleLocal(!isSubscribed);
      Alert.alert('Saved Locally', 'Notifications are visual-only in dev until push notifications are set up.');
      return;
    }

    setLoadingNotify(matchId);

    try {
      if (isSubscribed) {
        toggleLocal(false);
        await deleteDoc(doc(db, 'matchNotifications', `${userProfile.uid}_${matchId}`));

        analyticsService.track('notification_subscribe_toggled', { matchId, enabled: false, source: 'upcoming' });
      } else {
        const resolved = getResolvedNotifyPrefsForMatch(match);
        if (resolved.source !== 'manual') {
          await applyNotificationSubscription(matchId, resolved.prefs, match);
          setSubscribedMatches((prev) => {
            const next = new Set(prev);
            next.add(matchId);
            return next;
          });
          analyticsService.track('notification_subscribe_toggled', {
            matchId,
            enabled: true,
            source: `upcoming_${resolved.source}`,
          });
        } else {
          setActiveNotifyMatchId(matchId);
          setPendingPrefs(savedDefaultPrefs);
          setNotifyPrefsModalVisible(true);
        }
      }
    } catch (error) {
      console.error('Error updating notification:', error);
      monitoringService.error('upcoming_toggle_notification_failed', error, { matchId });
      Alert.alert('Saved Locally', 'Notification state updated on this device, but cloud sync is not available yet.');
    } finally {
      setLoadingNotify(null);
    }
  };

  const saveNotifyPrefsForMatch = async () => {
    if (!activeNotifyMatchId) return;
    if (!userProfile?.uid) {
      setNotifyPrefsModalVisible(false);
      return;
    }
    setLoadingNotify(activeNotifyMatchId);
    try {
      const match = matches.find((m) => m.id.toString() === activeNotifyMatchId);
      await applyNotificationSubscription(activeNotifyMatchId, pendingPrefs, match);
      setSubscribedMatches((prev) => {
        const next = new Set(prev);
        next.add(activeNotifyMatchId);
        return next;
      });
      analyticsService.track('notification_subscribe_toggled', {
        matchId: activeNotifyMatchId,
        enabled: true,
        source: 'upcoming',
      });
      setNotifyPrefsModalVisible(false);
      setActiveNotifyMatchId(null);
    } catch (error) {
      console.error('Error saving notification prefs:', error);
      Alert.alert('Error', 'Could not save notification preferences right now.');
    } finally {
      setLoadingNotify(null);
    }
  };

  const togglePendingPref = (key: keyof MatchNotifyPrefs) => {
    setPendingPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatMatchTime = (match: Match) => {
    const date = new Date(match.date);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTeamFontSize = (name: string) => {
    const length = name.length;
    if (Platform.OS === 'ios') {
      if (length > 12) return 12;
      if (length > 10) return 13;
      return 14;
    }
    if (length > 12) return 11;
    if (length > 10) return 12;
    return 13;
  };

  const renderMatchCard = (match: Match) => {
    const isSubscribed = subscribedMatches.has(match.id.toString());
    const isLoading = loadingNotify === match.id.toString();
    const phaseInfo = getMatchPhase({ kickoffAt: match.date, status: match.status });
    const showPregame = phaseInfo.chatOpen && phaseInfo.phase === 'pregame';
    const isTomorrow = isTomorrowDate(match.date);
    const homeLabel = getUpcomingTeamLabel({ name: match.home, short_name: match.homeShortName, code: match.homeCode });
    const awayLabel = getUpcomingTeamLabel({ name: match.away, short_name: match.awayShortName, code: match.awayCode });
    return (
      <TouchableOpacity
        key={match.id}
        activeOpacity={0.92}
        onPressIn={() => { void prefetchMatchOpenData(match); }}
        onPress={() => router.push(buildMatchRouteDescriptor(match) as any)}
        style={[
          styles.matchCard,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}
      >
        {/* Background tint */}
        <LinearGradient
          colors={[
            withAlpha(teamPrimaryColor(match.home), isDark ? 0.18 : 0.09),
            withAlpha(teamPrimaryColor(match.home), isDark ? 0.08 : 0.04),
            withAlpha(teamPrimaryColor(match.away), isDark ? 0.07 : 0.03),
            withAlpha(teamPrimaryColor(match.away), isDark ? 0.16 : 0.08),
          ]}
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0, y: 0.18 }}
          end={{ x: 1, y: 0.82 }}
          style={styles.cardBlend}
        />
        {/* Top accent bar */}
        <LinearGradient
          colors={[
            withAlpha(teamPrimaryColor(match.home), isDark ? 0.8 : 0.68),
            withAlpha(teamPrimaryColor(match.away), isDark ? 0.8 : 0.68),
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.cardAccentBar}
        />

        {/* Header: league + badge */}
        <View style={styles.cardHeader}>
          <Text style={[styles.cardLeague, { color: palette.accent }]} numberOfLines={1}>
            {getUpcomingLeagueLabel(match.league, isTomorrow)}
          </Text>
          {showPregame ? (
            <View style={[styles.statusBadge, { backgroundColor: palette.accentSoft }]}>
              <Ionicons name="chatbubbles" size={10} color={palette.accent} />
              <Text style={[styles.statusBadgeText, { color: palette.accent }]}>CHAT OPEN</Text>
            </View>
          ) : (
            <Text style={[styles.cardTime, { color: palette.accent }]}>{formatMatchTime(match)}</Text>
          )}
        </View>

        {/* Teams */}
        <View style={styles.cardTeamsRow}>
          <View style={styles.cardTeam}>
            {match.homeLogo ? (
              <Image source={{ uri: match.homeLogo }} style={styles.cardTeamLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.cardTeamLogo, styles.cardTeamLogoPlaceholder, { backgroundColor: palette.border }]} />
            )}
            <Text style={[styles.cardTeamName, { color: palette.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {homeLabel}
            </Text>
          </View>

          <View style={styles.cardCenter}>
            <Text style={[styles.cardVs, { color: palette.text }]}>VS</Text>
          </View>

          <View style={styles.cardTeam}>
            {match.awayLogo ? (
              <Image source={{ uri: match.awayLogo }} style={styles.cardTeamLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.cardTeamLogo, styles.cardTeamLogoPlaceholder, { backgroundColor: palette.border }]} />
            )}
            <Text style={[styles.cardTeamName, { color: palette.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {awayLabel}
            </Text>
          </View>
        </View>

        {/* Footer: kickoff time + notify */}
        <View style={[styles.cardFooter, { borderTopColor: palette.border }]}>
          <View style={styles.cardFooterMeta}>
            <Ionicons name="time-outline" size={13} color={palette.subtext} />
            <Text style={[styles.cardFooterText, { color: palette.subtext }]}>
              Starts @ {formatMatchTime(match)}{isTomorrow ? ' · Tomorrow' : ' · Today'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cardNotifyRow}
            onPress={(e) => { e.stopPropagation(); handleNotifyMe(match); }}
            disabled={isLoading}
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 4 }}
          >
            <Ionicons
              name={isLoading ? 'ellipse-outline' : isSubscribed ? 'notifications' : 'notifications-outline'}
              size={13}
              color={isSubscribed ? palette.accent : palette.subtext}
            />
            <Text style={[styles.cardNotifyText, { color: isSubscribed ? palette.accent : palette.subtext }]}>
              {isLoading ? '...' : isSubscribed ? 'Notifying' : 'Notify Me'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const activeFilterCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (competitionFilter !== 'All' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0);

  if (loading && matches.length === 0) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['left', 'right']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top + 8, 48), backgroundColor: palette.card, borderBottomColor: palette.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Upcoming Matches</Text>
        <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.headerFilterButton}>
          <Ionicons name="filter" size={20} color={palette.text} />
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: palette.accent }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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
        {filteredMatches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={palette.border} />
            <Text style={[styles.emptyText, { color: palette.text }]}>No matches found</Text>
            <Text style={[styles.emptySubtext, { color: palette.subtext }]}>Try changing filters to see more games</Text>
          </View>
        ) : (
          <>
            {/* Grouped Matches */}
            {Object.keys(groupedMatches).map((dateKey) => (
              <View key={dateKey} style={styles.dateSection}>
                <View style={styles.dateSectionHeader}>
                  <View style={[styles.dateLine, { backgroundColor: palette.border }]} />
                  <Text style={[styles.dateSectionTitle, { color: palette.text, backgroundColor: palette.background }]}>
                    {dateKey}
                  </Text>
                  <View style={[styles.dateLine, { backgroundColor: palette.border }]} />
                </View>
                {groupedMatches[dateKey].map((match) => renderMatchCard(match))}
              </View>
            ))}
          </>
        )}

      </ScrollView>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFilterModalVisible(false)}>
          <View style={styles.filterModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.filterSheet, { backgroundColor: palette.card, borderColor: palette.border }]}> 
                <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: palette.text }]}>Filter Matches</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={20} color={palette.subtext} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.filterLabel, { color: palette.subtext }]}>Competition Type</Text>
            <View style={styles.filterOptionRow}>
              {[
                { label: 'All', value: 'all' as MatchTypeFilter },
                { label: 'Leagues', value: 'league' as MatchTypeFilter },
                { label: 'Tournaments', value: 'tournament' as MatchTypeFilter },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterChip,
                    { borderColor: palette.border, backgroundColor: palette.background },
                    typeFilter === option.value && { borderColor: palette.accent, backgroundColor: palette.banner },
                  ]}
                  onPress={() => setTypeFilter(option.value)}
                >
                  <Text style={[styles.filterChipText, { color: palette.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: palette.subtext }]}>League or Tournament</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionRow}>
              {competitionOptions.map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.filterChip,
                    { borderColor: palette.border, backgroundColor: palette.background },
                    competitionFilter === option && { borderColor: palette.accent, backgroundColor: palette.banner },
                  ]}
                  onPress={() => setCompetitionFilter(option)}
                >
                  <Text style={[styles.filterChipText, { color: palette.text }]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: palette.subtext }]}>Date</Text>
            <View style={styles.filterOptionRow}>
              {[
                { label: 'All', value: 'all' as DateRangeFilter },
                { label: 'Today', value: 'today' as DateRangeFilter },
                { label: '7 Days', value: '7d' as DateRangeFilter },
                { label: '30 Days', value: '30d' as DateRangeFilter },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterChip,
                    { borderColor: palette.border, backgroundColor: palette.background },
                    dateFilter === option.value && { borderColor: palette.accent, backgroundColor: palette.banner },
                  ]}
                  onPress={() => setDateFilter(option.value)}
                >
                  <Text style={[styles.filterChipText, { color: palette.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterActions}>
              <TouchableOpacity
                style={[styles.filterResetButton, { borderColor: palette.border }]}
                onPress={() => {
                  setTypeFilter('all');
                  setCompetitionFilter('All');
                  setDateFilter('all');
                }}
              >
                <Text style={[styles.filterResetText, { color: palette.subtext }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterApplyButton, { backgroundColor: palette.accent }]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.filterApplyText}>Show Matches</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>

      <Modal
        visible={notifyPrefsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifyPrefsModalVisible(false)}
      >
        <View style={styles.filterModalOverlay}>
          <View style={[styles.notifySheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: palette.text }]}>Match Notifications</Text>
              <TouchableOpacity onPress={() => setNotifyPrefsModalVisible(false)}>
                <Ionicons name="close" size={20} color={palette.subtext} />
              </TouchableOpacity>
            </View>

            {(
              [
                { key: 'goals', label: 'Goals' },
                { key: 'cards', label: 'Cards' },
                { key: 'halftime', label: 'Half Time' },
                { key: 'matchStart', label: 'Kickoff' },
                { key: 'fulltime', label: 'Full Time' },
              ] as { key: keyof MatchNotifyPrefs; label: string }[]
            ).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.notifyRow, { borderBottomColor: palette.border }]}
                onPress={() => togglePendingPref(item.key)}
              >
                <Text style={[styles.notifyRowText, { color: palette.text }]}>{item.label}</Text>
                <Ionicons
                  name={pendingPrefs[item.key] ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={pendingPrefs[item.key] ? palette.accent : palette.subtext}
                />
              </TouchableOpacity>
            ))}

            <View style={styles.notifyActions}>
              <TouchableOpacity
                style={[styles.filterApplyButton, { backgroundColor: palette.accent }]}
                onPress={() => void saveNotifyPrefsForMatch()}
              >
                <Text style={styles.filterApplyText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  headerFilterButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
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
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  dateSection: {
    marginTop: 12,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  dateSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F7',
  },
  
  matchCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  cardBlend: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  cardLeague: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTime: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTeam: {
    flex: 1,
    alignItems: 'center',
  },
  cardTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 6,
  },
  cardTeamLogoPlaceholder: {
    borderRadius: 16,
  },
  cardTeamName: {
    width: '100%',
    minHeight: 30,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardCenter: {
    minWidth: 52,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  cardVs: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 9,
    borderTopWidth: 1,
  },
  cardFooterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardFooterText: {
    fontSize: 11,
    fontWeight: '500',
  },
  cardNotifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardNotifyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  leagueName: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  leagueNameTomorrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  predictionWrap: {
    marginBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  predictionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  predictionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  predictionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  predictionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  predictionPct: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  filterOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  filterResetButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: '700',
  },
  filterApplyButton: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  notifySheet: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 48,
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  notifyRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  notifyActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
});
