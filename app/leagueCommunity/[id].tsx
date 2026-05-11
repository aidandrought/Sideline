// app/leagueCommunity/[id].tsx
// League Community Screen with Full Standings Table

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
import { CommunityEntryLoading } from '../../components/CommunityEntryLoading';
import { NewsImage } from '../../components/NewsImage';
import { shadow } from '../../components/styleUtils';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCompetitionLabel } from '../../constants/footballCompetitions';
import { footballAPI, LeagueStandingsResponse, Match } from '../../services/footballApi';
import { reloadApp } from '../../services/appReload';
import { communityService } from '../../services/communityService';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { NewsSkeletonCards } from '../../components/NewsSkeletonCards';
import { getCommunityPosts, CommunityPost } from '../../services/communityPostsService';

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

const stripUefaPrefix = (value: string) => formatCompetitionLabel(value);

export default function LeagueCommunityScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { isDark } = useTheme();
  const leagueId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const seededName = Array.isArray(params.name) ? params.name[0] : params.name;
  const seededLogo = Array.isArray(params.logo) ? params.logo[0] : params.logo;
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
            tableHeader: '#141416',
            highlightRow: '#16202B',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5E5',
            placeholder: '#E5E7EB',
            tableHeader: '#F9F9F9',
            highlightRow: '#FFFBF0',
          },
    [isDark]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leagueInfo, setLeagueInfo] = useState<any>(null);
  const [standings, setStandings] = useState<LeagueStandingsResponse | null>(null);
  const [standingsRetryCount, setStandingsRetryCount] = useState(0);
  const [standingsRetryDone, setStandingsRetryDone] = useState(false);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [communityNews, setCommunityNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [previewPosts, setPreviewPosts] = useState<CommunityPost[]>([]);
  const [previewPostsLoaded, setPreviewPostsLoaded] = useState(false);

  useEffect(() => {
    loadLeagueData();
  }, [leagueId]);

  useEffect(() => {
    if (userProfile?.uid) {
      checkFollowStatus();
    }
  }, [userProfile, leagueId]);

  useEffect(() => {
    if (leagueInfo?.name) {
      void loadCommunityNews(leagueInfo.name);
    }
  }, [leagueInfo?.name]);

  useEffect(() => {
    void loadPreviewPosts();
  }, [leagueId]);

  const loadPreviewPosts = async () => {
    try {
      const { posts } = await getCommunityPosts(String(leagueId));
      setPreviewPosts(posts.slice(0, 3));
    } catch { /* ignore */ } finally {
      setPreviewPostsLoaded(true);
    }
  };

  const loadLeagueData = async (isRetry: boolean = false) => {
    try {
      if (!isRetry) setLoading(true);

      // Get league info from communities
      const league = await communityService.getCommunityById(leagueId, 'league');
      const fallbackLeague = {
        id: leagueId,
        type: 'league' as const,
        name: seededName || 'League',
        logo: seededLogo || '',
      };
      setLeagueInfo(league || fallbackLeague);

      // Get league standings
      const standingsData = await footballAPI.getLeagueStandingsByCurrentSeason(leagueId);
      setStandings(standingsData);

      // Retry once after 2 seconds if standings came back undefined/empty
      if ((!standingsData || standingsData.groups.length === 0) && !isRetry) {
        setStandingsRetryCount(1);
        setStandingsRetryDone(false);
        setTimeout(() => {
          void (async () => {
            try {
              const retryData = await footballAPI.getLeagueStandingsByCurrentSeason(leagueId);
              if (retryData && retryData.groups.length > 0) {
                setStandings(retryData);
              }
            } catch { /* ignore retry error */ } finally {
              setStandingsRetryDone(true);
            }
          })();
        }, 2000);
      }

      // Get upcoming matches for this league
      const upcoming = await footballAPI.getLeagueUpcomingMatches(leagueId, 8);
      setUpcomingMatches(upcoming);

    } catch (error) {
      if (__DEV__) console.error('Error loading league data:', error);
      // Retry once after 2 seconds on error
      if (!isRetry) {
        setTimeout(() => void loadLeagueData(true), 2000);
      }
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
    if (!leagueInfo) return;
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
        await communityService.unfollowCommunity(userProfile.uid, leagueId, 'league', leagueInfo);
        setIsFollowing(false);
      } else {
        await communityService.followCommunity(userProfile.uid, leagueId, 'league', leagueInfo);
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
      await loadLeagueData();
    });
    if (!didReload) {
      setRefreshing(false);
    }
  };

  const formatUpcomingDate = (dateString: string): string => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    return `${dayName} ${time}`;
  };

  const getArticleImage = (article: any) =>
    article?.imageUrl || article?.urlToImage || article?.image || article?.thumbnail || '';

  const loadCommunityNews = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (communityNews.length === 0) setNewsLoading(true);
    setNewsError(null);
    try {
      const { articles } = await newsAPI.leagueNews({ leagueName: trimmed, pageSize: 20 });
      if (articles.length > 0) {
        setCommunityNews(articles);
      } else if (communityNews.length === 0) {
        // Fallback: broader search for the league
        try {
          const fallback = await newsAPI.searchNews(trimmed + ' football', 10);
          setCommunityNews(fallback);
        } catch { /* ignore */ }
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        setNewsError('News is temporarily rate-limited. Try again shortly.');
      } else {
        if (communityNews.length === 0) setNewsError('Unable to load news right now.');
      }
    } finally {
      setNewsLoading(false);
    }
  };

  const getFormColor = (result: string): string => {
    if (result === 'W') return '#34C759';
    if (result === 'D') return '#FFD60A';
    if (result === 'L') return '#FF3B30';
    return '#8E8E93';
  };

  if (loading) {
    return (
      <CommunityEntryLoading
        name={stripUefaPrefix(leagueInfo?.name || seededName || 'League')}
        logo={leagueInfo?.logo || seededLogo || undefined}
        primaryColor={palette.accent}
        secondaryColor={isDark ? '#101923' : '#DDE8F5'}
        label="Loading community"
      />
    );
  }

  if (!leagueInfo) {
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
          <Text style={[styles.errorText, { color: palette.subtext }]}>League not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.card }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        
        <View style={styles.headerLeague}>
          {leagueInfo.logo ? (
            <Image 
              source={{ uri: leagueInfo.logo }} 
              style={[styles.headerLogo, isDark && styles.leagueLogoOnDark]}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.headerLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
              <Ionicons name="trophy" size={20} color={palette.accent} />
            </View>
          )}
          <Text style={[styles.headerTitle, { color: palette.text }]}>{stripUefaPrefix(leagueInfo.name)}</Text>
        </View>

        <TouchableOpacity 
          onPress={() => router.push('/profile' as any)} 
          style={[styles.profileButton, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <Ionicons name="person" size={20} color={palette.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* League Info Card */}
        <View style={[styles.leagueCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
          <View style={styles.leagueCardHeader}>
            {leagueInfo.logo && (
              <Image 
                source={{ uri: leagueInfo.logo }} 
                style={[styles.leagueLogo, isDark && styles.leagueLogoOnDark]}
                resizeMode="contain"
              />
            )}
            <View style={styles.leagueDetails}>
              <Text style={[styles.leagueName, { color: palette.text }]}>{stripUefaPrefix(leagueInfo.name)}</Text>
              {leagueInfo.country && (
                <Text style={[styles.leagueCountry, { color: palette.subtext }]}>{leagueInfo.country}</Text>
              )}
              {standings?.season && (
                <Text style={[styles.leagueSeason, { color: palette.accent }]}>Season {standings.season}</Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.followButton,
              { backgroundColor: palette.accent },
              isFollowing && { backgroundColor: palette.card, borderColor: palette.border }
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

        {/* Standings Table - always shown, retries if needed */}
        {standings && standings.groups.length > 0 ? standings.groups.map((group, groupIndex) => (
          <View key={groupIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{group.name}</Text>
            
            <View style={[styles.tableCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
              {/* Table Header */}
              <View style={[styles.tableHeader, { backgroundColor: palette.tableHeader, borderBottomColor: palette.border }]}>
                <Text style={[styles.tableHeaderPos, { color: palette.subtext }]}>#</Text>
                <Text style={[styles.tableHeaderTeam, { color: palette.subtext }]}>Team</Text>
                <Text style={[styles.tableHeaderStat, { color: palette.subtext }]}>P</Text>
                <Text style={[styles.tableHeaderStat, { color: palette.subtext }]}>W</Text>
                <Text style={[styles.tableHeaderStat, { color: palette.subtext }]}>D</Text>
                <Text style={[styles.tableHeaderStat, { color: palette.subtext }]}>L</Text>
                <Text style={[styles.tableHeaderStat, { color: palette.subtext }]}>GD</Text>
                <Text style={[styles.tableHeaderPts, { color: palette.subtext }]}>PTS</Text>
              </View>

              {/* Table Rows */}
              {group.standings.map((standing, index) => {
                const isTopFour = index <= 3;
                const isRelegation = index >= Math.max(0, group.standings.length - 3);

                return (
                  <TouchableOpacity
                    key={standing.team.id}
                    style={[
                      styles.tableRow,
                      { borderBottomColor: palette.border },
                      index === 0 && styles.tableRowFirst,
                      isTopFour && { backgroundColor: palette.highlightRow },
                      isRelegation && {
                        backgroundColor: isDark ? 'rgba(255, 59, 48, 0.12)' : 'rgba(255, 59, 48, 0.08)',
                      },
                      index === group.standings.length - 1 && styles.tableRowLast,
                    ]}
                    onPress={() => router.push(`/teamCommunity/${standing.team.id}` as any)}
                  >
                  <View style={[
                    styles.positionBadge,
                    { backgroundColor: palette.background },
                    index === 0 && styles.positionBadgeGold,
                    index === 1 && styles.positionBadgeSilver,
                    index === 2 && styles.positionBadgeBronze,
                  ]}>
                    <Text style={[
                      styles.positionText,
                      { color: palette.text },
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
                    <Text style={[styles.teamName, { color: palette.text }]} numberOfLines={1}>
                      {standing.team.name}
                    </Text>
                  </View>

                  <Text style={[styles.statText, { color: palette.subtext }]}>{standing.played}</Text>
                  <Text style={[styles.statText, { color: palette.subtext }]}>{standing.win}</Text>
                  <Text style={[styles.statText, { color: palette.subtext }]}>{standing.draw}</Text>
                  <Text style={[styles.statText, { color: palette.subtext }]}>{standing.lose}</Text>
                  <Text style={[
                    styles.statText,
                    { color: palette.subtext },
                    standing.goalsDiff > 0 && styles.statTextPositive,
                    standing.goalsDiff < 0 && styles.statTextNegative,
                  ]}>
                    {standing.goalsDiff > 0 ? '+' : ''}{standing.goalsDiff}
                  </Text>
                  <Text style={[styles.ptsText, { color: palette.text }]}>{standing.points}</Text>

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
                );
              })}
            </View>

            {/* Table Legend */}
            <View style={styles.tableLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
                <Text style={[styles.legendText, { color: palette.subtext }]}>Champions League</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
                <Text style={[styles.legendText, { color: palette.subtext }]}>Relegation</Text>
              </View>
            </View>
          </View>
        )) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>League Table</Text>
            <View style={[styles.tableCard, { backgroundColor: palette.card, borderColor: palette.border, padding: 20, alignItems: 'center' }, isDark && { borderWidth: 1 }]}>
              <Text style={[styles.newsEmptyText, { color: palette.subtext }]}>
                {standingsRetryCount > 0 && !standingsRetryDone ? 'Loading table data...' : 'Table data unavailable. Pull to refresh.'}
              </Text>
            </View>
          </View>
        )}

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
                params: { id: String(leagueId), name: stripUefaPrefix(leagueInfo?.name || ''), type: 'league', logo: leagueInfo?.logo ?? '' },
              } as any)}>
                <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
              </TouchableOpacity>
            </View>

            {previewPostsLoaded && previewPosts.length === 0 ? (
              <TouchableOpacity
                style={styles.communityEmptyState}
                onPress={() => router.push({
                  pathname: '/communityPosts/[id]',
                  params: { id: String(leagueId), name: stripUefaPrefix(leagueInfo?.name || ''), type: 'league', logo: leagueInfo?.logo ?? '' },
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
                    params: { id: String(leagueId), name: stripUefaPrefix(leagueInfo?.name || ''), type: 'league', logo: leagueInfo?.logo ?? '' },
                  } as any)}
                >
                  <Text style={[styles.communityViewAllText, { color: palette.accent }]}>Join the Discussion</Text>
                  <Ionicons name="chevron-forward" size={14} color={palette.accent} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Upcoming Matches</Text>
            
            {upcomingMatches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={[styles.upcomingMatchCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}
                onPress={() => router.push(`/matchPreview/${match.id}` as any)}
              >
                <Text style={[styles.upcomingMatchDate, { color: palette.accent }]}>{formatUpcomingDate(match.date)}</Text>

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

        {/* League News */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Latest News</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/news', params: { mode: 'community', q: stripUefaPrefix(leagueInfo?.name || '') } } as any)}>
              <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
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
            communityNews.map(article => (
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  leagueCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  leagueLogo: {
    width: 80,
    height: 80,
    marginRight: 16,
  },
  leagueLogoOnDark: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 3,
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
    paddingVertical: 10,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
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
    padding: 16,
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
});
