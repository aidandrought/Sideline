// app/(tabs)/index.tsx
// Home Screen - Production Quality - PL App Style
// Features: Correct match times, full-image hero news, working notifications

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { footballAPI } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';


const { width } = Dimensions.get('window');

interface LiveMatch {
  id: string;
  home: string;
  away: string;
  homeIcon?: string;
  awayIcon?: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  minute: string;
  league: string;
  activeUsers: string;
}

interface UpcomingMatch {
  id: string;
  home: string;
  away: string;
  homeIcon?: string;  // ← Add ?
  awayIcon?: string;  // ← Add ?
  homeLogo?: string;
  awayLogo?: string;
  league: string;
  kickoff: string;
  kickoffFull: string;
  kickoffTime: Date;
  venue: string;
}

// Test live match: Liverpool vs Arsenal (recent game)
const TEST_LIVE_MATCH: LiveMatch = {
  id: 'live_999999',
  home: 'Liverpool',
  away: 'Arsenal',
  homeIcon: '🔴',
  awayIcon: '🔴',
  score: '2-1',
  minute: "67'",
  league: 'Premier League',
  activeUsers: '12.5K',
};

// Upcoming matches with realistic times
const SAMPLE_UPCOMING: UpcomingMatch[] = [
  {
    id: 'upcoming_1',
    home: 'Manchester City',
    away: 'Chelsea',
    homeIcon: '🩵',
    awayIcon: '🔵',
    league: 'Premier League',
    kickoff: 'Sat 3:00 PM',
    kickoffFull: 'Saturday, Jan 11 · 3:00 PM',
    kickoffTime: new Date('2026-01-11T15:00:00'),
    venue: 'Etihad Stadium',
  },
  {
    id: 'upcoming_2',
    home: 'Real Madrid',
    away: 'Barcelona',
    homeIcon: '⚪',
    awayIcon: '🔵🔴',
    league: 'La Liga',
    kickoff: 'Sun 9:00 PM',
    kickoffFull: 'Sunday, Jan 12 · 9:00 PM',
    kickoffTime: new Date('2026-01-12T21:00:00'),
    venue: 'Santiago Bernabéu',
  },
  {
    id: 'upcoming_3',
    home: 'Bayern Munich',
    away: 'Dortmund',
    homeIcon: '🔴',
    awayIcon: '🟡',
    league: 'Bundesliga',
    kickoff: 'Sat 6:30 PM',
    kickoffFull: 'Saturday, Jan 11 · 6:30 PM',
    kickoffTime: new Date('2026-01-11T18:30:00'),
    venue: 'Allianz Arena',
  },
  {
    id: 'upcoming_4',
    home: 'Inter Milan',
    away: 'AC Milan',
    homeIcon: '🔵⚫',
    awayIcon: '🔴⚫',
    league: 'Serie A',
    kickoff: 'Sun 7:45 PM',
    kickoffFull: 'Sunday, Jan 12 · 7:45 PM',
    kickoffTime: new Date('2026-01-12T19:45:00'),
    venue: 'San Siro',
  },
  {
    id: 'upcoming_5',
    home: 'PSG',
    away: 'Marseille',
    homeIcon: '🔵🔴',
    awayIcon: '⚪',
    league: 'Ligue 1',
    kickoff: 'Sun 8:45 PM',
    kickoffFull: 'Sunday, Jan 12 · 8:45 PM',
    kickoffTime: new Date('2026-01-12T20:45:00'),
    venue: 'Parc des Princes',
  },
  {
    id: 'upcoming_6',
    home: 'Tottenham',
    away: 'Newcastle',
    homeIcon: '⚪',
    awayIcon: '⚫⚪',
    league: 'Premier League',
    kickoff: 'Mon 8:00 PM',
    kickoffFull: 'Monday, Jan 13 · 8:00 PM',
    kickoffTime: new Date('2026-01-13T20:00:00'),
    venue: 'Tottenham Hotspur Stadium',
  },
  {
    id: 'upcoming_7',
    home: 'Aston Villa',
    away: 'Everton',
    homeIcon: '🟣',
    awayIcon: '🔵',
    league: 'Premier League',
    kickoff: 'Sat 5:30 PM',
    kickoffFull: 'Saturday, Jan 11 · 5:30 PM',
    kickoffTime: new Date('2026-01-11T17:30:00'),
    venue: 'Villa Park',
  },
  {
    id: 'upcoming_8',
    home: 'Liverpool',
    away: 'Real Madrid',
    homeIcon: '🔴',
    awayIcon: '⚪',
    league: 'Champions League',
    kickoff: 'Tue 8:00 PM',
    kickoffFull: 'Tuesday, Jan 14 · 8:00 PM',
    kickoffTime: new Date('2026-01-14T20:00:00'),
    venue: 'Anfield',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());
  const [loadingNotify, setLoadingNotify] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (userProfile?.uid) {
      loadSubscriptions();
    }
  }, [userProfile]);

