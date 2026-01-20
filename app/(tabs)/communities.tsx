// app/(tabs)/communities.tsx
// FIXED: Immediate load, stable generation, filtered search, Firebase persistence

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { shadow } from '../../components/styleUtils';
import { useAuth } from '../../context/AuthContext';
import { Community, communityService } from '../../services/communityService';

export default function CommunitiesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  
  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [displayedCommunities, setDisplayedCommunities] = useState<Community[]>([]);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [suggestedCommunities, setSuggestedCommunities] = useState<Community[]>([]);
  
  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'teams' | 'leagues'>('all');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  
  // Follow state
  const [followedIds, setFollowedIds] = useState<Set<number>>(new Set());

  // FIX 1 & 2: Load communities immediately on mount, generate once
  useEffect(() => {
    loadAllCommunities();
  }, []);

  // Load user follows separately
  useEffect(() => {
    if (userProfile && allCommunities.length > 0) {
      loadUserFollows();
    }
  }, [userProfile, allCommunities]);

  const loadAllCommunities = async () => {
    try {
      setLoading(true);
      
      // FIX 2: Generate communities ONCE from live + upcoming matches
      const communities = await communityService.getAllCommunities();
      console.log('✅ Loaded communities:', communities.length);
      
      // Store in state - this is stable now
      setAllCommunities(communities);
      setDisplayedCommunities(communities);
      
      // Load suggested (major leagues)
      const suggested = await communityService.getSuggestedCommunities();
      setSuggestedCommunities(suggested);
      
    } catch (error) {
      console.error('❌ Error loading communities:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserFollows = async () => {
    if (!userProfile) return;
    
    try {
      // FIX 4: Load user's followed community IDs from Firebase
      const userCommunities = await communityService.getUserCommunities(userProfile.uid);
      
      // Extract IDs
      const followedTeamIds = new Set(userCommunities.followedTeams);
      const followedLeagueIds = new Set(userCommunities.followedLeagues);
      const allFollowedIds = new Set([...followedTeamIds, ...followedLeagueIds]);
      
      setFollowedIds(allFollowedIds);
      
      // Filter allCommunities to get user's communities
      const myComms = allCommunities.filter(c => allFollowedIds.has(c.id));
      setMyCommunities(myComms);
      
      console.log('✅ Loaded user follows:', allFollowedIds.size);
      
    } catch (error) {
      // FIX 3: Handle Firebase permission errors gracefully
      console.error('⚠️ Error loading user follows (permissions?):', error);
      // Continue without follows - don't break the screen
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    communityService.clearCache(); // Force fresh data
    await loadAllCommunities();
    if (userProfile) {
      await loadUserFollows();
    }
    setRefreshing(false);
  };

  // FIX 5: Search only filters, does NOT regenerate
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Always apply current filters when searching
    applyFilters(query, selectedFilter, selectedLeague);
  };

  // Pure filter function - no Firebase, no regeneration
  const applyFilters = (query: string, filter: 'all' | 'teams' | 'leagues', league: string | null) => {
    let filtered = [...allCommunities];
    
    // Step 1: Apply type filter first (All/Teams/Leagues)
    if (filter === 'teams') {
      filtered = filtered.filter(c => c.type === 'team');
    } else if (filter === 'leagues') {
      filtered = filtered.filter(c => c.type === 'league');
    }
    // If 'all', keep everything
    
    // Step 2: Apply league filter (only for teams)
    if (league && filter === 'teams') {
      filtered = filtered.filter(c => c.type === 'team' && c.league === league);
    }
    
    // Step 3: Apply search query (after other filters)
    if (query.trim().length > 0) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        (c.league && c.league.toLowerCase().includes(lowerQuery)) ||
        (c.country && c.country.toLowerCase().includes(lowerQuery))
      );
    }
    
    console.log(`🔍 Filters applied: ${filter}, league: ${league || 'all'}, query: "${query}", results: ${filtered.length}`);
    setDisplayedCommunities(filtered);
  };

  // FIX 4: Persist follow/unfollow to Firebase
  const handleFollowCommunity = async (community: Community) => {
    if (!userProfile) {
      console.log('⚠️ Cannot follow - no user profile');
      return;
    }
    
    try {
      const isFollowing = followedIds.has(community.id);
      
      if (isFollowing) {
        // Unfollow
        await communityService.unfollowCommunity(userProfile.uid, community.id, community.type);
        
        setFollowedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(community.id);
          return newSet;
        });
        
        setMyCommunities(prev => prev.filter(c => c.id !== community.id));
        
        console.log('✅ Unfollowed:', community.name);
      } else {
        // Follow
        await communityService.followCommunity(userProfile.uid, community.id, community.type);
        
        setFollowedIds(prev => new Set(prev).add(community.id));
        setMyCommunities(prev => [...prev, community]);
        
        console.log('✅ Followed:', community.name);
      }
    } catch (error) {
      // FIX 3: Handle Firebase permission errors
      console.error('❌ Error toggling follow (check Firebase rules):', error);
      alert('Unable to save. Please check your connection or sign in again.');
    }
  };

  const handleCommunityPress = (community: Community) => {
    if (community.type === 'team') {
      router.push(`/teamCommunity/${community.id}` as any);
    } else {
      router.push(`/leagueCommunity/${community.id}` as any);
    }
  };

  const applyFilter = (filter: 'all' | 'teams' | 'leagues') => {
    console.log(`🎯 Filter changed to: ${filter}`);
    setSelectedFilter(filter);
    setSelectedLeague(null); // Reset league filter when changing type
    applyFilters(searchQuery, filter, null);
  };

  const applyLeagueFilter = (leagueName: string | null) => {
    console.log(`⚽ League filter changed to: ${leagueName || 'All Leagues'}`);
    setSelectedLeague(leagueName);
    applyFilters(searchQuery, selectedFilter, leagueName);
  };

  const getAvailableLeagues = (): string[] => {
    const leagues = new Set<string>();
    allCommunities.forEach(c => {
      if (c.type === 'team' && c.league) {
        leagues.add(c.league);
      }
    });
    return Array.from(leagues).sort();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Communities</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
              <Ionicons name="search" size={24} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.profileButton}>
              <Ionicons name="person" size={20} color="#0066CC" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Loading communities...</Text>
        </View>
      </View>
    );
  }

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
  const renderMyCommunities = () => {
    if (myCommunities.length === 0) return null;
    
    return (
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
              key={`my-${community.type}-${community.id}`}
              style={styles.myTeamCard}
              onPress={() => handleCommunityPress(community)}
            >
              <View style={styles.myTeamHeader}>
                {community.logo ? (
                  <Image 
                    source={{ uri: community.logo }} 
                    style={styles.myTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.myTeamLogoPlaceholder}>
                    <Ionicons name={community.type === 'team' ? 'shield' : 'trophy'} size={32} color="#0066CC" />
                  </View>
                )}
              </View>
              <Text style={styles.myTeamName} numberOfLines={2}>
                {community.name}
              </Text>
              {community.type === 'team' && community.league && (
                <Text style={styles.myTeamLeague} numberOfLines={1}>{community.league}</Text>
              )}
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
  };

  // Suggested communities section
  const renderSuggested = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.trendingHeader}>
          <Ionicons name="flame" size={24} color="#FF3B30" />
          <Text style={styles.sectionTitle}>Popular Leagues</Text>
        </View>
        <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
          <Text style={styles.seeAllButton}>See All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.suggestedGrid}>
        {suggestedCommunities.slice(0, 6).map(community => (
          <TouchableOpacity
            key={`suggested-${community.type}-${community.id}`}
            style={styles.suggestedCard}
            onPress={() => handleCommunityPress(community)}
          >
            {community.logo ? (
              <Image 
                source={{ uri: community.logo }} 
                style={styles.suggestedLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.suggestedLogoPlaceholder}>
                <Ionicons name="trophy" size={24} color="#0066CC" />
              </View>
            )}
            <View style={styles.suggestedInfo}>
              <Text style={styles.suggestedName} numberOfLines={1}>{community.name}</Text>
              {community.country && (
                <Text style={styles.suggestedCountry}>{community.country}</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[
                styles.followButton,
                followedIds.has(community.id) && styles.followedButton
              ]}
              onPress={(e) => {
                e.stopPropagation();
                handleFollowCommunity(community);
              }}
            >
              <Ionicons 
                name={followedIds.has(community.id) ? 'checkmark' : 'add'} 
                size={20} 
                color={followedIds.has(community.id) ? '#0066CC' : '#FFF'} 
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // FIX 1: ALL COMMUNITIES shown immediately
  const renderAllCommunities = () => {
    const teams = allCommunities.filter(c => c.type === 'team');
    const leagues = allCommunities.filter(c => c.type === 'league');
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Communities</Text>
          <Text style={styles.sectionCount}>{allCommunities.length}</Text>
        </View>
        
        <Text style={styles.subsectionTitle}>Leagues ({leagues.length})</Text>
        {leagues.slice(0, 10).map(community => (
          <TouchableOpacity
            key={`all-${community.type}-${community.id}`}
            style={styles.communityListItem}
            onPress={() => handleCommunityPress(community)}
          >
            {community.logo ? (
              <Image 
                source={{ uri: community.logo }} 
                style={styles.communityListLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.communityListLogoPlaceholder}>
                <Ionicons name="trophy" size={24} color="#0066CC" />
              </View>
            )}
            <View style={styles.communityListInfo}>
              <Text style={styles.communityListName}>{community.name}</Text>
              {community.country && (
                <Text style={styles.communityListMeta}>{community.country}</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[
                styles.followButtonSmall,
                followedIds.has(community.id) && styles.followedButtonSmall
              ]}
              onPress={(e) => {
                e.stopPropagation();
                handleFollowCommunity(community);
              }}
            >
              <Ionicons 
                name={followedIds.has(community.id) ? 'checkmark' : 'add'} 
                size={16} 
                color={followedIds.has(community.id) ? '#0066CC' : '#FFF'} 
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        
        <Text style={[styles.subsectionTitle, { marginTop: 20 }]}>Teams ({teams.length})</Text>
        {teams.slice(0, 20).map(community => (
          <TouchableOpacity
            key={`all-${community.type}-${community.id}`}
            style={styles.communityListItem}
            onPress={() => handleCommunityPress(community)}
          >
            {community.logo ? (
              <Image 
                source={{ uri: community.logo }} 
                style={styles.communityListLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.communityListLogoPlaceholder}>
                <Ionicons name="shield" size={24} color="#0066CC" />
              </View>
            )}
            <View style={styles.communityListInfo}>
              <Text style={styles.communityListName}>{community.name}</Text>
              {community.league && (
                <Text style={styles.communityListMeta}>{community.league}</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[
                styles.followButtonSmall,
                followedIds.has(community.id) && styles.followedButtonSmall
              ]}
              onPress={(e) => {
                e.stopPropagation();
                handleFollowCommunity(community);
              }}
            >
              <Ionicons 
                name={followedIds.has(community.id) ? 'checkmark' : 'add'} 
                size={16} 
                color={followedIds.has(community.id) ? '#0066CC' : '#FFF'} 
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        
        <TouchableOpacity 
          style={styles.seeMoreButton}
          onPress={() => setSearchModalVisible(true)}
        >
          <Text style={styles.seeMoreText}>See All {allCommunities.length} Communities</Text>
          <Ionicons name="chevron-forward" size={20} color="#0066CC" />
        </TouchableOpacity>
      </View>
    );
  };

  // Search Modal
  const renderSearchModal = () => (
    <Modal
      visible={searchModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Find Communities</Text>
          <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
            <Ionicons name="close" size={28} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams, leagues..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === 'all' && styles.filterChipActive]}
            onPress={() => applyFilter('all')}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'all' && styles.filterChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === 'teams' && styles.filterChipActive]}
            onPress={() => applyFilter('teams')}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'teams' && styles.filterChipTextActive]}>
              Teams
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === 'leagues' && styles.filterChipActive]}
            onPress={() => applyFilter('leagues')}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'leagues' && styles.filterChipTextActive]}>
              Leagues
            </Text>
          </TouchableOpacity>
        </View>

        {/* League Filter (for teams only) */}
        {selectedFilter === 'teams' && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.leagueFiltersRow}
          >
            <TouchableOpacity
              style={[styles.leagueChip, !selectedLeague && styles.leagueChipActive]}
              onPress={() => applyLeagueFilter(null)}
            >
              <Text style={[styles.leagueChipText, !selectedLeague && styles.leagueChipTextActive]}>
                All Leagues
              </Text>
            </TouchableOpacity>
            {getAvailableLeagues().map(league => (
              <TouchableOpacity
                key={league}
                style={[styles.leagueChip, selectedLeague === league && styles.leagueChipActive]}
                onPress={() => applyLeagueFilter(league)}
              >
                <Text style={[styles.leagueChipText, selectedLeague === league && styles.leagueChipTextActive]}>
                  {league}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Results Count */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {displayedCommunities.length} {displayedCommunities.length === 1 ? 'community' : 'communities'}
          </Text>
        </View>

        {/* Results List */}
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {displayedCommunities.map(community => (
            <TouchableOpacity
              key={`search-${community.type}-${community.id}`}
              style={styles.searchResultItem}
              onPress={() => {
                handleCommunityPress(community);
                setSearchModalVisible(false);
              }}
            >
              {community.logo ? (
                <Image 
                  source={{ uri: community.logo }} 
                  style={styles.searchResultLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.searchResultLogoPlaceholder}>
                  <Ionicons 
                    name={community.type === 'team' ? 'shield' : 'trophy'} 
                    size={24} 
                    color="#0066CC" 
                  />
                </View>
              )}
              <View style={styles.searchResultInfo}>
                <Text style={styles.searchResultName}>{community.name}</Text>
                <Text style={styles.searchResultMeta}>
                  {community.type === 'team' ? community.league : community.country}
                </Text>
              </View>
              <TouchableOpacity 
                style={[
                  styles.followButtonSearch,
                  followedIds.has(community.id) && styles.followedButtonSearch
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleFollowCommunity(community);
                }}
              >
                <Ionicons 
                  name={followedIds.has(community.id) ? 'checkmark' : 'add'} 
                  size={20} 
                  color={followedIds.has(community.id) ? '#0066CC' : '#FFF'} 
                />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSearchModalVisible(true)}>
            <Ionicons name="search" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.profileButton}>
            <Ionicons name="person" size={20} color="#0066CC" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {myCommunities.length === 0 ? renderEmptyState() : (
          <>
            {renderMyCommunities()}
            {renderSuggested()}
            {renderAllCommunities()}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 20,
    backgroundColor: '#FFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  findCommunitiesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 14,
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
    marginTop: 24,
  },
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
  sectionCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seeAllButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 8,
  },
  
  // My Communities
  horizontalScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  myTeamCard: {
    width: 140,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  myTeamHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  myTeamLogo: {
    width: 64,
    height: 64,
  },
  myTeamLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  myTeamName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    minHeight: 36,
  },
  myTeamLeague: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  addTeamCard: {
    width: 140,
    backgroundColor: '#F0F7FF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0066CC',
    borderStyle: 'dashed',
  },
  addTeamText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
    marginTop: 8,
  },
  
  // Suggested
  suggestedGrid: {
    paddingHorizontal: 20,
    gap: 12,
  },
  suggestedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  suggestedLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  suggestedLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestedInfo: {
    flex: 1,
  },
  suggestedName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  suggestedCountry: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  followButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followedButton: {
    backgroundColor: '#E8F1FF',
  },
  
  // All Communities List
  communityListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  communityListLogo: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  communityListLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  communityListInfo: {
    flex: 1,
  },
  communityListName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  communityListMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  followButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followedButtonSmall: {
    backgroundColor: '#E8F1FF',
  },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    gap: 8,
  },
  seeMoreText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  
  // Search Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  filterChipActive: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  leagueFiltersRow: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  leagueChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  leagueChipActive: {
    backgroundColor: '#E8F1FF',
    borderColor: '#0066CC',
  },
  leagueChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  leagueChipTextActive: {
    color: '#0066CC',
  },
  resultsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalContent: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  searchResultLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  searchResultLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  searchResultMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  followButtonSearch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followedButtonSearch: {
    backgroundColor: '#E8F1FF',
  },
});
