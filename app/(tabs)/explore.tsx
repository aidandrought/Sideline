// app/(tabs)/explore.tsx
// IMPROVED: League browsing, team directory, better search
// UPDATED: Removed "Friendlies Clubs" and "Community" leagues from Browse Leagues

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Animated,
  Image,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandedLoading } from '../../components/BrandedLoading';
import { shadow } from '../../components/styleUtils';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { POPULAR_TEAM_LEAGUE_NAMES } from '../../constants/footballCompetitions';
import { Community, communityService } from '../../services/communityService';
import { footballAPI, Match } from '../../services/footballApi';
import { isLikelyFinishedFromLive } from '../../services/matchPhase';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { getCachedValue, getCachedValueAsync, setCachedValue } from '../../services/cacheService';
import { getFeedSelections, selectNewsForFeed } from '../../services/feedPreferences';
import { buildMatchRouteDescriptor } from '../../services/matchNavigation';
import { teamPrimaryColor } from '../../services/teamTint';
import { chatService } from '../../services/chatService';
import { CommunityPost, getPopularRecentPosts, purgeExpiredPosts } from '../../services/communityPostsService';
import { useTheme } from '../../context/ThemeContext';
import { prefetchMatchOpenData } from '../../services/matchRoutePrefetch';
import { NewsImage } from '../../components/NewsImage';
import { newsPersonalizationService } from '../../services/newsPersonalizationService';
import { useAuth } from '../../context/AuthContext';
import { getHomeExploreNewsAllocation } from '../../services/newsAllocationService';
import { getPrefetchedAppData, warmScreenData } from '../../services/prefetchService';
import { ProfileQuickAccessButton } from '../../components/ProfileQuickAccessButton';

const LIVE_TTL_MS = 60 * 1000;
const LIVE_FALLBACK_TTL_MS = 12 * 60 * 60 * 1000;
const UPCOMING_TTL_MS = 60 * 1000;
const RESULTS_TTL_MS = 10 * 60 * 1000;
const NEWS_TTL_MS = 10 * 60 * 1000;
const RESULTS_LIMIT = 8;
const NEWS_PREVIEW_LIMIT = 12;
const NEWS_FEED_LIMIT = 25;
const EXPLORE_LIVE_CACHE_KEY = 'explore:live:v2';
const EXPLORE_UPCOMING_CACHE_KEY = 'explore:upcoming:v7';
const EXPLORE_RESULTS_CACHE_KEY = 'explore:results:v2';
const EXPLORE_NEWS_CACHE_KEY = 'explore:news:v15';

const withAlpha = (hex: string, alpha: number) => {
  const n = hex.replace('#', '');
  const e = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  const r = parseInt(e.slice(0, 2), 16);
  const g = parseInt(e.slice(2, 4), 16);
  const b = parseInt(e.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const sortRecentResults = (matches: Match[]) => {
  const now = new Date();
  return [...matches].sort((a, b) => {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    const aToday =
      aDate.getFullYear() === now.getFullYear() &&
      aDate.getMonth() === now.getMonth() &&
      aDate.getDate() === now.getDate();
    const bToday =
      bDate.getFullYear() === now.getFullYear() &&
      bDate.getMonth() === now.getMonth() &&
      bDate.getDate() === now.getDate();
    if (aToday !== bToday) return bToday ? 1 : -1;
    return bDate.getTime() - aDate.getTime();
  });
};

const sortSearchMatches = (matches: Match[]) => {
  const now = Date.now();
  const getRank = (match: Match) => {
    if (match.status === 'live') return 0;
    if (match.status === 'upcoming') return 1;
    return 2;
  };

  return [...matches].sort((a, b) => {
    const rankDiff = getRank(a) - getRank(b);
    if (rankDiff !== 0) return rankDiff;

    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();

    if (a.status === 'finished' && b.status === 'finished') {
      return bTime - aTime;
    }

    const aDistance = Math.abs(aTime - now);
    const bDistance = Math.abs(bTime - now);
    if (a.status === 'live' && b.status === 'live') {
      return aDistance - bDistance;
    }
    return aTime - bTime;
  });
};

const looksTooSparseForUpcoming = (matches: Match[]) => {
  if (matches.length === 0) return true;
  const now = Date.now();
  const nextUpcoming = [...matches]
    .filter((match) => match.status === 'upcoming')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (!nextUpcoming) return true;
  const nextTime = new Date(nextUpcoming.date).getTime();
  if (Number.isNaN(nextTime)) return true;
  const daysAway = (nextTime - now) / (24 * 60 * 60 * 1000);
  return daysAway > 5;
};

const getExploreAllocationItems = (
  allocation?: {
    all?: unknown;
    home?: unknown;
    explore?: unknown;
  } | null
) => {
  const explore = newsAPI.sanitizeArticles(Array.isArray(allocation?.explore) ? allocation.explore : []);
  if (explore.length > 0) return explore;
  const all = newsAPI.sanitizeArticles(Array.isArray(allocation?.all) ? allocation.all : []);
  if (all.length > 0) return all;
  return newsAPI.sanitizeArticles(Array.isArray(allocation?.home) ? allocation.home : []);
};

const toTeamAbbr = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .map((p) => p[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 5);
  }
  return name.slice(0, 5).toUpperCase();
};

const TEAM_ABBR_MAP: Record<string, string> = {
  'hamburger sv': 'Hamburg',
  hamburger: 'Hamburg',
  bournemouth: 'Bournemouth',
  'afc bournemouth': 'Bournemouth',
  barcelona: 'Barcelona',
  'real madrid': 'Real Madrid',
  'real betis': 'Real Betis',
  'atletico madrid': 'Atletico',
  'manchester city': 'Man City',
  'manchester united': 'Man United',
  'paris saint germain': 'PSG',
  'paris saint-germain': 'PSG',
  liverpool: 'LIV',
  arsenal: 'ARS',
  chelsea: 'CHE',
  tottenham: 'Tottenham',
  'tottenham hotspur': 'Tottenham',
  'bayern munich': 'Bayern',
  'borussia dortmund': 'Dortmund',
  'borussia monchengladbach': 'Gladbach',
  'borussia mgladbach': 'Gladbach',
  'rb leipzig': 'Leipzig',
  'rasenballsport leipzig': 'Leipzig',
  'vfl wolfsburg': 'Wolfsburg',
  philadelphia: 'Philly',
  'philadelphia union': 'Philly',
  guadalajara: 'Chivas',
  'cd guadalajara': 'Chivas',
  chivas: 'Chivas',
  galatasaray: 'Gala',
  'inter milan': 'Inter',
  'ac milan': 'Milan',
};

const MAX_TEAM_LINE_CHARS = 16;

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

const formatTeamNameForTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  if (!value || value.trim().length === 0) return value;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return value;

  let current = '';
  const lines: string[] = [];

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  if (lines.length <= 2 && lines.every((line) => line.length <= maxCharsPerLine)) {
    return lines.join('\n');
  }
  return value;
};

const getDisplayTeamName = (team: { name?: string; short_name?: string; code?: string }) => {
  const fullName = (team?.name ?? '').trim();
  const normalizedFullName = fullName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (normalizedFullName.includes('hamburg')) return 'Hamburg';
  const mapped = TEAM_ABBR_MAP[fullName.toLowerCase()];
  if (mapped) return mapped;

  const shortName = (team?.short_name ?? '').trim();
  const code = (team?.code ?? '').trim();

  if (shortName && canWrapIntoTwoLines(shortName, MAX_TEAM_LINE_CHARS)) return shortName;

  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const twoLine = formatTeamNameForTwoLines(fullName, MAX_TEAM_LINE_CHARS);
      if (twoLine !== fullName) return twoLine;
    }

    if (canWrapIntoTwoLines(fullName, MAX_TEAM_LINE_CHARS)) return fullName;
    if (shortName) return shortName;
    if (fullName.length > MAX_TEAM_LINE_CHARS) return toTeamAbbr(fullName);
    return fullName;
  }

  if (code && code.length >= 2 && code.length <= 5) return code;
  if (shortName) return shortName;
  return fullName;
};