const loadData = async () => {
  try {
    // Load real data from API
    const liveData = await footballAPI.getLiveMatches();
    const upcomingData = await footballAPI.getUpcomingMatches();
    
    // Use real data if available, fallback to samples
    let live = liveData.length > 0 ? liveData.map(m => ({
      id: m.id.toString(),
      home: m.home,
      away: m.away,
      homeIcon: m.homeLogo,
      awayIcon: m.awayLogo,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      score: m.score || '0-0',
      minute: m.minute || "0'",
      league: m.league,
      activeUsers: `${(m.activeUsers || 0) / 1000}K`
    })) : [TEST_LIVE_MATCH];
    
    // Sort by active users
    live.sort((a, b) => {
      const parseUsers = (s: string) => parseFloat(s.replace('K','')) * 1000;
      return parseUsers(b.activeUsers || '0') - parseUsers(a.activeUsers || '0');
    });
    
    setLiveMatches(live);
    
    setUpcomingMatches(upcomingData.length > 0 ? upcomingData.map(m => ({
      id: m.id.toString(),
      home: m.home,
      away: m.away,
      homeIcon: m.homeLogo,
      awayIcon: m.awayLogo,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      league: m.league,
      kickoff: m.time || 'TBD',
      kickoffFull: new Date(m.date).toLocaleString(),
      kickoffTime: new Date(m.date),
      venue: 'Stadium TBD'
    })) : SAMPLE_UPCOMING);
  } catch (error) {
    console.error('Error loading data:', error);
    // Fallback to sample data on error
    setLiveMatches([TEST_LIVE_MATCH]);
    setUpcomingMatches(SAMPLE_UPCOMING);
  }

  try {
    const newsData = await newsAPI.getSoccerNews();
    setNews(newsData.slice(0, 6));
  } catch (error) {
    console.error('Error loading news:', error);
  }
};

