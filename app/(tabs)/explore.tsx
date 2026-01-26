// app/(tabs)/explore.tsx
// IMPROVED: League browsing, team directory, better search
// UPDATED: Removed "Friendlies Clubs" and "Community" leagues from Browse Leagues

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { shadow } from '../../components/styleUtils';
import { Community, communityService } from '../../services/communityService';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { getCachedValue, getCachedValueAsync, setCachedValue } from '../../services/cacheService';

const LIVE_TTL_MS = 60 * 1000;
const UPCOMING_TTL_MS = 60 * 1000;
const RESULTS_TTL_MS = 10 * 60 * 1000;
const NEWS_TTL_MS = 10 * 60 * 1000;
const RESULTS_LIMIT = 8;
const NEWS_LIMIT = 8;

type MatchCardVariant = 'live' | 'upcoming' | 'results';

const CompactMatchCard = memo(
  ({
    match,
    variant,
    onPress
  }: {
    match: Match;
    variant: MatchCardVariant;
    onPress: (match: Match) => void;
  }) => {
    const showLive = variant === 'live';
    const showUpcoming = variant === 'upcoming';
    const scoreLabel = match.score || (showUpcoming ? 'VS' : '0-0');
    const timeLabel = showLive ? match.minute : match.time || '';

    return (
      <TouchableOpacity style={styles.compactMatchCard} onPress={() => onPress(match)} activeOpacity={0.85}>
        <View style={styles.compactMatchHeader}>
          <Text style={styles.compactLeague} numberOfLines={1}>
            {match.league}
          </Text>
          {showLive && (
            <View style={styles.compactLiveBadge}>
              <View style={styles.compactLiveDot} />
              <Text style={styles.compactLiveText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.compactTeamsRow}>
          <View style={styles.compactTeam}>
            {match.homeLogo ? (
              <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.compactLogo} resizeMode="contain" />
            ) : (
              <View style={styles.compactLogoPlaceholder} />
            )}
            <Text style={styles.compactTeamName} numberOfLines={1}>
              {match.home}
            </Text>
          </View>

          <View style={styles.compactScoreBlock}>
            <Text style={styles.compactScore}>{scoreLabel}</Text>
            {timeLabel ? <Text style={styles.compactTime}>{timeLabel}</Text> : null}
          </View>

          <View style={styles.compactTeam}>
            {match.awayLogo ? (
              <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.compactLogo} resizeMode="contain" />
            ) : (
              <View style={styles.compactLogoPlaceholder} />
            )}
            <Text style={styles.compactTeamName} numberOfLines={1}>
              {match.away}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

const CompactNewsCard = memo(
  ({
    article,
    onPress,
    onPressIn
  }: {
    article: NewsArticle;
    onPress: (article: NewsArticle) => void;
    onPressIn?: (article: NewsArticle) => void;
  }) => (
    <TouchableOpacity
      style={styles.compactNewsCard}
      onPress={() => onPress(article)}
      onPressIn={() => onPressIn?.(article)}
      activeOpacity={0.85}
    >
      {article.imageUrl ? (
        <Image source={{ uri: article.imageUrl, cache: 'force-cache' }} style={styles.compactNewsImage} resizeMode="cover" />
      ) : null}
      <View style={styles.compactNewsBody}>
        <Text style={styles.compactNewsTitle} numberOfLines={2}>
          {article.title}
        </Text>
        <Text style={styles.compactNewsSource} numberOfLines={1}>
          {article.source}
        </Text>
      </View>
    </TouchableOpacity>
  )
);

export default function ExploreScreen() {
  const router = useRouter();
  const { mode, q, type, initialTab } = useLocalSearchParams();
  const { openArticle, prefetchArticle } = useOpenArticle();
  
  const tabParam = Array.isArray(initialTab) ? initialTab[0] : initialTab;
  const newsOnlyMode = (Array.isArray(mode) ? mode[0] : mode) === 'news' || (Array.isArray(type) ? type[0] : type) === 'news' || tabParam === 'news';
  const initialQuery = Array.isArray(q) ? q[0] : q;
  
  const deriveExploreData = useCallback((allCommunities: Community[]) => {
    // Get leagues - FILTER OUT FRIENDLIES AND COMMUNITY
    const leagueList = allCommunities.filter(c => {
      if (c.type !== 'league') return false;
      const name = c.name.toLowerCase();
      return !name.includes('friendlies') && 
             !name.includes('community') &&
             name !== 'friendlies clubs';
    });

    // Get popular teams (from major leagues)
    const popularLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1'];
    const popularTeamsList = allCommunities.filter(c => 
      c.type === 'team' && c.league && popularLeagues.includes(c.league)
    ).slice(0, 12);

    return { leagueList, popularTeamsList };
  }, []);

  const cached = useMemo(() => communityService.getCachedAllCommunities(), []);
  const cachedAll = cached?.data ?? [];
  const [allCommunities, setAllCommunities] = useState<Community[]>(cachedAll);
  const [liveMatches, setLiveMatches] = useState<Match[]>(getCachedValue('explore:live', LIVE_TTL_MS) ?? []);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>(getCachedValue('explore:upcoming', UPCOMING_TTL_MS) ?? []);
  const [recentResults, setRecentResults] = useState<Match[]>(getCachedValue('explore:results', RESULTS_TTL_MS) ?? []);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>(getCachedValue('explore:news', NEWS_TTL_MS) ?? []);
  const [loadingLive, setLoadingLive] = useState(liveMatches.length === 0);
  const [loadingUpcoming, setLoadingUpcoming] = useState(upcomingMatches.length === 0);
  const [loadingResults, setLoadingResults] = useState(recentResults.length === 0);
  const [loadingNews, setLoadingNews] = useState(newsItems.length === 0);
  const exploreData = useMemo(() => {
    if (__DEV__) {
      console.time('explore.derive');
    }
    const data = deriveExploreData(allCommunities);
    if (__DEV__) {
      console.timeEnd('explore.derive');
    }
    return data;
  }, [allCommunities, deriveExploreData]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    teams: Community[];
    leagues: Community[];
    matches: Match[];
    news: NewsArticle[];
  }>({ teams: [], leagues: [], matches: [], news: [] });
  const [newsPage, setNewsPage] = useState(1);
  const [newsHasMore, setNewsHasMore] = useState(true);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);
  const [newsRateLimited, setNewsRateLimited] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  
  const [loading, setLoading] = useState(cachedAll.length === 0);
  const leagues = exploreData.leagueList;
  const popularTeams = exploreData.popularTeamsList;
  const allCommunitiesRef = useRef<Community[]>(cachedAll);
  const matchesCacheRef = useRef<Match[]>([]);
  const matchesCacheAtRef = useRef(0);
  const matchesLoadRef = useRef<Promise<Match[]> | null>(null);
  const latestSearchRef = useRef('');
  const mountTimeRef = useRef(Date.now());
  const firstRenderLoggedRef = useRef(false);

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], news: [] });
      setSearching(false);
      setNewsPage(1);
      setNewsHasMore(true);
      setNewsRateLimited(false);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      return;
    }

    setSearching(true);
    setNewsPage(1);
    setNewsHasMore(true);
    setNewsRateLimited(false);

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
      if (__DEV__) {
        console.time('explore.load');
      }
      const cachedSnapshot = await communityService.getCachedAllCommunitiesAsync();
      if (cachedSnapshot?.data.length) {
        setAllCommunities(cachedSnapshot.data);
        allCommunitiesRef.current = cachedSnapshot.data;
        setLoading(false);
      } else {
        setLoading(true);
      }

      const fresh = await communityService.refreshCommunitiesIfStale();
      if (fresh) {
        const next = [...fresh.teams, ...fresh.leagues];
        setAllCommunities(next);
        allCommunitiesRef.current = next;
      }
    } catch (error) {
      console.error('Error loading explore page:', error);
    } finally {
      setLoading(false);
      if (__DEV__) {
        console.timeEnd('explore.load');
      }
    }
  }, []);

  useEffect(() => {
    loadExplorePage();
  }, [loadExplorePage]);

  const dedupeNewsByUrl = useCallback((articles: NewsArticle[]) => {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = (article.url || `${article.title}-${article.source}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const loadNewsPage = useCallback(async (query: string, pageToLoad: number, append: boolean, signal?: AbortSignal) => {
    if (append && (newsLoadingMore || !newsHasMore)) return;
    if (append) {
      setNewsLoadingMore(true);
    }

    try {
      if (__DEV__) {
        console.time(`explore.news.page.${pageToLoad}`);
      }
      const response = await newsAPI.searchNewsQuery({ q: query, page: pageToLoad, pageSize: 20, signal });
      if (response.isStale) {
        setNewsRateLimited(true);
      }
      const valid = response.articles.filter(article => article.title && article.url);
      const unique = dedupeNewsByUrl(valid);
      setSearchResults(prev => ({
        ...prev,
        news: append ? dedupeNewsByUrl([...prev.news, ...unique]) : unique
      }));
      setNewsPage(pageToLoad);
      const hasMore = response.totalResults ? pageToLoad * 20 < response.totalResults : unique.length === 20;
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
      if (__DEV__) {
        console.timeEnd(`explore.news.page.${pageToLoad}`);
      }
      if (append) {
        setNewsLoadingMore(false);
      }
    }
  }, [dedupeNewsByUrl, newsHasMore, newsLoadingMore]);

  const hydrateExploreCache = useCallback(async () => {
    const [live, upcoming, results, news] = await Promise.all([
      getCachedValueAsync<Match[]>('explore:live', LIVE_TTL_MS),
      getCachedValueAsync<Match[]>('explore:upcoming', UPCOMING_TTL_MS),
      getCachedValueAsync<Match[]>('explore:results', RESULTS_TTL_MS),
      getCachedValueAsync<NewsArticle[]>('explore:news', NEWS_TTL_MS)
    ]);

    if (live) {
      setLiveMatches(live);
      setLoadingLive(false);
    }
    if (upcoming) {
      setUpcomingMatches(upcoming);
      setLoadingUpcoming(false);
    }
    if (results) {
      setRecentResults(results);
      setLoadingResults(false);
    }
    if (news) {
      setNewsItems(news);
      setLoadingNews(false);
    }
  }, []);

  const refreshExploreSections = useCallback(
    async (force: boolean = false) => {
      const shouldFetchLive = force || !getCachedValue<Match[]>('explore:live', LIVE_TTL_MS);
      const shouldFetchUpcoming = force || !getCachedValue<Match[]>('explore:upcoming', UPCOMING_TTL_MS);
      const shouldFetchResults = force || !getCachedValue<Match[]>('explore:results', RESULTS_TTL_MS);
      const shouldFetchNews = force || !getCachedValue<NewsArticle[]>('explore:news', NEWS_TTL_MS);

      const tasks: Promise<void>[] = [];

      if (shouldFetchLive) {
        if (liveMatches.length === 0) setLoadingLive(true);
        tasks.push(
          (async () => {
            const data = await footballAPI.getLiveMatches();
            setLiveMatches(data);
            await setCachedValue('explore:live', data);
            setLoadingLive(false);
          })()
        );
      }

      if (shouldFetchUpcoming) {
        if (upcomingMatches.length === 0) setLoadingUpcoming(true);
        tasks.push(
          (async () => {
            const data = await footballAPI.getUpcomingMatches();
            setUpcomingMatches(data);
            await setCachedValue('explore:upcoming', data);
            setLoadingUpcoming(false);
          })()
        );
      }

      if (shouldFetchResults) {
        if (recentResults.length === 0) setLoadingResults(true);
        tasks.push(
          (async () => {
            const data = await footballAPI.getFinishedFixtures(3);
            const trimmed = data.slice(0, RESULTS_LIMIT);
            setRecentResults(trimmed);
            await setCachedValue('explore:results', trimmed);
            setLoadingResults(false);
          })()
        );
      }

      if (shouldFetchNews) {
        if (newsItems.length === 0) setLoadingNews(true);
        tasks.push(
          (async () => {
            const response = await newsAPI.getSoccerNewsPage(1, NEWS_LIMIT);
            const valid = response.articles.filter(article => article.title && article.url);
            const unique = dedupeNewsByUrl(valid).slice(0, NEWS_LIMIT);
            setNewsItems(unique);
            await setCachedValue('explore:news', unique);
            setLoadingNews(false);
          })()
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
    [dedupeNewsByUrl, liveMatches.length, newsItems.length, recentResults.length, upcomingMatches.length]
  );

  useEffect(() => {
    hydrateExploreCache();
    refreshExploreSections(false);
  }, [hydrateExploreCache, refreshExploreSections]);

  const loadMatchesCache = useCallback(async () => {
    const age = Date.now() - matchesCacheAtRef.current;
    if (matchesCacheRef.current.length > 0 && age < 2 * 60 * 1000) {
      return matchesCacheRef.current;
    }
    if (liveMatches.length || upcomingMatches.length) {
      const combined = [...liveMatches, ...upcomingMatches];
      matchesCacheRef.current = combined;
      matchesCacheAtRef.current = Date.now();
      return combined;
    }
    if (matchesLoadRef.current) {
      return matchesLoadRef.current;
    }

    matchesLoadRef.current = (async () => {
      if (__DEV__) {
        console.time('explore.matchesFetch');
      }
      const [live, upcoming] = await Promise.all([
        footballAPI.getLiveMatches(),
        footballAPI.getUpcomingMatches()
      ]);
      const combined = [...live, ...upcoming];
      matchesCacheRef.current = combined;
      matchesCacheAtRef.current = Date.now();
      if (__DEV__) {
        console.timeEnd('explore.matchesFetch');
      }
      return combined;
    })();

    try {
      return await matchesLoadRef.current;
    } finally {
      matchesLoadRef.current = null;
    }
  }, []);

  async function performSearch(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], news: [] });
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
        c.type === 'league' &&
        (c.name.toLowerCase().includes(lower) ||
          (c.country && c.country.toLowerCase().includes(lower)))
      );
      
      setSearchResults({
        teams,
        leagues: leagueResults,
        matches: [],
        news: []
      });

      loadMatchesCache().then((allMatches) => {
        if (latestSearchRef.current !== query) return;
        const matchResults = allMatches.filter(m =>
          m.home.toLowerCase().includes(lower) ||
          m.away.toLowerCase().includes(lower) ||
          m.league.toLowerCase().includes(lower)
        ).slice(0, 5);
        setSearchResults(prev => ({
          ...prev,
          matches: matchResults
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
      style={styles.leagueCard}
      onPress={() => router.push(`/leagueCommunity/${league.id}` as any)}
    >
      {league.logo ? (
        <Image source={{ uri: league.logo, cache: 'force-cache' }} style={styles.leagueLogo} resizeMode="contain" />
      ) : (
        <View style={styles.leagueLogoPlaceholder}>
          <Ionicons name="trophy" size={24} color="#0066CC" />
        </View>
      )}
      <Text style={styles.leagueName} numberOfLines={2}>{league.name}</Text>
      {league.country && (
        <Text style={styles.leagueCountry}>{league.country}</Text>
      )}
    </TouchableOpacity>
  ), [router]);

  const renderTeamCard = useCallback((team: Community) => (
    <TouchableOpacity
      key={team.id}
      style={styles.teamCard}
      onPress={() => router.push(`/teamCommunity/${team.id}` as any)}
    >
      {team.logo ? (
        <Image source={{ uri: team.logo, cache: 'force-cache' }} style={styles.teamLogo} resizeMode="contain" />
      ) : (
        <View style={styles.teamLogoPlaceholder}>
          <Ionicons name="shield" size={20} color="#0066CC" />
        </View>
      )}
      <View style={styles.teamInfo}>
        <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
        {team.league && (
          <Text style={styles.teamLeague}>{team.league}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CCC" />
    </TouchableOpacity>
  ), [router]);

  const renderMatchResult = useCallback((match: Match) => (
    <TouchableOpacity
      key={match.id}
      style={styles.matchResult}
      onPress={() => router.push(`/chat/${match.id}` as any)}
    >
      <View style={styles.matchResultHeader}>
        <Text style={styles.matchResultLeague}>{match.league}</Text>
        {match.status === 'live' && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={styles.matchResultTeams}>
        <View style={styles.matchResultTeam}>
          {match.homeLogo && (
            <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.matchResultLogo} resizeMode="contain" />
          )}
          <Text style={styles.matchResultTeamName} numberOfLines={1}>{match.home}</Text>
        </View>
        <View style={styles.matchResultScoreContainer}>
          <Text style={styles.matchResultScore}>{match.score || 'VS'}</Text>
        </View>
        <View style={styles.matchResultTeam}>
          {match.awayLogo && (
            <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.matchResultLogo} resizeMode="contain" />
          )}
          <Text style={styles.matchResultTeamName} numberOfLines={1}>{match.away}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const handleLivePress = useCallback((match: Match) => {
    router.push(`/chat/${match.id}` as any);
  }, [router]);

  const handleUpcomingPress = useCallback((match: Match) => {
    router.push(`/matchPreview/${match.id}` as any);
  }, [router]);

  const handleResultPress = useCallback((match: Match) => {
    router.push(`/chat/${match.id}` as any);
  }, [router]);

  const renderLiveCard = useCallback(
    ({ item }: { item: Match }) => (
      <CompactMatchCard match={item} variant="live" onPress={handleLivePress} />
    ),
    [handleLivePress]
  );

  const renderUpcomingCard = useCallback(
    ({ item }: { item: Match }) => (
      <CompactMatchCard match={item} variant="upcoming" onPress={handleUpcomingPress} />
    ),
    [handleUpcomingPress]
  );

  const renderResultCard = useCallback(
    ({ item }: { item: Match }) => (
      <CompactMatchCard match={item} variant="results" onPress={handleResultPress} />
    ),
    [handleResultPress]
  );

  const renderNewsCard = useCallback(
    ({ item }: { item: NewsArticle }) => (
      <CompactNewsCard article={item} onPress={openArticle} onPressIn={prefetchArticle} />
    ),
    [openArticle, prefetchArticle]
  );

  const renderNewsResult = useCallback((article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={styles.newsResult}
      onPress={() => openArticle(article)}
      onPressIn={() => prefetchArticle(article)}
    >
      {article.imageUrl && (
        <Image source={{ uri: article.imageUrl, cache: 'force-cache' }} style={styles.newsResultImage} resizeMode="cover" />
      )}
      <View style={styles.newsResultContent}>
        <Text style={styles.newsResultTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.newsResultMeta}>{article.source}</Text>
      </View>
    </TouchableOpacity>
  ), [openArticle, prefetchArticle]);

  const showSkeleton = loading && leagues.length === 0 && popularTeams.length === 0;
  
  useEffect(() => {
    if (!firstRenderLoggedRef.current && !loading) {
      firstRenderLoggedRef.current = true;
      if (__DEV__) {
        const delta = Date.now() - mountTimeRef.current;
        console.log(`Explore first render: ${delta}ms`);
      }
    }
  }, [loading]);

  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.profileButton}>
          <Ionicons name="person" size={20} color="#0066CC" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teams, leagues, matches..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {searching ? (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="small" color="#0066CC" />
            <Text style={styles.searchingText}>Searching...</Text>
          </View>
        ) : searchQuery.trim().length >= 2 ? (
          // Search Results
          <View style={styles.searchResults}>
            {/* Teams Results */}
            {!newsOnlyMode && searchResults.teams.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Teams ({searchResults.teams.length})</Text>
                {searchResults.teams.map(renderTeamCard)}
              </View>
            )}

            {/* Leagues Results */}
            {!newsOnlyMode && searchResults.leagues.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Leagues ({searchResults.leagues.length})</Text>
                {searchResults.leagues.map(league => renderTeamCard(league))}
              </View>
            )}

            {/* Matches Results */}
            {!newsOnlyMode && searchResults.matches.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Matches ({searchResults.matches.length})</Text>
                {searchResults.matches.map(renderMatchResult)}
              </View>
            )}

            {/* News Results */}
            {searchResults.news.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>News ({searchResults.news.length})</Text>
                {searchResults.news.map(renderNewsResult)}
                {newsRateLimited && (
                  <Text style={styles.rateLimitText}>News is temporarily rate-limited. Try again shortly.</Text>
                )}
                {newsLoadingMore && (
                  <View style={styles.loadMoreRow}>
                    <ActivityIndicator size="small" color="#0066CC" />
                    <Text style={styles.loadMoreText}>Loading more news...</Text>
                  </View>
                )}
                {!newsLoadingMore && newsHasMore && !newsRateLimited && (
                  <TouchableOpacity
                    style={styles.loadMoreButton}
                    onPress={() => loadNewsPage(searchQuery, newsPage + 1, true)}
                  >
                    <Text style={styles.loadMoreButtonText}>Load more news</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {newsRateLimited && searchResults.news.length === 0 && (
              <Text style={styles.rateLimitText}>News is temporarily rate-limited. Try again shortly.</Text>
            )}

            {/* No Results */}
            {searchResults.teams.length === 0 &&
              searchResults.leagues.length === 0 &&
              searchResults.matches.length === 0 &&
              searchResults.news.length === 0 && (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={64} color="#E5E5E5" />
                  <Text style={styles.noResultsText}>No results found</Text>
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
                  style={styles.quickActionButton}
                  onPress={() => router.push('/live' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B30' }]}>
                    <Ionicons name="radio" size={24} color="#FFF" />
                  </View>
                  <Text style={styles.quickActionText}>Live Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => router.push('/upcoming' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#0066CC' }]}>
                    <Ionicons name="calendar" size={24} color="#FFF" />
                  </View>
                  <Text style={styles.quickActionText}>Upcoming</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => router.push('/news' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#34C759' }]}>
                    <Ionicons name="newspaper" size={24} color="#FFF" />
                  </View>
                  <Text style={styles.quickActionText}>News</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!newsOnlyMode && (
              <>
                {/* Live Now */}
                {(loadingLive || liveMatches.length > 0) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Live Now</Text>
                      <TouchableOpacity onPress={() => router.push('/live' as any)}>
                        <Text style={styles.seeAllText}>See All</Text>
                      </TouchableOpacity>
                    </View>
                    {loadingLive && liveMatches.length === 0 ? (
                      <View style={styles.inlineLoader}>
                        <ActivityIndicator size="small" color="#0066CC" />
                        <Text style={styles.inlineLoaderText}>Loading live matches...</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={liveMatches}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderLiveCard}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalList}
                        initialNumToRender={4}
                        maxToRenderPerBatch={6}
                        windowSize={3}
                        removeClippedSubviews
                      />
                    )}
                  </View>
                )}

                {/* Upcoming */}
                {(loadingUpcoming || upcomingMatches.length > 0) && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Upcoming</Text>
                      <TouchableOpacity onPress={() => router.push('/upcoming' as any)}>
                        <Text style={styles.seeAllText}>See All</Text>
                      </TouchableOpacity>
                    </View>
                    {loadingUpcoming && upcomingMatches.length === 0 ? (
                      <View style={styles.inlineLoader}>
                        <ActivityIndicator size="small" color="#0066CC" />
                        <Text style={styles.inlineLoaderText}>Loading upcoming matches...</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={upcomingMatches.slice(0, 8)}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderUpcomingCard}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalList}
                        initialNumToRender={4}
                        maxToRenderPerBatch={6}
                        windowSize={3}
                        removeClippedSubviews
                      />
                    )}
                  </View>
                )}

                {/* Results */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Results</Text>
                    <TouchableOpacity onPress={() => router.push('/results' as any)}>
                      <Text style={styles.seeAllText}>See All</Text>
                    </TouchableOpacity>
                  </View>
                  {loadingResults && recentResults.length === 0 ? (
                    <View style={styles.inlineLoader}>
                      <ActivityIndicator size="small" color="#0066CC" />
                      <Text style={styles.inlineLoaderText}>Loading results...</Text>
                    </View>
                  ) : recentResults.length === 0 ? (
                    <Text style={styles.emptySectionText}>No recent results</Text>
                  ) : (
                    <FlatList
                      data={recentResults}
                      keyExtractor={(item) => item.id.toString()}
                      renderItem={renderResultCard}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalList}
                      initialNumToRender={4}
                      maxToRenderPerBatch={6}
                      windowSize={3}
                      removeClippedSubviews
                    />
                  )}
                </View>
              </>
            )}

            {/* News */}
            {(loadingNews || newsItems.length > 0) && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Latest News</Text>
                  <TouchableOpacity onPress={() => router.push('/news' as any)}>
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
                {loadingNews && newsItems.length === 0 ? (
                  <View style={styles.inlineLoader}>
                    <ActivityIndicator size="small" color="#0066CC" />
                    <Text style={styles.inlineLoaderText}>Loading news...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={newsItems}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderNewsCard}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                    initialNumToRender={4}
                    maxToRenderPerBatch={6}
                    windowSize={3}
                    removeClippedSubviews
                  />
                )}
              </View>
            )}

            {/* Browse Leagues - FILTERED */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Browse Leagues</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/communities?filter=leagues' as any)}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.leaguesScroll}
              >
                {leagues.slice(0, 8).map(renderLeagueCard)}
              </ScrollView>
            </View>

            {/* Popular Teams */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Popular Teams</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/communities?filter=teams' as any)}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              {popularTeams.map(renderTeamCard)}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
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
    width: 120,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  leagueLogo: {
    width: 48,
    height: 48,
    marginBottom: 12,
  },
  leagueLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  leagueName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    minHeight: 32,
  },
  leagueCountry: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  
  // Teams
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  teamLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  teamLeague: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  
  // Search Results
  searchResults: {
    paddingTop: 8,
  },
  resultSection: {
    marginBottom: 24,
  },
  resultSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
    paddingHorizontal: 20,
    marginBottom: 12,
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
  
  // Match Results
  matchResult: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 8,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  matchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchResultLeague: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 4,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
  },
  matchResultTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchResultTeam: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  matchResultLogo: {
    width: 28,
    height: 28,
  },
  matchResultTeamName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  matchResultScoreContainer: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchResultScore: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1,
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
  emptySectionText: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 20,
  },
  compactMatchCard: {
    width: 220,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  compactMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  compactLeague: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    flex: 1,
    marginRight: 8,
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
  },
  compactTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  compactScoreBlock: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  compactScore: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  compactTime: {
    fontSize: 11,
    color: '#666',
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
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 8,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  newsResultImage: {
    width: 100,
    height: 100,
  },
  newsResultContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  newsResultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
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
