import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle } from '../../services/newsApi';

type FilterCategory = 'All' | 'Matches' | 'News' | 'Live' | 'Upcoming';

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('All');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchResults, setSearchResults] = useState<(Match | NewsArticle)[]>([]);
  const [loading, setLoading] = useState(false);

  const categories: FilterCategory[] = ['All', 'Matches', 'News', 'Live', 'Upcoming'];

  const leagues = [
    { id: 'premier', name: 'Premier League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'laliga', name: 'La Liga', icon: '🇪🇸' },
    { id: 'bundesliga', name: 'Bundesliga', icon: '🇩🇪' },
    { id: 'seriea', name: 'Serie A', icon: '🇮🇹' },
    { id: 'ligue1', name: 'Ligue 1', icon: '🇫🇷' },
    { id: 'ucl', name: 'Champions League', icon: '⭐' },
  ];

  // Handle search from home screen
  useEffect(() => {
    if (params.query && typeof params.query === 'string') {
      setSearchQuery(params.query);
      performSearch(params.query);
    }
  }, [params.query]);

  const performSearch = async (query: string) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      if (selectedCategory === 'News' || selectedCategory === 'All') {
        const newsResults = await newsAPI.searchNews(query);
        setSearchResults(newsResults);
      } else {
        const matches = await footballAPI.getLiveMatches();
        const filtered = matches.filter(m =>
          m.home.toLowerCase().includes(query.toLowerCase()) ||
          m.away.toLowerCase().includes(query.toLowerCase()) ||
          m.league.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    performSearch(searchQuery);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
      </View>

      {/* Search Bar with Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search matches, teams, news..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            placeholderTextColor="#8E8E93"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSearchResults([]);
            }}>
              <Ionicons name="close-circle" size={20} color="#8E8E93" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowFilterModal(true)}>
              <View style={styles.filterButton}>
                <Ionicons name="options" size={20} color="#0066CC" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Quick Filter Chips */}
      <View style={styles.quickFilters}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFiltersContent}
        >
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                selectedCategory === cat && styles.filterChipActive
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === cat && styles.filterChipTextActive
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Popular Leagues Section */}
      {searchResults.length === 0 && (
        <View style={styles.popularLeagues}>
          <Text style={styles.sectionTitle}>Popular Leagues</Text>
          <View style={styles.leaguesGrid}>
            {leagues.map(league => (
              <TouchableOpacity
                key={league.id}
                style={styles.leagueCard}
                onPress={() => {
                  setSearchQuery(league.name);
                  performSearch(league.name);
                }}
              >
                <Text style={styles.leagueIcon}>{league.icon}</Text>
                <Text style={styles.leagueName}>{league.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Results */}
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        ) : searchResults.length > 0 ? (
          searchResults.map((item: any, index) => {
            if ('score' in item) {
              const match = item as Match;
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.resultCard}
                  onPress={() => router.push(`/chat/${match.id}` as any)}
                >
                  <View style={styles.matchResult}>
                    <View style={styles.matchHeader}>
                      {match.status === 'live' && (
                        <View style={styles.liveIndicator}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>{match.minute}</Text>
                        </View>
                      )}
                      <Text style={styles.matchLeague}>{match.league}</Text>
                    </View>
                    <Text style={styles.matchScore}>{match.score || 'vs'}</Text>
                    <Text style={styles.matchTeams}>
                      {match.home} vs {match.away}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            } else {
              const news = item as NewsArticle;
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.newsResultCard}
                  onPress={() => router.push(`/newsDetail/${encodeURIComponent(news.id)}` as any)}
                >
                  <View style={styles.newsImageContainer}>
                    {news.imageUrl ? (
                      <Image source={{ uri: news.imageUrl }} style={styles.newsResultImage} />
                    ) : (
                      <View style={styles.newsImagePlaceholder}>
                        <Ionicons name="newspaper" size={32} color="#8E8E93" />
                      </View>
                    )}
                  </View>
                  <View style={styles.newsResultContent}>
                    <View style={styles.newsResultHeader}>
                      <Text style={styles.newsSource}>{news.source}</Text>
                      <Text style={styles.newsDot}>•</Text>
                      <Text style={styles.newsTime}>
                        {new Date(news.publishedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.newsTitle}>{news.title}</Text>
                    <Text style={styles.newsDescription} numberOfLines={2}>
                      {news.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }
          })
        ) : searchQuery.length > 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color="#E5E7EB" />
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubtext}>Try different keywords</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="compass-outline" size={64} color="#E5E7EB" />
            <Text style={styles.emptyText}>Discover football</Text>
            <Text style={styles.emptySubtext}>
              Search for teams, matches, or browse leagues
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Content Type</Text>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={styles.filterOption}
                    onPress={() => {
                      setSelectedCategory(cat);
                      setShowFilterModal(false);
                    }}
                  >
                    <Text style={styles.filterOptionText}>{cat}</Text>
                    {selectedCategory === cat && (
                      <Ionicons name="checkmark" size={24} color="#0066CC" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Leagues</Text>
                {leagues.map(league => (
                  <TouchableOpacity
                    key={league.id}
                    style={styles.filterOption}
                    onPress={() => {
                      setSearchQuery(league.name);
                      setShowFilterModal(false);
                      performSearch(league.name);
                    }}
                  >
                    <View style={styles.leagueOption}>
                      <Text style={styles.leagueOptionIcon}>{league.icon}</Text>
                      <Text style={styles.filterOptionText}>{league.name}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
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
  header: {
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
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#000',
  },
  filterButton: {
    padding: 4,
  },
  quickFilters: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  quickFiltersContent: {
    paddingHorizontal: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
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
    color: '#FFFFFF',
  },
  popularLeagues: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 15,
  },
  leaguesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  leagueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  leagueIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  leagueName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  results: {
    flex: 1,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  matchResult: {},
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF3B30',
  },
  matchLeague: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  matchScore: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
  },
  matchTeams: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  newsResultCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  newsImageContainer: {
    width: 120,
    height: 120,
  },
  newsResultImage: {
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
  newsResultContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  newsResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  newsSource: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  newsDot: {
    fontSize: 11,
    color: '#999',
    marginHorizontal: 4,
  },
  newsTime: {
    fontSize: 11,
    color: '#999',
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
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
  emptyState: {
    paddingVertical: 100,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  filterSection: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  filterOptionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  leagueOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leagueOptionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
});