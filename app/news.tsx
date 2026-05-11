// app/news.tsx
// News Feed with pagination and search

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { NewsImage } from '../components/NewsImage';
import { NEWS_FILTER_LEAGUES } from '../constants/footballCompetitions';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { BrowseNewsParams, NewsDateRange, newsAPI, NewsArticle, RateLimitError } from '../services/newsApi';
import { useOpenArticle } from '../hooks/useOpenArticle';
import { useTheme } from '../context/ThemeContext';
import { reloadApp } from '../services/appReload';
import { getCachedValue, getCachedValueAsync, setCachedValue } from '../services/cacheService';
import { useAuth } from '../context/AuthContext';
import { getFeedSelections, selectNewsForFeed } from '../services/feedPreferences';
import { getCachedHomeExploreNewsAllocation } from '../services/newsAllocationService';
import { newsPersonalizationService, NewsReactionValue } from '../services/newsPersonalizationService';
import { getPrefetchedAppData } from '../services/prefetchService';

const PAGE_SIZE = 25;
const NEWS_FEED_CACHE_KEY = 'news:feed:v6';
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const LEAGUE_FILTERS = NEWS_FILTER_LEAGUES;
const DATE_FILTERS: { label: string; value: NewsDateRange }[] = [
  { label: 'Any Time', value: 'all' },
  { label: '24 Hours', value: '24h' },
  { label: '3 Days', value: '3d' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
];

export default function NewsScreen() {
  const router = useRouter();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { bootstrapApp } = useAppBootstrap();
  const { userProfile } = useAuth();
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const { isDark } = useTheme();
  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', text: '#FFFFFF', subtext: '#A1A1A6', border: '#2C2C2E', searchBg: '#141416' }
        : { background: '#F5F5F7', card: '#FFFFFF', text: '#000000', subtext: '#666666', border: '#F0F0F0', searchBg: '#F5F5F7' },
    [isDark]
  );
  const searchInputRef = useRef<TextInput>(null);
  const prefetchedNews = useMemo(
    () => getPrefetchedAppData()?.newsAllocation.all ?? [],
    []
  );
  const initialFeedItems = useMemo(
    () =>
      selectNewsForFeed(
        getCachedValue<NewsArticle[]>(NEWS_FEED_CACHE_KEY, NEWS_CACHE_TTL_MS) ??
          prefetchedNews,
        feedSelections,
        6
      ),
    [feedSelections, prefetchedNews]
  );

  const [items, setItems] = useState<NewsArticle[]>(initialFeedItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(initialFeedItems.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [, setRateLimitedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newsReactions, setNewsReactions] = useState<Record<string, NewsReactionValue>>({});
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [leagueFilter, setLeagueFilter] = useState<(typeof LEAGUE_FILTERS)[number]>('All');
  const [dateFilter, setDateFilter] = useState<NewsDateRange>('all');
  const [searchResults, setSearchResults] = useState<NewsArticle[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoadMoreError, setSearchLoadMoreError] = useState<string | null>(null);

  const rateLimitMessage = 'News API is temporarily rate-limited. Showing cached soccer news when available.';

  const hasActiveBrowseFilters = searchQuery.trim().length >= 2 || leagueFilter !== 'All' || dateFilter !== 'all';
  const scopedItems = useMemo(() => selectNewsForFeed(items, feedSelections, 6), [feedSelections, items]);
  const activeItems = hasActiveBrowseFilters ? searchResults : scopedItems;
  const activeLoading = hasActiveBrowseFilters ? searchLoading : loading;
  const activeLoadingMore = hasActiveBrowseFilters ? searchLoadingMore : loadingMore;
  const activeError = hasActiveBrowseFilters ? searchError : error;
  const activeLoadMoreError = hasActiveBrowseFilters ? searchLoadMoreError : loadMoreError;
  const activeHasMore = hasActiveBrowseFilters ? searchHasMore : hasMore;

  useEffect(() => {
    activeItems.slice(0, 8).forEach((article) => prefetchArticle(article));
  }, [activeItems, prefetchArticle]);

  useEffect(() => {
    if (!userProfile?.uid || activeItems.length === 0) return;
    let active = true;
    void newsPersonalizationService.getUserFeedbackForArticles(userProfile.uid, activeItems).then((map) => {
      if (!active) return;
      setNewsReactions(map);
    });
    return () => {
      active = false;
    };
  }, [userProfile?.uid, activeItems]);

  // Hydrate instantly from prefetched/cached news, then refresh in the background.
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      if (prefetchedNews.length > 0) {
        setItems(selectNewsForFeed(prefetchedNews, feedSelections, 6));
        setLoading(false);
      }
      const cachedAllocation = await getCachedHomeExploreNewsAllocation();
      if (active && cachedAllocation?.all?.length) {
        setItems((prev) => {
          const merged = selectNewsForFeed(mergeByUrl(prev, cachedAllocation.all), feedSelections, 6);
          return merged;
        });
        setLoading(false);
      }
      const cached = await getCachedValueAsync<NewsArticle[]>(NEWS_FEED_CACHE_KEY, NEWS_CACHE_TTL_MS);
      if (!active || !cached || cached.length === 0) return;
      setItems(selectNewsForFeed(cached, feedSelections, 6));
      setLoading(false);
      setHasMore(cached.length >= PAGE_SIZE);
    };
    void hydrate();
    void loadFeedPage(1, false, { silent: initialFeedItems.length > 0, deferRanking: true });
    return () => {
      active = false;
    };
  }, [feedSelections, initialFeedItems.length, prefetchedNews]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let isActive = true;

    if (!hasActiveBrowseFilters) {
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
  }, [searchQuery, leagueFilter, dateFilter, hasActiveBrowseFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const sanitizeArticles = (articles: NewsArticle[]) => {
    return articles.filter((article) => Boolean(article?.title) && Boolean(article?.url));
  };

  const dedupeByUrl = (articles: NewsArticle[]) => {
    const seen = new Set<string>();
    return articles.filter((article) => {
      if (!article?.title || !article?.url) return false;
      const normalizedTitle = article.title
        .toLowerCase()
        .replace(/\s*\|\s*[^|]+$/g, '')
        .replace(/\s*-\s*[^-]+$/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const key = normalizedTitle || (article.url || `${article.title}-${article.source}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const mergeByUrl = (current: NewsArticle[], incoming: NewsArticle[]) => {
    return dedupeByUrl([...sanitizeArticles(current), ...sanitizeArticles(incoming)]);
  };

  const mergeFeedItems = (current: NewsArticle[], incoming: NewsArticle[], append: boolean) =>
    prioritizeArticlesWithImages(
      selectNewsForFeed(append ? mergeByUrl(current, incoming) : incoming, feedSelections, 6)
    );

  const prioritizeArticlesWithImages = (articles: NewsArticle[]) => {
    const withImages = articles.filter((article) => !!article.imageUrl);
    const withoutImages = articles.filter((article) => !article.imageUrl);
    return [...withImages, ...withoutImages];
  };

  const computeHasMore = (pageToLoad: number, totalResults: number, receivedCount: number, pageSize: number = PAGE_SIZE) => {
    if (totalResults > 0) {
      return pageToLoad * pageSize < totalResults && receivedCount > 0;
    }
    return receivedCount === pageSize;
  };

  const buildBrowseParams = (pageToLoad: number, signal?: AbortSignal): BrowseNewsParams => ({
    query: searchQuery.trim(),
    league: leagueFilter,
    dateRange: dateFilter,
    page: pageToLoad,
    pageSize: PAGE_SIZE,
    signal,
  });

  const loadFeedPage = async (
    pageToLoad: number,
    append: boolean,
    options: { silent?: boolean; deferRanking?: boolean } = {}
  ) => {
    const { silent = false, deferRanking = false } = options;
    const shouldDeferRanking = deferRanking || (!append && pageToLoad === 1);
    if (append) {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      setLoadMoreError(null);
      setRateLimitedNotice(false);
    } else {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      setRateLimitedNotice(false);
    }

    try {
      const response = await newsAPI.getTopNews({ page: pageToLoad, pageSize: PAGE_SIZE });
      if (response.isStale) {
        setRateLimitedNotice(true);
      }
      const incomingRaw = dedupeByUrl(sanitizeArticles(response.articles));
      const fastIncoming = prioritizeArticlesWithImages(selectNewsForFeed(incomingRaw, feedSelections, 6));
      let nextItems: NewsArticle[] = fastIncoming;
      setItems((prev) => {
        nextItems = mergeFeedItems(prev, fastIncoming, append || silent);
        return nextItems;
      });
      await setCachedValue(NEWS_FEED_CACHE_KEY, nextItems);
      setPage(pageToLoad);
      setHasMore(computeHasMore(pageToLoad, response.totalResults, incomingRaw.length));

      const rankAndApply = async () => {
        const incomingRanked = await newsPersonalizationService.rankArticles(incomingRaw, userProfile?.uid);
        const rankedIncoming = prioritizeArticlesWithImages(selectNewsForFeed(incomingRanked, feedSelections, 6));
        let rankedItems: NewsArticle[] = rankedIncoming;
        setItems((prev) => {
          rankedItems = mergeFeedItems(prev, rankedIncoming, append || silent);
          return rankedItems;
        });
        await setCachedValue(NEWS_FEED_CACHE_KEY, rankedItems);
      };

      if (shouldDeferRanking) {
        void rankAndApply().catch(() => {
          // Keep the fast first-pass ordering if ranking fails.
        });
      } else {
        await rankAndApply();
      }
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
      setSearchLoadMoreError(null);
    }

    try {
      const response = await newsAPI.browseNews(buildBrowseParams(pageToLoad, signal));
      if (response.isStale) {
        setRateLimitedNotice(true);
      }
      const incomingRaw = dedupeByUrl(sanitizeArticles(response.articles));
      const incomingRanked = await newsPersonalizationService.rankArticles(incomingRaw, userProfile?.uid);
      const incoming = prioritizeArticlesWithImages(incomingRanked);
      setSearchResults((prev) => prioritizeArticlesWithImages(append ? mergeByUrl(prev, incoming) : incoming));
      setSearchPage(pageToLoad);
      setSearchHasMore(computeHasMore(pageToLoad, response.totalResults, incoming.length, PAGE_SIZE));
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
    const didReload = await reloadApp(async () => {
      await bootstrapApp({ reason: 'refresh', userId: userProfile?.uid ?? undefined });
      if (hasActiveBrowseFilters) {
        await loadSearchPage(1, false);
      } else {
        await loadFeedPage(1, false);
      }
    });
    if (!didReload) {
      setRefreshing(false);
    }
  };

  const onLoadMore = () => {
    if (!activeHasMore || activeLoadingMore) return;
    if (hasActiveBrowseFilters) {
      loadSearchPage(searchPage + 1, true);
    } else {
      loadFeedPage(page + 1, true);
    }
  };

  const onToggleSearch = () => {
    if (isSearchActive) {
      setIsSearchActive(false);
      setSearchQuery('');
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

  const prioritizedActiveItems = prioritizeArticlesWithImages(activeItems).filter((item) => !!item.imageUrl);
  const heroArticle = prioritizedActiveItems[0];
  const secondaryArticles = prioritizedActiveItems.slice(1, 3);
  const listArticles = prioritizedActiveItems.slice(3);
  const activeFilterCount = (leagueFilter !== 'All' ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0);
  const selectedDateLabel = DATE_FILTERS.find((item) => item.value === dateFilter)?.label || 'Any Time';

  const handleReaction = async (article: NewsArticle, reaction: Exclude<NewsReactionValue, null>) => {
    if (!userProfile?.uid) {
      Alert.alert('Sign in to react', 'Create an account or log in to like or dislike news articles.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => router.push('/(auth)/login' as any) },
        { text: 'Sign Up', onPress: () => router.push('/(auth)/signup' as any) },
      ]);
      return;
    }
    const nextValue: NewsReactionValue = newsReactions[article.id] === reaction ? null : reaction;
    setNewsReactions((prev) => ({ ...prev, [article.id]: nextValue }));
    try {
      await newsPersonalizationService.recordReaction(userProfile.uid, article, nextValue);
    } catch (error) {
      console.error('Unable to save news reaction:', error);
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
      <TouchableOpacity onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color={palette.text} />
      </TouchableOpacity>
      {isSearchActive ? (
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: palette.text, backgroundColor: palette.searchBg, borderColor: palette.border }]}
          placeholder="Search news"
          placeholderTextColor={palette.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : (
        <Text style={[styles.headerTitle, { color: palette.text }]}>Latest News</Text>
      )}
      <View style={styles.headerActions}>
        <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.headerIconButton}>
          <Ionicons name="options-outline" size={22} color={palette.text} />
          {activeFilterCount > 0 ? (
            <View style={[styles.filterBadge, { backgroundColor: isDark ? '#4DA3FF' : '#0066CC' }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleSearch} style={styles.headerIconButton}>
          <Ionicons name={isSearchActive ? 'close' : 'search'} size={24} color={palette.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHero = () => {
    if (!heroArticle) return null;
    return (
      <TouchableOpacity
        style={styles.heroCard}
        onPress={() => openArticle(heroArticle)}
        onPressIn={() => prefetchArticle(heroArticle)}
        activeOpacity={0.9}
      >
        <NewsImage
          uri={heroArticle.imageUrl}
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
          <View style={styles.reactionRow}>
            <TouchableOpacity
              style={[styles.reactionButton, newsReactions[heroArticle.id] === 'up' && styles.reactionButtonUp]}
              onPress={() => void handleReaction(heroArticle, 'up')}
            >
              <Ionicons name="thumbs-up" size={14} color={newsReactions[heroArticle.id] === 'up' ? '#2F9E5B' : '#E6E6E9'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reactionButton, newsReactions[heroArticle.id] === 'down' && styles.reactionButtonDown]}
              onPress={() => void handleReaction(heroArticle, 'down')}
            >
              <Ionicons name="thumbs-down" size={14} color={newsReactions[heroArticle.id] === 'down' ? '#D14343' : '#E6E6E9'} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSecondary = () => {
    if (secondaryArticles.length === 0) return null;
    return (
      <View style={styles.secondaryGrid}>
        {secondaryArticles.map((article) => (
          <TouchableOpacity
            key={article.id}
            style={[styles.secondaryCard, { borderColor: isDark ? '#2C2C2E' : '#E5E7EB' }]}
            onPress={() => openArticle(article)}
            onPressIn={() => prefetchArticle(article)}
            activeOpacity={0.88}
          >
            <NewsImage uri={article.imageUrl} style={styles.secondaryImage} resizeMode="cover" />
            <View style={styles.secondaryOverlay}>
              <Text style={styles.secondaryTitle} numberOfLines={2}>{article.title}</Text>
              <Text style={styles.secondaryMeta}>{article.source}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderListItem = ({ item, index }: { item: NewsArticle; index: number }) => (
    <TouchableOpacity
      style={[
        index % 4 === 0
          ? [styles.featureListItem, { borderColor: isDark ? '#2C2C2E' : '#E5E7EB', backgroundColor: palette.card }]
          : [styles.listItem, { borderBottomColor: isDark ? '#2C2C2E' : '#F0F0F0' }],
      ]}
      onPress={() => openArticle(item)}
      onPressIn={() => prefetchArticle(item)}
      activeOpacity={0.7}
    >
      {index % 4 === 0 ? (
        <>
          <NewsImage uri={item.imageUrl} style={styles.featureListImage} resizeMode="cover" />
          <View style={styles.featureListContent}>
            <Text style={[styles.listItemCategory, { color: isDark ? '#8CC4FF' : '#37003C' }]}>{item.category}</Text>
            <Text style={[styles.featureListTitle, { color: palette.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.metaReactionRow}>
              <Text style={[styles.listItemMeta, { color: palette.subtext }]}>{item.source} - {formatTimeAgo(item.publishedAt)}</Text>
              <View style={styles.inlineReactionRow}>
                <TouchableOpacity
                  style={[
                    styles.reactionButtonSmall,
                    { backgroundColor: isDark ? '#2A2A2E' : '#F3F4F6' },
                    newsReactions[item.id] === 'up' && styles.reactionButtonUp,
                  ]}
                  onPress={() => void handleReaction(item, 'up')}
                >
                  <Ionicons name="thumbs-up" size={12} color={newsReactions[item.id] === 'up' ? '#2F9E5B' : '#9AA3AF'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reactionButtonSmall,
                    { backgroundColor: isDark ? '#2A2A2E' : '#F3F4F6' },
                    newsReactions[item.id] === 'down' && styles.reactionButtonDown,
                  ]}
                  onPress={() => void handleReaction(item, 'down')}
                >
                  <Ionicons name="thumbs-down" size={12} color={newsReactions[item.id] === 'down' ? '#D14343' : '#9AA3AF'} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.listItemContent}>
            <Text style={[styles.listItemCategory, { color: isDark ? '#8CC4FF' : '#37003C' }]}>{item.category}</Text>
            <Text style={[styles.listItemTitle, { color: palette.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.metaReactionRow}>
              <Text style={[styles.listItemMeta, { color: palette.subtext }]}>
                {item.source} - {formatTimeAgo(item.publishedAt)}
              </Text>
              <View style={styles.inlineReactionRow}>
                <TouchableOpacity
                  style={[
                    styles.reactionButtonSmall,
                    { backgroundColor: isDark ? '#2A2A2E' : '#F3F4F6' },
                    newsReactions[item.id] === 'up' && styles.reactionButtonUp,
                  ]}
                  onPress={() => void handleReaction(item, 'up')}
                >
                  <Ionicons name="thumbs-up" size={12} color={newsReactions[item.id] === 'up' ? '#2F9E5B' : '#9AA3AF'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reactionButtonSmall,
                    { backgroundColor: isDark ? '#2A2A2E' : '#F3F4F6' },
                    newsReactions[item.id] === 'down' && styles.reactionButtonDown,
                  ]}
                  onPress={() => void handleReaction(item, 'down')}
                >
                  <Ionicons name="thumbs-down" size={12} color={newsReactions[item.id] === 'down' ? '#D14343' : '#9AA3AF'} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={styles.listItemImageContainer}>
            <NewsImage uri={item.imageUrl} style={styles.listItemImage} resizeMode="cover" />
          </View>
        </>
      )}
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (activeLoadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={palette.text} />
        </View>
      );
    }

    if (activeLoadMoreError) {
      return (
        <TouchableOpacity style={styles.loadMoreError} onPress={onLoadMore}>
          <Text style={[styles.loadMoreErrorText, { color: palette.subtext }]}>{activeLoadMoreError === rateLimitMessage ? rateLimitMessage : "Couldn't load more. Tap to retry."}</Text>
        </TouchableOpacity>
      );
    }

    if (activeHasMore) {
      return (
        <View style={styles.footerButtonWrap}>
          <TouchableOpacity style={[styles.seeMoreButton, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={onLoadMore}>
            <Text style={[styles.seeMoreButtonText, { color: isDark ? '#9CCBFF' : '#0066CC' }]}>See More</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return <View style={{ height: 24 }} />;
  };

  const renderEmpty = () => {
    if (activeLoading) return null;
    const fallbackMessage = activeError || newsAPI.getFallbackMessage();
    return (
      <View style={styles.emptyState}>
        <Ionicons name="newspaper-outline" size={64} color={palette.subtext} />
        <Text style={[styles.emptyText, { color: palette.subtext }]}>
          {fallbackMessage || 'No soccer news available right now'}
        </Text>
      </View>
    );
  };

  if (activeLoading && activeItems.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.text} />
        </View>
      </View>
    );
  }

  if (activeError && activeItems.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: palette.subtext }]}>{activeError === rateLimitMessage ? rateLimitMessage : "Couldn't load news. Tap to retry."}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: isDark ? palette.card : '#111111' }]} onPress={() => (hasActiveBrowseFilters ? loadSearchPage(1, false) : loadFeedPage(1, false))}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {renderHeader()}
      {(leagueFilter !== 'All' || dateFilter !== 'all') && (
        <View style={styles.activeFiltersRow}>
          {leagueFilter !== 'All' ? (
            <View style={[styles.activeFilterChip, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.activeFilterText, { color: palette.text }]}>{leagueFilter}</Text>
            </View>
          ) : null}
          {dateFilter !== 'all' ? (
            <View style={[styles.activeFilterChip, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.activeFilterText, { color: palette.text }]}>{selectedDateLabel}</Text>
            </View>
          ) : null}
        </View>
      )}

      <FlatList
        data={listArticles}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        ListHeaderComponent={
          <View>
            {searchLoading && hasActiveBrowseFilters && (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={palette.text} />
                <Text style={[styles.searchingText, { color: palette.subtext }]}>Searching...</Text>
              </View>
            )}
            {renderHero()}
            {renderSecondary()}
          </View>
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
      />
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.filterOverlay}>
          <View style={[styles.filterSheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.filterHeader}>
              <Text style={[styles.filterTitle, { color: palette.text }]}>Filter News</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={20} color={palette.subtext} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.filterLabel, { color: palette.subtext }]}>League</Text>
            <View style={styles.filterChipRow}>
              {LEAGUE_FILTERS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.filterChip,
                    { backgroundColor: palette.background, borderColor: palette.border },
                    leagueFilter === option && { borderColor: isDark ? '#4DA3FF' : '#0066CC' },
                  ]}
                  onPress={() => setLeagueFilter(option)}
                >
                  <Text style={[styles.filterChipText, { color: palette.text }]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.filterLabel, { color: palette.subtext }]}>Date</Text>
            <View style={styles.filterChipRow}>
              {DATE_FILTERS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterChip,
                    { backgroundColor: palette.background, borderColor: palette.border },
                    dateFilter === option.value && { borderColor: isDark ? '#4DA3FF' : '#0066CC' },
                  ]}
                  onPress={() => setDateFilter(option.value)}
                >
                  <Text style={[styles.filterChipText, { color: palette.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={[styles.filterResetButton, { borderColor: palette.border }]}
                onPress={() => {
                  setLeagueFilter('All');
                  setDateFilter('all');
                }}
              >
                <Text style={[styles.filterResetText, { color: palette.subtext }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterApplyButton, { backgroundColor: isDark ? '#4DA3FF' : '#0066CC' }]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.filterApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    marginHorizontal: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F5F5F7',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    fontSize: 15,
    color: '#000'
  },
  listContent: {
    paddingBottom: 24,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  activeFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '600',
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
  footerButtonWrap: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  seeMoreButton: {
    minWidth: 148,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  seeMoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  loadMoreErrorText: {
    fontSize: 13,
    color: '#666'
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  filterResetButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterApplyButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  filterApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  reactionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  reactionButton: {
    width: 30,
    height: 30,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,18,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  reactionButtonUp: {
    borderColor: '#2F9E5B',
    backgroundColor: 'rgba(47,158,91,0.18)',
  },
  reactionButtonDown: {
    borderColor: '#D14343',
    backgroundColor: 'rgba(209,67,67,0.18)',
  },
  secondaryGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  secondaryCard: {
    flex: 1,
    height: 176,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
  },
  secondaryImage: {
    width: '100%',
    height: '100%',
  },
  secondaryOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,12,14,0.66)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  secondaryTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 4,
  },
  secondaryMeta: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
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
  featureListItem: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  featureListImage: {
    width: '100%',
    height: 170,
  },
  featureListContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  featureListTitle: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 8,
  },
  metaReactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineReactionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reactionButtonSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
});
