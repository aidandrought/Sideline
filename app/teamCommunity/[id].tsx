// app/teamCommunity/[id].tsx
// Team Community Detail Screen - News, Last Match, Table Position, Upcoming

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

export default function TeamCommunityScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { userProfile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamLogo, setTeamLogo] = useState('');
  const [leagueId, setLeagueId] = useState<number | null>(null);
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [lastMatch, setLastMatch] = useState<FinishedMatch | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [tablePosition, setTablePosition] = useState<LeagueStanding | null>(null);
  const [leagueTable, setLeagueTable] = useState<LeagueStanding[]>([]);

  useEffect(() => {
    loadTeamData();
  }, [id]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      const teamId = parseInt(id as string);
      
      // Get team info from communities
      const community = await communityService.getCommunityById(teamId, 'team');
      if (community) {
        setTeamName(community.name);
        setTeamLogo(community.logo);
        if (community.league) {
          // Find league ID from league name
          const allComms = await communityService.getAllCommunities();
          const league = allComms.find(c => c.type === 'league' && c.name === community.league);
          if (league) setLeagueId(league.id);
        }
      }
      
      // Check if following
      if (userProfile) {
        const following = await communityService.isFollowing(userProfile.uid, teamId);
        setIsFollowing(following);
      }
      
      // Load all data in parallel
      const [newsData, lastMatchData, upcomingData] = await Promise.all([
        newsAPI.getNewsByTeam(community?.name || ''),
        footballAPI.getTeamLastMatch(teamId),
        footballAPI.getTeamUpcomingMatches(teamId, 5)
      ]);
      
      setNews(newsData.slice(0, 5));
      setLastMatch(lastMatchData);
      setUpcomingMatches(upcomingData);
      
      // Load league table if we have a league ID
      if (community?.league) {
        const allComms = await communityService.getAllCommunities();
        const league = allComms.find(c => c.type === 'league' && c.name === community.league);
        if (league) {
          const standings = await footballAPI.getLeagueStandings(league.id);
          setLeagueTable(standings);
          
          // Find this team's position
          const position = standings.find(s => s.team.id === teamId);
          setTablePosition(position || null);
        }
      }
      
    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeamData();
    setRefreshing(false);
  };

  const handleFollow = async () => {
    if (!userProfile) return;
    
    try {
      const teamId = parseInt(id as string);
      await communityService.toggleFollow(userProfile.uid, teamId, 'team');
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
          {teamLogo ? (
            <Image source={{ uri: teamLogo }} style={styles.headerLogo} resizeMode="contain" />
          ) : (
            <Ionicons name="shield" size={32} color="#0066CC" />
          )}
          <Text style={styles.headerTitle}>{teamName}</Text>
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
        {/* Last Match */}
        {lastMatch && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Match</Text>
            <View style={styles.matchCard}>
              <View style={styles.matchHeader}>
                <Text style={styles.matchLeague}>{lastMatch.league}</Text>
                <Text style={styles.matchDate}>{formatDate(lastMatch.date)}</Text>
              </View>
              <View style={styles.matchTeams}>
                <View style={styles.matchTeam}>
                  {lastMatch.homeLogo && (
                    <Image source={{ uri: lastMatch.homeLogo }} style={styles.matchTeamLogo} resizeMode="contain" />
                  )}
                  <Text style={styles.matchTeamName}>{lastMatch.home}</Text>
                </View>
                <Text style={styles.matchScore}>{lastMatch.score}</Text>
                <View style={styles.matchTeam}>
                  {lastMatch.awayLogo && (
                    <Image source={{ uri: lastMatch.awayLogo }} style={styles.matchTeamLogo} resizeMode="contain" />
                  )}
                  <Text style={styles.matchTeamName}>{lastMatch.away}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* League Table Position */}
        {tablePosition && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>League Position</Text>
            <View style={styles.positionCard}>
              <View style={styles.positionHeader}>
                <Text style={styles.positionRank}>#{tablePosition.rank}</Text>
                <View style={styles.positionStats}>
                  <Text style={styles.positionPoints}>{tablePosition.points} pts</Text>
                  <Text style={styles.positionForm}>Form: {tablePosition.form}</Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>P</Text>
                  <Text style={styles.statValue}>{tablePosition.played}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>W</Text>
                  <Text style={styles.statValue}>{tablePosition.win}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>D</Text>
                  <Text style={styles.statValue}>{tablePosition.draw}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>L</Text>
                  <Text style={styles.statValue}>{tablePosition.lose}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>GD</Text>
                  <Text style={styles.statValue}>{tablePosition.goalsDiff > 0 ? '+' : ''}{tablePosition.goalsDiff}</Text>
                </View>
              </View>
            </View>
            
            {/* Show top 5 of table */}
            {leagueTable.length > 0 && (
              <View style={styles.miniTable}>
                <Text style={styles.miniTableTitle}>Top 5</Text>
                {leagueTable.slice(0, 5).map(team => (
                  <View 
                    key={team.team.id} 
                    style={[
                      styles.miniTableRow,
                      team.team.id === parseInt(id as string) && styles.miniTableRowHighlight
                    ]}
                  >
                    <Text style={styles.miniTableRank}>{team.rank}</Text>
                    {team.team.logo && (
                      <Image source={{ uri: team.team.logo }} style={styles.miniTableLogo} resizeMode="contain" />
                    )}
                    <Text style={[
                      styles.miniTableTeam,
                      team.team.id === parseInt(id as string) && styles.miniTableTeamHighlight
                    ]} numberOfLines={1}>
                      {team.team.name}
                    </Text>
                    <Text style={styles.miniTablePoints}>{team.points}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Matches</Text>
            {upcomingMatches.map(match => (
              <View key={match.id} style={styles.upcomingCard}>
                <View style={styles.upcomingHeader}>
                  <Text style={styles.upcomingLeague}>{match.league}</Text>
                  <Text style={styles.upcomingDate}>
                    {new Date(match.date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
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

        {/* Team News */}
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
  
  // Last Match
  matchCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  matchLeague: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  matchDate: {
    fontSize: 14,
    color: '#666',
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
  matchTeamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  matchScore: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginHorizontal: 20,
  },
  
  // League Position
  positionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  positionRank: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0066CC',
    marginRight: 16,
  },
  positionStats: {
    flex: 1,
  },
  positionPoints: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  positionForm: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  miniTable: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  miniTableTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 12,
  },
  miniTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  miniTableRowHighlight: {
    backgroundColor: '#E8F1FF',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  miniTableRank: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 30,
  },
  miniTableLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  miniTableTeam: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  miniTableTeamHighlight: {
    fontWeight: '700',
  },
  miniTablePoints: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    width: 40,
    textAlign: 'right',
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
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingLeague: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  upcomingDate: {
    fontSize: 12,
    color: '#666',
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
    width: 32,
    height: 32,
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