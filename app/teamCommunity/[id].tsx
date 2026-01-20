// app/teamCommunity/[id].tsx
// Team Community Screen with League Position

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
import { shadow } from '../../components/styleUtils';
import { useAuth } from '../../context/AuthContext';
import { footballAPI, LeagueStanding, Match } from '../../services/footballApi';
import { communityService } from '../../services/communityService';

export default function TeamCommunityScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const teamId = Number(id);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [lastMatch, setLastMatch] = useState<any>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [leaguePositions, setLeaguePositions] = useState<Array<{
    leagueName: string;
    leagueId: number;
    position: LeagueStanding;
    topFour: LeagueStanding[];
  }>>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    loadTeamData();
  }, [teamId]);

  useEffect(() => {
    if (userProfile?.uid) {
      checkFollowStatus();
    }
  }, [userProfile, teamId]);

  const loadTeamData = async () => {
    try {
      setLoading(true);

      // Get team info from communities
      const team = await communityService.getCommunityById(teamId, 'team');
      setTeamInfo(team);

      // Get last match
      const lastMatchData = await footballAPI.getTeamLastMatch(teamId);
      setLastMatch(lastMatchData);

      // Get upcoming matches
      const upcoming = await footballAPI.getTeamUpcomingMatches(teamId, 10);
      setUpcomingMatches(upcoming);

      // Extract all unique league IDs from upcoming matches
      const leagueIds = new Set<number>();
      upcoming.forEach(match => {
        // We need to get the leagueId from the match
        // For now, we'll use the known league mappings
        const leagueId = getLeagueIdFromName(match.league);
        if (leagueId) leagueIds.add(leagueId);
      });

      // Also add the team's primary league
      if (team?.league) {
        const primaryLeagueId = await getLeagueIdForTeam(team);
        if (primaryLeagueId) leagueIds.add(primaryLeagueId);
      }

      // Fetch standings for each league
      const positionsData: Array<{
        leagueName: string;
        leagueId: number;
        position: LeagueStanding;
        topFour: LeagueStanding[];
      }> = [];

      for (const leagueId of Array.from(leagueIds)) {
        try {
          const standings = await footballAPI.getLeagueStandingsByCurrentSeason(leagueId);
          
          // Find this team in the standings
          for (const group of standings.groups) {
            const teamStanding = group.standings.find(s => s.team.id === teamId);
            if (teamStanding) {
              // Get top 4 teams
              const topFour = group.standings.slice(0, 4);
              
              positionsData.push({
                leagueName: group.name,
                leagueId: leagueId,
                position: teamStanding,
                topFour: topFour
              });
              break;
            }
          }
        } catch (error) {
          console.error(`Error fetching standings for league ${leagueId}:`, error);
        }
      }

      setLeaguePositions(positionsData);
      console.log(`✅ Found team in ${positionsData.length} leagues:`, positionsData.map(p => p.leagueName));

    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get league ID from league name
  const getLeagueIdFromName = (leagueName: string): number | null => {
    const leagueMap: { [key: string]: number } = {
      'Premier League': 39,
      'La Liga': 140,
      'Serie A': 135,
      'Bundesliga': 78,
      'Ligue 1': 61,
      'UEFA Champions League': 2,
      'Champions League': 2,
      'UEFA Europa League': 3,
      'Europa League': 3,
      'FA Cup': 45,
      'Copa del Rey': 143,
      'Coppa Italia': 137,
      'DFB-Pokal': 81,
      'Coupe de France': 66,
    };
    
    return leagueMap[leagueName] || null;
  };

  // Helper to get league ID - you'll need to implement this based on your data structure
  const getLeagueIdForTeam = async (team: any): Promise<number | null> => {
    // Map league names to IDs - you may want to store this mapping or get it from API
    const leagueMap: { [key: string]: number } = {
      'Premier League': 39,
      'La Liga': 140,
      'Serie A': 135,
      'Bundesliga': 78,
      'Ligue 1': 61,
      'Champions League': 2,
      'UEFA Champions League': 2,
    };
    
    return leagueMap[team.league] || null;
  };

  const checkFollowStatus = async () => {
    if (!userProfile?.uid) return;
    const following = await communityService.isFollowing(userProfile.uid, teamId);
    setIsFollowing(following);
  };

  const toggleFollow = async () => {
    if (!userProfile?.uid || !teamInfo) return;
    
    await communityService.toggleFollow(userProfile.uid, teamId, 'team');
    setIsFollowing(!isFollowing);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeamData();
    setRefreshing(false);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatUpcomingDate = (dateString: string): string => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `${dayName} ${time}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
        </View>
      </View>
    );
  }

  if (!teamInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Team not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.headerTeam}>
          {teamInfo.logo ? (
            <Image 
              source={{ uri: teamInfo.logo }} 
              style={styles.headerLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.headerLogoPlaceholder}>
              <Ionicons name="shield" size={20} color="#0066CC" />
            </View>
          )}
          <Text style={styles.headerTitle}>{teamInfo.name}</Text>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/profile' as any)} 
          style={styles.profileButton}
        >
          <Ionicons name="person" size={20} color="#0066CC" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Team Info Card */}
        <View style={styles.teamCard}>
          <View style={styles.teamCardHeader}>
            {teamInfo.logo && (
              <Image 
                source={{ uri: teamInfo.logo }} 
                style={styles.teamLogo}
                resizeMode="contain"
              />
            )}
            <View style={styles.teamDetails}>
              <Text style={styles.teamName}>{teamInfo.name}</Text>
              {teamInfo.league && (
                <Text style={styles.teamLeague}>{teamInfo.league}</Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={toggleFollow}
          >
            <Ionicons 
              name={isFollowing ? 'checkmark' : 'add'} 
              size={18} 
              color={isFollowing ? '#0066CC' : '#FFF'} 
            />
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* League Positions - Multiple Mini Tables */}
        {leaguePositions.map((leagueData, index) => (
          <View key={leagueData.leagueId} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{leagueData.leagueName}</Text>
              <TouchableOpacity onPress={() => router.push(`/leagueCommunity/${leagueData.leagueId}` as any)}>
                <Text style={styles.seeFullTableText}>Full Table</Text>
              </TouchableOpacity>
            </View>

            {/* Position Summary */}
            <View style={styles.positionSummaryCard}>
              <View style={styles.positionBadgeLarge}>
                <Text style={styles.positionNumberLarge}>{leagueData.position.rank}</Text>
                <Text style={styles.positionSuffix}>
                  {leagueData.position.rank === 1 ? 'st' : 
                   leagueData.position.rank === 2 ? 'nd' : 
                   leagueData.position.rank === 3 ? 'rd' : 'th'}
                </Text>
              </View>
              
              <View style={styles.positionStats}>
                <View style={styles.positionStatItem}>
                  <Text style={styles.positionStatValue}>{leagueData.position.points}</Text>
                  <Text style={styles.positionStatLabel}>Points</Text>
                </View>
                <View style={styles.positionStatDivider} />
                <View style={styles.positionStatItem}>
                  <Text style={styles.positionStatValue}>{leagueData.position.played}</Text>
                  <Text style={styles.positionStatLabel}>Played</Text>
                </View>
                <View style={styles.positionStatDivider} />
                <View style={styles.positionStatItem}>
                  <Text style={[
                    styles.positionStatValue,
                    leagueData.position.goalsDiff > 0 && styles.statPositive,
                    leagueData.position.goalsDiff < 0 && styles.statNegative,
                  ]}>
                    {leagueData.position.goalsDiff > 0 ? '+' : ''}{leagueData.position.goalsDiff}
                  </Text>
                  <Text style={styles.positionStatLabel}>GD</Text>
                </View>
              </View>
            </View>

            {/* Top 4 Mini Table */}
            <View style={styles.miniTableCard}>
              <View style={styles.miniTableHeader}>
                <Text style={styles.miniTableHeaderPos}>#</Text>
                <Text style={styles.miniTableHeaderTeam}>Team</Text>
                <Text style={styles.miniTableHeaderStat}>P</Text>
                <Text style={styles.miniTableHeaderStat}>GD</Text>
                <Text style={styles.miniTableHeaderPts}>PTS</Text>
              </View>

              {leagueData.topFour.map((standing, idx) => {
                const isCurrentTeam = standing.team.id === teamId;
                
                return (
                  <TouchableOpacity
                    key={standing.team.id}
                    style={[
                      styles.miniTableRow,
                      isCurrentTeam && styles.miniTableRowHighlight,
                      idx === 0 && styles.miniTableRowFirst,
                    ]}
                    onPress={() => {
                      if (!isCurrentTeam) {
                        router.push(`/teamCommunity/${standing.team.id}` as any);
                      }
                    }}
                  >
                    <View style={[
                      styles.miniPositionBadge,
                      idx === 0 && styles.miniPositionBadgeGold,
                      idx === 1 && styles.miniPositionBadgeSilver,
                      idx === 2 && styles.miniPositionBadgeBronze,
                      isCurrentTeam && styles.miniPositionBadgeCurrent,
                    ]}>
                      <Text style={[
                        styles.miniPositionText,
                        idx <= 2 && !isCurrentTeam && styles.miniPositionTextHighlight,
                        isCurrentTeam && styles.miniPositionTextCurrent,
                      ]}>
                        {standing.rank}
                      </Text>
                    </View>

                    <View style={styles.miniTeamColumn}>
                      <Image 
                        source={{ uri: standing.team.logo }} 
                        style={styles.miniTeamLogo}
                        resizeMode="contain"
                      />
                      <Text style={[
                        styles.miniTeamName,
                        isCurrentTeam && styles.miniTeamNameCurrent
                      ]} numberOfLines={1}>
                        {standing.team.name}
                      </Text>
                    </View>

                    <Text style={[styles.miniStatText, isCurrentTeam && styles.miniStatTextCurrent]}>
                      {standing.played}
                    </Text>
                    <Text style={[
                      styles.miniStatText,
                      standing.goalsDiff > 0 && styles.miniStatTextPositive,
                      standing.goalsDiff < 0 && styles.miniStatTextNegative,
                      isCurrentTeam && styles.miniStatTextCurrent,
                    ]}>
                      {standing.goalsDiff > 0 ? '+' : ''}{standing.goalsDiff}
                    </Text>
                    <Text style={[styles.miniPtsText, isCurrentTeam && styles.miniPtsTextCurrent]}>
                      {standing.points}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Show current team if not in top 4 */}
              {!leagueData.topFour.some(s => s.team.id === teamId) && (
                <>
                  <View style={styles.miniTableDivider}>
                    <Text style={styles.miniTableDividerText}>···</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.miniTableRow, styles.miniTableRowHighlight]}
                  >
                    <View style={styles.miniPositionBadgeCurrent}>
                      <Text style={styles.miniPositionTextCurrent}>
                        {leagueData.position.rank}
                      </Text>
                    </View>

                    <View style={styles.miniTeamColumn}>
                      <Image 
                        source={{ uri: leagueData.position.team.logo }} 
                        style={styles.miniTeamLogo}
                        resizeMode="contain"
                      />
                      <Text style={styles.miniTeamNameCurrent} numberOfLines={1}>
                        {leagueData.position.team.name}
                      </Text>
                    </View>

                    <Text style={styles.miniStatTextCurrent}>{leagueData.position.played}</Text>
                    <Text style={[
                      styles.miniStatTextCurrent,
                      leagueData.position.goalsDiff > 0 && styles.miniStatTextPositive,
                      leagueData.position.goalsDiff < 0 && styles.miniStatTextNegative,
                    ]}>
                      {leagueData.position.goalsDiff > 0 ? '+' : ''}{leagueData.position.goalsDiff}
                    </Text>
                    <Text style={styles.miniPtsTextCurrent}>{leagueData.position.points}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))}

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
                    <Image 
                      source={{ uri: lastMatch.homeLogo }} 
                      style={styles.matchTeamLogo}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={styles.matchTeamName}>{lastMatch.home}</Text>
                </View>

                <View style={styles.matchScore}>
                  <Text style={styles.scoreText}>{lastMatch.score}</Text>
                </View>

                <View style={styles.matchTeam}>
                  {lastMatch.awayLogo && (
                    <Image 
                      source={{ uri: lastMatch.awayLogo }} 
                      style={styles.matchTeamLogo}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={styles.matchTeamName}>{lastMatch.away}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Matches</Text>
            
            {upcomingMatches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={styles.upcomingMatchCard}
                onPress={() => router.push(`/matchPreview/${match.id}` as any)}
              >
                <View style={styles.upcomingMatchHeader}>
                  <Text style={styles.upcomingMatchLeague}>{match.league}</Text>
                  <Text style={styles.upcomingMatchDate}>{formatUpcomingDate(match.date)}</Text>
                </View>

                <View style={styles.upcomingMatchTeams}>
                  <View style={styles.upcomingMatchTeam}>
                    {match.homeLogo && (
                      <Image 
                        source={{ uri: match.homeLogo }} 
                        style={styles.upcomingMatchLogo}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={styles.upcomingMatchTeamName}>{match.home}</Text>
                  </View>

                  <Text style={styles.upcomingVs}>vs</Text>

                  <View style={styles.upcomingMatchTeam}>
                    {match.awayLogo && (
                      <Image 
                        source={{ uri: match.awayLogo }} 
                        style={styles.upcomingMatchLogo}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={styles.upcomingMatchTeamName}>{match.away}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTeam: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 24,
    height: 24,
  },
  headerLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  teamCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  teamLogo: {
    width: 80,
    height: 80,
    marginRight: 16,
  },
  teamDetails: {
    flex: 1,
  },
  teamName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  teamLeague: {
    fontSize: 14,
    color: '#666',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  followingButton: {
    backgroundColor: '#E8F1FF',
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  followingButtonText: {
    color: '#0066CC',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  seeFullTableText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  
  // Position Summary Card
  positionSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  positionBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginRight: 16,
  },
  positionNumberLarge: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0066CC',
  },
  positionSuffix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0066CC',
    marginLeft: 2,
  },
  positionStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  positionStatItem: {
    alignItems: 'center',
  },
  positionStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  positionStatLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  positionStatDivider: {
    width: 1,
    backgroundColor: '#E5E5E5',
  },
  statPositive: {
    color: '#34C759',
  },
  statNegative: {
    color: '#FF3B30',
  },

  // Mini Table
  miniTableCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  miniTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  miniTableHeaderPos: {
    width: 32,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
  },
  miniTableHeaderTeam: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
  },
  miniTableHeaderStat: {
    width: 32,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  miniTableHeaderPts: {
    width: 40,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  miniTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  miniTableRowFirst: {
    borderTopWidth: 3,
    borderTopColor: '#FFD700',
  },
  miniTableRowHighlight: {
    backgroundColor: '#E8F1FF',
  },
  miniPositionBadge: {
    width: 32,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPositionBadgeGold: {
    backgroundColor: '#FFD700',
  },
  miniPositionBadgeSilver: {
    backgroundColor: '#C0C0C0',
  },
  miniPositionBadgeBronze: {
    backgroundColor: '#CD7F32',
  },
  miniPositionBadgeCurrent: {
    backgroundColor: '#0066CC',
  },
  miniPositionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  miniPositionTextHighlight: {
    color: '#FFF',
  },
  miniPositionTextCurrent: {
    color: '#FFF',
  },
  miniTeamColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  miniTeamLogo: {
    width: 22,
    height: 22,
    marginRight: 8,
  },
  miniTeamName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  miniTeamNameCurrent: {
    fontWeight: '800',
    color: '#0066CC',
  },
  miniStatText: {
    width: 32,
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  miniStatTextCurrent: {
    fontWeight: '800',
    color: '#0066CC',
  },
  miniStatTextPositive: {
    color: '#34C759',
  },
  miniStatTextNegative: {
    color: '#FF3B30',
  },
  miniPtsText: {
    width: 40,
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  miniPtsTextCurrent: {
    color: '#0066CC',
  },
  miniTableDivider: {
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  miniTableDividerText: {
    fontSize: 14,
    color: '#8E8E93',
    letterSpacing: 2,
  },
  matchCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  matchLeague: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  matchDate: {
    fontSize: 13,
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
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  matchScore: {
    paddingHorizontal: 20,
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
  },
  upcomingMatchCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  upcomingMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  upcomingMatchLeague: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  upcomingMatchDate: {
    fontSize: 12,
    color: '#666',
  },
  upcomingMatchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingMatchTeam: {
    flex: 1,
    alignItems: 'center',
  },
  upcomingMatchLogo: {
    width: 40,
    height: 40,
    marginBottom: 6,
  },
  upcomingMatchTeamName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  upcomingVs: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    paddingHorizontal: 12,
  },
});