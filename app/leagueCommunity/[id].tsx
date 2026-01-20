// app/leagueCommunity/[id].tsx
// League Community Screen with Full Standings Table

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
import { footballAPI, LeagueStandingsResponse, Match } from '../../services/footballApi';
import { communityService } from '../../services/communityService';

export default function LeagueCommunityScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const leagueId = Number(id);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leagueInfo, setLeagueInfo] = useState<any>(null);
  const [standings, setStandings] = useState<LeagueStandingsResponse | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    loadLeagueData();
  }, [leagueId]);

  useEffect(() => {
    if (userProfile?.uid) {
      checkFollowStatus();
    }
  }, [userProfile, leagueId]);

  const loadLeagueData = async () => {
    try {
      setLoading(true);

      // Get league info from communities
      const league = await communityService.getCommunityById(leagueId, 'league');
      setLeagueInfo(league);

      // Get league standings
      const standingsData = await footballAPI.getLeagueStandingsByCurrentSeason(leagueId);
      setStandings(standingsData);

      // Get upcoming matches for this league
      const upcoming = await footballAPI.getLeagueUpcomingMatches(leagueId, 8);
      setUpcomingMatches(upcoming);

    } catch (error) {
      console.error('Error loading league data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkFollowStatus = async () => {
    if (!userProfile?.uid) return;
    const following = await communityService.isFollowing(userProfile.uid, leagueId);
    setIsFollowing(following);
  };

  const toggleFollow = async () => {
    if (!userProfile?.uid || !leagueInfo) return;
    
    await communityService.toggleFollow(userProfile.uid, leagueId, 'league');
    setIsFollowing(!isFollowing);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeagueData();
    setRefreshing(false);
  };

  const formatUpcomingDate = (dateString: string): string => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `${dayName} ${time}`;
  };

  const getFormColor = (result: string): string => {
    if (result === 'W') return '#34C759';
    if (result === 'D') return '#FFD60A';
    if (result === 'L') return '#FF3B30';
    return '#8E8E93';
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

  if (!leagueInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>League not found</Text>
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
        
        <View style={styles.headerLeague}>
          {leagueInfo.logo ? (
            <Image 
              source={{ uri: leagueInfo.logo }} 
              style={styles.headerLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.headerLogoPlaceholder}>
              <Ionicons name="trophy" size={20} color="#0066CC" />
            </View>
          )}
          <Text style={styles.headerTitle}>{leagueInfo.name}</Text>
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
        {/* League Info Card */}
        <View style={styles.leagueCard}>
          <View style={styles.leagueCardHeader}>
            {leagueInfo.logo && (
              <Image 
                source={{ uri: leagueInfo.logo }} 
                style={styles.leagueLogo}
                resizeMode="contain"
              />
            )}
            <View style={styles.leagueDetails}>
              <Text style={styles.leagueName}>{leagueInfo.name}</Text>
              {leagueInfo.country && (
                <Text style={styles.leagueCountry}>{leagueInfo.country}</Text>
              )}
              {standings?.season && (
                <Text style={styles.leagueSeason}>Season {standings.season}</Text>
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

        {/* Standings Table */}
        {standings && standings.groups.map((group, groupIndex) => (
          <View key={groupIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{group.name}</Text>
            
            <View style={styles.tableCard}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderPos}>#</Text>
                <Text style={styles.tableHeaderTeam}>Team</Text>
                <Text style={styles.tableHeaderStat}>P</Text>
                <Text style={styles.tableHeaderStat}>W</Text>
                <Text style={styles.tableHeaderStat}>D</Text>
                <Text style={styles.tableHeaderStat}>L</Text>
                <Text style={styles.tableHeaderStat}>GD</Text>
                <Text style={styles.tableHeaderPts}>PTS</Text>
              </View>

              {/* Table Rows */}
              {group.standings.map((standing, index) => (
                <TouchableOpacity
                  key={standing.team.id}
                  style={[
                    styles.tableRow,
                    index === 0 && styles.tableRowFirst,
                    index <= 3 && styles.tableRowChampions,
                    index === group.standings.length - 1 && styles.tableRowLast,
                  ]}
                  onPress={() => router.push(`/teamCommunity/${standing.team.id}` as any)}
                >
                  <View style={[
                    styles.positionBadge,
                    index === 0 && styles.positionBadgeGold,
                    index === 1 && styles.positionBadgeSilver,
                    index === 2 && styles.positionBadgeBronze,
                  ]}>
                    <Text style={[
                      styles.positionText,
                      index <= 2 && styles.positionTextHighlight
                    ]}>
                      {standing.rank}
                    </Text>
                  </View>

                  <View style={styles.teamColumn}>
                    <Image 
                      source={{ uri: standing.team.logo }} 
                      style={styles.teamLogo}
                      resizeMode="contain"
                    />
                    <Text style={styles.teamName} numberOfLines={1}>
                      {standing.team.name}
                    </Text>
                  </View>

                  <Text style={styles.statText}>{standing.played}</Text>
                  <Text style={styles.statText}>{standing.win}</Text>
                  <Text style={styles.statText}>{standing.draw}</Text>
                  <Text style={styles.statText}>{standing.lose}</Text>
                  <Text style={[
                    styles.statText,
                    standing.goalsDiff > 0 && styles.statTextPositive,
                    standing.goalsDiff < 0 && styles.statTextNegative,
                  ]}>
                    {standing.goalsDiff > 0 ? '+' : ''}{standing.goalsDiff}
                  </Text>
                  <Text style={styles.ptsText}>{standing.points}</Text>

                  {/* Form */}
                  {standing.form && (
                    <View style={styles.formContainer}>
                      {standing.form.split('').slice(-5).map((result, i) => (
                        <View
                          key={i}
                          style={[
                            styles.formDot,
                            { backgroundColor: getFormColor(result) }
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Table Legend */}
            <View style={styles.tableLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
                <Text style={styles.legendText}>Champions League</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
                <Text style={styles.legendText}>Relegation</Text>
              </View>
            </View>
          </View>
        ))}

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
                <Text style={styles.upcomingMatchDate}>{formatUpcomingDate(match.date)}</Text>

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
  headerLeague: {
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
  leagueCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  leagueCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  leagueLogo: {
    width: 80,
    height: 80,
    marginRight: 16,
  },
  leagueDetails: {
    flex: 1,
  },
  leagueName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  leagueCountry: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  leagueSeason: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
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
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tableCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: 2,
    borderBottomColor: '#E5E5E5',
  },
  tableHeaderPos: {
    width: 32,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
  },
  tableHeaderTeam: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
  },
  tableHeaderStat: {
    width: 28,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  tableHeaderPts: {
    width: 36,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tableRowFirst: {
    borderTopWidth: 3,
    borderTopColor: '#FFD700',
  },
  tableRowChampions: {
    backgroundColor: '#FFFBF0',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  positionBadge: {
    width: 32,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionBadgeGold: {
    backgroundColor: '#FFD700',
  },
  positionBadgeSilver: {
    backgroundColor: '#C0C0C0',
  },
  positionBadgeBronze: {
    backgroundColor: '#CD7F32',
  },
  positionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  positionTextHighlight: {
    color: '#FFF',
  },
  teamColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  statText: {
    width: 28,
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  statTextPositive: {
    color: '#34C759',
  },
  statTextNegative: {
    color: '#FF3B30',
  },
  ptsText: {
    width: 36,
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  formContainer: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: 8,
  },
  formDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tableLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
  upcomingMatchCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  upcomingMatchDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 12,
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