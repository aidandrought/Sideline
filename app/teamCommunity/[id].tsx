// app/teamCommunity/[id].tsx
// Team Community Screen with League Position

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { CommunityEntryLoading } from '../../components/CommunityEntryLoading';
import { NewsImage } from '../../components/NewsImage';
import { shadow } from '../../components/styleUtils';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCompetitionLabel, getCompetitionIdByName } from '../../constants/footballCompetitions';
import { reloadApp } from '../../services/appReload';
import { footballAPI, LeagueStanding, Match } from '../../services/footballApi';
import { communityService } from '../../services/communityService';
import { db } from '../../config/firebase';
import { formatKickoffLabel } from '../../services/matchTime';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { getOrFetchCached } from '../../services/cacheService';
import { TEAM_HISTORY } from '../../services/teamCommunityHistoryData';
import { teamPrimaryColor, teamSecondaryColor } from '../../services/teamTint';
import { NewsSkeletonCards } from '../../components/NewsSkeletonCards';
import { getCommunityPosts, CommunityPost } from '../../services/communityPostsService';

const COMMUNITY_NEWS_TTL_MS = 30 * 60 * 1000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function TeamCommunityScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { isDark } = useTheme();
  const teamId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const seededName = Array.isArray(params.name) ? params.name[0] : params.name;
  const seededLogo = Array.isArray(params.logo) ? params.logo[0] : params.logo;
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
  const [communityNews, setCommunityNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [previewPosts, setPreviewPosts] = useState<CommunityPost[]>([]);
  const [previewPostsLoaded, setPreviewPostsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'roster' | 'news'>('upcoming');
  const [recentResults, setRecentResults] = useState<Array<{
    id: number;
    home: string;
    away: string;
    score: string;
    league: string;
    date: string;
    homeLogo?: string;
    awayLogo?: string;
  }>>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const themedTeamName = teamInfo?.name || seededName || 'Community';
  const themedTeamLogo = teamInfo?.logo || seededLogo || undefined;
  const teamPrimary = useMemo(() => teamPrimaryColor(themedTeamName), [themedTeamName]);
  const teamSecondary = useMemo(() => teamSecondaryColor(themedTeamName), [themedTeamName]);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#14171B',
            text: '#E6E6E9',
            subtext: '#A8B2BD',
            accent: teamPrimary,
            border: withAlpha(teamSecondary, 0.24),
            placeholder: withAlpha(teamSecondary, 0.18),
            tableHeader: withAlpha(teamSecondary, 0.12),
            tabBg: '#13161A',
            tabActive: withAlpha(teamPrimary, 0.18),
            headerSurface: withAlpha(teamSecondary, 0.16),
            glowPrimary: withAlpha(teamPrimary, 0.14),
            glowSecondary: withAlpha(teamSecondary, 0.12),
            cardTint: withAlpha(teamPrimary, 0.12),
            cardTintSecondary: withAlpha(teamSecondary, 0.08),
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: teamPrimary,
            border: withAlpha(teamPrimary, 0.16),
            placeholder: '#E5E7EB',
            tableHeader: withAlpha(teamPrimary, 0.06),
            tabBg: '#FFFFFF',
            tabActive: withAlpha(teamPrimary, 0.12),
            headerSurface: withAlpha(teamPrimary, 0.08),
            glowPrimary: withAlpha(teamPrimary, 0.09),
            glowSecondary: withAlpha(teamSecondary, 0.07),
            cardTint: withAlpha(teamPrimary, 0.08),
            cardTintSecondary: withAlpha(teamSecondary, 0.04),
          },
    [isDark, teamPrimary, teamSecondary]
  );

  useEffect(() => {
    loadTeamData();
  }, [teamId]);

  useEffect(() => {
    if (userProfile?.uid) {
      checkFollowStatus();
    }
  }, [userProfile, teamId]);

  useEffect(() => {
    void loadPreviewPosts();
  }, [teamId]);

  const loadPreviewPosts = async () => {
    try {
      const { posts } = await getCommunityPosts(String(teamId));
      setPreviewPosts(posts.slice(0, 3));
    } catch { /* ignore */ } finally {
      setPreviewPostsLoaded(true);
    }
  };

  const isNationalTeam = !!teamInfo?.isNationalTeam
    || (teamInfo?.league || '').toLowerCase().includes('world cup')
    || (teamInfo?.league || '').toLowerCase().includes('fifa world cup');

  // Re-fetch news if teamInfo reveals a better name or league context than the seeded name
  useEffect(() => {
    if (teamInfo?.name && teamInfo.name !== seededName) {
      void loadCommunityNews(teamInfo.name);
    }
  }, [teamInfo?.name, isNationalTeam]);

  const loadTeamData = async () => {
    try {
      setLoading(true);

      // Start news loading immediately (no need to wait for team data)
      const initialName = seededName || '';
      if (initialName) void loadCommunityNews(initialName);

      // Fetch team info, last match, upcoming, and recent results all in parallel
      const [team, lastMatchData, upcoming, recentFixtures] = await Promise.all([
        communityService.getCommunityById(teamId, 'team'),
        footballAPI.getTeamLastMatch(teamId),
        footballAPI.getTeamUpcomingMatches(teamId, 10),
        footballAPI.getTeamLastFixtures(teamId, 5),
      ]);

      const fallbackTeam = {
        id: teamId,
        type: 'team' as const,
        name: seededName || 'Community',
        logo: seededLogo || '',
        league: '',
      };
      const resolvedTeam = team || fallbackTeam;
      setTeamInfo(resolvedTeam);
      setLastMatch(lastMatchData);
      setUpcomingMatches(upcoming);
      setRecentResults(recentFixtures);

      // Collect league IDs from upcoming + recent results (use leagueId directly — reliable)
      const leagueIds = new Set<number>();
      upcoming.forEach(m => { if (m.leagueId) leagueIds.add(m.leagueId); });
      recentFixtures.forEach((m: any) => { if (m.leagueId) leagueIds.add(m.leagueId); });

      // Also include the team's primary league by name (catches case with no recent/upcoming)
      const teamLeague = (resolvedTeam as any)?.league as string | undefined;
      if (teamLeague) {
        const primaryLeagueId = getCompetitionIdByName(teamLeague);
        if (primaryLeagueId) leagueIds.add(primaryLeagueId);
      }

      // Remove tournament-only competitions that don't have a traditional standings table
      // (CL/EL knockout stages return empty standings — only keep domestic leagues)
      const DOMESTIC_LEAGUE_IDS = new Set([39, 140, 135, 78, 61, 253, 262, 94, 119, 203]);
      const filteredLeagueIds = Array.from(leagueIds).filter(id => DOMESTIC_LEAGUE_IDS.has(id));
      // If we have domestic leagues, use only those; otherwise keep all (national team etc.)
      const standingsLeagueIds = filteredLeagueIds.length > 0 ? filteredLeagueIds : Array.from(leagueIds);

      // Fetch all standings in parallel
      const standingsResults = await Promise.allSettled(
        standingsLeagueIds.map((lid) => footballAPI.getLeagueStandingsByCurrentSeason(lid))
      );

      const positionsData: Array<{
        leagueName: string;
        leagueId: number;
        position: LeagueStanding;
        topFour: LeagueStanding[];
      }> = [];

      standingsResults.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const standings = result.value;
        for (const group of standings.groups) {
          const teamStanding = group.standings.find(s => s.team.id === teamId);
          if (teamStanding) {
            positionsData.push({
              leagueName: formatCompetitionLabel(group.name || teamLeague || ''),
              leagueId: standings.leagueId,
              position: teamStanding,
              topFour: group.standings.slice(0, 4),
            });
            break;
          }
        }
      });

      setLeaguePositions(positionsData);
      if (__DEV__) {
        if (__DEV__) { }
      }

    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (name?: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(' ').filter(Boolean);
    return parts[parts.length - 1] || trimmed;
  };

  const loadRecentResults = async () => {
    try {
      const results = await footballAPI.getTeamLastFixtures(teamId, 5);
      setRecentResults(results);
    } catch (error) {
      console.error('Error loading recent results:', error);
      setRecentResults([]);
    }
  };

  // Helper to get league ID from league name
  const getLeagueIdFromName = (leagueName: string): number | null => {
    return getCompetitionIdByName(leagueName);
  };

  const getLeagueIdForTeam = async (team: any): Promise<number | null> => {
    return getCompetitionIdByName(team.league);
  };

  const checkFollowStatus = async () => {
    if (!userProfile?.uid) return;
    const following = await communityService.isFollowing(userProfile.uid, teamId);
    setIsFollowing(following);
  };

  const toggleFollow = async () => {
    if (!teamInfo) return;
    if (!userProfile?.uid) {
      Alert.alert('Sign in to follow', 'Create an account or log in to add communities and personalize your feed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => router.push('/(auth)/login' as any) },
        { text: 'Sign Up', onPress: () => router.push('/(auth)/signup' as any) },
      ]);
      return;
    }
    
    try {
      if (isFollowing) {
        await communityService.unfollowCommunity(userProfile.uid, teamId, 'team', teamInfo);
        setIsFollowing(false);
      } else {
        await communityService.followCommunity(userProfile.uid, teamId, 'team', teamInfo);
        setIsFollowing(true);
      }
    } catch (error) {
      console.error('Error updating follow state:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const didReload = await reloadApp(async () => {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      await loadTeamData();
    });
    if (!didReload) {
      setRefreshing(false);
    }
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
    return formatKickoffLabel(new Date(dateString));
  };

  const getArticleImage = (article: any) =>
    article?.imageUrl || article?.urlToImage || article?.image || article?.thumbnail || '';

  const historyText = useMemo(() => {
    const name = teamInfo?.name || 'This national team';
    const aliases: Record<string, string> = {
      'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
      'Cabo Verde': 'Cabo Verde',
      'Cape Verde': 'Cabo Verde',
      "Cote d'Ivoire": 'Ivory Coast',
      'Côte d’Ivoire': 'Ivory Coast',
      'Curaçao': 'Curacao',
      'Czech Republic': 'Czechia',
      'Democratic Republic of Congo': 'Congo DR',
      'DR Congo': 'Congo DR',
      'IR Iran': 'Iran',
      'Korea Republic': 'South Korea',
      'Turkey': 'Türkiye',
      'USA': 'United States',
    };
    const resolved = TEAM_HISTORY[aliases[name] || name];
    if (resolved) return resolved;
    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const normalizedMatch = Object.keys(TEAM_HISTORY).find((key) =>
      key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase() === normalized
    );
    if (normalizedMatch) return TEAM_HISTORY[normalizedMatch];
    return `${name} have built their World Cup story through steady growth, regional competition, and a commitment to long-term development. Their most memorable moments have come when preparation and belief aligned on the tournament stage.\n\nIn their confederation, ${name} are known for their identity and the way they adapt to different opponents and styles. Their best teams have combined structure with bursts of attacking intent, earning respect across their region.\n\nToday, ${name} aim to turn progress into a lasting World Cup legacy, with the goal of reaching the knockout rounds and delivering a signature tournament win.`;
  }, [teamInfo?.name]);

  const loadCommunityNews = async (teamName: string) => {
    const trimmed = teamName.trim();
    if (!trimmed) return;
    // Don't reset to loading if we already have cached news — show skeleton only on first load
    if (communityNews.length === 0) setNewsLoading(true);
    setNewsError(null);
    try {
      // For national teams, use the league from team info if available (e.g. UEFA Nations League, AFCON),
      // falling back to undefined so teamNews builds the best query without an incorrect competition filter.
      const leagueContext = isNationalTeam
        ? (teamInfo?.league && !teamInfo.league.toLowerCase().includes('world cup') ? teamInfo.league : undefined)
        : (teamInfo?.league || undefined);
      const { articles } = await newsAPI.teamNews({ teamName: trimmed, leagueContext, pageSize: 20 });
      // Always set news — never leave blank
      if (articles.length > 0) {
        setCommunityNews(articles);
      } else {
        // Fallback: search by team name broadly (international match news)
        try {
          const query = isNationalTeam ? `${trimmed} football international` : trimmed;
          const fallback = await newsAPI.searchNews(query, 10);
          if (fallback.length > 0) {
            setCommunityNews(fallback);
          } else if (communityNews.length === 0) {
            const broadFallback = await newsAPI.searchNews(trimmed, 10);
            setCommunityNews(broadFallback);
          }
        } catch { /* ignore fallback error */ }
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        setNewsError('News is temporarily rate-limited. Try again shortly.');
      } else {
        // Don't show error if we already have cached news displayed
        if (communityNews.length === 0) setNewsError('Unable to load news right now.');
      }
    } finally {
      setNewsLoading(false);
    }
  };

  if (loading) {
    return (
      <CommunityEntryLoading
        name={themedTeamName}
        logo={themedTeamLogo}
        primaryColor={teamPrimary}
        secondaryColor={teamSecondary}
        label="Loading community"
      />
    );
  }

  if (!teamInfo) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={[styles.header, { backgroundColor: palette.card }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: palette.card, borderColor: palette.border }]}
          >
            <Ionicons name="chevron-back" size={24} color={palette.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: palette.subtext }]}>Team not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View pointerEvents="none" style={[styles.screenGlow, styles.screenGlowLeft, { backgroundColor: palette.glowPrimary }]} />
      <View pointerEvents="none" style={[styles.screenGlow, styles.screenGlowRight, { backgroundColor: palette.glowSecondary }]} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? '#101317' : palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: palette.headerSurface, borderColor: palette.border }]}
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        
        <View style={styles.headerTeam}>
          {teamInfo.logo ? (
            <Image 
              source={{ uri: teamInfo.logo }} 
              style={styles.headerLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.headerLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
              <Ionicons name="shield" size={20} color={palette.accent} />
            </View>
          )}
          <Text style={[styles.headerTitle, { color: palette.text }]}>{teamInfo.name}</Text>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/profile' as any)} 
          style={[styles.profileButton, { backgroundColor: palette.headerSurface, borderColor: palette.border }]}
        >
          <Ionicons name="person" size={20} color={palette.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Team Info Card */}
        <View style={[styles.teamCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
          <LinearGradient
            colors={[palette.cardTint, palette.cardTintSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.teamCardTint}
          />
          <View style={styles.teamCardHeader}>
            {teamInfo.logo && (
              <Image 
                source={{ uri: teamInfo.logo }} 
                style={styles.teamLogo}
                resizeMode="contain"
              />
            )}
            <View style={styles.teamDetails}>
              <Text style={[styles.teamName, { color: palette.text }]}>{teamInfo.name}</Text>
              {teamInfo.league && (
                <Text style={[styles.teamLeague, { color: palette.subtext }]}>{teamInfo.league}</Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.followButton,
              { backgroundColor: palette.accent },
              isFollowing && { backgroundColor: palette.headerSurface, borderColor: palette.border }
            ]}
            onPress={toggleFollow}
          >
            <Ionicons 
              name={isFollowing ? 'checkmark' : 'add'} 
              size={18} 
              color={isFollowing ? palette.accent : '#FFF'} 
            />
            <Text
              style={[
                styles.followButtonText,
                { color: '#FFF' },
                isFollowing && { color: palette.accent }
              ]}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* National teams show Upcoming + Roster + News in one scroll */}

        {/* League Positions - Multiple Mini Tables */}
        {leaguePositions.map((leagueData, index) => (
          <View key={leagueData.leagueId} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>{leagueData.leagueName}</Text>
              <TouchableOpacity onPress={() => router.push(`/leagueCommunity/${leagueData.leagueId}` as any)}>
                <Text style={[styles.seeFullTableText, { color: palette.accent }]}>Full Table</Text>
              </TouchableOpacity>
            </View>

            {/* Position Summary */}
            <View style={[styles.positionSummaryCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
              <View style={[styles.positionBadgeLarge, { backgroundColor: '#E8F1FF' }]}>
                <Text style={[styles.positionNumberLarge, { color: palette.accent }]}>{leagueData.position.rank}</Text>
                <Text style={[styles.positionSuffix, { color: palette.accent }]}>
                  {leagueData.position.rank === 1 ? 'st' : 
                   leagueData.position.rank === 2 ? 'nd' : 
                   leagueData.position.rank === 3 ? 'rd' : 'th'}
                </Text>
              </View>
              
              <View style={styles.positionStats}>
                <View style={styles.positionStatItem}>
                  <Text style={[styles.positionStatValue, { color: palette.text }]}>{leagueData.position.points}</Text>
                  <Text style={[styles.positionStatLabel, { color: palette.subtext }]}>Points</Text>
                </View>
                <View style={[styles.positionStatDivider, { backgroundColor: palette.border }]} />
                <View style={styles.positionStatItem}>
                  <Text style={[styles.positionStatValue, { color: palette.text }]}>{leagueData.position.played}</Text>
                  <Text style={[styles.positionStatLabel, { color: palette.subtext }]}>Played</Text>
                </View>
                <View style={[styles.positionStatDivider, { backgroundColor: palette.border }]} />
                <View style={styles.positionStatItem}>
                  <Text style={[
                    styles.positionStatValue,
                    { color: palette.text },
                    leagueData.position.goalsDiff > 0 && styles.statPositive,
                    leagueData.position.goalsDiff < 0 && styles.statNegative,
                  ]}>
                    {leagueData.position.goalsDiff > 0 ? '+' : ''}{leagueData.position.goalsDiff}
                  </Text>
                  <Text style={[styles.positionStatLabel, { color: palette.subtext }]}>GD</Text>
                </View>
              </View>
            </View>

            {/* Top 4 Mini Table */}
            <View style={[styles.miniTableCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
              <View style={[styles.miniTableHeader, { backgroundColor: palette.tableHeader, borderBottomColor: palette.border }]}>
                <Text style={[styles.miniTableHeaderPos, { color: palette.subtext }]}>#</Text>
                <Text style={[styles.miniTableHeaderTeam, { color: palette.subtext }]}>Team</Text>
                <Text style={[styles.miniTableHeaderStat, { color: palette.subtext }]}>P</Text>
                <Text style={[styles.miniTableHeaderStat, { color: palette.subtext }]}>GD</Text>
                <Text style={[styles.miniTableHeaderPts, { color: palette.subtext }]}>PTS</Text>
              </View>

              {leagueData.topFour.map((standing, idx) => {
                const isCurrentTeam = standing.team.id === teamId;
                
                return (
                  <TouchableOpacity
                    key={standing.team.id}
                    style={[
                      styles.miniTableRow,
                      { borderBottomColor: palette.border },
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
                      { backgroundColor: palette.background },
                      idx === 0 && styles.miniPositionBadgeGold,
                      idx === 1 && styles.miniPositionBadgeSilver,
                      idx === 2 && styles.miniPositionBadgeBronze,
                      isCurrentTeam && styles.miniPositionBadgeCurrent,
                    ]}>
                      <Text style={[
                        styles.miniPositionText,
                        { color: palette.text },
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
                        { color: palette.text }
                      ]} numberOfLines={1}>
                        {standing.team.name}
                      </Text>
                    </View>

                    <Text style={[styles.miniStatText, { color: palette.subtext }]}>
                      {standing.played}
                    </Text>
                    <Text style={[
                      styles.miniStatText,
                      { color: palette.subtext },
                      standing.goalsDiff > 0 && styles.miniStatTextPositive,
                      standing.goalsDiff < 0 && styles.miniStatTextNegative,
                    ]}>
                      {standing.goalsDiff > 0 ? '+' : ''}{standing.goalsDiff}
                    </Text>
                    <Text style={[styles.miniPtsText, { color: palette.text }]}>
                      {standing.points}
                    </Text>
                  </TouchableOpacity>
                );
              })}

            </View>
          </View>
        ))}

        {/* Community Posts Card */}
        <View style={styles.section}>
          <View style={[styles.communityCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
            <View style={styles.communityCardHeader}>
              <View style={styles.communityCardTitleRow}>
                <Ionicons name="chatbubbles" size={20} color={palette.accent} />
                <Text style={[styles.communityCardTitle, { color: palette.text }]}>Community Posts</Text>
              </View>
              <TouchableOpacity onPress={() => router.push({
                pathname: '/communityPosts/[id]',
                params: { id: String(teamId), name: teamInfo?.name ?? 'Community', type: 'team', logo: themedTeamLogo ?? '' },
              } as any)}>
                <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
              </TouchableOpacity>
            </View>

            {previewPostsLoaded && previewPosts.length === 0 ? (
              <TouchableOpacity
                style={styles.communityEmptyState}
                onPress={() => router.push({
                  pathname: '/communityPosts/[id]',
                  params: { id: String(teamId), name: teamInfo?.name ?? 'Community', type: 'team', logo: themedTeamLogo ?? '' },
                } as any)}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={28} color={palette.subtext} style={{ marginBottom: 8 }} />
                <Text style={[styles.communityEmptyText, { color: palette.subtext }]}>No posts yet — be the first to start a discussion!</Text>
                <View style={[styles.communityPostButton, { backgroundColor: palette.accent }]}>
                  <Ionicons name="add" size={16} color="#FFF" />
                  <Text style={styles.communityPostButtonText}>Post</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <>
                {previewPosts.map((post, index) => (
                  <TouchableOpacity
                    key={post.id}
                    style={[
                      styles.communityPostRow,
                      index < previewPosts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/communityPost/${post.id}` as any)}
                  >
                    <View style={styles.communityPostMeta}>
                      <View style={[styles.communityAvatar, { backgroundColor: palette.accent + '22' }]}>
                        <Text style={[styles.communityAvatarText, { color: palette.accent }]}>
                          {post.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.communityUsername, { color: palette.subtext }]}>{post.username}</Text>
                      <Text style={[styles.communityPostTime, { color: palette.subtext }]}> · {timeAgo(post.createdAt)}</Text>
                    </View>
                    <Text style={[styles.communityPostTitle, { color: palette.text }]} numberOfLines={1}>{post.title}</Text>
                    {!!post.body && (
                      <Text style={[styles.communityPostBody, { color: palette.subtext }]} numberOfLines={2}>{post.body}</Text>
                    )}
                    <View style={styles.communityPostStats}>
                      <Ionicons name="heart-outline" size={13} color={palette.subtext} />
                      <Text style={[styles.communityStatText, { color: palette.subtext }]}>{post.likesCount}</Text>
                      <Ionicons name="chatbubble-outline" size={13} color={palette.subtext} style={{ marginLeft: 10 }} />
                      <Text style={[styles.communityStatText, { color: palette.subtext }]}>{post.commentCount}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.communityViewAll, { borderTopColor: palette.border }]}
                  onPress={() => router.push({
                    pathname: '/communityPosts/[id]',
                    params: { id: String(teamId), name: teamInfo?.name ?? 'Community', type: 'team', logo: themedTeamLogo ?? '' },
                  } as any)}
                >
                  <Text style={[styles.communityViewAllText, { color: palette.accent }]}>Join the Discussion</Text>
                  <Ionicons name="chevron-forward" size={14} color={palette.accent} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Last Match */}
        {lastMatch && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Last Match</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.matchCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}
              onPress={() => router.push(`/results/${lastMatch.id}` as any)}
              activeOpacity={0.85}
            >
              <View style={styles.matchHeader}>
                <Text style={[styles.matchLeague, { color: palette.accent }]}>{lastMatch.league}</Text>
                <Text style={[styles.matchDate, { color: palette.subtext }]}>{formatDate(lastMatch.date)}</Text>
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
                  <Text style={[styles.matchTeamName, { color: palette.text }]}>{lastMatch.home}</Text>
                </View>

                <View style={styles.matchScore}>
                  <Text style={[styles.scoreText, { color: palette.text }]}>{lastMatch.score}</Text>
                </View>

                <View style={styles.matchTeam}>
                  {lastMatch.awayLogo && (
                    <Image 
                      source={{ uri: lastMatch.awayLogo }} 
                      style={styles.matchTeamLogo}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={[styles.matchTeamName, { color: palette.text }]}>{lastMatch.away}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Upcoming Matches</Text>
            </View>
            
            {upcomingMatches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={[styles.upcomingMatchCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}
                onPress={() => router.push(`/matchPreview/${match.id}` as any)}
              >
                <View style={styles.upcomingMatchHeader}>
                  <Text style={[styles.upcomingMatchLeague, { color: palette.accent }]}>{match.league}</Text>
                  <Text style={[styles.upcomingMatchDate, { color: palette.subtext }]}>{formatUpcomingDate(match.date)}</Text>
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
                    <Text style={[styles.upcomingMatchTeamName, { color: palette.text }]}>{match.home}</Text>
                  </View>

                  <Text style={[styles.upcomingVs, { color: palette.subtext }]}>vs</Text>

                  <View style={styles.upcomingMatchTeam}>
                    {match.awayLogo && (
                      <Image 
                        source={{ uri: match.awayLogo }} 
                        style={styles.upcomingMatchLogo}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={[styles.upcomingMatchTeamName, { color: palette.text }]}>{match.away}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Recent Results</Text>
            </View>
            {recentResults.map(result => (
              <View key={result.id} style={[styles.upcomingMatchCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                <View style={styles.upcomingMatchHeader}>
                  <Text style={[styles.upcomingMatchLeague, { color: palette.accent }]}>{result.league}</Text>
                  <Text style={[styles.upcomingMatchDate, { color: palette.subtext }]}>{formatDate(result.date)}</Text>
                </View>
                <View style={styles.upcomingMatchTeams}>
                  <View style={styles.upcomingMatchTeam}>
                    {result.homeLogo && (
                      <Image 
                        source={{ uri: result.homeLogo }} 
                        style={styles.upcomingMatchLogo}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={[styles.upcomingMatchTeamName, { color: palette.text }]}>{result.home}</Text>
                  </View>
                  <Text style={[styles.upcomingVs, { color: palette.text }]}>{result.score}</Text>
                  <View style={styles.upcomingMatchTeam}>
                    {result.awayLogo && (
                      <Image 
                        source={{ uri: result.awayLogo }} 
                        style={styles.upcomingMatchLogo}
                        resizeMode="contain"
                      />
                    )}
                    <Text style={[styles.upcomingMatchTeamName, { color: palette.text }]}>{result.away}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* History */}
        {isNationalTeam && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>History</Text>
            </View>
            <View style={[styles.historyCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
              <Text style={[styles.historyText, { color: palette.text }]} numberOfLines={historyExpanded ? 0 : 3}>
                {historyText}
              </Text>
              <TouchableOpacity
                style={styles.historyToggle}
                onPress={() => setHistoryExpanded(prev => !prev)}
              >
                <Text style={[styles.historyToggleText, { color: palette.accent }]}>
                  {historyExpanded ? 'Show less' : 'Read more'}
                </Text>
                <Ionicons
                  name={historyExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={palette.accent}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Team News */}
        {(
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Latest News</Text>
              <TouchableOpacity onPress={() => router.push({ pathname: '/news', params: { mode: 'community', q: teamInfo?.name } } as any)}>
                <Text style={[styles.seeFullTableText, { color: palette.accent }]}>See All</Text>
              </TouchableOpacity>
            </View>
            {newsLoading && communityNews.length === 0 ? (
              <NewsSkeletonCards isDark={isDark} count={3} />
            ) : newsError && communityNews.length === 0 ? (
              <Text style={[styles.newsErrorText, { color: palette.subtext }]}>{newsError}</Text>
            ) : communityNews.length === 0 ? (
              <View style={[styles.newsEmptyCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                <Text style={[styles.newsEmptyText, { color: palette.subtext }]}>No recent news found for this community.</Text>
              </View>
            ) : (
              communityNews.slice(0, 5).map(article => (
                <View key={article.id} style={[styles.newsCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                  <TouchableOpacity
                    onPress={() => openArticle(article)}
                    onPressIn={() => prefetchArticle(article)}
                  >
                    <View style={styles.newsRow}>
                      {getArticleImage(article) ? (
                        <NewsImage uri={getArticleImage(article)} style={styles.newsThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.newsThumbPlaceholder, { backgroundColor: palette.placeholder }]}>
                          <Ionicons name="image-outline" size={18} color={palette.subtext} />
                        </View>
                      )}
                      <View style={styles.newsTextCol}>
                        <Text style={[styles.newsTitle, { color: palette.text }]} numberOfLines={2}>
                          {article.title}
                        </Text>
                        <Text style={[styles.newsDescription, { color: palette.subtext }]} numberOfLines={2}>
                          {article.description}
                        </Text>
                        <Text style={[styles.newsSource, { color: palette.accent }]} numberOfLines={1}>
                          {article.source}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            )}
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
  screenGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  screenGlowLeft: {
    top: 92,
    left: -72,
  },
  screenGlowRight: {
    top: 260,
    right: -84,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  teamCardTint: {
    ...StyleSheet.absoluteFillObject,
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    marginBottom: 0,
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
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabItemActive: {
    backgroundColor: '#E8F1FF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  tabTextActive: {
    color: '#0066CC',
  },
  section: {
    marginTop: 20,
  },
  sectionTitleRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  communityCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  communityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  communityCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  communityCardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  communityEmptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 4,
  },
  communityEmptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  communityPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
  },
  communityPostButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  communityPostRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  communityPostMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  communityAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  communityAvatarText: {
    fontSize: 11,
    fontWeight: '800',
  },
  communityUsername: {
    fontSize: 13,
    fontWeight: '600',
  },
  communityPostTime: {
    fontSize: 12,
  },
  communityPostTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  communityPostBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  communityPostStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  communityStatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  communityViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  communityViewAllText: {
    fontSize: 14,
    fontWeight: '700',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
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
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    width: 74,
    height: 74,
    borderRadius: 12,
    marginRight: 12,
  },
  positionNumberLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0066CC',
    lineHeight: 70,
  },
  positionSuffix: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066CC',
    marginLeft: 1,
    marginBottom: 2,
  },
  positionStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  positionStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  positionStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginBottom: 0,
  },
  positionStatLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  positionStatDivider: {
    width: 1,
    marginHorizontal: 6,
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
    width: 38,
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  miniTableHeaderPts: {
    width: 44,
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
    width: 38,
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
    width: 44,
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
  newsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  newsLoadingText: {
    fontSize: 13,
    color: '#666',
  },
  newsErrorText: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  newsEmptyCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    marginTop: 12,
  },
  newsEmptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  newsCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  newsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  newsThumb: {
    width: 84,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  newsThumbPlaceholder: {
    width: 84,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#EEF0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsTextCol: {
    flex: 1,
  },
  newsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
    lineHeight: 20,
  },
  newsDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    lineHeight: 18,
  },
  newsSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  historyCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  historyText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  historyToggle: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
});
