import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

interface Community {
  id: string;
  name: string;
  members: string;
  activeNow: string;
  icon: string;
  color: string;
  description: string;
  league?: string;
  trending?: boolean;
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [myTeams, setMyTeams] = useState<Community[]>([]);
  const [trending, setTrending] = useState<Community[]>([]);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    // Mock data - based on user's followed teams
    const teams: Community[] = [
      { 
        id: '1', 
        name: 'Real Madrid', 
        members: '2.4M',
        activeNow: '45.2K',
        icon: '👑',
        color: '#FFFFFF',
        description: 'Official Real Madrid fan community',
        league: 'La Liga',
        trending: true
      },
      { 
        id: '2', 
        name: 'Liverpool FC', 
        members: '2.1M',
        activeNow: '38.5K',
        icon: '🔴',
        color: '#C8102E',
        description: 'You\'ll Never Walk Alone',
        league: 'Premier League',
        trending: false
      },
      { 
        id: '3', 
        name: 'Bayern Munich', 
        members: '1.8M',
        activeNow: '32.1K',
        icon: '🔴',
        color: '#DC052D',
        description: 'Mia San Mia - Bayern fans unite',
        league: 'Bundesliga',
        trending: false
      },
    ];

    const trendingComms: Community[] = [
      { 
        id: '4', 
        name: 'Champions League', 
        members: '3.2M',
        activeNow: '89.4K',
        icon: '⭐',
        color: '#0066CC',
        description: 'The biggest club competition',
        trending: true
      },
      { 
        id: '5', 
        name: 'Premier League Fans', 
        members: '2.8M',
        activeNow: '76.3K',
        icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        color: '#3D195B',
        description: 'Best league in the world',
        league: 'Premier League',
        trending: true
      },
      { 
        id: '6', 
        name: 'El Clásico', 
        members: '1.9M',
        activeNow: '52.1K',
        icon: '⚔️',
        color: '#FFD700',
        description: 'The greatest rivalry',
        trending: true
      },
    ];

    const all: Community[] = [
      { 
        id: '7', 
        name: 'La Liga United', 
        members: '890K',
        activeNow: '12.4K',
        icon: '🇪🇸',
        color: '#DC2626',
        description: 'Spanish football passion',
        league: 'La Liga'
      },
      { 
        id: '8', 
        name: 'Bundesliga Hub', 
        members: '654K',
        activeNow: '9.8K',
        icon: '🇩🇪',
        color: '#059669',
        description: 'German football excellence',
        league: 'Bundesliga'
      },
      { 
        id: '9', 
        name: 'Serie A Passione', 
        members: '721K',
        activeNow: '11.2K',
        icon: '🇮🇹',
        color: '#2563EB',
        description: 'Italian football artistry',
        league: 'Serie A'
      },
      { 
        id: '10', 
        name: 'Football Transfer Talk', 
        members: '1.2M',
        activeNow: '28.6K',
        icon: '💰',
        color: '#EA580C',
        description: 'Latest transfer news & rumors',
      },
    ];

