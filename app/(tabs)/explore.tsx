// app/(tabs)/explore.tsx
// IMPROVED: League browsing, team directory, better search

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

export default function ExploreScreen() {
  const router = useRouter();
  const { mode, q, type, initialTab } = useLocalSearchParams();
  
  const tabParam = Array.isArray(initialTab) ? initialTab[0] : initialTab;
  const newsOnlyMode = (Array.isArray(mode) ? mode[0] : mode) === 'news' || (Array.isArray(type) ? type[0] : type) === 'news' || tabParam === 'news';
  const initialQuery = Array.isArray(q) ? q[0] : q;
  
  const deriveExploreData = useCallback((allCommunities: Community[]) => {
    // Get leagues
    const leagueList = allCommunities.filter(c => c.type === 'league');

    // Get popular teams (from major leagues)
    const popularLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1'];
    const popularTeamsList = allCommunities.filter(c => 
      c.type === 'team' && c.league && popularLeagues.includes(c.league)
    ).slice(0, 12);

    return { leagueList, popularTeamsList };
  }, []);

  const cached = useMemo(() => communityService.getCachedAllCommunities(), []);
  const cachedAll = cached?.data ?? [];
  const cachedExploreData = useMemo(() => deriveExploreData(cachedAll), [cachedAll, deriveExploreData]);

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
  
  const [leagues, setLeagues] = useState<Community[]>(cachedExploreData.leagueList);
  const [popularTeams, setPopularTeams] = useState<Community[]>(cachedExploreData.popularTeamsList);
  const [loading, setLoading] = useState(cachedAll.length === 0);

  useEffect(() => {
    loadExplorePage();
  }, []);

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

  const loadExplorePage = async () => {
    try {
      const cachedSnapshot = communityService.getCachedAllCommunities();
      if (cachedSnapshot?.data.length) {
        const { leagueList, popularTeamsList } = deriveExploreData(cachedSnapshot.data);
        setLeagues(leagueList);
        setPopularTeams(popularTeamsList);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const fresh = await communityService.refreshCommunitiesIfStale();
      const allCommunities = fresh ? [...fresh.teams, ...fresh.leagues] : await communityService.getAllCommunities();
      const { leagueList, popularTeamsList } = deriveExploreData(allCommunities);
      setLeagues(leagueList);
      setPopularTeams(popularTeamsList);
    } catch (error) {
      console.error('Error loading explore page:', error);
    } finally {
      setLoading(false);
    }
  };

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
      if (append) {
        setNewsLoadingMore(false);
      }
    }
  }, [dedupeNewsByUrl, newsHasMore, newsLoadingMore]);

  async function performSearch(query: string, signal?: AbortSignal) {
    if (query.trim().length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], news: [] });
      setNewsPage(1);
      setNewsHasMore(true);
      return;
    }
    try {
      // Search teams and leagues
      const communities = await communityService.searchCommunities(query);
      const teams = communities.filter(c => c.type === 'team');
      const leagueResults = communities.filter(c => c.type === 'league');
      
      // Search matches
      const liveMatches = await footballAPI.getLiveMatches();
      const upcomingMatches = await footballAPI.getUpcomingMatches();
      const allMatches = [...liveMatches, ...upcomingMatches];
      const matchResults = allMatches.filter(m =>
        m.home.toLowerCase().includes(query.toLowerCase()) ||
        m.away.toLowerCase().includes(query.toLowerCase()) ||
        m.league.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      
      setSearchResults({
        teams,
        leagues: leagueResults,
        matches: matchResults,
        news: []
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
        <Image source={{ uri: league.logo }} style={styles.leagueLogo} resizeMode="contain" />
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
        <Image source={{ uri: team.logo }} style={styles.teamLogo} resizeMode="contain" />
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
            <Image source={{ uri: match.homeLogo }} style={styles.matchResultLogo} resizeMode="contain" />
          )}
          <Text style={styles.matchResultTeamName} numberOfLines={1}>{match.home}</Text>
        </View>
        <View style={styles.matchResultScoreContainer}>
          <Text style={styles.matchResultScore}>{match.score || 'VS'}</Text>
        </View>
        <View style={styles.matchResultTeam}>
          {match.awayLogo && (
            <Image source={{ uri: match.awayLogo }} style={styles.matchResultLogo} resizeMode="contain" />
          )}
          <Text style={styles.matchResultTeamName} numberOfLines={1}>{match.away}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderNewsResult = useCallback((article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={styles.newsResult}
      onPress={() => router.push({ pathname: '/news/reader', params: { url: article.url, title: article.title, source: article.source, author: article.author || '', publishedAt: article.publishedAt, imageUrl: article.imageUrl || '' } } as any)}
    >
      {article.imageUrl && (
        <Image source={{ uri: article.imageUrl }} style={styles.newsResultImage} resizeMode="cover" />
      )}
      <View style={styles.newsResultContent}>
        <Text style={styles.newsResultTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.newsResultMeta}>{article.source}</Text>
      </View>
    </TouchableOpacity>
  ), [router]);

  const showSkeleton = loading && leagues.length === 0 && popularTeams.length === 0;

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

            {/* Browse Leagues */}
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


