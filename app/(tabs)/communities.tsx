// app/(tabs)/communities.tsx
// FIXED: Immediate load, stable generation, filtered search, Firebase persistence

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  FlatList,
  InteractionManager,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandedLoading } from '../../components/BrandedLoading';
import { shadow } from '../../components/styleUtils';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { Community, communityService } from '../../services/communityService';
import { chatService } from '../../services/chatService';
import { useTheme } from '../../context/ThemeContext';
import { SPOTLIGHT_LEAGUE_NAMES } from '../../constants/footballCompetitions';
import { getPrefetchedAppData } from '../../services/prefetchService';
import { ProfileQuickAccessButton } from '../../components/ProfileQuickAccessButton';

export default function CommunitiesScreen() {
  const router = useRouter();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const prefetchedCommunities = useMemo(
    () => getPrefetchedAppData()?.communities ?? [],
    []
  );
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            border: '#2C2C2E',
            placeholder: '#2C2C2E',
            chip: '#1C1C1E',
            chipActive: '#1B3A66',
            chipText: '#A1A1A6',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5E5',
            placeholder: '#F0F0F0',
            chip: '#FFFFFF',
            chipActive: '#0066CC',
            chipText: '#666666',
          },
    [isDark]
  );
  const isCompactPhone = Platform.OS === 'ios' && width < 395;
  const enableClippedSubviews = Platform.OS === 'android';
  
  // State
  const [loading, setLoading] = useState(prefetchedCommunities.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [allCommunities, setAllCommunities] = useState<Community[]>(prefetchedCommunities);
  const [displayedCommunities, setDisplayedCommunities] = useState<Community[]>(prefetchedCommunities);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [popularLeagueCommunities, setPopularLeagueCommunities] = useState<Community[]>([]);
  const [popularCommunityCommunities, setPopularCommunityCommunities] = useState<Community[]>([]);
  const [suggestedCommunities, setSuggestedCommunities] = useState<Community[]>(
    prefetchedCommunities.filter((community) => community.type === 'league')
  );
  const [memberCounts, setMemberCounts] = useState<Record<number, number>>({});
  const [activeCommunityIds, setActiveCommunityIds] = useState<Set<string>>(new Set());

  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'teams' | 'leagues' | 'tournaments'>('all');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [modalTitleOverride, setModalTitleOverride] = useState<string | null>(null);
  const [modalResultsOverride, setModalResultsOverride] = useState<Community[] | null>(null);
  const [preserveModalOrder, setPreserveModalOrder] = useState(false);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  
  // Follow state
  const [followedTeamIds, setFollowedTeamIds] = useState<Set<number>>(new Set());
  const [followedLeagueIds, setFollowedLeagueIds] = useState<Set<number>>(new Set());
  const [followedWorldcupIds, setFollowedWorldcupIds] = useState<Set<number>>(new Set());

  // Keep follows in sync with Firestore — subscribe once on mount, not on every focus.
  // Tab is never unmounted (freezeOnBlur=true keeps it alive) so this runs for app lifetime.
  useEffect(() => {
    if (!userProfile) return;
    return communityService.subscribeToUserCommunities(userProfile.uid, (data) => {
      setFollowedTeamIds(new Set(data.followedTeams));
      setFollowedLeagueIds(new Set(data.followedLeagues));
      setFollowedWorldcupIds(new Set(data.followedWorldcups || []));
    });
  }, [userProfile]);

  const isFollowingCommunity = useCallback((community: Community) => {
    if (community.type === 'team') return followedTeamIds.has(community.id);
    if (community.type === 'league') return followedLeagueIds.has(community.id);
    return followedWorldcupIds.has(community.id);
  }, [followedLeagueIds, followedTeamIds, followedWorldcupIds]);

  // Load active community IDs (communities with messages in last 24h) for unread dot indicator
  useEffect(() => {
    if (allCommunities.length === 0) return;
    let active = true;
    const load = async () => {
      try {
        const ids = allCommunities
          .filter((c) => c.type === 'team' || c.type === 'league')
          .slice(0, 30)
          .map((c) => String(c.id));
        const threads = await chatService.getHotCommunityThreads(ids, 10);
        if (!active) return;
        setActiveCommunityIds(new Set(threads.map((t) => t.communityId)));
      } catch { /* ignore */ }
    };
    void load();
    return () => { active = false; };
  }, [allCommunities]);

  const TOP_FIVE_LEAGUES = useMemo(
    () => new Set(SPOTLIGHT_LEAGUE_NAMES.map((name) => name.toLowerCase())),
    []
  );
  const LEAGUE_SPOTLIGHT = useMemo(
    () => new Set(SPOTLIGHT_LEAGUE_NAMES.map((name) => name.toLowerCase())),
    []
  );
  const POPULAR_COMMUNITY_ORDER = useMemo(
    () => [
      { aliases: ['premier league'] },
      { aliases: ['la liga'] },
      { aliases: ['real madrid'] },
      { aliases: ['barcelona'] },
      { aliases: ['liverpool'] },
      { aliases: ['manchester city'] },
      { aliases: ['arsenal'] },
      { aliases: ['mls', 'major league soccer'] },
      { aliases: ['manchester united'] },
      { aliases: ['bayern munich'] },
    ],
    []
  );
  const isLeagueSpotlightCommunity = useCallback(
    (community: Community) => {
      if (community.type !== 'league') return false;
      const name = community.name.toLowerCase().trim();
      return TOP_FIVE_LEAGUES.has(name) || LEAGUE_SPOTLIGHT.has(name);
    },
    [TOP_FIVE_LEAGUES, LEAGUE_SPOTLIGHT]
  );
  const isTournamentCommunity = useCallback(
    (community: Community) => {
      if (community.type === 'worldcup') return true;
      if (community.type !== 'league') return false;
      const name = community.name.toLowerCase().trim();
      return !(TOP_FIVE_LEAGUES.has(name) || LEAGUE_SPOTLIGHT.has(name));
    },
    [TOP_FIVE_LEAGUES, LEAGUE_SPOTLIGHT]
  );

  const dedupeVisibleCommunities = useCallback((communities: Community[]) => {
    const byKey = new Map<string, Community>();
    const makeKey = (community: Community) => {
      const normalizedName = community.name.toLowerCase().trim().replace(/^fifa\s+/i, '');
      if (community.type === 'worldcup' || normalizedName.includes('world cup')) {
        return `tournament:${normalizedName}`;
      }
      return `${community.type}:${community.id}`;
    };

    for (const community of communities) {
      const key = makeKey(community);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, community);
        continue;
      }
      if (community.type === 'worldcup' && existing.type !== 'worldcup') {
        byKey.set(key, community);
      }
    }

    return Array.from(byKey.values());
  }, []);

  const mergeUniqueCommunities = useCallback(
    (communities: Community[]) => dedupeVisibleCommunities(communities),
    [dedupeVisibleCommunities]
  );

  useEffect(() => {
    if (allCommunities.length === 0) return;
    const myComms = allCommunities.filter(c => isFollowingCommunity(c));
    setMyCommunities(mergeUniqueCommunities(myComms));
  }, [allCommunities, isFollowingCommunity, mergeUniqueCommunities]);

  const deriveSuggested = useCallback((communities: Community[]) => communities.filter(c => c.type === 'league'), []);

  const tournamentCommunities = useMemo(
    () => dedupeVisibleCommunities(allCommunities.filter(isTournamentCommunity)),
    [allCommunities, dedupeVisibleCommunities, isTournamentCommunity]
  );
  const visibleMyCommunities = useMemo(
    () => mergeUniqueCommunities(myCommunities),
    [mergeUniqueCommunities, myCommunities]
  );

  const loadPopularLeagueCommunities = useCallback(async (sourceCommunities: Community[]) => {
    const next = await communityService.getTopLeaguesByMemberCount(sourceCommunities, 10);
    setPopularLeagueCommunities(next);
  }, []);

  const loadPopularCommunityCommunities = useCallback(async (sourceCommunities: Community[]) => {
    const teamCommunities = sourceCommunities.filter((c) => c.type === 'team');

    // First: match by preferred order aliases
    const preferred = POPULAR_COMMUNITY_ORDER
      .map((entry) =>
        teamCommunities.find((community) =>
          entry.aliases.some((alias) => community.name.toLowerCase().trim().includes(alias))
        )
      )
      .filter(Boolean) as Community[];

    // Fallback: top teams by heat ranking (teams only)
    const rankedFallback = await communityService.getTopCommunitiesByHeat(teamCommunities, 15);
    const seen = new Set<number>();
    const next = [...preferred, ...rankedFallback].filter((community) => {
      if (seen.has(community.id)) return false;
      seen.add(community.id);
      return true;
    });

    setPopularCommunityCommunities(next);
  }, [POPULAR_COMMUNITY_ORDER]);

  const displayPopularCommunityCommunities = useMemo(
    () => popularCommunityCommunities.slice(0, 10),
    [popularCommunityCommunities]
  );

  const loadAllCommunities = useCallback(async () => {
    try {
      const cachedSnapshot = await communityService.getCachedAllCommunitiesAsync();
      const cachedData = cachedSnapshot?.data?.length ? cachedSnapshot.data : prefetchedCommunities;

      if (cachedData.length > 0) {
        setAllCommunities(cachedData);
        setDisplayedCommunities(cachedData);
        setSuggestedCommunities(deriveSuggested(cachedData));
        void loadPopularLeagueCommunities(cachedData);
        void loadPopularCommunityCommunities(cachedData);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const fresh = await communityService.refreshCommunitiesIfStale();
      if (fresh) {
        const next = [...fresh.worldcups, ...fresh.teams, ...fresh.leagues];
        setAllCommunities(next);
        setDisplayedCommunities(next);
        setSuggestedCommunities(deriveSuggested(next));
        void loadPopularLeagueCommunities(next);
        void loadPopularCommunityCommunities(next);
      }
    } catch (error) {
      console.error('Error loading communities:', error);
    } finally {
      setLoading(false);
    }
  }, [deriveSuggested, loadPopularCommunityCommunities, loadPopularLeagueCommunities, prefetchedCommunities]);

  // FIX 1 & 2: Load communities immediately on mount, generate once
  useEffect(() => {
    if (allCommunities.length > 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void loadAllCommunities();
    });
    return () => {
      task.cancel();
    };
  }, [allCommunities.length, loadAllCommunities]);

  // Populate Popular/League sections when communities arrive via prefetch (skips loadAllCommunities)
  useEffect(() => {
    if (allCommunities.length === 0) return;
    if (popularCommunityCommunities.length > 0) return;
    void loadPopularCommunityCommunities(allCommunities);
    void loadPopularLeagueCommunities(allCommunities);
  }, [allCommunities, loadPopularCommunityCommunities, loadPopularLeagueCommunities, popularCommunityCommunities.length]);

  // Subscribe to member counts once when the visible community set stabilises.
  // Using a stable ref to avoid re-subscribing every focus or minor list change.
  const memberCountSubsRef = useRef<Map<number, () => void>>(new Map());
  useEffect(() => {
    if (allCommunities.length === 0) return;
    const ids = new Set<number>();
    myCommunities.forEach(c => ids.add(c.id));
    suggestedCommunities.forEach(c => ids.add(c.id));
    popularLeagueCommunities.forEach(c => ids.add(c.id));
    popularCommunityCommunities.forEach(c => ids.add(c.id));
    allCommunities.filter(c => c.type === 'team').slice(0, 20).forEach(c => ids.add(c.id));

    // Only subscribe to IDs we aren't already listening to
    const newIds = [...ids].filter(id => !memberCountSubsRef.current.has(id));
    const task = InteractionManager.runAfterInteractions(() => {
      newIds.forEach((communityId) => {
        if (memberCountSubsRef.current.has(communityId)) return;
        const community = allCommunities.find(c => c.id === communityId);
        const unsubscribe = communityService.listenMemberCount(
          communityId,
          (count) => {
            setMemberCounts(prev => prev[communityId] === count ? prev : { ...prev, [communityId]: count });
          },
          community?.docId,
          community?.type || 'team'
        );
        memberCountSubsRef.current.set(communityId, unsubscribe);
      });
    });

    return () => { task.cancel(); };
  }, [allCommunities, myCommunities, popularCommunityCommunities, popularLeagueCommunities, suggestedCommunities]);

  const loadUserFollows = useCallback(async () => {
    if (!userProfile) return;
    
    try {
      // FIX 4: Load user's followed community IDs from Firebase
      const userCommunities = await communityService.getUserCommunities(userProfile.uid);
      
      // Extract IDs
      const teams = new Set(userCommunities.followedTeams);
      const leagues = new Set(userCommunities.followedLeagues);
      const worldcups = new Set(userCommunities.followedWorldcups || []);
      
      setFollowedTeamIds(teams);
      setFollowedLeagueIds(leagues);
      setFollowedWorldcupIds(worldcups);
      
      // Filter allCommunities to get user's communities
      const myComms = allCommunities.filter((community) => {
        if (community.type === 'team') return teams.has(community.id);
        if (community.type === 'league') return leagues.has(community.id);
        return worldcups.has(community.id);
      });
      setMyCommunities(mergeUniqueCommunities(myComms));
      await communityService.ensureMemberships(userProfile.uid, myComms);
      
    } catch (error) {
      // Handle Firebase permission errors gracefully
      if (__DEV__) {
        console.warn('Error loading user follows (permissions?):', error);
      }
      // Continue without follows - don't break the screen
    }
  }, [allCommunities, mergeUniqueCommunities, userProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      communityService.clearCache();
      await loadAllCommunities();
      if (userProfile) {
        await loadUserFollows();
      }
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!userProfile) return;
      void loadUserFollows();
    }, [loadUserFollows, userProfile])
  );

  // FIX 5: Search only filters, does NOT regenerate
  const handleSearch = (query: string) => {
    setModalTitleOverride(null);
    setModalResultsOverride(null);
    setPreserveModalOrder(false);
    setSearchQuery(query);
    // Always apply current filters when searching
    applyFilters(query, selectedFilter, selectedLeague);
  };

  // Pure filter function - no Firebase, no regeneration
  const applyFilters = (query: string, filter: 'all' | 'teams' | 'leagues' | 'tournaments', league: string | null) => {
    let filtered = [...allCommunities];
    
    // Step 1: Apply type filter first (All/Teams/Leagues)
    if (filter === 'teams') {
      filtered = filtered.filter(c => c.type === 'team');
    } else if (filter === 'leagues') {
      filtered = filtered.filter(isLeagueSpotlightCommunity);
    } else if (filter === 'tournaments') {
      filtered = filtered.filter(isTournamentCommunity);
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
    
    filtered = dedupeVisibleCommunities(filtered);
    filtered.sort((a, b) => (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0));
    setDisplayedCommunities(filtered);
  };

  // FIX 4: Persist follow/unfollow to Firebase
  const handleFollowCommunity = async (community: Community) => {
    if (!userProfile) {
      setAuthPromptVisible(true);
      return;
    }
    
    try {
      const isFollowing = isFollowingCommunity(community);
      
      if (isFollowing) {
        // Unfollow
        await communityService.unfollowCommunity(userProfile.uid, community.id, community.type, community);
        
        if (community.type === 'team') {
          setFollowedTeamIds(prev => {
            const next = new Set(prev);
            next.delete(community.id);
            return next;
          });
        } else if (community.type === 'league') {
          setFollowedLeagueIds(prev => {
            const next = new Set(prev);
            next.delete(community.id);
            return next;
          });
        } else {
          setFollowedWorldcupIds(prev => {
            const next = new Set(prev);
            next.delete(community.id);
            return next;
          });
        }
        
        setMyCommunities(prev => prev.filter(c => !(c.id === community.id && c.type === community.type)));
        
      } else {
        // Follow
        await communityService.followCommunity(userProfile.uid, community.id, community.type, community);
        
        if (community.type === 'team') {
          setFollowedTeamIds(prev => new Set(prev).add(community.id));
        } else if (community.type === 'league') {
          setFollowedLeagueIds(prev => new Set(prev).add(community.id));
        } else {
          setFollowedWorldcupIds(prev => new Set(prev).add(community.id));
        }
        setMyCommunities(prev => mergeUniqueCommunities([...prev, community]));
        
      }
    } catch (error) {
      // FIX 3: Handle Firebase permission errors
      console.error('âŒ Error toggling follow (check Firebase rules):', error);
      alert('Unable to save. Please check your connection or sign in again.');
    }
  };

  const handleCommunityPress = (community: Community) => {
    if (community.type === 'team') {
      router.push({
        pathname: '/teamCommunity/[id]',
        params: {
          id: String(community.id),
          name: community.name,
          logo: community.logo || '',
        },
      } as any);
    } else if (community.type === 'worldcup') {
      router.push({
        pathname: '/worldCupCommunity/[id]',
        params: {
          id: String(community.id),
          name: community.name,
          logo: community.logo || '',
        },
      } as any);
    } else {
      router.push({
        pathname: '/leagueCommunity/[id]',
        params: {
          id: String(community.id),
          name: community.name,
          logo: community.logo || '',
        },
      } as any);
    }
  };

  const applyFilter = (filter: 'all' | 'teams' | 'leagues' | 'tournaments') => {
    setModalTitleOverride(null);
    setModalResultsOverride(null);
    setPreserveModalOrder(false);
    setSelectedFilter(filter);
    setSelectedLeague(null); // Reset league filter when changing type
    applyFilters(searchQuery, filter, null);
  };

  const openSearchWithFilter = (filter: 'all' | 'teams' | 'leagues' | 'tournaments') => {
    setSearchModalVisible(true);
    setModalTitleOverride(null);
    setModalResultsOverride(null);
    setPreserveModalOrder(false);
    applyFilter(filter);
  };

  const applyLeagueFilter = (leagueName: string | null) => {
    setModalTitleOverride(null);
    setModalResultsOverride(null);
    setPreserveModalOrder(false);
    setSelectedLeague(leagueName);
    applyFilters(searchQuery, selectedFilter, leagueName);
  };

  const openPresetList = (
    title: string,
    communities: Community[],
    filter: 'all' | 'teams' | 'leagues' | 'tournaments' = 'all',
    preserveOrder: boolean = false
  ) => {
    const sorted = preserveOrder
      ? dedupeVisibleCommunities(communities)
      : dedupeVisibleCommunities(communities).sort((a, b) => (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0));
    setSearchQuery('');
    setSelectedLeague(null);
    setSelectedFilter(filter);
    setModalTitleOverride(title);
    setModalResultsOverride(sorted);
    setPreserveModalOrder(preserveOrder);
    setDisplayedCommunities(sorted);
    setSearchModalVisible(true);
  };

  const openSearchModalDefault = () => {
    const sorted = dedupeVisibleCommunities(allCommunities).sort((a, b) => (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0));
    setModalTitleOverride(null);
    setModalResultsOverride(null);
    setPreserveModalOrder(false);
    setSearchQuery('');
    setSelectedLeague(null);
    setSelectedFilter('all');
    setDisplayedCommunities(sorted);
    setSearchModalVisible(true);
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

  const displayPopularLeagueCommunities = useMemo(() => {
    const fallbackIndex = new Map(popularLeagueCommunities.map((community, index) => [community.id, index]));
    return [...popularLeagueCommunities]
      .sort((a, b) => {
        const countDiff = (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0);
        if (countDiff !== 0) return countDiff;
        return (fallbackIndex.get(a.id) ?? 999) - (fallbackIndex.get(b.id) ?? 999);
      })
      .slice(0, 10);
  }, [memberCounts, popularLeagueCommunities]);

  const activeModalResults = useMemo(
    () => {
      const activeResults = modalResultsOverride ?? displayedCommunities;
      if (preserveModalOrder) {
        return activeResults;
      }
      return [...activeResults].sort(
        (a, b) => (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0)
      );
    },
    [displayedCommunities, memberCounts, modalResultsOverride, preserveModalOrder]
  );

  if (loading && allCommunities.length === 0) {
    return <BrandedLoading variant="launch" dark />;
  }

  // My Communities section
  const getCommunityLogoSource = (community: Community) => {
    const name = community.name.toLowerCase();
    if (community.type === 'worldcup' || name.includes('world cup')) return null;
    if (community.logo) return { uri: community.logo, cache: 'force-cache' as const };
    return null;
  };
  const shouldUseLeagueLogoPlate = (community: Community) => {
    if (!isDark) return false;
    if (community.type !== 'league') return false;
    const name = community.name.toLowerCase().trim();
    return (
      name.includes('premier league') ||
      name.includes('champions league') ||
      name.includes('europa league') ||
      name.includes('conference league') ||
      name.includes('la liga') ||
      name.includes('bundesliga') ||
      name.includes('ligue 1') ||
      name.includes('fa cup') ||
      name.includes('league cup') ||
      name.includes('efl cup') ||
      name.includes('community shield') ||
      name.includes('dfb pokal') ||
      name.includes('coppa italia') ||
      name.includes('copa del rey')
    );
  };
  const shouldHideLeagueLogoPlateBorder = (community: Community) =>
    community.type === 'league' && community.name.toLowerCase().trim().includes('bundesliga');
  const renderLeagueCardLogo = (
    community: Community,
    variant: 'suggested' | 'search' | 'popular'
  ) => {
    const source = getCommunityLogoSource(community);
    if (!source) return null;

    const usePlate = shouldUseLeagueLogoPlate(community);
    const isBorderlessBundesliga = shouldHideLeagueLogoPlateBorder(community);

    const wrapStyle =
      variant === 'suggested'
        ? styles.suggestedLogoWrap
        : variant === 'search'
          ? styles.searchResultLogoWrap
          : styles.popularLogoWrap;

    const imageStyle =
      variant === 'suggested'
        ? styles.suggestedLogo
        : variant === 'search'
          ? styles.searchResultLogo
          : styles.popularLogo;

    const plateImageStyle =
      variant === 'suggested'
        ? isBorderlessBundesliga
          ? styles.suggestedLogoPlateImageBundesliga
          : styles.suggestedLogoPlateImage
        : variant === 'search'
          ? isBorderlessBundesliga
            ? styles.searchResultLogoPlateImageBundesliga
            : styles.searchResultLogoPlateImage
          : isBorderlessBundesliga
            ? styles.popularLogoPlateImageBundesliga
            : styles.popularLogoPlateImage;

    if (!usePlate) {
      return <Image source={source as any} style={imageStyle} resizeMode="contain" />;
    }

    return (
      <View
        style={[
          wrapStyle,
          styles.leagueLogoOnDarkWrap,
          isBorderlessBundesliga && styles.leagueLogoOnDarkWrapNoBorder,
        ]}
      >
        <Image source={source as any} style={plateImageStyle} resizeMode="contain" />
      </View>
    );
  };

  // Suggested communities section
  const renderSuggested = () => {
    if (displayPopularLeagueCommunities.length === 0) return null;
    return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.trendingHeader}>
          <Ionicons name="trophy" size={20} color={palette.accent} />
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Popular Leagues</Text>
        </View>
        <TouchableOpacity onPress={() => openPresetList('Popular Leagues', displayPopularLeagueCommunities, 'leagues', true)}>
          <Text style={[styles.seeAllButton, { color: palette.accent }]}>See All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.popularStack}>
        {displayPopularLeagueCommunities.map((community, index) => (
          <TouchableOpacity
            key={`popular-league-${community.id}`}
            style={[styles.suggestedCard, { backgroundColor: palette.card }]}
            onPress={() => handleCommunityPress(community)}
          >
            <View style={[styles.popularRankBadge, { backgroundColor: isDark ? '#11253A' : '#EAF3FF' }]}>
              <Text style={[styles.popularRankText, { color: palette.accent }]}>{index + 1}</Text>
            </View>
            {getCommunityLogoSource(community) ? (
              renderLeagueCardLogo(community, 'suggested')
            ) : (
              <View style={[styles.suggestedLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                <Ionicons name="trophy" size={24} color={palette.accent} />
              </View>
            )}
            <View style={styles.suggestedInfo}>
              <Text style={[styles.suggestedName, { color: palette.text }]} numberOfLines={1}>
                {community.name}
              </Text>
              {community.country && (
                <Text style={[styles.suggestedCountry, { color: palette.subtext }]}>{community.country}</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[
                styles.followButton,
                { backgroundColor: palette.accent },
                isFollowingCommunity(community) && { backgroundColor: palette.card }
              ]}
              onPress={(e) => {
                e.stopPropagation();
                handleFollowCommunity(community);
              }}
            >
              <Ionicons 
                name={isFollowingCommunity(community) ? 'checkmark' : 'add'} 
                size={20} 
                color={isFollowingCommunity(community) ? palette.accent : '#FFF'} 
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
    );
  };

  const renderTournaments = () => {
    if (tournamentCommunities.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.trendingHeader}>
            <Ionicons name="trophy" size={24} color={palette.accent} />
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Tournaments</Text>
          </View>
          <TouchableOpacity onPress={() => openSearchWithFilter('tournaments')}>
            <Text style={[styles.seeAllButton, { color: palette.accent }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={[
            ...tournamentCommunities.filter((c) => c.type === 'worldcup'),
            ...tournamentCommunities
              .filter((c) => c.type !== 'worldcup')
              .sort((a, b) => (memberCounts[b.id] ?? 0) - (memberCounts[a.id] ?? 0))
              .slice(0, 5),
          ]}
          keyExtractor={(community) => `tournament-${community.type}-${community.id}`}
          renderItem={({ item: community }) => (
            <TouchableOpacity
              style={[styles.suggestedCard, { backgroundColor: palette.card }]}
              onPress={() => handleCommunityPress(community)}
            >
              {getCommunityLogoSource(community) ? (
                renderLeagueCardLogo(community, 'suggested')
              ) : (
                <View style={[styles.suggestedLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                  <Ionicons name="trophy" size={24} color={palette.accent} />
                </View>
              )}
              <View style={styles.suggestedInfo}>
                <Text style={[styles.suggestedName, { color: palette.text }]} numberOfLines={1}>
                  {community.name}
                </Text>
                {community.country && (
                  <Text style={[styles.suggestedCountry, { color: palette.subtext }]}>{community.country}</Text>
                )}
              </View>
              <TouchableOpacity 
                style={[
                  styles.followButton,
                  { backgroundColor: palette.accent },
                  isFollowingCommunity(community) && { backgroundColor: palette.card }
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleFollowCommunity(community);
                }}
              >
                <Ionicons 
                  name={isFollowingCommunity(community) ? 'checkmark' : 'add'} 
                  size={20} 
                  color={isFollowingCommunity(community) ? palette.accent : '#FFF'} 
                />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.suggestedGrid}
          scrollEnabled={false}
          initialNumToRender={6}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={enableClippedSubviews}
        />
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
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: palette.background }]} edges={['bottom']}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: palette.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Math.max(insets.top, 12)}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16), backgroundColor: palette.card }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{modalTitleOverride || 'Find Communities'}</Text>
          <TouchableOpacity onPress={() => {
            setSearchModalVisible(false);
            setModalTitleOverride(null);
            setModalResultsOverride(null);
            setPreserveModalOrder(false);
          }}>
              <Ionicons name="close" size={28} color={palette.text} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="search" size={20} color={palette.subtext} />
          <TextInput
            style={[styles.searchInput, { color: palette.text }]}
            placeholder="Search teams, leagues, tournaments..."
            placeholderTextColor={palette.subtext}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={20} color={palette.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filters */}
          <View style={styles.filtersRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: palette.chip, borderColor: palette.border },
                selectedFilter === 'all' && { backgroundColor: palette.chipActive, borderColor: palette.accent }
              ]}
              onPress={() => applyFilter('all')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: palette.chipText },
                  selectedFilter === 'all' && { color: '#FFF' }
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: palette.chip, borderColor: palette.border },
                selectedFilter === 'teams' && { backgroundColor: palette.chipActive, borderColor: palette.accent }
              ]}
              onPress={() => applyFilter('teams')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: palette.chipText },
                  selectedFilter === 'teams' && { color: '#FFF' }
                ]}
              >
                Teams
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: palette.chip, borderColor: palette.border },
                selectedFilter === 'leagues' && { backgroundColor: palette.chipActive, borderColor: palette.accent }
              ]}
              onPress={() => applyFilter('leagues')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: palette.chipText },
                  selectedFilter === 'leagues' && { color: '#FFF' }
                ]}
              >
                Leagues
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: palette.chip, borderColor: palette.border },
                selectedFilter === 'tournaments' && { backgroundColor: palette.chipActive, borderColor: palette.accent }
              ]}
              onPress={() => applyFilter('tournaments')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: palette.chipText },
                  selectedFilter === 'tournaments' && { color: '#FFF' }
                ]}
              >
                Tournaments
              </Text>
            </TouchableOpacity>
          </View>

          {/* League Filter (for teams only) */}
          {selectedFilter === 'teams' && (
            <FlatList
              horizontal
              data={getAvailableLeagues()}
              keyExtractor={(league) => league}
              style={styles.leagueFiltersList}
              renderItem={({ item: league }) => (
                <TouchableOpacity
                  style={[
                    styles.leagueChip,
                    { backgroundColor: palette.chip, borderColor: palette.border },
                    selectedLeague === league && { backgroundColor: palette.chipActive, borderColor: palette.accent }
                  ]}
                  onPress={() => applyLeagueFilter(league)}
                >
                  <Text
                    style={[
                      styles.leagueChipText,
                      { color: palette.chipText },
                      selectedLeague === league && { color: '#FFF' }
                    ]}
                  >
                    {league}
                  </Text>
                </TouchableOpacity>
              )}
              ListHeaderComponent={(
                <TouchableOpacity
                  style={[
                    styles.leagueChip,
                    { backgroundColor: palette.chip, borderColor: palette.border },
                    !selectedLeague && { backgroundColor: palette.chipActive, borderColor: palette.accent }
                  ]}
                  onPress={() => applyLeagueFilter(null)}
                >
                  <Text
                    style={[
                      styles.leagueChipText,
                      { color: palette.chipText },
                      !selectedLeague && { color: '#FFF' }
                    ]}
                  >
                    All Leagues
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.leagueFiltersRow}
              initialNumToRender={10}
              windowSize={5}
              maxToRenderPerBatch={12}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews={enableClippedSubviews}
            />
          )}

          {/* Results Count */}
          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsCount, { color: palette.subtext }]}>
              {activeModalResults.length} {activeModalResults.length === 1 ? 'community' : 'communities'}
            </Text>
          </View>

          {/* Results List */}
          <FlatList
            style={styles.modalContent}
            data={activeModalResults}
            keyExtractor={(community) => `search-${community.type}-${community.id}`}
            renderItem={({ item: community }) => (
              <TouchableOpacity
                style={[styles.searchResultItem, { backgroundColor: palette.card }]}
                onPress={() => {
                  handleCommunityPress(community);
                  setSearchModalVisible(false);
                  setModalTitleOverride(null);
                  setModalResultsOverride(null);
                  setPreserveModalOrder(false);
                }}
              >
                {getCommunityLogoSource(community) ? (
                  renderLeagueCardLogo(community, 'search')
                ) : (
                  <View style={[styles.searchResultLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                    <Ionicons 
                      name={community.type === 'team' ? 'shield' : 'trophy'} 
                      size={24} 
                      color={palette.accent} 
                    />
                  </View>
                )}
                <View style={styles.searchResultInfo}>
                  <Text style={[styles.searchResultName, { color: palette.text }]}>{community.name}</Text>
                  <Text style={[styles.searchResultMeta, { color: palette.subtext }]}>
                    {community.type === 'team' ? community.league : community.country}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.followButtonSearch,
                    { backgroundColor: palette.accent },
                    isFollowingCommunity(community) && { backgroundColor: palette.card }
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleFollowCommunity(community);
                  }}
                >
                  <Ionicons 
                    name={isFollowingCommunity(community) ? 'checkmark' : 'add'} 
                    size={20} 
                    color={isFollowingCommunity(community) ? palette.accent : '#FFF'} 
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            windowSize={7}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={enableClippedSubviews}
            ListFooterComponent={<View style={{ height: 40 }} />}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  const renderAuthPromptModal = () => (
    <Modal
      visible={authPromptVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setAuthPromptVisible(false)}
    >
      <View style={styles.authPromptOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setAuthPromptVisible(false)}
        />
        <View
          style={[
            styles.authPromptSheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom + 14, 24),
            },
          ]}
        >
          <View style={styles.authPromptHandle} />
          <View style={[styles.authPromptIcon, { backgroundColor: isDark ? '#0D2034' : '#EAF3FF' }]}>
            <Ionicons name="people" size={24} color={palette.accent} />
          </View>
          <Text style={[styles.authPromptTitle, { color: palette.text }]}>Follow communities</Text>
          <Text style={[styles.authPromptCopy, { color: palette.subtext }]}>
            Create an account or log in to join communities, personalize your feed, and keep your favorites synced.
          </Text>
          <TouchableOpacity
            style={[styles.authPromptPrimary, { backgroundColor: palette.accent }]}
            activeOpacity={0.86}
            onPress={() => {
              setAuthPromptVisible(false);
              router.push('/(auth)/signup' as any);
            }}
          >
            <Text style={styles.authPromptPrimaryText}>Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.authPromptSecondary, { backgroundColor: isDark ? '#101A27' : '#F3F7FC', borderColor: palette.border }]}
            activeOpacity={0.86}
            onPress={() => {
              setAuthPromptVisible(false);
              router.push('/(auth)/login' as any);
            }}
          >
            <Text style={[styles.authPromptSecondaryText, { color: palette.text }]}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authPromptCancel}
            activeOpacity={0.75}
            onPress={() => setAuthPromptVisible(false)}
          >
            <Text style={[styles.authPromptCancelText, { color: palette.subtext }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderHubMyCommunities = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>My Communities</Text>
        <TouchableOpacity onPress={() => openPresetList('My Communities', visibleMyCommunities, 'all')}>
          <Text style={[styles.seeAllButton, { color: palette.accent }]}>See All</Text>
        </TouchableOpacity>
      </View>
      {visibleMyCommunities.length === 0 ? (
        <TouchableOpacity
          style={[styles.hubEmptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}
          onPress={() => setSearchModalVisible(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="people-outline" size={20} color={palette.accent} />
          <Text style={[styles.hubEmptyTitle, { color: palette.text }]}>No communities yet</Text>
          <Text style={[styles.hubEmptyMeta, { color: palette.subtext }]}>Join teams, leagues, and tournaments to build your hub.</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          horizontal
          data={visibleMyCommunities.slice(0, 10)}
          keyExtractor={(community) => `my-hub-${community.type}-${community.id}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.myTeamCard, { backgroundColor: palette.card, borderColor: palette.border }]}
              onPress={() => handleCommunityPress(item)}
              activeOpacity={0.9}
            >
              {activeCommunityIds.has(String(item.id)) && (
                <View style={styles.activityDot} />
              )}
              <View style={styles.myTeamHeader}>
                {getCommunityLogoSource(item) ? (
                  <View style={item.type === 'league' ? styles.myLeagueLogoFrame : undefined}>
                    {item.type === 'league' && shouldUseLeagueLogoPlate(item) ? (
                      <View
                        style={[
                          styles.myLeagueLogoPlate,
                          {
                            borderColor: `${palette.accent}55`,
                            backgroundColor: isDark ? 'rgba(243, 247, 252, 0.96)' : 'rgba(255,255,255,0.98)',
                          },
                        ]}
                      >
                        <Image
                          source={getCommunityLogoSource(item) as any}
                          style={styles.myLeagueLogo}
                          resizeMode="contain"
                        />
                      </View>
                    ) : (
                      <Image
                        source={getCommunityLogoSource(item) as any}
                        style={item.type === 'league' ? styles.myLeagueLogo : styles.myTeamLogo}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                ) : (
                  <View style={[styles.myTeamLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                    <Ionicons name={item.type === 'team' ? 'shield' : 'trophy'} size={28} color={palette.accent} />
                  </View>
                )}
              </View>
              <Text style={[styles.myTeamName, { color: palette.text }]} numberOfLines={2}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScrollContent}
        />
      )}
    </View>
  );


  const renderCommunityStudio = () => (
    <View style={styles.studioWrap}>
      <View style={[styles.studioCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <View style={styles.studioTopRow}>
          <View style={styles.studioCopy}>
            <Text style={[styles.studioEyebrow, { color: palette.accent }]}>Community Hubs</Text>
            <Text style={[styles.studioTitle, { color: palette.text }]}>Browse faster.</Text>
          </View>
          <TouchableOpacity
            style={[styles.studioButton, { backgroundColor: isDark ? '#0F2033' : '#EAF3FF', borderColor: palette.border }]}
            onPress={openSearchModalDefault}
            activeOpacity={0.88}
          >
            <Ionicons name="search" size={16} color={palette.accent} />
            <Text style={[styles.studioButtonText, { color: palette.accent }]}>Browse All</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.studioStatRow}>
          <TouchableOpacity
            style={[styles.studioStatCard, { backgroundColor: isDark ? '#0D1722' : '#F8FBFF', borderColor: palette.border }]}
            onPress={() =>
              visibleMyCommunities.length > 0
                ? openPresetList('My Communities', visibleMyCommunities, 'all')
                : openSearchModalDefault()
            }
            activeOpacity={0.88}
          >
            <Text style={[styles.studioStatValue, { color: palette.text }]}>{visibleMyCommunities.length}</Text>
            <Text style={[styles.studioStatLabel, { color: palette.subtext }]}>Joined</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.studioStatCard, { backgroundColor: isDark ? '#0D1722' : '#F8FBFF', borderColor: palette.border }]}
            onPress={openSearchModalDefault}
            activeOpacity={0.88}
          >
            <Text style={[styles.studioStatValue, { color: palette.text }]}>{allCommunities.length}</Text>
            <Text style={[styles.studioStatLabel, { color: palette.subtext }]}>Open Rooms</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.studioFilterRow}
        >
          {categoryCards.map((card) => (
            <TouchableOpacity
              key={`studio-filter-${card.key}`}
              style={[styles.studioFilterChip, { backgroundColor: isDark ? '#0D1722' : '#F8FBFF', borderColor: palette.border }]}
              onPress={card.onPress}
              activeOpacity={0.88}
            >
              <Ionicons name={card.icon as any} size={14} color={card.iconColor} />
              <Text style={[styles.studioFilterText, { color: palette.text }]}>{card.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderPopularNow = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Popular Communities</Text>
        <TouchableOpacity
          onPress={() =>
            openPresetList(
              'Popular Communities',
              displayPopularCommunityCommunities,
              'all',
              true
            )
          }
        >
          <Text style={[styles.seeAllButton, { color: palette.accent }]}>See All</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.popularStack}>
        {displayPopularCommunityCommunities.map((community, index) => (
          <TouchableOpacity
            key={`popular-${community.type}-${community.id}`}
            style={[styles.popularMiniCard, { backgroundColor: palette.card, borderColor: palette.border }]}
            onPress={() => handleCommunityPress(community)}
            activeOpacity={0.9}
          >
            <View style={[styles.popularRankBadge, { backgroundColor: isDark ? '#1B3A66' : '#E8F1FF' }]}>
              <Text style={[styles.popularRankText, { color: palette.accent }]}>{index + 1}</Text>
            </View>
            {getCommunityLogoSource(community) ? (
              renderLeagueCardLogo(community, 'popular')
            ) : (
              <View style={[styles.popularLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                <Ionicons name={community.type === 'team' ? 'shield' : 'trophy'} size={18} color={palette.accent} />
              </View>
            )}
            <View style={styles.popularTextWrap}>
              <Text style={[styles.popularName, { color: palette.text }]} numberOfLines={1}>
                {community.name}
              </Text>
              <Text style={[styles.popularMeta, { color: palette.subtext }]} numberOfLines={1}>
                {community.type === 'team'
                  ? (community.league || community.country || 'Club')
                  : (community.country || 'League')}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.popularFollowButton,
                { backgroundColor: palette.accent, borderColor: palette.accent },
                isFollowingCommunity(community) && { backgroundColor: palette.card, borderColor: palette.border }
              ]}
              onPress={(e) => {
                e.stopPropagation();
                handleFollowCommunity(community);
              }}
            >
              <Ionicons
                name={isFollowingCommunity(community) ? 'checkmark' : 'add'}
                size={18}
                color={isFollowingCommunity(community) ? palette.accent : '#FFF'}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const categoryCards = [
    {
      key: 'popular',
      icon: 'flame',
      iconColor: '#FF5A36',
      title: 'Popular Communities',
      subtitle: 'Explore trending chats',
      onPress: () =>
        openPresetList(
          'Popular Communities',
          displayPopularCommunityCommunities,
          'all',
          true
        ),
    },
    {
      key: 'leagues',
      icon: 'trophy',
      iconColor: '#4DA3FF',
      title: 'Leagues',
      subtitle: 'Europe, MLS, Liga MX, J1, Primeira',
      onPress: () => openSearchWithFilter('leagues'),
    },
    {
      key: 'tournaments',
      icon: 'earth',
      iconColor: '#58C27D',
      title: 'Tournaments',
      subtitle: 'World Cup, Champions League, and cross-league comps',
      onPress: () => openSearchWithFilter('tournaments'),
    },
    {
      key: 'teams',
      icon: 'football',
      iconColor: '#F6C445',
      title: 'Teams',
      subtitle: 'Find team fan arenas',
      onPress: () => openSearchWithFilter('teams'),
    },
  ] as const;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={[]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top + (isCompactPhone ? 2 : 4), isCompactPhone ? 22 : 40),
            paddingBottom: isCompactPhone ? 6 : 8,
            backgroundColor: palette.card,
          },
        ]}
      >
        <View style={[styles.headerSide, { width: isCompactPhone ? 116 : 126 }]}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>Communities</Text>
        </View>
        <View style={[styles.headerActions, styles.headerActionsRail, { width: isCompactPhone ? 116 : 126 }]}>
          <TouchableOpacity onPress={openSearchModalDefault}>
            <Ionicons name="search" size={isCompactPhone ? 22 : 24} color={palette.text} />
          </TouchableOpacity>
          <ProfileQuickAccessButton
            initial={(userProfile?.username || 'U')[0] || 'U'}
            dark={isDark}
            size={isCompactPhone ? 34 : 38}
          />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressBackgroundColor={palette.card}
          />
        }
      >
        {renderCommunityStudio()}
        {renderHubMyCommunities()}
        {renderPopularNow()}
        {renderSuggested()}
        {renderTournaments()}
        <View style={{ height: 16 }} />
      </ScrollView>

      {renderSearchModal()}
      {renderAuthPromptModal()}
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: '#FFF',
    position: 'relative',
  },
  headerSide: {
    minHeight: 40,
    justifyContent: 'center',
    zIndex: 1,
  },
  iosBrandWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  iosBrandIcon: {
    width: 44,
    height: 44,
    opacity: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionsRail: {
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.2,
  },
  content: {
    flex: 1,
  },
  studioWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  studioCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
  },
  studioTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  studioCopy: {
    flex: 1,
  },
  studioEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  studioTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    maxWidth: 220,
  },
  studioStatRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  studioStatCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  studioStatValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  studioStatLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  studioButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  studioButtonText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  studioFilterRow: {
    paddingTop: 12,
    gap: 10,
  },
  studioFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  studioFilterText: {
    fontSize: 13,
    fontWeight: '800',
  },
  studioLeagueBoard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  studioLeagueBoardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  studioLeagueBoardTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  studioLeagueBoardLink: {
    fontSize: 13,
    fontWeight: '800',
  },
  studioLeagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  studioLeagueRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioLeagueRankText: {
    fontSize: 12,
    fontWeight: '900',
  },
  studioSpotlightLogo: {
    width: 34,
    height: 34,
  },
  studioSpotlightLogoFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioSpotlightText: {
    flex: 1,
  },
  studioSpotlightName: {
    fontSize: 15,
    fontWeight: '800',
  },
  studioSpotlightMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
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
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
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
  subsectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 6,
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
    overflow: 'visible',
  },
  activityDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF453A',
    borderWidth: 1.5,
    borderColor: '#FFF',
    zIndex: 10,
  },
  myTeamHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  myTeamLogo: {
    width: 64,
    height: 64,
  },
  myLeagueLogoFrame: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLeagueLogoPlate: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  myLeagueLogo: {
    width: 48,
    height: 48,
  },
  leagueLogoOnDark: {
    backgroundColor: 'rgba(243, 247, 252, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(189, 210, 232, 0.32)',
    borderRadius: 10,
    padding: 2,
  },
  leagueLogoPlateNoBorder: {
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
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
  memberCountText: {
    fontSize: 12,
    color: '#8E8E93',
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
    paddingHorizontal: 16,
    gap: 12,
  },
  suggestedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  suggestedLogoWrap: {
    width: 40,
    height: 40,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestedLogo: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  suggestedLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
  leagueFiltersList: {
    maxHeight: 40,
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
    width: 44,
    height: 44,
    marginRight: 12,
  },
  searchResultLogoWrap: {
    width: 44,
    height: 44,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  searchResultLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  authPromptOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  authPromptSheet: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.36,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  authPromptHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.52)',
    marginBottom: 18,
  },
  authPromptIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  authPromptTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  authPromptCopy: {
    marginTop: 9,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  authPromptPrimary: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authPromptPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  authPromptSecondary: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authPromptSecondaryText: {
    fontSize: 16,
    fontWeight: '800',
  },
  authPromptCancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  authPromptCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  hubCommunityCard: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 140,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  hubCommunityLogoWrap: {
    marginBottom: 10,
  },
  hubCommunityLogo: {
    width: 40,
    height: 40,
  },
  hubCommunityLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCommunityName: {
    fontSize: 15,
    fontWeight: '800',
    minHeight: 38,
  },
  hubCommunityMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  hubEmptyCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 84,
    ...shadow({ y: 2, blur: 8, opacity: 0.06, elevation: 2 }),
  },
  hubEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
  hubEmptyMeta: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  popularStack: {
    paddingHorizontal: 16,
    gap: 10,
  },
  popularMiniCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadow({ y: 2, blur: 8, opacity: 0.06, elevation: 2 }),
  },
  popularRankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularRankText: {
    fontSize: 13,
    fontWeight: '800',
  },
  popularLogo: {
    width: 32,
    height: 32,
  },
  popularLogoWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  popularLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leagueLogoOnDarkWrap: {
    backgroundColor: 'rgba(243, 247, 252, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(189, 210, 232, 0.32)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leagueLogoOnDarkWrapNoBorder: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  suggestedLogoPlateImage: {
    width: 34,
    height: 34,
  },
  suggestedLogoPlateImageBorderless: {
    width: 40,
    height: 40,
  },
  suggestedLogoPlateImageBundesliga: {
    width: 30,
    height: 44,
    transform: [{ translateY: 2 }],
  },
  searchResultLogoPlateImage: {
    width: 38,
    height: 38,
  },
  searchResultLogoPlateImageBorderless: {
    width: 44,
    height: 44,
  },
  searchResultLogoPlateImageBundesliga: {
    width: 34,
    height: 48,
    transform: [{ translateY: 2 }],
  },
  popularLogoPlateImage: {
    width: 28,
    height: 28,
  },
  popularLogoPlateImageBorderless: {
    width: 36,
    height: 36,
  },
  popularLogoPlateImageBundesliga: {
    width: 28,
    height: 38,
    transform: [{ translateY: 0 }],
  },
  popularTextWrap: {
    flex: 1,
  },
  popularName: {
    fontSize: 15,
    fontWeight: '700',
  },
  popularMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  popularFollowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  categoryCard: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 132,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  categoryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  categorySubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
