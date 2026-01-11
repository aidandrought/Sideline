// app/(tabs)/communities.tsx
// Communities Screen - Empty for new users, search to join, live team chats

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
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
  type: 'team' | 'league';
  isLive?: boolean;
  liveMatchId?: string;
}

// All predefined communities (teams and leagues)
const ALL_COMMUNITIES: Community[] = [
  // Premier League Teams
  { id: 'liverpool', name: 'Liverpool FC', members: '2.1M', activeNow: '45.2K', icon: '🔴', color: '#C8102E', description: 'You\'ll Never Walk Alone', league: 'Premier League', type: 'team', isLive: true, liveMatchId: '999999' },
  { id: 'arsenal', name: 'Arsenal', members: '1.8M', activeNow: '38.1K', icon: '🔴', color: '#EF0107', description: 'The Gunners', league: 'Premier League', type: 'team', isLive: true, liveMatchId: '999999' },
  { id: 'mancity', name: 'Manchester City', members: '1.9M', activeNow: '42.3K', icon: '🩵', color: '#6CABDD', description: 'City \'til I die', league: 'Premier League', type: 'team' },
  { id: 'manunited', name: 'Manchester United', members: '2.5M', activeNow: '52.1K', icon: '🔴', color: '#DA291C', description: 'Red Devils', league: 'Premier League', type: 'team' },
  { id: 'chelsea', name: 'Chelsea FC', members: '1.7M', activeNow: '35.4K', icon: '🔵', color: '#034694', description: 'The Blues', league: 'Premier League', type: 'team' },
  { id: 'tottenham', name: 'Tottenham Hotspur', members: '1.4M', activeNow: '28.6K', icon: '⚪', color: '#132257', description: 'COYS', league: 'Premier League', type: 'team' },
  
  // La Liga Teams
  { id: 'realmadrid', name: 'Real Madrid', members: '3.2M', activeNow: '68.4K', icon: '⚪', color: '#FEBE10', description: 'Hala Madrid', league: 'La Liga', type: 'team' },
  { id: 'barcelona', name: 'FC Barcelona', members: '3.0M', activeNow: '64.2K', icon: '🔵🔴', color: '#A50044', description: 'Més que un club', league: 'La Liga', type: 'team' },
  { id: 'atletico', name: 'Atlético Madrid', members: '1.1M', activeNow: '22.3K', icon: '🔴⚪', color: '#CB3524', description: 'Atleti', league: 'La Liga', type: 'team' },
  
  // Bundesliga Teams
  { id: 'bayern', name: 'Bayern Munich', members: '2.4M', activeNow: '51.2K', icon: '🔴', color: '#DC052D', description: 'Mia san Mia', league: 'Bundesliga', type: 'team' },
  { id: 'dortmund', name: 'Borussia Dortmund', members: '1.3M', activeNow: '27.8K', icon: '🟡', color: '#FDE100', description: 'Echte Liebe', league: 'Bundesliga', type: 'team' },
  
  // Serie A Teams
  { id: 'juventus', name: 'Juventus', members: '1.6M', activeNow: '33.4K', icon: '⚫⚪', color: '#000000', description: 'Fino Alla Fine', league: 'Serie A', type: 'team' },
  { id: 'intermilan', name: 'Inter Milan', members: '1.4M', activeNow: '29.1K', icon: '🔵⚫', color: '#0068A8', description: 'Nerazzurri', league: 'Serie A', type: 'team' },
  { id: 'acmilan', name: 'AC Milan', members: '1.5M', activeNow: '31.2K', icon: '🔴⚫', color: '#FB090B', description: 'Rossoneri', league: 'Serie A', type: 'team' },
  
  // Ligue 1 Teams
  { id: 'psg', name: 'Paris Saint-Germain', members: '2.0M', activeNow: '43.6K', icon: '🔵🔴', color: '#004170', description: 'Ici c\'est Paris', league: 'Ligue 1', type: 'team' },
  
  // MLS Teams
  { id: 'intermiami', name: 'Inter Miami', members: '1.8M', activeNow: '39.2K', icon: '🩷', color: '#F5B5C8', description: 'La Familia', league: 'MLS', type: 'team' },
  
  // League Communities
  { id: 'premierleague', name: 'Premier League', members: '4.5M', activeNow: '98.2K', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#3D195B', description: 'The best league in the world', type: 'league', trending: true },
  { id: 'laliga', name: 'La Liga', members: '3.8M', activeNow: '82.1K', icon: '🇪🇸', color: '#EE8707', description: 'Spanish football passion', type: 'league', trending: true },
  { id: 'bundesliga', name: 'Bundesliga', members: '2.1M', activeNow: '45.6K', icon: '🇩🇪', color: '#D20515', description: 'German football excellence', type: 'league' },
  { id: 'seriea', name: 'Serie A', members: '2.4M', activeNow: '51.3K', icon: '🇮🇹', color: '#024494', description: 'Italian football artistry', type: 'league' },
  { id: 'ligue1', name: 'Ligue 1', members: '1.6M', activeNow: '34.2K', icon: '🇫🇷', color: '#DCC65C', description: 'French football', type: 'league' },
  { id: 'championsleague', name: 'Champions League', members: '5.2M', activeNow: '112.4K', icon: '⭐', color: '#0066CC', description: 'The biggest club competition', type: 'league', trending: true },
  { id: 'europaleague', name: 'Europa League', members: '1.9M', activeNow: '41.2K', icon: '🏆', color: '#F68E1E', description: 'UEFA Europa League', type: 'league' },
  { id: 'mls', name: 'MLS', members: '1.2M', activeNow: '26.8K', icon: '🇺🇸', color: '#0033A0', description: 'Major League Soccer', type: 'league' },
];

export default function CommunitiesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [trendingCommunities, setTrendingCommunities] = useState<Community[]>([]);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Community[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    // For new users, myCommunities is empty
    // In real app, this would fetch from Firestore: userCommunities/{userId}
    // For now, start empty to demonstrate the empty state
    setMyCommunities([]);
    
    // Load trending communities
    const trending = ALL_COMMUNITIES.filter(c => c.trending);
    setTrendingCommunities(trending);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommunities();
    setRefreshing(false);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const results = ALL_COMMUNITIES.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      (c.league && c.league.toLowerCase().includes(lowerQuery))
    );
    setSearchResults(results);
  };

  const handleFollowCommunity = (community: Community) => {
    const newFollowed = new Set(followedIds);
    
    if (newFollowed.has(community.id)) {
      // Unfollow
      newFollowed.delete(community.id);
      setMyCommunities(prev => prev.filter(c => c.id !== community.id));
    } else {
      // Follow
      newFollowed.add(community.id);
      setMyCommunities(prev => [...prev, community]);
    }
    
    setFollowedIds(newFollowed);
    
    // In real app, save to Firestore:
    // await updateDoc(doc(db, 'userCommunities', userProfile.uid), { 
    //   followedIds: Array.from(newFollowed) 
    // });
  };

  const handleCommunityPress = (community: Community) => {
    if (community.isLive && community.liveMatchId) {
      // Navigate to live match chat with community context
      router.push(`/chat/${community.liveMatchId}?communityId=${community.id}&teamName=${encodeURIComponent(community.name)}` as any);
    } else {
      // Navigate to community page (could be a general chat or info page)
      router.push(`/chat/${community.id}` as any);
    }
  };

  // Empty state for new users
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="people-outline" size={80} color="#E5E7EB" />
      </View>
      <Text style={styles.emptyTitle}>No Communities Yet</Text>
      <Text style={styles.emptyDescription}>
        Join communities to connect with fellow fans, chat during live matches, and stay updated on your favorite teams.
      </Text>
      <TouchableOpacity 
        style={styles.findCommunitiesButton}
        onPress={() => setSearchModalVisible(true)}
      >
        <Ionicons name="search" size={20} color="#FFF" />
        <Text style={styles.findCommunitiesText}>Find Communities</Text>
      </TouchableOpacity>
    </View>
  );

  // My Communities section
  const renderMyCommunities = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Teams & Leagues</Text>
        <Text style={styles.sectionCount}>{myCommunities.length}</Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScrollContent}
      >
        {myCommunities.map(community => (
          <TouchableOpacity
            key={community.id}
            style={[
              styles.myTeamCard,
              { backgroundColor: community.color === '#FFFFFF' ? '#F5F5F7' : community.color }
            ]}
            onPress={() => handleCommunityPress(community)}
          >
            <View style={styles.myTeamHeader}>
              <Text style={styles.myTeamIcon}>{community.icon}</Text>
              {community.isLive ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : (
                <View style={styles.memberBadge}>
                  <Ionicons name="people" size={12} color="#666" />
                  <Text style={styles.memberCountSmall}>{community.activeNow}</Text>
                </View>
              )}
            </View>
            <Text 
              style={[
                styles.myTeamName,
                { color: community.color === '#FFFFFF' || community.color === '#FDE100' || community.color === '#FEBE10' ? '#000' : '#FFF' }
              ]} 
              numberOfLines={2}
            >
              {community.name}
            </Text>
            <View style={styles.myTeamFooter}>
              {community.isLive ? (
                <View style={styles.joinChatButton}>
                  <Ionicons name="chatbubbles" size={14} color="#FFF" />
                  <Text style={styles.joinChatText}>Join Chat</Text>
                </View>
              ) : (
                <Text style={[
                  styles.myTeamMembers,
                  { color: community.color === '#FFFFFF' || community.color === '#FDE100' || community.color === '#FEBE10' ? '#666' : 'rgba(255,255,255,0.8)' }
                ]}>
                  {community.members} members
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
        
        <TouchableOpacity 
          style={styles.addTeamCard}
          onPress={() => setSearchModalVisible(true)}
        >
          <Ionicons name="add-circle" size={48} color="#0066CC" />
          <Text style={styles.addTeamText}>Join More</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // Trending communities section
  const renderTrending = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.trendingHeader}>
          <Ionicons name="flame" size={24} color="#FF3B30" />
          <Text style={styles.sectionTitle}>Trending</Text>
        </View>
        <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
          <Text style={styles.seeAllButton}>See All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.trendingGrid}>
        {trendingCommunities.slice(0, 6).map(community => (
          <TouchableOpacity
            key={community.id}
            style={styles.trendingCard}
            onPress={() => handleCommunityPress(community)}
          >
            <View style={[styles.trendingIconBg, { backgroundColor: community.color }]}>
              <Text style={styles.trendingIcon}>{community.icon}</Text>
            </View>
            <View style={styles.trendingInfo}>
              <Text style={styles.trendingName} numberOfLines={1}>{community.name}</Text>
              <Text style={styles.trendingMembers}>{community.members} members</Text>
            </View>
            <TouchableOpacity 
              style={[
                styles.followButton,
                followedIds.has(community.id) && styles.followedButton
              ]}
              onPress={() => handleFollowCommunity(community)}
            >
              <Text style={[
                styles.followButtonText,
                followedIds.has(community.id) && styles.followedButtonText
              ]}>
                {followedIds.has(community.id) ? 'Joined' : 'Join'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Search Modal
  const renderSearchModal = () => (
    <Modal
      visible={searchModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setSearchModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
            <Ionicons name="close" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Find Communities</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams, leagues..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Results or Suggestions */}
        <ScrollView style={styles.searchResults} showsVerticalScrollIndicator={false}>
          {searchQuery.length === 0 ? (
            <>
              <Text style={styles.suggestionsTitle}>Suggested Communities</Text>
              {ALL_COMMUNITIES.slice(0, 10).map(community => renderSearchResultItem(community))}
            </>
          ) : searchResults.length === 0 ? (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={48} color="#E5E7EB" />
              <Text style={styles.noResultsText}>No communities found</Text>
            </View>
          ) : (
            searchResults.map(community => renderSearchResultItem(community))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );

  const renderSearchResultItem = (community: Community) => (
    <TouchableOpacity
      key={community.id}
      style={styles.searchResultItem}
      onPress={() => {
        handleFollowCommunity(community);
      }}
    >
      <View style={[styles.resultIconBg, { backgroundColor: community.color }]}>
        <Text style={styles.resultIcon}>{community.icon}</Text>
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName}>{community.name}</Text>
        <Text style={styles.resultDescription}>{community.description}</Text>
        <View style={styles.resultStats}>
          <Ionicons name="people" size={12} color="#666" />
          <Text style={styles.resultMembers}>{community.members}</Text>
          {community.league && (
            <>
              <Text style={styles.resultDot}>•</Text>
              <Text style={styles.resultLeague}>{community.league}</Text>
            </>
          )}
        </View>
      </View>
      <TouchableOpacity 
        style={[
          styles.resultFollowButton,
          followedIds.has(community.id) && styles.resultFollowedButton
        ]}
        onPress={() => handleFollowCommunity(community)}
      >
        {followedIds.has(community.id) ? (
          <Ionicons name="checkmark" size={18} color="#0066CC" />
        ) : (
          <Ionicons name="add" size={18} color="#FFF" />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
          <Ionicons name="search" size={26} color="#0066CC" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {myCommunities.length === 0 ? (
          <>
            {renderEmptyState()}
            {renderTrending()}
          </>
        ) : (
          <>
            {renderMyCommunities()}
            {renderTrending()}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderSearchModal()}
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
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  findCommunitiesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  findCommunitiesText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  
  // Section
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
    backgroundColor: '#E5E7EB',
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
  
  // My Teams Horizontal Scroll
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  memberCountSmall: {
    fontSize: 10,
    fontWeight: '600',
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
  },
  joinChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  joinChatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
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
  
  // Trending Grid
  trendingGrid: {
    paddingHorizontal: 20,
    gap: 12,
  },
  trendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  trendingIconBg: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingIcon: {
    fontSize: 28,
  },
  trendingInfo: {
    flex: 1,
    marginLeft: 14,
  },
  trendingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  trendingMembers: {
    fontSize: 13,
    color: '#666',
  },
  followButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  followedButton: {
    backgroundColor: '#E5E7EB',
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  followedButtonText: {
    color: '#666',
  },
  
  // Search Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    margin: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  searchResults: {
    flex: 1,
    paddingHorizontal: 20,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  resultIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultIcon: {
    fontSize: 26,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 14,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  resultDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultMembers: {
    fontSize: 12,
    color: '#666',
  },
  resultDot: {
    fontSize: 12,
    color: '#CCC',
  },
  resultLeague: {
    fontSize: 12,
    color: '#666',
  },
  resultFollowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultFollowedButton: {
    backgroundColor: '#E5E7EB',
  },
  noResults: {
    alignItems: 'center',
    paddingTop: 60,
  },
  noResultsText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
});