// app/news.tsx
// News Feed with pagination and search

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { newsAPI, NewsArticle, RateLimitError } from '../services/newsApi';
import { useOpenArticle } from '../hooks/useOpenArticle';

const PAGE_SIZE = 20;

export default function NewsScreen() {
  const router = useRouter();
  const openArticle = useOpenArticle();
  const searchInputRef = useRef<TextInput>(null);

  const [items, setItems] = useState<NewsArticle[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [rateLimitedNotice, setRateLimitedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NewsArticle[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoadMoreError, setSearchLoadMoreError] = useState<string | null>(null);

  const rateLimitMessage = 'News is temporarily rate-limited. Try again shortly.';

  const isSearching = searchQuery.trim().length >= 2;
  const activeItems = isSearching ? searchResults : items;
  const activeLoading = isSearching ? searchLoading : loading;
  const activeLoadingMore = isSearching ? searchLoadingMore : loadingMore;
  const activeError = isSearching ? searchError : error;
  const activeLoadMoreError = isSearching ? searchLoadMoreError : loadMoreError;
  const activeHasMore = isSearching ? searchHasMore : hasMore;

  useEffect(() => {
    loadFeedPage(1, false);
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!isSearching) {
      setSearchResults([]);
      setSearchPage(1);
      setSearchHasMore(true);
      setSearchError(null);
      setSearchLoadMoreError(null);
      setRateLimitedNotice(false);
      setSearchLoading(false);
      return () => {
        isActive = false;
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (!isActive) return;
      loadSearchPage(1, false, controller.signal);
    }, 500);

    return () => {
      isActive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  const sanitizeArticles = (articles: NewsArticle[]) => {
    return articles.filter((article) => Boolean(article?.title) && Boolean(article?.url));
  };

  const dedupeByUrl = (articles: NewsArticle[]) => {
    const seen = new Set<string>();
    return articles.filter((article) => {
      if (!article?.title || !article?.url) return false;
      const key = (article.url || `${article.title}-${article.source}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const mergeByUrl = (current: NewsArticle[], incoming: NewsArticle[]) => {
    return dedupeByUrl([...sanitizeArticles(current), ...sanitizeArticles(incoming)]);
  };

  const computeHasMore = (pageToLoad: number, totalResults: number, receivedCount: number) => {
    if (totalResults > 0) {
      return pageToLoad * PAGE_SIZE < totalResults && receivedCount > 0;
    }
    return receivedCount === PAGE_SIZE;
  };

  const loadFeedPage = async (pageToLoad: number, append: boolean) => {
    if (append) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      setLoadMoreError(null);
      setRateLimitedNotice(false);
    } else {
      setLoading(true);
      setError(null);
      setRateLimitedNotice(false);
    }

    try {
      const response = await newsAPI.getSoccerNewsPage(pageToLoad, PAGE_SIZE);
      if (response.isStale) {
        setRateLimitedNotice(true);
      }
      const incoming = dedupeByUrl(sanitizeArticles(response.articles));
      setItems((prev) => (append ? mergeByUrl(prev, incoming) : incoming));
      setPage(pageToLoad);
      setHasMore(computeHasMore(pageToLoad, response.totalResults, incoming.length));
    } catch (err) {
      if (err instanceof RateLimitError) {
        if (append) {
          setLoadMoreError(rateLimitMessage);
        } else {
          setError(rateLimitMessage);
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('News feed error:', err);
      if (append) {
        setLoadMoreError(message);
      } else {
        setError(message);
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  const loadSearchPage = async (pageToLoad: number, append: boolean, signal?: AbortSignal) => {
    if (append) {
      if (searchLoadingMore || !searchHasMore) return;
      setSearchLoadingMore(true);
      setSearchLoadMoreError(null);
    } else {
      setSearchLoading(true);
      setSearchError(null);
    }

    try {
      const response = await newsAPI.searchNewsQuery({
        q: searchQuery,
        page: pageToLoad,
        pageSize: PAGE_SIZE,
        signal
      });
      if (response.isStale) {
        setRateLimitedNotice(true);
      }
      const incoming = dedupeByUrl(sanitizeArticles(response.articles));
      setSearchResults((prev) => (append ? mergeByUrl(prev, incoming) : incoming));
      setSearchPage(pageToLoad);
      setSearchHasMore(computeHasMore(pageToLoad, response.totalResults, incoming.length));
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        return;
      }
      if (err instanceof RateLimitError) {
        if (append) {
          setSearchLoadMoreError(rateLimitMessage);
        } else {
          setSearchError(rateLimitMessage);
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('News search error:', err);
      if (append) {
        setSearchLoadMoreError(message);
      } else {
        setSearchError(message);
      }
    } finally {
      if (append) {
        setSearchLoadingMore(false);
      } else {
        setSearchLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isSearching) {
      await loadSearchPage(1, false);
    } else {
      await loadFeedPage(1, false);
    }
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (!activeHasMore || activeLoadingMore) return;
    if (isSearching) {
      loadSearchPage(searchPage + 1, true);
    } else {
      loadFeedPage(page + 1, true);
    }
  };

  const onToggleSearch = () => {
    if (isSearchActive) {
      setIsSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
      return;
    }
    setIsSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const heroArticle = activeItems[0];
  const listArticles = activeItems.slice(1);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color="#000" />
      </TouchableOpacity>
      {isSearchActive ? (
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search news"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : (
        <Text style={styles.headerTitle}>Latest News</Text>
      )}
      <TouchableOpacity onPress={onToggleSearch}>
        <Ionicons name={isSearchActive ? 'close' : 'search'} size={24} color="#000" />
      </TouchableOpacity>
    </View>
  );

  const renderHero = () => {
    if (!heroArticle) return null;
    return (
      <TouchableOpacity
        style={styles.heroCard}
        onPress={() => openArticle(heroArticle)}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: heroArticle.imageUrl || 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800' }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <View style={styles.heroGradient}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{heroArticle.category}</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {heroArticle.title}
          </Text>
          <Text style={styles.heroDescription} numberOfLines={2}>
            {heroArticle.description}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: NewsArticle }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => openArticle(item)}
      activeOpacity={0.7}
    >
      <View style={styles.listItemContent}>
        <Text style={styles.listItemCategory}>{item.category}</Text>
        <Text style={styles.listItemTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.listItemMeta}>
          {item.source} - {formatTimeAgo(item.publishedAt)}
        </Text>
      </View>

      {item.imageUrl && (
        <View style={styles.listItemImageContainer}>
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.listItemImage}
            resizeMode="cover"
          />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (activeLoadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color="#37003C" />
        </View>
      );
    }

    if (activeLoadMoreError) {
      return (
        <TouchableOpacity style={styles.loadMoreError} onPress={onEndReached}>
          <Text style={styles.loadMoreErrorText}>{activeLoadMoreError === rateLimitMessage ? rateLimitMessage : "Couldn't load more. Tap to retry."}</Text>
        </TouchableOpacity>
      );
    }

    return <View style={{ height: 24 }} />;
  };

  const renderEmpty = () => {
    if (activeLoading) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="newspaper-outline" size={64} color="#E5E7EB" />
        <Text style={styles.emptyText}>No news available</Text>
      </View>
    );
  };

  if (activeLoading && activeItems.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#37003C" />
        </View>
      </View>
    );
  }

  if (activeError && activeItems.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{activeError === rateLimitMessage ? rateLimitMessage : "Couldn't load news. Tap to retry."}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => (isSearching ? loadSearchPage(1, false) : loadFeedPage(1, false))}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}

      <FlatList
        data={listArticles}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        ListHeaderComponent={
          <View>
            {rateLimitedNotice && (
              <View style={styles.rateLimitRow}>
                <Text style={styles.rateLimitText}>News is temporarily rate-limited. Try again shortly.</Text>
              </View>
            )}
            {searchLoading && isSearching && (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color="#37003C" />
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
            )}
            {renderHero()}
          </View>
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F5F5F7',
    fontSize: 15,
    color: '#000'
  },
  listContent: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#111111',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rateLimitRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  rateLimitText: {
    fontSize: 12,
    color: "#999"
  },
  searchingText: {
    fontSize: 13,
    color: '#666'
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreError: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreErrorText: {
    fontSize: 13,
    color: '#666'
  },

  // Hero Card - PL App Style
  heroCard: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 320,
    backgroundColor: '#1C1C1E',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'rgba(55, 0, 60, 0.85)',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    lineHeight: 28,
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },

  // List Items - PL App Style
  listItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  listItemContent: {
    flex: 1,
    paddingRight: 16,
  },
  listItemCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: '#37003C',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    lineHeight: 22,
    marginBottom: 8,
  },
  listItemMeta: {
    fontSize: 12,
    color: '#999',
  },
  listItemImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F5F5F7',
  },
  listItemImage: {
    width: '100%',
    height: '100%',
  },
});