// Helper function - add this BEFORE the loadData function
const formatKickoffTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return `${dayName} ${time}`;
};

  const loadSubscriptions = async () => {
    if (!userProfile?.uid) return;
    
    try {
      const q = query(
        collection(db, 'matchNotifications'),
        where('userId', '==', userProfile.uid)
      );
      const snapshot = await getDocs(q);
      
      const subscribed = new Set<string>();
      snapshot.forEach((doc) => {
        subscribed.add(doc.data().matchId);
      });
      
      setSubscribedMatches(subscribed);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  const toggleNotification = async (match: UpcomingMatch) => {
    if (!userProfile?.uid) {
      Alert.alert('Sign In Required', 'Please sign in to receive notifications.');
      return;
    }

    setLoadingNotify(match.id);
    const isSubscribed = subscribedMatches.has(match.id);

    try {
      if (isSubscribed) {
        const q = query(
          collection(db, 'matchNotifications'),
          where('userId', '==', userProfile.uid),
          where('matchId', '==', match.id)
        );
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((doc) => deleteDoc(doc.ref)));

        setSubscribedMatches((prev) => {
          const updated = new Set(prev);
          updated.delete(match.id);
          return updated;
        });

        Alert.alert('Notification Removed', `You won't be notified for ${match.home} vs ${match.away}.`);
      } else {
        await addDoc(collection(db, 'matchNotifications'), {
          matchId: match.id,
          userId: userProfile.uid,
          homeTeam: match.home,
          awayTeam: match.away,
          league: match.league,
          kickoffTime: match.kickoffTime,
          createdAt: new Date(),
          notified: false,
        });

        setSubscribedMatches((prev) => new Set(prev).add(match.id));
        Alert.alert('Notification Set! 🔔', `You'll be notified when ${match.home} vs ${match.away} goes live.`);
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      Alert.alert('Error', 'Failed to update notification.');
    } finally {
      setLoadingNotify(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (userProfile?.uid) {
      await loadSubscriptions();
    }
    setRefreshing(false);
  };

  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
  };

  // Live match card
  const renderLiveMatch = (match: LiveMatch) => (
    <TouchableOpacity
      key={match.id}
      style={styles.liveMatchCard}
      onPress={() => router.push(`/chat/${match.id}` as any)}
      activeOpacity={0.85}
    >
      <View style={styles.liveMatchHeader}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.liveLeague} numberOfLines={1}>{match.league}</Text>
        <View style={styles.activeUsers}>
          <Ionicons name="people" size={11} color="#8E8E93" />
          <Text style={styles.activeUsersText}>{match.activeUsers}</Text>
        </View>
      </View>

      <View style={styles.liveMatchTeams}>
        <View style={styles.liveTeam}>
  {match.homeLogo ? (
    <Image 
      source={{ uri: match.homeLogo }} 
      style={styles.liveTeamLogo}
      resizeMode="contain"
    />
  ) : (
    <View style={styles.liveTeamLogoPlaceholder} />
  )}
  <Text style={styles.liveTeamName} numberOfLines={1}>{match.home}</Text>
</View>
        <View style={styles.liveScoreContainer}>
          <Text style={styles.liveScore}>{match.score}</Text>
          <Text style={styles.liveMinute}>{match.minute}</Text>
        </View>
        <View style={styles.liveTeam}>
  {match.awayLogo ? (
    <Image 
      source={{ uri: match.awayLogo }} 
      style={styles.liveTeamLogo}
      resizeMode="contain"
    />
  ) : (
    <View style={styles.liveTeamLogoPlaceholder} />
  )}
  <Text style={styles.liveTeamName} numberOfLines={1}>{match.away}</Text>
</View>
      </View>

      <View style={styles.joinChatRow}>
        <Ionicons name="chatbubbles" size={14} color="#0066CC" />
        <Text style={styles.joinChatText}>Join Live Chat</Text>
        <Ionicons name="chevron-forward" size={14} color="#0066CC" />
      </View>
    </TouchableOpacity>
  );

  // Upcoming match card
// Upcoming match card
const renderUpcomingMatch = (match: UpcomingMatch) => {
  const isSubscribed = subscribedMatches.has(match.id);
  const isLoading = loadingNotify === match.id;
  
  return (
    <TouchableOpacity 
      key={match.id} 
      style={styles.upcomingCard}
      onPress={() => router.push(`/matchPreview/${match.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.upcomingHeader}>
        <Text style={styles.upcomingLeague} numberOfLines={1}>{match.league}</Text>
      </View>
      
      <Text style={styles.upcomingKickoff}>{match.kickoff}</Text>
      
      <View style={styles.upcomingTeams}>
        <View style={styles.upcomingTeam}>
          {match.homeLogo ? (
            <Image 
              source={{ uri: match.homeLogo }} 
              style={styles.upcomingTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.upcomingTeamLogoPlaceholder} />
          )}
          <Text style={styles.upcomingTeamName} numberOfLines={1}>{match.home}</Text>
        </View>
        <Text style={styles.upcomingVs}>vs</Text>
        <View style={styles.upcomingTeam}>
          {match.awayLogo ? (
            <Image 
              source={{ uri: match.awayLogo }} 
              style={styles.upcomingTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.upcomingTeamLogoPlaceholder} />
          )}
          <Text style={styles.upcomingTeamName} numberOfLines={1}>{match.away}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.notifyButton, isSubscribed && styles.notifyButtonActive]}
        onPress={(e) => {
          e.stopPropagation();
          toggleNotification(match);
        }}
        disabled={isLoading}
      >
        <Ionicons
          name={isSubscribed ? 'notifications' : 'notifications-outline'}
          size={13}
          color={isSubscribed ? '#FFF' : '#0066CC'}
        />
        <Text style={[styles.notifyButtonText, isSubscribed && styles.notifyButtonTextActive]}>
          {isLoading ? '...' : isSubscribed ? 'Notifying' : 'Notify Me'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

  // News hero card - FULL IMAGE with gradient overlay (PL App Style)
  const renderHeroNews = (article: NewsArticle) => (
    <TouchableOpacity
      style={styles.heroNewsCard}
      onPress={() => router.push(`/newsDetail/${encodeURIComponent(article.id)}` as any)}
      activeOpacity={0.95}
    >
      <Image 
        source={{ uri: article.imageUrl }} 
        style={styles.heroNewsImage}
        resizeMode="cover"
      />
      <View style={styles.heroNewsGradient}>
        <View style={styles.heroNewsBadge}>
          <Text style={styles.heroNewsBadgeText}>{article.category || 'NEWS'}</Text>
        </View>
        <Text style={styles.heroNewsTitle} numberOfLines={3}>{article.title}</Text>
        <Text style={styles.heroNewsMeta}>{article.source} · {formatTimeAgo(article.publishedAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  // News list item
  const renderNewsListItem = (article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={styles.newsListItem}
      onPress={() => router.push(`/newsDetail/${encodeURIComponent(article.id)}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.newsListContent}>
        <View style={styles.newsListMeta}>
          <Text style={styles.newsListSource}>{article.source}</Text>
          <Text style={styles.newsListDot}>·</Text>
          <Text style={styles.newsListTime}>{formatTimeAgo(article.publishedAt)}</Text>
        </View>
        <Text style={styles.newsListTitle} numberOfLines={2}>{article.title}</Text>
      </View>
      {article.imageUrl && (
        <Image 
          source={{ uri: article.imageUrl }} 
          style={styles.newsListImage}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hey, {userProfile?.username || 'Fan'}!
          </Text>
          <Text style={styles.subtitle}>What's happening in football</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile' as any)} style={styles.profileButton}>
          <Ionicons name="person" size={20} color="#0066CC" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Live Now Section */}
        {liveMatches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.liveIndicator} />
                <Text style={styles.sectionTitle}>Live Now</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/live' as any)}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView 
  horizontal 
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.horizontalScroll}
>
  {liveMatches.slice(0, 8).map((match) => renderLiveMatch(match))}
</ScrollView>
          </View>
        )}

        {/* Upcoming Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            <TouchableOpacity onPress={() => router.push('/upcoming' as any)}>
              <Text style={styles.seeAllText}>See All ({upcomingMatches.length})</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {upcomingMatches.slice(0, 8).map((match) => renderUpcomingMatch(match))}
          </ScrollView>
        </View>

        {/* News Section */}
        <View style={styles.section}>
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>Latest News</Text>
    <TouchableOpacity onPress={() => router.push('/explore?filter=news' as any)}>
      <Text style={styles.seeAllText}>View All</Text>
    </TouchableOpacity>
  </View>

  <View style={styles.newsContainer}>
    {news[0] && renderHeroNews(news[0])}
    <View style={styles.newsListSection}>
      {news.slice(1, 12).map((article) => renderNewsListItem(article))}
    </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  horizontalScroll: {
    paddingHorizontal: 20,
  },

  // Live Match Card
  liveMatchCard: {
    width: 195,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 14,
    marginRight: 12,
  },
  liveMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFF',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
  },
  liveLeague: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8E8E93',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 4,
  },
  activeUsers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activeUsersText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
  },
  liveMatchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveTeam: {
    flex: 1,
    alignItems: 'center',
  },
  liveTeamName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  liveScoreContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  liveScore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  liveMinute: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 2,
  },
  joinChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,102,204,0.15)',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  joinChatText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
