import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';
import { db } from '../../firebaseConfig';

export default function HomeScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifiedMatches, setNotifiedMatches] = useState<Set<number>>(new Set());

  // Search modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [live, upcoming, newsData] = await Promise.all([
        footballAPI.getLiveMatches(),
        footballAPI.getUpcomingMatches(),
        newsAPI.getSoccerNews()
      ]);
      
      setLiveMatches(live.slice(0, 8));
      setUpcomingMatches(upcoming.slice(0, 8));
      setNews(newsData.slice(0, 4));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Close modal and navigate to explore with search query
      setShowSearchModal(false);
      router.push({
        pathname: '/explore',
        params: { query: searchQuery }
      } as any);
      setSearchQuery(''); // Reset search
    }
  };

  const toggleNotification = async (matchId: number, event?: any) => {
    event?.stopPropagation();

    if (!userProfile?.uid) return;

    const isNotified = notifiedMatches.has(matchId);
    const userDocRef = doc(db, 'users', userProfile.uid);

    try {
      if (isNotified) {
        // Remove notification
        setNotifiedMatches(prev => {
          const newSet = new Set(prev);
          newSet.delete(matchId);
          return newSet;
        });
        await updateDoc(userDocRef, {
          notifiedMatches: arrayRemove(matchId)
        });
      } else {
        // Add notification
        setNotifiedMatches(prev => new Set(prev).add(matchId));
        await updateDoc(userDocRef, {
          notifiedMatches: arrayUnion(matchId)
        });
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      // Revert on error
      if (isNotified) {
        setNotifiedMatches(prev => new Set(prev).add(matchId));
      } else {
        setNotifiedMatches(prev => {
          const newSet = new Set(prev);
          newSet.delete(matchId);
          return newSet;
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Ionicons name="menu" size={28} color="#000" />
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Sideline</Text>
        </View>

        <TouchableOpacity onPress={() => router.push('/profile')}>
          <View style={styles.profilePic}>
            <Text style={styles.profileInitial}>
              {userProfile?.username?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Search Bar - Opens Modal */}
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
                  style={styles.liveCard}
                  onPress={() => router.push(`/chat/${match.id}` as any)}
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
                      {new Date(news[0].publishedAt).toLocaleDateString()}
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
                        <View style={styles.newsSource}>
                          <Text style={styles.newsSourceText}>{article.source}</Text>
                        </View>
                        <Text style={styles.newsCardTitle} numberOfLines={3}>
                          {article.title}
                        </Text>
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
              {liveMatches.length === 0 ? 'Upcoming Matches' : 'Coming Up Next'}
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
              {upcomingMatches.map(match => (
                <TouchableOpacity
                  key={match.id}
                  style={styles.upcomingCard}
                  onPress={() => router.push(`/chat/${match.id}` as any)}
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
                      notifiedMatches.has(match.id) && styles.notifyButtonActive
                    ]}
                    onPress={(e) => toggleNotification(match.id, e)}
                  >
                    <Ionicons
                      name={notifiedMatches.has(match.id) ? "notifications" : "notifications-outline"}
                      size={14}
                      color={notifiedMatches.has(match.id) ? "#FFF" : "#0066CC"}
                    />
                    <Text style={[
                      styles.notifyText,
                      notifiedMatches.has(match.id) && styles.notifyTextActive
                    ]}>
                      {notifiedMatches.has(match.id) ? "Notifications on" : "Notify me"}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
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
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBar}>
              <Ionicons name="search" size={20} color="#8E8E93" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search matches, teams, news..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                autoFocus
                placeholderTextColor="#8E8E93"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#8E8E93" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.searchButton, !searchQuery.trim() && styles.searchButtonDisabled]}
              onPress={handleSearch}
              disabled={!searchQuery.trim()}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0066CC',
  },
  profilePic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    marginLeft: 10,
    fontSize: 16,
    color: '#8E8E93',
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
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  viewAllButton: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  liveCount: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  liveCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  horizontalScroll: {
    paddingLeft: 20,
  },
  horizontalScrollContent: {
    paddingRight: 20,
  },
  liveCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: 200,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  liveCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
  },
  cardLeague: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    flex: 1,
    textAlign: 'right',
  },
  liveScore: {
    fontSize: 32,
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
    elevation: 3,
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
    marginRight: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  newsCardImage: {
    width: '100%',
    height: 140,
  },
  newsCardContent: {
    padding: 12,
  },
  newsCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    lineHeight: 20,
  },
  upcomingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: 180,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  upcomingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  upcomingTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
    marginLeft: 4,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
    borderTopWidth: 0,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    marginBottom: -20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  notifyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    marginLeft: 4,
  },
  notifyTextActive: {
    color: '#FFF',
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#999',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
  },
  modalSearchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#000',
  },
  searchButton: {
    backgroundColor: '#0066CC',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});