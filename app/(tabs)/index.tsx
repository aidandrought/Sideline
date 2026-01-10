// app/(tabs)/index.tsx
// Home screen with live matches, upcoming matches, and news

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';
import { notificationService } from '../../services/notificationService';
import { mergeWithTestData, SAMPLE_LIVE_MATCH } from '../../services/testData';

export default function HomeScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifiedMatches, setNotifiedMatches] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
    loadNotifiedMatches();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [liveData, upcomingData, newsData] = await Promise.all([
        footballAPI.getLiveMatches(),
        footballAPI.getUpcomingMatches(),
        newsAPI.getSoccerNews()
      ]);

      // Merge with test data (includes Liverpool vs Arsenal)
      const mergedLive = mergeWithTestData(liveData);
      
      setLiveMatches(mergedLive);
      setUpcomingMatches(upcomingData);
      setNews(newsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifiedMatches = async () => {
    try {
      const subscribed = await notificationService.getSubscribedMatches();
      setNotifiedMatches(new Set(subscribed.map(m => m.matchId)));
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await loadNotifiedMatches();
    setRefreshing(false);
  };

  const handleNotifyMe = async (match: Match) => {
    try {
      const isSubscribed = notifiedMatches.has(match.id);
      
      if (isSubscribed) {
        // Unsubscribe
        await notificationService.unsubscribeFromMatch(match.id);
        setNotifiedMatches(prev => {
          const next = new Set(prev);
          next.delete(match.id);
          return next;
        });
        Alert.alert('Notifications Off', `You won't be notified about ${match.home} vs ${match.away}`);
      } else {
        // Subscribe
        const success = await notificationService.subscribeToMatch(match);
        if (success) {
          setNotifiedMatches(prev => new Set(prev).add(match.id));
          Alert.alert(
            'Notifications On! 🔔', 
            `You'll be notified 30 minutes before ${match.home} vs ${match.away} kicks off`
          );
        } else {
          Alert.alert('Unable to set notification', 'The match may have already started');
        }
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  const navigateToChat = (match: Match) => {
    // Navigate to the match-specific chat room
    router.push({
      pathname: '/chat/[id]',
      params: { id: match.id.toString() }
    } as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {getGreeting()}, {userProfile?.username?.split(' ')[0] || 'Fan'}
          </Text>
          <Text style={styles.subtitle}>What's happening in football</Text>
        </View>
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.profileInitial}>
            {userProfile?.username?.[0]?.toUpperCase() || 'U'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <TouchableOpacity
        style={styles.searchContainer}
        onPress={() => setShowSearchModal(true)}
      >
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <Text style={styles.searchPlaceholder}>Search matches, teams, news...</Text>
        </View>
      </TouchableOpacity>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* LIVE Matches Section */}
        {liveMatches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.liveDot} />
                <Text style={styles.sectionTitle}>LIVE NOW</Text>
                <View style={styles.liveCount}>
                  <Text style={styles.liveCountText}>{liveMatches.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/live')}>
                <Text style={styles.viewAllButton}>View All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              {liveMatches.map(match => (
                <TouchableOpacity
                  key={match.id}
                  style={[
                    styles.liveCard,
                    match.id === SAMPLE_LIVE_MATCH.id && styles.featuredCard
                  ]}
                  onPress={() => navigateToChat(match)}
                >
                  <View style={styles.liveCardHeader}>
                    <View style={styles.liveIndicator}>
                      <View style={styles.liveIndicatorDot} />
                      <Text style={styles.liveTime}>{match.minute}</Text>
                    </View>
                    <Text style={styles.cardLeague} numberOfLines={1}>{match.league}</Text>
                  </View>
                  
                  <Text style={styles.liveScore}>{match.score}</Text>
                  
                  <View style={styles.teamsContainer}>
                    <Text style={styles.teamName} numberOfLines={1}>{match.home}</Text>
                    <Text style={styles.vsText}>vs</Text>
                    <Text style={styles.teamName} numberOfLines={1}>{match.away}</Text>
                  </View>

                  <View style={styles.chatPreview}>
                    <Ionicons name="chatbubbles" size={14} color="#666" />
                    <Text style={styles.chatCount}>
                      {match.activeUsers ? `${(match.activeUsers / 1000).toFixed(1)}k watching` : 'Join chat'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Top Headlines Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Headlines</Text>
            <TouchableOpacity onPress={() => router.push('/news')}>
              <Text style={styles.viewAllButton}>View All</Text>
            </TouchableOpacity>
          </View>

          {news.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.featuredNewsCard}
                onPress={() => router.push(`/newsDetail/${encodeURIComponent(news[0].id)}` as any)}
              >
                <View style={styles.featuredNewsImage}>
                  {news[0].imageUrl ? (
                    <Image source={{ uri: news[0].imageUrl }} style={styles.newsImage} />
                  ) : (
                    <View style={styles.newsImagePlaceholder}>
                      <Ionicons name="newspaper" size={48} color="#8E8E93" />
                    </View>
                  )}
                </View>
                <View style={styles.featuredNewsContent}>
                  <View style={styles.newsSource}>
                    <Ionicons name="ellipse" size={6} color="#0066CC" />
                    <Text style={styles.newsSourceText}>{news[0].source}</Text>
                    <Text style={styles.newsDot}>•</Text>
                    <Text style={styles.newsTime}>
                      {formatTimeAgo(news[0].publishedAt)}
                    </Text>
                  </View>
                  <Text style={styles.featuredNewsTitle}>{news[0].title}</Text>
                  <Text style={styles.featuredNewsDescription} numberOfLines={2}>
                    {news[0].description}
                  </Text>
                </View>
              </TouchableOpacity>

              {news.length > 1 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.horizontalScroll}
                  contentContainerStyle={styles.horizontalScrollContent}
                >
                  {news.slice(1, 4).map(article => (
                    <TouchableOpacity
                      key={article.id}
                      style={styles.newsCard}
                      onPress={() => router.push(`/newsDetail/${encodeURIComponent(article.id)}` as any)}
                    >
                      <View style={styles.newsCardImage}>
                        {article.imageUrl ? (
                          <Image source={{ uri: article.imageUrl }} style={styles.newsImage} />
                        ) : (
                          <View style={styles.newsImagePlaceholder}>
                            <Ionicons name="newspaper" size={32} color="#8E8E93" />
                          </View>
                        )}
                      </View>
                      <View style={styles.newsCardContent}>
                        <Text style={styles.newsCardSource}>{article.source}</Text>
                        <Text style={styles.newsCardTitle} numberOfLines={2}>{article.title}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="newspaper-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyText}>No news available</Text>
            </View>
          )}
        </View>

        {/* Upcoming Matches Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {liveMatches.length > 0 ? 'Coming Up Next' : 'Upcoming Matches'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/upcoming')}>
              <Text style={styles.viewAllButton}>View All</Text>
            </TouchableOpacity>
          </View>

          {upcomingMatches.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              {upcomingMatches.slice(0, 5).map(match => {
                const isNotified = notifiedMatches.has(match.id);
                return (
                  <TouchableOpacity
                    key={match.id}
                    style={styles.upcomingCard}
                    onPress={() => router.push(`/matchPreview/${match.id}` as any)}
                  >
                    <View style={styles.upcomingCardHeader}>
                      <Ionicons name="time-outline" size={16} color="#0066CC" />
                      <Text style={styles.upcomingTime}>{match.time}</Text>
                    </View>
                    
                    <View style={styles.teamsContainer}>
                      <Text style={styles.teamName} numberOfLines={1}>{match.home}</Text>
                      <Text style={styles.vsText}>vs</Text>
                      <Text style={styles.teamName} numberOfLines={1}>{match.away}</Text>
                    </View>

                    <Text style={styles.cardLeague} numberOfLines={1}>{match.league}</Text>

                    <TouchableOpacity 
                      style={[
                        styles.notifyButton,
                        isNotified && styles.notifyButtonActive
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleNotifyMe(match);
                      }}
                    >
                      <Ionicons 
                        name={isNotified ? 'notifications' : 'notifications-outline'} 
                        size={14} 
                        color={isNotified ? '#FFF' : '#0066CC'} 
                      />
                      <Text style={[
                        styles.notifyText,
                        isNotified && styles.notifyTextActive
                      ]}>
                        {isNotified ? 'Notifying' : 'Notify me'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyText}>No upcoming matches</Text>
              <Text style={styles.emptySubtext}>Check back later</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search</Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchBar}>
              <Ionicons name="search" size={20} color="#8E8E93" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search matches, teams, news..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                placeholderTextColor="#8E8E93"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Helper functions
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
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
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: '#8E8E93',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  liveCount: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  liveCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  viewAllButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  horizontalScroll: {
    flexGrow: 0,
  },
  horizontalScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  liveCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  featuredCard: {
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  liveCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 4,
  },
  liveTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
  cardLeague: {
    fontSize: 11,
    color: '#999',
  },
  liveScore: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  teamsContainer: {
    marginBottom: 8,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  vsText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
    textAlign: 'center',
    marginVertical: 2,
  },
  chatPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  chatCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  upcomingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  upcomingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  upcomingTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
    marginLeft: 6,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4FD',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 4,
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
  },
  notifyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  notifyTextActive: {
    color: '#FFF',
  },
  featuredNewsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  featuredNewsImage: {
    width: '100%',
    height: 200,
  },
  newsImage: {
    width: '100%',
    height: '100%',
  },
  newsImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredNewsContent: {
    padding: 16,
  },
  newsSource: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  newsSourceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066CC',
    marginLeft: 4,
  },
  newsDot: {
    fontSize: 12,
    color: '#999',
    marginHorizontal: 6,
  },
  newsTime: {
    fontSize: 12,
    color: '#999',
  },
  featuredNewsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
    lineHeight: 26,
  },
  featuredNewsDescription: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  newsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 280,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  newsCardImage: {
    width: '100%',
    height: 140,
  },
  newsCardContent: {
    padding: 12,
  },
  newsCardSource: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 4,
  },
  newsCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  modalClose: {
    fontSize: 16,
    color: '#0066CC',
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    marginHorizontal: 20,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
});