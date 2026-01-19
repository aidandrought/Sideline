// app/leagueCommunity/[id].tsx
// League Community Detail Screen - News, Full Table, Recent Results, Upcoming

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { communityService } from '../../services/communityService';
import { FinishedMatch, footballAPI, LeagueStanding, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';

export default function LeagueCommunityScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { userProfile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [leagueLogo, setLeagueLogo] = useState('');
  const [country, setCountry] = useState('');
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [recentMatches, setRecentMatches] = useState<FinishedMatch[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [leagueTable, setLeagueTable] = useState<LeagueStanding[]>([]);

  useEffect(() => {
    loadLeagueData();
  }, [id]);

  const loadLeagueData = async () => {
    try {
      setLoading(true);
      const leagueId = parseInt(id as string);
      
      // Get league info from communities
      const community = await communityService.getCommunityById(leagueId, 'league');
      if (community) {
        setLeagueName(community.name);
        setLeagueLogo(community.logo);
        setCountry(community.country || '');
      }
      
      // Check if following
      if (userProfile) {
        const following = await communityService.isFollowing(userProfile.uid, leagueId);
        setIsFollowing(following);
      }
      
      // Load all data in parallel
      const [newsData, recentData, upcomingData, standingsData] = await Promise.all([
        newsAPI.searchNews(community?.name || ''),
        footballAPI.getLeagueRecentMatches(leagueId, 6),
        footballAPI.getLeagueUpcomingMatches(leagueId, 10),
        footballAPI.getLeagueStandings(leagueId)
      ]);
      
      setNews(newsData.slice(0, 5));
      setRecentMatches(recentData.slice(0, 10));
      setUpcomingMatches(upcomingData);
      setLeagueTable(standingsData);
      
    } catch (error) {
      console.error('Error loading league data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeagueData();
    setRefreshing(false);
  };

  const handleFollow = async () => {
    if (!userProfile) return;
    
    try {
      const leagueId = parseInt(id as string);
      await communityService.toggleFollow(userProfile.uid, leagueId, 'league');
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getFormColor = (form: string, index: number) => {
    const result = form[index];
    if (result === 'W') return '#34C759';
    if (result === 'D') return '#FF9500';
    if (result === 'L') return '#FF3B30';
    return '#E5E5E5';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {leagueLogo ? (
            <Image source={{ uri: leagueLogo }} style={styles.headerLogo} resizeMode="contain" />
          ) : (
            <Ionicons name="trophy" size={32} color="#0066CC" />
          )}
          <View>
            <Text style={styles.headerTitle}>{leagueName}</Text>
            {country && <Text style={styles.headerCountry}>{country}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={handleFollow} style={styles.followButton}>
          <Ionicons 
            name={isFollowing ? "checkmark" : "add"} 
            size={20} 
            color={isFollowing ? "#0066CC" : "#FFF"} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* League Table */}
        {leagueTable.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Standings</Text>
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderRank}>#</Text>
                <Text style={styles.tableHeaderTeam}>Team</Text>
                <Text style={styles.tableHeaderStat}>P</Text>
                <Text style={styles.tableHeaderStat}>GD</Text>
                <Text style={styles.tableHeaderPoints}>Pts</Text>
              </View>
              {leagueTable.map((team, index) => (
                <View 
                  key={team.team.id}
                  style={[
                    styles.tableRow,
                    index < 4 && styles.tableRowChampions,
                    index >= 4 && index < 6 && styles.tableRowEuropa,
                    index >= leagueTable.length - 3 && styles.tableRowRelegation
                  ]}
                >
                  <Text style={styles.tableRank}>{team.rank}</Text>
                  <View style={styles.tableTeam}>
                    {team.team.logo && (
                      <Image source={{ uri: team.team.logo }} style={styles.tableLogo} resizeMode="contain" />
                    )}
                    <Text style={styles.tableTeamName} numberOfLines={1}>{team.team.name}</Text>
                  </View>
                  <Text style={styles.tableStat}>{team.played}</Text>
                  <Text style={styles.tableStat}>{team.goalsDiff > 0 ? '+' : ''}{team.goalsDiff}</Text>
                  <Text style={styles.tablePoints}>{team.points}</Text>
                </View>
              ))}
            </View>
            
            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
                <Text style={styles.legendText}>Champions League</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF9500' }]} />
                <Text style={styles.legendText}>Europa League</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
                <Text style={styles.legendText}>Relegation</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Matches */}
        {recentMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Matches</Text>
            {recentMatches.map(match => (
              <View key={match.id} style={styles.matchCard}>
                <Text style={styles.matchDate}>{formatDate(match.date)}</Text>
                <View style={styles.matchTeams}>
                  <View style={styles.matchTeam}>
                    {match.homeLogo && (
                      <Image source={{ uri: match.homeLogo }} style={styles.matchLogo} resizeMode="contain" />
                    )}
                    <Text style={styles.matchName}>{match.home}</Text>
                  </View>
                  <Text style={styles.matchScore}>{match.score}</Text>
                  <View style={styles.matchTeam}>
                    {match.awayLogo && (
                      <Image source={{ uri: match.awayLogo }} style={styles.matchLogo} resizeMode="contain" />
                    )}
                    <Text style={styles.matchName}>{match.away}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Matches</Text>
            {upcomingMatches.map(match => (
              <View key={match.id} style={styles.upcomingCard}>
                <Text style={styles.upcomingDate}>
                  {new Date(match.date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </Text>
                <View style={styles.upcomingTeams}>
                  <View style={styles.upcomingTeam}>
                    {match.homeLogo && (
                      <Image source={{ uri: match.homeLogo }} style={styles.upcomingLogo} resizeMode="contain" />
                    )}
                    <Text style={styles.upcomingName}>{match.home}</Text>
                  </View>
                  <Text style={styles.upcomingVs}>vs</Text>
                  <View style={styles.upcomingTeam}>
                    {match.awayLogo && (
                      <Image source={{ uri: match.awayLogo }} style={styles.upcomingLogo} resizeMode="contain" />
                    )}
                    <Text style={styles.upcomingName}>{match.away}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* League News */}
        {news.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest News</Text>
            {news.map(article => (
              <TouchableOpacity 
                key={article.id} 
                style={styles.newsCard}
                onPress={() => router.push(`/article/${article.id}` as any)}
              >
                {article.imageUrl && (
                  <Image source={{ uri: article.imageUrl }} style={styles.newsImage} resizeMode="cover" />
                )}
                <View style={styles.newsContent}>
                  <Text style={styles.newsTitle} numberOfLines={2}>{article.title}</Text>
                  <Text style={styles.newsDescription} numberOfLines={2}>{article.description}</Text>
                  <View style={styles.newsMeta}>
                    <Text style={styles.newsSource}>{article.source}</Text>
                    <Text style={styles.newsDot}>•</Text>
                    <Text style={styles.newsDate}>{formatDate(article.publishedAt)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFF',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  headerCountry: {
    fontSize: 14,
    color: '#666',
  },
  followButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  
  // League Table
  tableCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#F0F0F0',
    marginBottom: 8,
  },
  tableHeaderRank: {
    width: 30,
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
  },
  tableHeaderTeam: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
  },
  tableHeaderStat: {
    width: 35,
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textAlign: 'center',
  },
  tableHeaderPoints: {
    width: 40,
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingLeft: 8,
    marginLeft: -8,
  },
  tableRowChampions: {
    borderLeftColor: '#34C759',
  },
  tableRowEuropa: {
    borderLeftColor: '#FF9500',
  },
  tableRowRelegation: {
    borderLeftColor: '#FF3B30',
  },
  tableRank: {
    width: 30,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tableTeam: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  tableTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  tableStat: {
    width: 35,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  tablePoints: {
    width: 40,
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    textAlign: 'right',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
  
  // Recent Matches
  matchCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  matchDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  matchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeam: {
    flex: 1,
    alignItems: 'center',
  },
  matchLogo: {
    width: 28,
    height: 28,
    marginBottom: 6,
  },
  matchName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  matchScore: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginHorizontal: 16,
  },
  
  // Upcoming Matches
  upcomingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  upcomingDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  upcomingTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingTeam: {
    flex: 1,
    alignItems: 'center',
  },
  upcomingLogo: {
    width: 28,
    height: 28,
    marginBottom: 6,
  },
  upcomingName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  upcomingVs: {
    fontSize: 12,
    color: '#999',
    marginHorizontal: 12,
  },
  
  // News
  newsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  newsImage: {
    width: '100%',
    height: 180,
  },
  newsContent: {
    padding: 16,
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  newsDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  newsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newsSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  newsDot: {
    fontSize: 12,
    color: '#CCC',
    marginHorizontal: 6,
  },
  newsDate: {
    fontSize: 12,
    color: '#999',
  },
});