export default function ExploreScreen() {
  const router = useRouter();
  const { bootstrapApp, isBootstrapping } = useAppBootstrap();
  const { userProfile } = useAuth();
  const isFocused = useIsFocused();
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            badgeBg: 'rgba(255,59,48,0.15)',
            badgeText: '#FF453A',
            border: '#2C2C2E',
            placeholder: '#2C2C2E',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            badgeBg: '#FFF1F0',
            badgeText: '#FF3B30',
            border: '#E5E7EB',
            placeholder: '#F0F0F0',
          },
    [isDark]
  );
  const { mode, q, type, initialTab } = useLocalSearchParams();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  
  const tabParam = Array.isArray(initialTab) ? initialTab[0] : initialTab;
  const newsOnlyMode = (Array.isArray(mode) ? mode[0] : mode) === 'news' || (Array.isArray(type) ? type[0] : type) === 'news' || tabParam === 'news';
  const initialQuery = Array.isArray(q) ? q[0] : q;
  
  const deriveExploreData = useCallback((allCommunities: Community[]) => {
    // Get leagues - FILTER OUT FRIENDLIES AND COMMUNITY
    const leagueListRaw = allCommunities.filter(c => {
      if (c.type !== 'league' && c.type !== 'worldcup') return false;
      const name = c.name.toLowerCase();
      return !name.includes('friendlies') && 
             !name.includes('community') &&
             name !== 'friendlies clubs';
    });
    const worldcups = leagueListRaw.filter(c => c.type === 'worldcup');
    const leagues = leagueListRaw.filter(c => c.type === 'league');
    const leagueList = [...worldcups, ...leagues].sort((a, b) => {
      if (a.type === 'worldcup' && b.type !== 'worldcup') return -1;
      if (b.type === 'worldcup' && a.type !== 'worldcup') return 1;
      return a.name.localeCompare(b.name);
    });

    // Get popular teams (from major leagues)
    const popularLeagues = POPULAR_TEAM_LEAGUE_NAMES;
    const popularTeamsList = allCommunities.filter(c => 
      c.type === 'team' && c.league && popularLeagues.includes(c.league)
    ).slice(0, 12);

    return { leagueList, popularTeamsList };
  }, []);

  const prefetchedAppDataRef = useRef(getPrefetchedAppData());
  const cached = useMemo(() => communityService.getCachedAllCommunities(), []);
  const cachedAll = prefetchedAppDataRef.current?.communities ?? cached?.data ?? [];
  const [allCommunities, setAllCommunities] = useState<Community[]>(cachedAll);
  const [liveMatches, setLiveMatches] = useState<Match[]>(
    prefetchedAppDataRef.current?.liveMatches ?? getCachedValue(EXPLORE_LIVE_CACHE_KEY, LIVE_TTL_MS) ?? []
  );
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>(
    prefetchedAppDataRef.current?.upcomingMatches ?? getCachedValue(EXPLORE_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS) ?? []
  );
  const [recentResults, setRecentResults] = useState<Match[]>(
    sortRecentResults(
      prefetchedAppDataRef.current?.resultsMatches ??
        getCachedValue(EXPLORE_RESULTS_CACHE_KEY, RESULTS_TTL_MS) ??
        []
    )
  );
  const [newsItems, setNewsItems] = useState<NewsArticle[]>(
    () => {
      const prefetchedExploreNews = getExploreAllocationItems(prefetchedAppDataRef.current?.newsAllocation);
      const cachedExploreNews = newsAPI.sanitizeArticles(
        getCachedValue<NewsArticle[]>(EXPLORE_NEWS_CACHE_KEY, NEWS_TTL_MS) ?? []
      );
      return selectNewsForFeed(
        prefetchedExploreNews.length > 0 ? prefetchedExploreNews : cachedExploreNews,
        feedSelections
      );
    }
  );
  const [loadingNews, setLoadingNews] = useState(newsItems.length === 0);
  const scopedNewsItems = useMemo(
    () => selectNewsForFeed(newsAPI.sanitizeArticles(newsItems), feedSelections),
    [feedSelections, newsItems]
  );
  const exploreData = useMemo(() => deriveExploreData(allCommunities), [allCommunities, deriveExploreData]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    teams: Community[];
    leagues: Community[];
    matches: Match[];
    upcoming: Match[];
    results: Match[];
    news: NewsArticle[];
  }>({ teams: [], leagues: [], matches: [], upcoming: [], results: [], news: [] });
  const [newsPage, setNewsPage] = useState(1);
  const [newsHasMore, setNewsHasMore] = useState(true);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);
  const [newsFeedPage, setNewsFeedPage] = useState(1);
  const [newsFeedHasMore, setNewsFeedHasMore] = useState(true);
  const [newsFeedLoadingMore, setNewsFeedLoadingMore] = useState(false);
  const [newsRateLimited, setNewsRateLimited] = useState(false);
  const [lastMatchFetchCount, setLastMatchFetchCount] = useState(0);
  const [lastMatchFetchPage, setLastMatchFetchPage] = useState(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  
  const [loading, setLoading] = useState(cachedAll.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [hotThreads, setHotThreads] = useState<{
    communityId: string;
    communityName: string;
    messageCount: number;
    lastMessage: string;
    lastMessageAt: number;
    communityType: 'team' | 'league' | 'worldcup';
  }[]>([]);
  const [popularPosts, setPopularPosts] = useState<CommunityPost[]>([]);
  const leagues = exploreData.leagueList;
  const [popularTeams, setPopularTeams] = useState<Community[]>(exploreData.popularTeamsList.slice(0, 5));
  const allCommunitiesRef = useRef<Community[]>(cachedAll);
  const matchesCacheRef = useRef<Match[]>([]);
  const matchesCacheAtRef = useRef(0);
  const matchesLoadRef = useRef<Promise<Match[]> | null>(null);
  const latestSearchRef = useRef('');
  const initialQueryAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, {
          toValue: 0.28,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(liveDotOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, liveDotOpacity]);

  useEffect(() => {
    if (!isFocused) return;
    scopedNewsItems.slice(0, 4).forEach((article) => prefetchArticle(article));
  }, [isFocused, scopedNewsItems, prefetchArticle]);

  useEffect(() => {
    if (!initialQuery) return;
    if (initialQueryAppliedRef.current === initialQuery) return;
    initialQueryAppliedRef.current = initialQuery;
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], upcoming: [], results: [], news: [] });
      setSearching(false);
      setNewsPage(1);
      setNewsHasMore(true);
      setNewsRateLimited(false);
      setLastMatchFetchCount(0);
      setLastMatchFetchPage(0);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      return;
    }

    setSearching(true);
    setNewsPage(1);
    setNewsHasMore(true);
    setNewsRateLimited(false);
    setLastMatchFetchCount(0);
    setLastMatchFetchPage(0);

    const controller = new AbortController();
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    searchAbortRef.current = controller;

    const timeout = setTimeout(() => {
      performSearch(trimmed, controller.signal);
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  const loadExplorePage = useCallback(async () => {
    try {
      const cachedSnapshot = await communityService.getCachedAllCommunitiesAsync();
      const cachedData = cachedSnapshot?.data?.length ? cachedSnapshot.data : cachedAll;
      if (cachedData.length) {
        setAllCommunities(cachedData);
        allCommunitiesRef.current = cachedData;
        setLoading(false);
      } else {
        setLoading(true);
      }

      const fresh = await communityService.refreshCommunitiesIfStale();
      if (fresh) {
        const next = [...fresh.worldcups, ...fresh.teams, ...fresh.leagues];
        setAllCommunities(next);
        allCommunitiesRef.current = next;
      }
    } catch (error) {
      console.error('Error loading explore page:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const dedupeNewsByUrl = useCallback((articles: NewsArticle[]) => {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = (article.url || `${article.title}-${article.source}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const parseMatchQuery = useCallback((query: string) => {
    const match = query.match(/^"(.+?)"\s+OR\s+"(.+?)"$/i);
    if (!match) return null;
    return { teamA: match[1].trim(), teamB: match[2].trim() };
  }, []);
  const matchQueryParts = useMemo(() => parseMatchQuery(searchQuery.trim()), [parseMatchQuery, searchQuery]);

  const loadNewsPage = useCallback(async (query: string, pageToLoad: number, append: boolean, signal?: AbortSignal) => {
    if (append && (newsLoadingMore || !newsHasMore)) return;
    if (append) {
      setNewsLoadingMore(true);
    }

    try {
      const matchParts = parseMatchQuery(query.trim());
      let unique: NewsArticle[] = [];
      let receivedCount = 0;

      if (matchParts) {
        const results = await newsAPI.searchMatchNews({
          teamA: matchParts.teamA,
          teamB: matchParts.teamB,
          limit: 20,
          page: pageToLoad,
          pageSize: 20
        });
        const valid = results.filter(article => article.title && article.url);
        unique = dedupeNewsByUrl(valid);
        receivedCount = unique.length;
        setLastMatchFetchCount(unique.length);
        setLastMatchFetchPage(pageToLoad);
      } else {
        const response = await newsAPI.searchNewsQuery({ q: query, page: pageToLoad, pageSize: 20, signal });
        if (response.isStale) {
          setNewsRateLimited(true);
        }
        const valid = response.articles.filter(article => article.title && article.url);
        unique = dedupeNewsByUrl(valid);
        receivedCount = response.totalResults ? (pageToLoad * 20 < response.totalResults ? 20 : unique.length) : unique.length;
        setLastMatchFetchCount(0);
        setLastMatchFetchPage(0);
      }

      setSearchResults(prev => ({
        ...prev,
        news: append ? dedupeNewsByUrl([...prev.news, ...unique]) : unique
      }));
      setNewsPage(pageToLoad);
      const hasMore = matchParts ? receivedCount > 0 : receivedCount === 20;
      setNewsHasMore(hasMore);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        return;
      }
      if (error instanceof RateLimitError) {
        setNewsRateLimited(true);
        setNewsHasMore(false);
        return;
      }
      console.error('Error loading news results:', error);
      setNewsHasMore(false);
    } finally {
      if (append) {
        setNewsLoadingMore(false);
      }
    }
  }, [dedupeNewsByUrl, newsHasMore, newsLoadingMore, parseMatchQuery]);

  const loadMoreNewsFeed = useCallback(async () => {
    if (newsFeedLoadingMore || !newsFeedHasMore) return;
    setNewsFeedLoadingMore(true);
    const nextPage = newsFeedPage + 1;
    try {
      const response = await newsAPI.getSoccerNewsPage(nextPage, NEWS_FEED_LIMIT);
      const valid = response.articles.filter(article => article.title && article.url);
      const unique = dedupeNewsByUrl(valid);
      let ranked = unique;
      try {
        ranked = await newsPersonalizationService.rankArticles(unique, userProfile?.uid);
      } catch {
        ranked = unique;
      }
      const mergedRanked = dedupeNewsByUrl([...ranked, ...unique]);
      if (unique.length === 0) {
        setNewsFeedHasMore(false);
        return;
      }
      setNewsItems(prev => dedupeNewsByUrl([...prev, ...mergedRanked]));
      await setCachedValue(EXPLORE_NEWS_CACHE_KEY, dedupeNewsByUrl([...newsItems, ...mergedRanked]));
      setNewsFeedPage(nextPage);
      setNewsFeedHasMore(unique.length >= NEWS_FEED_LIMIT);
    } catch (error) {
      if (error instanceof RateLimitError) {
        setNewsRateLimited(true);
        setNewsFeedHasMore(false);
        return;
      }
      console.error('Error loading more news feed:', error);
    } finally {
      setNewsFeedLoadingMore(false);
    }
  }, [newsFeedHasMore, newsFeedLoadingMore, newsFeedPage, dedupeNewsByUrl, newsItems]);

  const hydrateExploreCache = useCallback(async () => {
    const [live, upcoming, results, news] = await Promise.all([
      getCachedValueAsync<Match[]>(EXPLORE_LIVE_CACHE_KEY, LIVE_TTL_MS),
      getCachedValueAsync<Match[]>(EXPLORE_UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
      getCachedValueAsync<Match[]>(EXPLORE_RESULTS_CACHE_KEY, RESULTS_TTL_MS),
      getCachedValueAsync<NewsArticle[]>(EXPLORE_NEWS_CACHE_KEY, NEWS_TTL_MS)
    ]);

    if (live) {
      setLiveMatches(live);
    }
    if (upcoming) {
      setUpcomingMatches(upcoming);
    }
    if (results) {
      setRecentResults(sortRecentResults(results));
    }
    if (news) {
      setNewsItems(selectNewsForFeed(newsAPI.sanitizeArticles(news), feedSelections));
      setLoadingNews(false);
    }
  }, [feedSelections]);

  const getFinishedFromLive = (liveMatches: Match[], activeLiveIds?: Set<string>) => {
    const now = new Date();
    return liveMatches.filter((match) => isLikelyFinishedFromLive(match, now, activeLiveIds));
  };

  const refreshExploreSections = useCallback(
    async (force: boolean = false) => {
      const cachedLive = getCachedValue<Match[]>(EXPLORE_LIVE_CACHE_KEY, LIVE_TTL_MS);
      const cachedResults = getCachedValue<Match[]>(EXPLORE_RESULTS_CACHE_KEY, RESULTS_TTL_MS);
      const cachedNewsRaw = getCachedValue<NewsArticle[]>(EXPLORE_NEWS_CACHE_KEY, NEWS_TTL_MS);
      const cachedNews = cachedNewsRaw ? newsAPI.sanitizeArticles(cachedNewsRaw) : null;
      const [cachedExploreLiveForResults, cachedHomeLiveForResults] = await Promise.all([
        getCachedValueAsync<Match[]>(EXPLORE_LIVE_CACHE_KEY, LIVE_FALLBACK_TTL_MS),
        getCachedValueAsync<Match[]>('matches:live:v2', LIVE_FALLBACK_TTL_MS),
      ]);
      const activeLiveIds = new Set(liveMatches.map((match) => String(match.id)));
      const forcedFinishedSeed = getFinishedFromLive([
        ...liveMatches,
        ...(cachedExploreLiveForResults ?? []),
        ...(cachedHomeLiveForResults ?? []),
      ], activeLiveIds);

      const shouldFetchLive = force || !cachedLive || cachedLive.length === 0;
      const shouldFetchUpcoming = true;
      const shouldFetchResults = force || !cachedResults || cachedResults.length === 0 || forcedFinishedSeed.length > 0;
      const shouldFetchNews =
        force ||
        !cachedNews ||
        cachedNews.length === 0 ||
        scopedNewsItems.length < NEWS_PREVIEW_LIMIT;

      const tasks: Promise<void>[] = [];

      if (shouldFetchLive) {
        tasks.push(
          (async () => {
            const data = await footballAPI.getLiveMatches();
            setLiveMatches(data);
            await setCachedValue(EXPLORE_LIVE_CACHE_KEY, data);
          })()
        );
      }

      if (shouldFetchUpcoming) {
        tasks.push(
          (async () => {
            const data = await footballAPI.getUpcomingMatches();
            setUpcomingMatches(data);
            await setCachedValue(EXPLORE_UPCOMING_CACHE_KEY, data);
          })()
        );
      }

      if (shouldFetchResults) {
        tasks.push(
          (async () => {
            const data = await footballAPI.getRecentFinishedFixtures(80);
            const cachedRecent = await footballAPI.getCachedRecentResults(RESULTS_LIMIT);
            const combined = [...data, ...cachedRecent, ...forcedFinishedSeed].filter(Boolean);
            const unique = combined.filter((match, index, arr) =>
              arr.findIndex(other => other.id === match.id) === index
            );
            const trimmed = unique.slice(0, RESULTS_LIMIT);
            const nextResults = sortRecentResults(trimmed.length > 0 ? trimmed : recentResults);
            setRecentResults(nextResults);
            if (nextResults.length > 0) {
              await setCachedValue(EXPLORE_RESULTS_CACHE_KEY, nextResults);
            }
          })()
        );
      }

      if (shouldFetchNews) {
        if (scopedNewsItems.length === 0) setLoadingNews(true);
        tasks.push(
          (async () => {
            try {
              const allocation = await getHomeExploreNewsAllocation(userProfile?.uid, feedSelections);
              const allocationItems = getExploreAllocationItems(allocation);
              const exploreWithImages = allocationItems.filter((item) => item?.imageUrl);
              const exploreSource = exploreWithImages.length >= NEWS_PREVIEW_LIMIT ? exploreWithImages : allocationItems;
              const exploreSlice = selectNewsForFeed(exploreSource.slice(0, NEWS_PREVIEW_LIMIT), feedSelections);
              setNewsItems(exploreSlice);
              await setCachedValue(EXPLORE_NEWS_CACHE_KEY, exploreSlice);
              setNewsFeedPage(1);
              setNewsFeedHasMore(true);
              setNewsRateLimited(false);
            } catch (error) {
              if (error instanceof RateLimitError) {
                setNewsRateLimited(true);
                setNewsFeedHasMore(false);
              } else {
                console.error('Error refreshing explore news:', error);
              }
            } finally {
              setLoadingNews(false);
            }
          })()
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
    [dedupeNewsByUrl, feedSelections, liveMatches.length, scopedNewsItems.length, recentResults.length, upcomingMatches.length, userProfile?.uid]
  );

  useEffect(() => {
    hydrateExploreCache();
  }, [hydrateExploreCache]);

  useEffect(() => {
    const shouldHydrateImmediately =
      allCommunities.length === 0 ||
      liveMatches.length === 0 ||
      upcomingMatches.length === 0 ||
      recentResults.length === 0 ||
      newsItems.length === 0;

    if (!shouldHydrateImmediately) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      if (allCommunities.length === 0) {
        void loadExplorePage();
      }
      void refreshExploreSections(false);
    });

    return () => {
      task.cancel();
    };
  }, [
    allCommunities.length,
    liveMatches.length,
    loadExplorePage,
    newsItems.length,
    recentResults.length,
    refreshExploreSections,
    upcomingMatches.length,
  ]);

  useEffect(() => {
    if (!isFocused) return;
    const interval = setInterval(() => {
      void refreshExploreSections(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [isFocused, refreshExploreSections]);

  useEffect(() => {
    if (!isFocused) return;
    const previewMatches = [
      ...liveMatches.slice(0, 4),
      ...upcomingMatches.slice(0, 6),
      ...recentResults.slice(0, 4),
    ];
    if (previewMatches.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      previewMatches.forEach((match) => {
        void prefetchMatchOpenData(match);
      });
    });
    return () => {
      task.cancel();
    };
  }, [isFocused, liveMatches, recentResults, upcomingMatches]);

  useEffect(() => {
    if (isBootstrapping) return;
    const latest = getPrefetchedAppData();
    if (!latest) return;

    if (allCommunities.length === 0 && latest.communities.length > 0) {
      setAllCommunities(latest.communities);
      allCommunitiesRef.current = latest.communities;
      setLoading(false);
    }
    if (liveMatches.length === 0 && latest.liveMatches.length > 0) {
      setLiveMatches(latest.liveMatches);
    }
    if (upcomingMatches.length === 0 && latest.upcomingMatches.length > 0) {
      setUpcomingMatches(latest.upcomingMatches);
    }
    if (recentResults.length === 0 && latest.resultsMatches.length > 0) {
      setRecentResults(sortRecentResults(latest.resultsMatches));
    }
    const latestExploreNews = getExploreAllocationItems(latest.newsAllocation);
    if (newsItems.length === 0 && latestExploreNews.length > 0) {
      setNewsItems(selectNewsForFeed(latestExploreNews, feedSelections));
      setLoadingNews(false);
    }
  }, [allCommunities.length, feedSelections, isBootstrapping, liveMatches.length, newsItems.length, recentResults.length, upcomingMatches.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      communityService.clearCache();
      matchesCacheRef.current = [];
      matchesCacheAtRef.current = 0;
      await loadExplorePage();
      await refreshExploreSections(true);
    } finally {
      setRefreshing(false);
    }
  }, [bootstrapApp, loadExplorePage, refreshExploreSections, userProfile?.uid]);

  useEffect(() => {
    let active = true;
    const loadPopularTeams = async () => {
      const ranked = await communityService.getTopTeamsByMemberCount(allCommunities, 5);
      if (active) {
        setPopularTeams(ranked);
      }
    };
    void loadPopularTeams();
    return () => {
      active = false;
    };
  }, [allCommunities]);

  useEffect(() => {
    let active = true;
    getPopularRecentPosts(5).then((posts) => {
      if (active) setPopularPosts(posts);
    });
    // Run cleanup once per session — removes posts older than 72h
    void purgeExpiredPosts();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (allCommunities.length === 0) return;
    let active = true;
    const loadHotThreads = async () => {
      try {
        // Get the community IDs — prefer teams and major leagues
        const communityIds = allCommunities
          .filter((c) => c.type === 'team' || c.type === 'league')
          .slice(0, 20)
          .map((c) => String(c.id));
        const raw = await chatService.getHotCommunityThreads(communityIds, 3);
        if (!active) return;
        const enriched = raw.map((thread) => {
          const community = allCommunities.find((c) => String(c.id) === thread.communityId);
          return {
            ...thread,
            communityName: community?.name ?? 'Community',
            communityType: (community?.type ?? 'team') as 'team' | 'league' | 'worldcup',
          };
        });
        setHotThreads(enriched);
      } catch { /* ignore */ }
    };
    void loadHotThreads();
    return () => { active = false; };
  }, [allCommunities]);

  const loadMatchesCache = useCallback(async () => {
    const age = Date.now() - matchesCacheAtRef.current;
    if (matchesCacheRef.current.length > 0 && age < 2 * 60 * 1000) {
      return matchesCacheRef.current;
    }
    const localCombined = [...liveMatches, ...upcomingMatches, ...recentResults];
    if (localCombined.length > 0 && !looksTooSparseForUpcoming(localCombined)) {
      matchesCacheRef.current = localCombined;
      matchesCacheAtRef.current = Date.now();
      return localCombined;
    }
    if (matchesLoadRef.current) {
      return matchesLoadRef.current;
    }

    matchesLoadRef.current = (async () => {
      const [live, upcoming, finished] = await Promise.all([
        footballAPI.getLiveMatches(),
        footballAPI.getUpcomingMatches(),
        footballAPI.getRecentFinishedFixtures(80),
      ]);
      const combined = sortSearchMatches(
        Array.from(new Map([...live, ...upcoming, ...finished].map((match) => [match.id, match])).values())
      );
      matchesCacheRef.current = combined;
      matchesCacheAtRef.current = Date.now();
      return combined;
    })();

    try {
      return await matchesLoadRef.current;
    } finally {
      matchesLoadRef.current = null;
    }
  }, [liveMatches, upcomingMatches, recentResults]);

  async function performSearch(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], upcoming: [], results: [], news: [] });
      setNewsPage(1);
      setNewsHasMore(true);
      return;
    }
    try {
      latestSearchRef.current = query;
      const lower = query.toLowerCase();
      const communities = allCommunitiesRef.current;
      const teams = communities.filter(c =>
        c.type === 'team' &&
        (c.name.toLowerCase().includes(lower) ||
          (c.league && c.league.toLowerCase().includes(lower)))
      );
      const leagueResults = communities.filter(c =>
        (c.type === 'league' || c.type === 'worldcup') &&
        (c.name.toLowerCase().includes(lower) ||
          (c.country && c.country.toLowerCase().includes(lower)))
      );
      
      setSearchResults({
        teams,
        leagues: leagueResults,
        matches: [],
        upcoming: [],
        results: [],
        news: []
      });

      loadMatchesCache().then((allMatches) => {
        if (latestSearchRef.current !== query) return;
        const matchResults = sortSearchMatches(
          allMatches
          .filter(m =>
            m.home.toLowerCase().includes(lower) ||
            m.away.toLowerCase().includes(lower) ||
            m.league.toLowerCase().includes(lower)
          )
        ).slice(0, 10);
        const now = Date.now();
        const upcomingMatches = matchResults.filter(m => {
          const s = (m.status || '').toLowerCase();
          return s !== 'finished' && s !== 'ft' && new Date(m.date).getTime() > now - 2 * 60 * 60 * 1000;
        }).slice(0, 4);
        const resultMatches = matchResults.filter(m => {
          const s = (m.status || '').toLowerCase();
          return s === 'finished' || s === 'ft';
        }).slice(0, 4);
        setSearchResults(prev => ({
          ...prev,
          matches: matchResults,
          upcoming: upcomingMatches,
          results: resultMatches,
        }));
      }).catch(error => {
        console.error('Error loading matches cache:', error);
      });

      await loadNewsPage(query, 1, false, signal);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setSearching(false);
    }
  }

  const renderLeagueCard = useCallback((league: Community) => (
    <TouchableOpacity
      key={league.id}
      style={[styles.leagueCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      onPress={() =>
        router.push({
          pathname: '/leagueCommunity/[id]',
          params: {
            id: String(league.id),
            name: league.name,
            logo: league.logo || '',
          },
        } as any)
      }
    >
      <View style={[styles.leagueCardGlow, { backgroundColor: isDark ? 'rgba(77,163,255,0.14)' : 'rgba(13,108,207,0.08)' }]} />
      <View style={[styles.leagueCardTag, { backgroundColor: isDark ? 'rgba(156,219,255,0.10)' : 'rgba(13,108,207,0.08)' }]}>
        <Text style={[styles.leagueCardTagText, { color: palette.accent }]}>League Hub</Text>
      </View>
      {league.logo ? (
        <View
          style={[
            styles.leagueLogoPlate,
            {
              backgroundColor: isDark ? '#F8FAFC' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
            },
          ]}
        >
          <Image source={{ uri: league.logo, cache: 'force-cache' }} style={styles.leagueLogo} resizeMode="contain" />
        </View>
      ) : (
        <View style={[styles.leagueLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
          <Ionicons name="trophy" size={24} color={palette.accent} />
        </View>
      )}
      <Text style={[styles.leagueName, { color: palette.text }]} numberOfLines={2}>{league.name}</Text>
      <View style={styles.leagueFooterRow}>
        {league.country ? (
          <Text style={[styles.leagueCountry, { color: palette.subtext }]}>{league.country}</Text>
        ) : <View />}
        <Ionicons name="arrow-forward" size={16} color={palette.accent} />
      </View>
    </TouchableOpacity>
  ), [isDark, palette, router]);

  const renderTeamCard = useCallback((team: Community) => (
    <TouchableOpacity
      key={team.id}
      style={[styles.teamCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      onPress={() =>
        router.push({
          pathname: '/teamCommunity/[id]',
          params: {
            id: String(team.id),
            name: team.name,
            logo: team.logo || '',
          },
        } as any)
      }
    >
      {team.logo ? (
        <Image source={{ uri: team.logo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
      ) : (
        <View style={[styles.teamLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
          <Ionicons name="shield" size={20} color={palette.accent} />
        </View>
      )}
      <View style={styles.teamInfo}>
        {team.league ? (
          <View style={[styles.teamLeagueChip, { backgroundColor: isDark ? 'rgba(77,163,255,0.12)' : 'rgba(13,108,207,0.08)' }]}>
            <Text style={[styles.teamLeagueChipText, { color: palette.accent }]} numberOfLines={1}>
              {team.league}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.teamName, { color: palette.text }]} numberOfLines={1}>{team.name}</Text>
        {team.country ? <Text style={[styles.teamLeague, { color: palette.subtext }]}>{team.country}</Text> : null}
      </View>
      <View style={[styles.teamArrowWrap, { backgroundColor: isDark ? '#162133' : '#EEF5FE' }]}>
        <Ionicons name="chevron-forward" size={18} color={palette.accent} />
      </View>
    </TouchableOpacity>
  ), [palette, router]);

  const renderMatchResult = useCallback((match: Match) => {
    const isLive = match.status === 'live';
    const isFinished = (match.status || '').toLowerCase() === 'finished';
    const homeColor = teamPrimaryColor(match.home);
    const awayColor = teamPrimaryColor(match.away);
    const homeName = getDisplayTeamName({ name: match.home, short_name: match.homeShortName, code: match.homeCode });
    const awayName = getDisplayTeamName({ name: match.away, short_name: match.awayShortName, code: match.awayCode });
    return (
      <TouchableOpacity
        key={match.id}
        style={[styles.matchResult, { backgroundColor: palette.card, borderColor: palette.border }]}
        activeOpacity={0.88}
        onPressIn={() => { void prefetchMatchOpenData(match); }}
        onPress={() => router.push(buildMatchRouteDescriptor(isFinished ? { ...match, status: 'finished' } : match) as any)}
      >
        <LinearGradient
          colors={[withAlpha(homeColor, isDark ? 0.14 : 0.07), 'transparent', withAlpha(awayColor, isDark ? 0.14 : 0.07)]}
          locations={[0, 0.5, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[withAlpha(homeColor, 0.7), withAlpha(awayColor, 0.7)]}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={styles.matchResultAccentBar}
        />
        {/* Single row: logo · name · score · name · logo · badge */}
        <View style={styles.matchResultRow}>
          {match.homeLogo
            ? <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.matchResultLogo} resizeMode="contain" />
            : <View style={[styles.matchResultLogoPlaceholder, { backgroundColor: palette.border }]} />}
          <Text style={[styles.matchResultName, { color: palette.text }]} numberOfLines={1}>{homeName}</Text>
          <Text style={[styles.matchResultScore, { color: palette.text }]}>{match.score || 'vs'}</Text>
          <Text style={[styles.matchResultName, { color: palette.text, textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text>
          {match.awayLogo
            ? <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.matchResultLogo} resizeMode="contain" />
            : <View style={[styles.matchResultLogoPlaceholder, { backgroundColor: palette.border }]} />}
          {isLive && (
            <View style={[styles.liveBadge, { backgroundColor: isDark ? 'rgba(255,69,58,0.2)' : '#FFF1F0', marginLeft: 6 }]}>
              <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity }]} />
              <Text style={[styles.liveText, { color: '#FF6B5E' }]}>{match.minute || 'LIVE'}</Text>
            </View>
          )}
          {isFinished && (
            <View style={[styles.finishedBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)', marginLeft: 6 }]}>
              <Text style={[styles.finishedText, { color: palette.subtext }]}>FT</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [isDark, liveDotOpacity, palette, router]);

  const renderNewsResult = useCallback((article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={[styles.newsResult, { backgroundColor: palette.card, borderColor: palette.border }]}
      onPress={() => {
        openArticle(article);
      }}
      onPressIn={() => {
        prefetchArticle(article);
      }}
    >
      <NewsImage uri={article.imageUrl} style={styles.newsResultImage} resizeMode="cover" />
      <View style={styles.newsResultContent}>
        <Text style={[styles.newsResultTitle, { color: palette.text }]}>{article.title}</Text>
        <Text style={[styles.newsResultMeta, { color: palette.subtext }]}>{article.source}</Text>
      </View>
    </TouchableOpacity>
  ), [openArticle, palette, prefetchArticle]);

  const renderDynamicNewsCard = useCallback((article: NewsArticle, index: number) => {
    const isFeature = index % 3 === 0;
    const isPrimaryFeature = index === 0;
    if (isFeature) {
      return (
        <TouchableOpacity
          key={article.id}
          style={[
            styles.newsFeatureCard,
            isPrimaryFeature ? styles.newsFeatureCardPrimary : styles.newsFeatureCardSecondary,
            { borderColor: palette.border, backgroundColor: palette.card },
          ]}
          onPress={() => openArticle(article)}
          onPressIn={() => prefetchArticle(article)}
          activeOpacity={0.9}
        >
          <NewsImage
            uri={article.imageUrl}
            style={[styles.newsFeatureImage, isPrimaryFeature ? styles.newsFeatureImagePrimary : styles.newsFeatureImageSecondary]}
            resizeMode="cover"
          />
          <View style={[styles.newsFeatureOverlay, { backgroundColor: isDark ? 'rgba(9,11,14,0.68)' : 'rgba(7,17,34,0.40)' }]} />
          <View style={styles.newsFeatureContent}>
            <View style={[styles.newsFeatureTag, { backgroundColor: isDark ? 'rgba(77,163,255,0.22)' : 'rgba(0,102,204,0.15)' }]}>
              <Text style={[styles.newsFeatureTagText, { color: palette.accent }]}>Top Story</Text>
            </View>
            <Text style={[styles.newsFeatureTitle, isPrimaryFeature ? styles.newsFeatureTitlePrimary : styles.newsFeatureTitleSecondary]}>
              {article.title}
            </Text>
            <Text style={styles.newsFeatureMeta}>{article.source}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={article.id}
        style={[styles.newsAltCard, { backgroundColor: palette.card, borderColor: palette.border }]}
        onPress={() => openArticle(article)}
        onPressIn={() => prefetchArticle(article)}
        activeOpacity={0.9}
      >
        <NewsImage uri={article.imageUrl} style={styles.newsAltImage} resizeMode="cover" />
        <View style={styles.newsAltBody}>
          <Text style={[styles.newsAltTitle, { color: palette.text }]}>{article.title}</Text>
          <Text style={[styles.newsAltMeta, { color: palette.subtext }]}>{article.source}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [isDark, openArticle, palette, prefetchArticle]);

  const displayNewsPreview = useMemo(() => {
    const sanitized = newsAPI.sanitizeArticles(scopedNewsItems);
    return sanitized.filter((item) => !!item.imageUrl).slice(0, NEWS_PREVIEW_LIMIT);
  }, [scopedNewsItems]);
  const displayNewsFeed = useMemo(() => {
    const sanitized = newsAPI.sanitizeArticles(scopedNewsItems);
    return sanitized.filter((item) => !!item.imageUrl);
  }, [scopedNewsItems]);

  const waitingForBootSections =
    isBootstrapping &&
    liveMatches.length === 0 &&
    upcomingMatches.length === 0 &&
    recentResults.length === 0 &&
    newsItems.length === 0;

  if (waitingForBootSections) {
    return <BrandedLoading variant="launch" dark />;
  }

  const showSkeleton = loading && leagues.length === 0 && popularTeams.length === 0;
  
  if (showSkeleton) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={[styles.header, { backgroundColor: palette.background, paddingTop: Math.max(insets.top + 4, 40) }]}>
          <View style={styles.headerSide}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Explore</Text>
          </View>
          <View style={styles.headerSideRight} />
        </View>
        <View style={styles.skeletonContainer}>
          <View style={styles.skeletonSearch} />
          <View style={styles.skeletonSection}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonRow}>
              {Array.from({ length: 4 }).map((_, index) => (
                <View key={`league-skeleton-${index}`} style={styles.skeletonLeagueCard} />
              ))}
            </View>
          </View>
          <View style={styles.skeletonSection}>
            <View style={styles.skeletonTitle} />
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={`team-skeleton-${index}`} style={styles.skeletonTeamCard} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.background, paddingTop: Math.max(insets.top + 4, 40) }]}>
        <View style={styles.headerSide}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Explore</Text>
        </View>
        <View style={styles.headerSideRight}>
          <ProfileQuickAccessButton
            initial={(userProfile?.username || 'U')[0] || 'U'}
            dark={isDark}
            size={38}
          />
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Ionicons name="search" size={20} color={palette.subtext} />
        <TextInput
          style={[styles.searchInput, { color: palette.text }]}
          placeholder={newsOnlyMode ? 'Search soccer news...' : 'Search teams, leagues, matches...'}
          placeholderTextColor={palette.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={palette.subtext} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressBackgroundColor={palette.card}
          />
        }
      >
        {searching ? (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="small" color={palette.accent} />
            <Text style={[styles.searchingText, { color: palette.subtext }]}>Searching...</Text>
          </View>
        ) : searchQuery.trim().length >= 2 ? (
          // Search Results
          <View style={styles.searchResults}>
            {/* Teams */}
            {!newsOnlyMode && searchResults.teams.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>Teams</Text>
                {searchResults.teams.map(renderTeamCard)}
              </View>
            )}

            {/* Leagues */}
            {!newsOnlyMode && searchResults.leagues.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>Leagues</Text>
                {searchResults.leagues.map(league => renderTeamCard(league))}
              </View>
            )}

            {/* Live matches */}
            {!newsOnlyMode && searchResults.matches.filter(m => m.status === 'live').length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>Live</Text>
                {searchResults.matches.filter(m => m.status === 'live').map(renderMatchResult)}
              </View>
            )}

            {/* Upcoming matches */}
            {!newsOnlyMode && searchResults.upcoming.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>Upcoming</Text>
                {searchResults.upcoming.map(renderMatchResult)}
              </View>
            )}

            {/* Results */}
            {!newsOnlyMode && searchResults.results.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>Results</Text>
                {searchResults.results.map(renderMatchResult)}
              </View>
            )}

            {/* News */}
            {searchResults.news.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={[styles.resultSectionTitle, { color: palette.text }]}>News</Text>
                {searchResults.news.map(renderNewsResult)}
                {newsRateLimited && (
                  <Text style={[styles.rateLimitText, { color: palette.subtext }]}>
                    News is temporarily rate-limited. Try again shortly.
                  </Text>
                )}
                {newsLoadingMore && (
                  <View style={styles.loadMoreRow}>
                    <ActivityIndicator size="small" color={palette.accent} />
                    <Text style={[styles.loadMoreText, { color: palette.subtext }]}>Loading more news...</Text>
                  </View>
                )}
                {!newsLoadingMore && newsHasMore && !newsRateLimited && (
                  <TouchableOpacity
                    style={[styles.loadMoreButton, { backgroundColor: palette.card, borderColor: palette.border }]}
                    onPress={() => loadNewsPage(searchQuery, newsPage + 1, true)}
                  >
                    <Text style={[styles.loadMoreButtonText, { color: palette.accent }]}>Load more news</Text>
                  </TouchableOpacity>
                )}
                {!!matchQueryParts && lastMatchFetchPage >= 2 && lastMatchFetchCount === 0 && (
                  <Text style={[styles.matchNoMoreText, { color: palette.subtext }]}>No more match news found</Text>
                )}
              </View>
            )}

            {newsRateLimited && searchResults.news.length === 0 && (
              <Text style={[styles.rateLimitText, { color: palette.subtext }]}>
                News is temporarily rate-limited. Try again shortly.
              </Text>
            )}

            {/* No Results */}
            {searchResults.teams.length === 0 &&
              searchResults.leagues.length === 0 &&
              searchResults.matches.length === 0 &&
              searchResults.news.length === 0 && (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={64} color={palette.border} />
                  <Text style={[styles.noResultsText, { color: palette.subtext }]}>No results found</Text>
                </View>
              )}
          </View>
        ) : (
          // Browse Content (when not searching)
          <>
            {/* Quick Actions */}
            <View style={styles.section}>
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: palette.card }]}
                  onPressIn={() => { void warmScreenData('live'); }}
                  onPress={() => router.push('/live' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B30' }]}>
                    <Ionicons name="radio" size={24} color="#FFF" />
                  </View>
                  <Text style={[styles.quickActionText, { color: palette.text }]}>Live Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: palette.card }]}
                  onPressIn={() => { void warmScreenData('upcoming'); }}
                  onPress={() => router.push('/upcoming' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#0066CC' }]}>
                    <Ionicons name="calendar" size={24} color="#FFF" />
                  </View>
                  <Text style={[styles.quickActionText, { color: palette.text }]}>Upcoming</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { backgroundColor: palette.card }]}
                  onPressIn={() => { void warmScreenData('news'); }}
                  onPress={() => router.push('/news' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#34C759' }]}>
                    <Ionicons name="newspaper" size={24} color="#FFF" />
                  </View>
                  <Text style={[styles.quickActionText, { color: palette.text }]}>News</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Hot Threads */}
            {!newsOnlyMode && hotThreads.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>🔥 Popular Now</Text>
                </View>
                {hotThreads.map((thread) => (
                  <TouchableOpacity
                    key={thread.communityId}
                    style={[styles.hotThreadCard, { backgroundColor: palette.card, borderColor: palette.border }]}
                    onPress={() =>
                      router.push({
                        pathname: '/communityChat/[id]',
                        params: {
                          id: thread.communityId,
                          name: thread.communityName,
                          type: thread.communityType,
                        },
                      } as any)
                    }
                  >
                    <View style={styles.hotThreadTop}>
                      <Text style={styles.hotThreadFire}>🔥</Text>
                      <Text style={[styles.hotThreadName, { color: palette.text }]} numberOfLines={1}>
                        {thread.communityName}
                      </Text>
                      <View style={[styles.hotThreadBadge, { backgroundColor: isDark ? 'rgba(255,69,58,0.18)' : '#FFF1F0' }]}>
                        <Text style={[styles.hotThreadBadgeText, { color: '#FF453A' }]}>
                          {thread.messageCount} msgs/24h
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.hotThreadPreview, { color: palette.subtext }]} numberOfLines={2}>
                      {thread.lastMessage.slice(0, 60)}{thread.lastMessage.length > 60 ? '...' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Popular Threads */}
            {!newsOnlyMode && popularPosts.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>Popular Threads</Text>
                  <TouchableOpacity onPress={() => router.push('/allThreads' as any)}>
                    <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
                  </TouchableOpacity>
                </View>
                {popularPosts.map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    style={[styles.threadCard, { backgroundColor: palette.card, borderColor: palette.border }]}
                    onPress={() =>
                      router.push({
                        pathname: '/communityPosts/[id]',
                        params: {
                          id: post.communityId,
                          name: post.communityName,
                          type: post.communityType,
                          logo: '',
                        },
                      } as any)
                    }
                    activeOpacity={0.85}
                  >
                    <View style={[styles.threadTag, { backgroundColor: isDark ? 'rgba(77,163,255,0.14)' : 'rgba(0,102,204,0.08)' }]}>
                      <Ionicons name="people" size={11} color={palette.accent} />
                      <Text style={[styles.threadTagText, { color: palette.accent }]} numberOfLines={1}>
                        {post.communityName}
                      </Text>
                    </View>
                    <Text style={[styles.threadTitle, { color: palette.text }]} numberOfLines={2}>
                      {post.title}
                    </Text>
                    {post.body.trim().length > 0 && (
                      <Text style={[styles.threadBody, { color: palette.subtext }]} numberOfLines={1}>
                        {post.body}
                      </Text>
                    )}
                    <View style={styles.threadFooter}>
                      <Text style={[styles.threadMeta, { color: palette.subtext }]}>{post.username}</Text>
                      <View style={styles.threadStats}>
                        <Ionicons name="chatbubble-outline" size={13} color={palette.subtext} />
                        <Text style={[styles.threadStatText, { color: palette.subtext }]}>{post.commentCount}</Text>
                        <Ionicons name="heart-outline" size={13} color={palette.subtext} style={{ marginLeft: 8 }} />
                        <Text style={[styles.threadStatText, { color: palette.subtext }]}>{post.likesCount}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!newsOnlyMode && (
              <>
                {/* Browse Leagues - FILTERED */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>Browse Leagues</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/communities?filter=leagues' as any)}>
                      <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.leaguesScroll}
                  >
                    {leagues.slice(0, 8).map(renderLeagueCard)}
                  </ScrollView>
                  <Text style={[styles.trademarkNote, { color: palette.subtext }]}>
                    Logos and marks are trademarks of their respective owners.
                  </Text>
                </View>

                {/* Popular Teams */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>Popular Teams</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/communities?filter=teams' as any)}>
                      <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
                    </TouchableOpacity>
                  </View>
                  {popularTeams.map(renderTeamCard)}
                </View>
              </>
            )}

            {/* News */}
            <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>Latest News</Text>
                    {!newsOnlyMode && (
                      <TouchableOpacity onPressIn={() => { void warmScreenData('news'); }} onPress={() => router.push('/news' as any)}>
                        <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {newsOnlyMode ? (
                    <View style={styles.newsFeedStack}>
                      {loadingNews && scopedNewsItems.length === 0 && (
                        <View style={styles.inlineLoader}>
                          <ActivityIndicator size="small" color={palette.accent} />
                          <Text style={[styles.inlineLoaderText, { color: palette.subtext }]}>Loading news...</Text>
                        </View>
                      )}
                      {displayNewsFeed.map((article, index) => renderDynamicNewsCard(article, index))}
                      {newsRateLimited && (
                        <Text style={[styles.matchNoMoreText, { color: palette.subtext }]}>
                          News is temporarily rate-limited. Try again shortly.
                        </Text>
                      )}
                      {newsFeedLoadingMore && (
                        <Text style={[styles.loadMoreText, { color: palette.subtext }]}>Loading more news...</Text>
                      )}
                      {!loadingNews && displayNewsFeed.length === 0 && !newsRateLimited && (
                        <View style={[styles.newsEmptyState, { backgroundColor: palette.card, borderColor: palette.border }]}>
                          <Text style={[styles.newsEmptyTitle, { color: palette.text }]}>Latest News unavailable</Text>
                          <Text style={[styles.newsEmptySubtitle, { color: palette.subtext }]}>{newsAPI.getFallbackMessage()}</Text>
                        </View>
                      )}
                      {!newsFeedLoadingMore && newsFeedHasMore && !newsRateLimited && displayNewsFeed.length > 0 && (
                        <TouchableOpacity
                          style={[styles.loadMoreButton, { backgroundColor: palette.card, borderColor: palette.border }]}
                          onPress={loadMoreNewsFeed}
                        >
                          <Text style={[styles.loadMoreButtonText, { color: palette.accent }]}>Load more news</Text>
                        </TouchableOpacity>
                      )}
                      {!newsFeedHasMore && displayNewsFeed.length > 0 && (
                        <Text style={[styles.matchNoMoreText, { color: palette.subtext }]}>No more news found</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.newsFeedStack}>
                      {loadingNews && scopedNewsItems.length === 0 && (
                        <View style={styles.inlineLoader}>
                          <ActivityIndicator size="small" color={palette.accent} />
                          <Text style={[styles.inlineLoaderText, { color: palette.subtext }]}>Loading news...</Text>
                        </View>
                      )}
                      {displayNewsPreview.map((article, index) => renderDynamicNewsCard(article, index))}
                      {!loadingNews && displayNewsPreview.length === 0 && !newsRateLimited && (
                        <View style={[styles.newsEmptyState, { backgroundColor: palette.card, borderColor: palette.border }]}>
                          <Text style={[styles.newsEmptyTitle, { color: palette.text }]}>Latest News unavailable</Text>
                          <Text style={[styles.newsEmptySubtitle, { color: palette.subtext }]}>{newsAPI.getFallbackMessage()}</Text>
                        </View>
                      )}
                    </View>
                  )}
              </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  threadCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  threadTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 7,
    gap: 4,
  },
  threadTagText: {
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 200,
  },
  threadTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 3,
  },
  threadBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  threadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  threadMeta: {
    fontSize: 12,
  },
  threadStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  threadStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  hotThreadCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  hotThreadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  hotThreadFire: {
    fontSize: 16,
  },
  hotThreadName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  hotThreadBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hotThreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  hotThreadPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 8,
    backgroundColor: '#FFF',
    position: 'relative',
  },
  headerSide: {
    width: 112,
    minHeight: 40,
    justifyContent: 'center',
    zIndex: 1,
  },
  headerSideRight: {
    width: 112,
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1,
  },
  iosBrandWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  iosBrandIcon: {
    width: 44,
    height: 44,
    opacity: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  skeletonSearch: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E6E6E9',
    marginBottom: 20,
  },
  skeletonSection: {
    marginBottom: 24,
  },
  skeletonTitle: {
    height: 20,
    width: 160,
    borderRadius: 10,
    backgroundColor: '#E6E6E9',
    marginBottom: 16,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonLeagueCard: {
    width: 120,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#E6E6E9',
  },
  skeletonTeamCard: {
    height: 64,
    borderRadius: 12,
    backgroundColor: '#E6E6E9',
    marginBottom: 10,
  },
  searchingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  searchingText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 12,
  },
  
  // Quick Actions
  section: {
    marginTop: 20,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  
  // Sections
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  
  // Leagues
  leaguesScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  leagueCard: {
    width: 152,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-start',
    minHeight: 188,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  leagueCardGlow: {
    position: 'absolute',
    top: -18,
    right: -12,
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  leagueCardTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 16,
  },
  leagueCardTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  leagueLogoPlate: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  leagueLogo: {
    width: 48,
    height: 48,
  },
  leagueLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  leagueName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: '#000',
    minHeight: 44,
  },
  leagueFooterRow: {
    marginTop: 'auto',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueCountry: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  trademarkNote: {
    fontSize: 11,
    marginTop: 8,
    marginHorizontal: 20,
  },
  
  // Teams
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 6,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  teamLogo: {
    width: 38,
    height: 38,
    marginRight: 10,
  },
  teamLogoPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  teamInfo: {
    flex: 1,
  },
  teamLeagueChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
    maxWidth: '92%',
  },
  teamLeagueChipText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  teamName: {
    fontSize: 15,
    fontWeight: '700',
  },
  teamLeague: {
    fontSize: 12,
    marginTop: 1,
  },
  teamArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Search Results
  searchResults: {
    paddingTop: 8,
  },
  resultSection: {
    marginBottom: 14,
  },
  resultSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadMoreButton: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
  },
  loadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#666',
  },
  rateLimitText: {
    fontSize: 13,
    color: '#999',
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  matchNoMoreText: {
    fontSize: 13,
    color: '#999',
    paddingTop: 8,
  },
  
  // Match Results
  matchResult: {
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginBottom: 6,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow({ y: 1, blur: 4, opacity: 0.06, elevation: 2 }),
  },
  matchResultAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  matchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchResultLogo: {
    width: 22,
    height: 22,
    flexShrink: 0,
  },
  matchResultLogoPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    flexShrink: 0,
  },
  matchResultName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  matchResultScore: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
  },
  finishedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  finishedText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Compact match cards (Live/Upcoming/Results)
  horizontalList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  inlineLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  inlineLoaderText: {
    fontSize: 13,
    color: '#666',
  },
  newsEmptyState: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  newsEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  newsEmptySubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  emptySectionText: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 20,
  },
  compactMatchCard: {
    width: 208,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  compactLiveBlend: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  compactAccentBarStrong: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  compactAccentBarSoft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  compactSoftTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  compactMatchCardContent: {
    position: 'relative',
    zIndex: 1,
  },
  compactMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 10,
    paddingRight: 4,
  },
  compactLeague: {
    fontSize: 9,
    fontWeight: '600',
    color: '#0066CC',
    flex: 1,
    marginRight: 0,
    paddingLeft: 8,
    textAlign: 'right',
  },
  compactLeagueResults: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0066CC',
    width: '100%',
    textAlign: 'center',
  },
  compactLeagueDivider: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: -2,
    height: 2,
    borderRadius: 999,
  },
  compactHeaderDate: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 56,
  },
  compactLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  compactLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 4,
  },
  compactLiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF3B30',
  },
  compactTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: 4,
  },
  compactTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  compactLogo: {
    width: 26,
    height: 26,
  },
  compactLogoPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F0F0F0',
  },
  compactTeamName: {
    fontSize: 9,
    lineHeight: 11,
    minHeight: 20,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  compactScoreBlock: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  compactScore: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  compactTime: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    width: '100%',
  },
  compactResultStatus: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 1,
  },
  compactBottomTime: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 1,
  },
  compactBottomResultDate: {
    fontWeight: '700',
  },
  compactResultsMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 12,
  },

  // Compact news cards
  compactNewsCard: {
    width: 220,
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  compactNewsImage: {
    width: '100%',
    height: 110,
  },
  compactNewsBody: {
    padding: 12,
  },
  compactNewsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  compactNewsSource: {
    fontSize: 11,
    color: '#666',
  },
  
  // News Results
  newsResult: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    ...shadow({ y: 3, blur: 10, opacity: 0.08, elevation: 3 }),
  },
  newsOnlyList: {
    gap: 12,
  },
  newsFeedStack: {
    gap: 14,
    paddingHorizontal: 20,
  },
  newsFeatureCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    ...shadow({ y: 5, blur: 14, opacity: 0.16, elevation: 6 }),
  },
  newsFeatureCardPrimary: {
    minHeight: 220,
  },
  newsFeatureCardSecondary: {
    minHeight: 170,
  },
  newsFeatureImage: {
    width: '100%',
  },
  newsFeatureImagePrimary: {
    height: 220,
  },
  newsFeatureImageSecondary: {
    height: 170,
  },
  newsFeatureOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  newsFeatureContent: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  newsFeatureTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  newsFeatureTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  newsFeatureTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 8,
  },
  newsFeatureTitlePrimary: {
    fontSize: 22,
    lineHeight: 28,
  },
  newsFeatureTitleSecondary: {
    fontSize: 18,
    lineHeight: 24,
  },
  newsFeatureMeta: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },
  newsAltCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: 126,
    ...shadow({ y: 3, blur: 10, opacity: 0.1, elevation: 4 }),
  },
  newsAltCardReverse: {
    flexDirection: 'row-reverse',
  },
  newsAltImage: {
    width: 128,
    height: '100%',
    minHeight: 126,
  },
  newsAltBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
    gap: 8,
  },
  newsAltTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    flexShrink: 1,
  },
  newsAltMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  newsResultImage: {
    width: 112,
    height: 112,
  },
  newsResultContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  newsResultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    lineHeight: 20,
    flexShrink: 1,
  },
  newsResultMeta: {
    fontSize: 12,
    color: '#0066CC',
    fontWeight: '600',
  },
  
  // No Results
  noResults: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  noResultsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
