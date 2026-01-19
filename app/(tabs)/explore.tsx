// app/(tabs)/explore.tsx
// IMPROVED: League browsing, team directory, better search

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { Community, communityService } from '../../services/communityService';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';

export default function ExploreScreen() {
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    teams: Community[];
    leagues: Community[];
    matches: Match[];
    news: NewsArticle[];
  }>({ teams: [], leagues: [], matches: [], news: [] });
  
  const [leagues, setLeagues] = useState<Community[]>([]);
  const [popularTeams, setPopularTeams] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExplorePage();
  }, []);

  const loadExplorePage = async () => {
    try {
      setLoading(true);
      const allCommunities = await communityService.getAllCommunities();
      
      // Get leagues
      const leagueList = allCommunities.filter(c => c.type === 'league');
      setLeagues(leagueList);
      
      // Get popular teams (from major leagues)
      const popularLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1'];
      const popularTeamsList = allCommunities.filter(c => 
        c.type === 'team' && c.league && popularLeagues.includes(c.league)
      ).slice(0, 12);
      setPopularTeams(popularTeamsList);
      
    } catch (error) {
      console.error('Error loading explore page:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults({ teams: [], leagues: [], matches: [], news: [] });
      return;
    }
    
    setSearching(true);
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
      
      // Search news
      const newsResults = await newsAPI.searchNews(query);
      
      setSearchResults({
        teams,
        leagues: leagueResults,
        matches: matchResults,
        news: newsResults.slice(0, 5)
      });
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setSearching(false);
    }
  };

  const renderLeagueCard = (league: Community) => (
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
  );

  const renderTeamCard = (team: Community) => (
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
  );

  const renderMatchResult = (match: Match) => (
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
          <Text style={styles.matchResultTeamName}>{match.home}</Text>
        </View>
        <Text style={styles.matchResultScore}>{match.score || 'vs'}</Text>
        <View style={styles.matchResultTeam}>
          {match.awayLogo && (
            <Image source={{ uri: match.awayLogo }} style={styles.matchResultLogo} resizeMode="contain" />
          )}
          <Text style={styles.matchResultTeamName}>{match.away}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderNewsResult = (article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={styles.newsResult}
      onPress={() => router.push(`/newsDetail/${article.id}` as any)}
    >
      {article.imageUrl && (
        <Image source={{ uri: article.imageUrl }} style={styles.newsResultImage} resizeMode="cover" />
      )}
      <View style={styles.newsResultContent}>
        <Text style={styles.newsResultTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.newsResultMeta}>{article.source}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teams, leagues, matches..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
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
            {searchResults.teams.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Teams ({searchResults.teams.length})</Text>
                {searchResults.teams.map(renderTeamCard)}
              </View>
            )}

            {/* Leagues Results */}
            {searchResults.leagues.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Leagues ({searchResults.leagues.length})</Text>
                {searchResults.leagues.map(league => renderTeamCard(league))}
              </View>
            )}

            {/* Matches Results */}
            {searchResults.matches.length > 0 && (
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
              </View>
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
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 16,
    backgroundColor: '#FFF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  
  // Match Results
  matchResult: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchResultLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  matchResultTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  matchResultScore: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    marginHorizontal: 12,
  },
  
  // News Results
  newsResult: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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