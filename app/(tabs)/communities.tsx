// app/(tabs)/communities.tsx
// Communities page - New users start empty, can search and join communities

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Community, communityService } from '../../services/communityService';

export default function CommunitiesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [trending, setTrending] = useState<Community[]>([]);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Community[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      setLoading(true);
      
      // Load user's joined communities (empty for new users)
      if (userProfile) {
        const joined = await communityService.getUserCommunities(userProfile.uid);
        setMyCommunities(joined);
      }
      
      // Load trending and all communities
      const trendingComms = await communityService.getTrendingCommunities();
      const allComms = await communityService.getAllCommunities();
      
      setTrending(trendingComms);
      setAllCommunities(allComms);
    } catch (error) {
      console.error('Error loading communities:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommunities();
    setRefreshing(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length > 1) {
      const results = await communityService.searchCommunities(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleJoinCommunity = async (community: Community) => {
    if (!userProfile) {
      Alert.alert('Sign in required', 'Please sign in to join communities');
      return;
    }

    const success = await communityService.joinCommunity(userProfile.uid, community.id);
    if (success) {
      // Update local state
      setMyCommunities(prev => [...prev, community]);
      Alert.alert('Joined!', `You're now a member of ${community.name}`);
    } else {
      Alert.alert('Error', 'Failed to join community. Please try again.');
    }
  };

  const handleLeaveCommunity = async (community: Community) => {
    if (!userProfile) return;

    Alert.alert(
      'Leave Community',
      `Are you sure you want to leave ${community.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const success = await communityService.leaveCommunity(userProfile.uid, community.id);
            if (success) {
              setMyCommunities(prev => prev.filter(c => c.id !== community.id));
            }
          }
        }
      ]
    );
  };

  const navigateToCommunityChat = (community: Community) => {
    // Navigate to the community chat with proper type
    router.push({
      pathname: '/communityChat/[id]',
      params: { 
        id: community.id,
        name: community.name,
        type: community.type
      }
    } as any);
  };

  const isJoined = (communityId: string): boolean => {
    return myCommunities.some(c => c.id === communityId);
  };

  const renderCommunityCard = (community: Community, showJoinButton: boolean = true) => {
    const joined = isJoined(community.id);
    
    return (
      <TouchableOpacity
        key={community.id}
        style={styles.communityCard}
        onPress={() => joined ? navigateToCommunityChat(community) : handleJoinCommunity(community)}
        onLongPress={() => joined ? handleLeaveCommunity(community) : null}
      >
        <View style={[styles.communityHeader, { backgroundColor: community.color }]}>
          <Text style={styles.communityIcon}>{community.icon}</Text>
          {community.trending && (
            <View style={styles.trendingBadge}>
              <Ionicons name="trending-up" size={12} color="#FFF" />
            </View>
          )}
        </View>

        <View style={styles.communityBody}>
          <Text style={styles.communityName} numberOfLines={1}>
            {community.name}
          </Text>
          
          {community.type && (
            <View style={[
              styles.typeBadge,
              community.type === 'team' && styles.teamBadge,
              community.type === 'league' && styles.leagueBadge,
            ]}>
              <Text style={styles.typeText}>
                {community.type === 'team' ? '⚽ Team' : 
                 community.type === 'league' ? '🏆 League' : '👥 Community'}
              </Text>
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
            {community.activeNow && (
              <View style={styles.stat}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{community.activeNow} active</Text>
              </View>
            )}
          </View>

          {showJoinButton && (
            <TouchableOpacity
              style={[styles.joinButton, joined && styles.joinedButton]}
              onPress={(e) => {
                e.stopPropagation();
                if (joined) {
                  navigateToCommunityChat(community);
                } else {
                  handleJoinCommunity(community);
                }
              }}
            >
              <Ionicons 
                name={joined ? 'chatbubbles' : 'add'} 
                size={16} 
                color={joined ? '#FFF' : '#0066CC'} 
              />
              <Text style={[styles.joinButtonText, joined && styles.joinedButtonText]}>
                {joined ? 'Open Chat' : 'Join'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <TouchableOpacity onPress={() => setShowSearchModal(true)}>
          <Ionicons name="search" size={24} color="#0066CC" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <TouchableOpacity 
        style={styles.searchBar}
        onPress={() => setShowSearchModal(true)}
      >
        <Ionicons name="search" size={20} color="#8E8E93" />
        <Text style={styles.searchPlaceholder}>Search communities...</Text>
      </TouchableOpacity>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* My Communities Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Communities</Text>
            <Text style={styles.sectionCount}>{myCommunities.length}</Text>
          </View>

          {myCommunities.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              {myCommunities.map(community => (
                <TouchableOpacity
                  key={community.id}
                  style={styles.myTeamCard}
                  onPress={() => navigateToCommunityChat(community)}
                >
                  <View style={[styles.myTeamIcon, { backgroundColor: community.color }]}>
                    <Text style={styles.myTeamEmoji}>{community.icon}</Text>
                  </View>
                  <Text style={styles.myTeamName} numberOfLines={1}>{community.name}</Text>
                  {community.hasLiveMatch && (
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyMyCommunities}>
              <Ionicons name="people-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyTitle}>No communities yet</Text>
              <Text style={styles.emptySubtitle}>
                Join communities below to connect with fellow fans
              </Text>
            </View>
          )}
        </View>

        {/* Trending Communities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🔥 Trending</Text>
          </View>

          {trending.map(community => renderCommunityCard(community))}
        </View>

        {/* Team Communities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚽ Team Communities</Text>
          </View>

          {allCommunities
            .filter(c => c.type === 'team')
            .slice(0, 6)
            .map(community => renderCommunityCard(community))}
        </View>

        {/* League Communities */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏆 League Communities</Text>
          </View>

          {allCommunities
            .filter(c => c.type === 'league')
            .slice(0, 4)
            .map(community => renderCommunityCard(community))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSearchModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Search Communities</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.modalSearchBar}>
            <Ionicons name="search" size={20} color="#8E8E93" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for teams, leagues..."
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
              placeholderTextColor="#8E8E93"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={20} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.searchResults}>
            {searchQuery.length > 0 ? (
              searchResults.length > 0 ? (
                searchResults.map(community => renderCommunityCard(community))
              ) : (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={48} color="#E5E7EB" />
                  <Text style={styles.noResultsText}>No communities found</Text>
                  <Text style={styles.noResultsSubtext}>Try a different search term</Text>
                </View>
              )
            ) : (
              <View style={styles.searchSuggestions}>
                <Text style={styles.suggestionsTitle}>Popular Searches</Text>
                {['Liverpool', 'Real Madrid', 'Premier League', 'Champions League', 'Barcelona'].map(term => (
                  <TouchableOpacity 
                    key={term}
                    style={styles.suggestionItem}
                    onPress={() => handleSearch(term)}
                  >
                    <Ionicons name="search" size={16} color="#666" />
                    <Text style={styles.suggestionText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
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
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
    marginTop: 10,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  horizontalScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  myTeamCard: {
    alignItems: 'center',
    width: 80,
  },
  myTeamIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  myTeamEmoji: {
    fontSize: 28,
  },
  myTeamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyMyCommunities: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  communityCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  communityHeader: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  communityIcon: {
    fontSize: 28,
  },
  trendingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  communityBody: {
    padding: 16,
  },
  communityName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  teamBadge: {
    backgroundColor: '#E8F5E9',
  },
  leagueBadge: {
    backgroundColor: '#FFF3E0',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
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
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  activeText: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '500',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4FD',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  joinedButton: {
    backgroundColor: '#0066CC',
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  joinedButtonText: {
    color: '#FFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  cancelButton: {
    fontSize: 16,
    color: '#0066CC',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 10,
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
    marginTop: 20,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  searchSuggestions: {
    paddingHorizontal: 20,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionText: {
    fontSize: 16,
    color: '#333',
  },
});