upcomingTeamLogo: {
  width: 32,
  height: 32,
  marginBottom: 6,
},
upcomingTeamLogoPlaceholder: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: '#E5E7EB',
  marginBottom: 6,
},

  // Upcoming Cards
  upcomingCard: {
    width: 165,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  upcomingHeader: {
    marginBottom: 4,
  },
  upcomingLeague: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upcomingKickoff: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 10,
  },
  upcomingTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingTeam: {
    flex: 1,
    alignItems: 'center',
  },
  upcomingTeamName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  upcomingVs: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    marginHorizontal: 4,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
  },
  notifyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  notifyButtonTextActive: {
    color: '#FFF',
  },
  liveTeamLogo: {
  width: 40,
  height: 40,
  marginBottom: 6,
},
liveTeamLogoPlaceholder: {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: '#2C2C2E',
  marginBottom: 6,
},

  // News Section
  newsContainer: {
    paddingHorizontal: 20,
  },

  // Hero News Card - FULL IMAGE (PL App Style)
  heroNewsCard: {
    width: '100%',
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#1C1C1E',
  },
  heroNewsImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroNewsGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingTop: 100,
    backgroundColor: 'transparent',
    // Gradient simulation with overlay
  },
  heroNewsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#37003C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 10,
  },
  heroNewsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  heroNewsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    lineHeight: 26,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroNewsMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

  // News List
  newsListSection: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  newsListItem: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  newsListContent: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  newsListMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  newsListSource: {
    fontSize: 11,
    fontWeight: '700',
    color: '#37003C',
  },
  newsListDot: {
    fontSize: 11,
    color: '#8E8E93',
    marginHorizontal: 5,
  },
  newsListTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
  newsListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    lineHeight: 19,
  },
  newsListImage: {
    width: 75,
    height: 75,
    borderRadius: 10,
    backgroundColor: '#F5F5F7',
  },
});