    setMyTeams(teams);
    setTrending(trendingComms);
    setAllCommunities(all);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommunities();
    setRefreshing(false);
  };

  const renderCommunityCard = (community: Community, size: 'large' | 'medium' = 'medium') => {
    const isLarge = size === 'large';
    
    return (
      <TouchableOpacity
        key={community.id}
        style={[
          styles.communityCard,
          isLarge && styles.communityCardLarge
        ]}
        onPress={() => {
          // Navigate to community chat
          router.push(`/chat/${community.id}` as any);
        }}
      >
        <View style={[
          styles.communityHeader,
          { backgroundColor: community.color === '#FFFFFF' ? '#F5F5F7' : community.color }
        ]}>
          <Text style={styles.communityIcon}>{community.icon}</Text>
          {community.trending && (
            <View style={styles.trendingBadge}>
              <Ionicons name="trending-up" size={12} color="#FFF" />
              <Text style={styles.trendingText}>Trending</Text>
            </View>
          )}
        </View>

        <View style={styles.communityBody}>
          <Text style={styles.communityName} numberOfLines={1}>
            {community.name}
          </Text>
          
          {community.league && (
            <View style={styles.leagueBadge}>
              <Text style={styles.leagueText}>{community.league}</Text>
            </View>
          )}

          <Text style={styles.communityDescription} numberOfLines={2}>
            {community.description}
          </Text>

          <View style={styles.communityStats}>
            <View style={styles.stat}>
              <Ionicons name="people" size={14} color="#666" />
              <Text style={styles.statText}>{community.members}</Text>
            </View>
            <View style={styles.stat}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{community.activeNow} active</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <TouchableOpacity>
          <Ionicons name="add-circle" size={28} color="#0066CC" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* My Teams Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Teams</Text>
            <Text style={styles.sectionCount}>{myTeams.length}</Text>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContent}
          >
            {myTeams.map(team => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.myTeamCard,
                  { backgroundColor: team.color === '#FFFFFF' ? '#F5F5F7' : team.color }
                ]}
                onPress={() => router.push(`/chat/${team.id}` as any)}
              >
                <View style={styles.myTeamHeader}>
                  <Text style={styles.myTeamIcon}>{team.icon}</Text>
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveCount}>{team.activeNow}</Text>
                  </View>
                </View>
                <Text 
                  style={[
                    styles.myTeamName,
                    { color: team.color === '#FFFFFF' ? '#000' : '#FFF' }
                  ]} 
                  numberOfLines={2}
                >
                  {team.name}
                </Text>
                <View style={styles.myTeamFooter}>
                  <Ionicons 
                    name="chatbubbles" 
                    size={14} 
                    color={team.color === '#FFFFFF' ? '#666' : 'rgba(255,255,255,0.8)'} 
                  />
                  <Text 
                    style={[
                      styles.myTeamMembers,
                      { color: team.color === '#FFFFFF' ? '#666' : 'rgba(255,255,255,0.8)' }
                    ]}
                  >
                    {team.members}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity style={styles.addTeamCard}>
              <Ionicons name="add-circle" size={48} color="#0066CC" />
              <Text style={styles.addTeamText}>Follow Team</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Trending Now */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.trendingHeader}>
              <Ionicons name="flame" size={24} color="#FF3B30" />
              <Text style={styles.sectionTitle}>Trending Now</Text>
            </View>
          </View>

          <View style={styles.trendingGrid}>
            {trending.map(comm => renderCommunityCard(comm, 'large'))}
          </View>
        </View>

        {/* Discover Communities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discover</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllButton}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.communitiesGrid}>
            {allCommunities.map(comm => renderCommunityCard(comm))}
          </View>
        </View>

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
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  sectionCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seeAllButton: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  horizontalScrollContent: {
    paddingHorizontal: 20,
  },
  myTeamCard: {
    width: 160,
    height: 180,
    borderRadius: 20,
    padding: 16,
    marginRight: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  myTeamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  myTeamIcon: {
    fontSize: 40,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
    marginRight: 4,
  },
  liveCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  myTeamName: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  myTeamFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myTeamMembers: {
    fontSize: 13,
    fontWeight: '600',
  },
  addTeamCard: {
    width: 160,
    height: 180,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0066CC',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addTeamText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066CC',
    marginTop: 8,
  },
  trendingGrid: {
    paddingHorizontal: 20,
    gap: 12,
  },
  communitiesGrid: {
    paddingHorizontal: 20,
    gap: 12,
  },
  communityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  communityCardLarge: {
    marginBottom: 8,
  },
  communityHeader: {
    height: 80,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  communityIcon: {
    fontSize: 36,
  },
  trendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  communityBody: {
    padding: 16,
  },
  communityName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 6,
  },
  leagueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  leagueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  communityDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  communityStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  activeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
});