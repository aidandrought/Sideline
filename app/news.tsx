// app/news.tsx
// News List - PL App Style
// Hero card with gradient overlay, list items with thumbnail on right

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { newsAPI, NewsArticle } from '../services/newsApi';

export default function NewsScreen() {
  const router = useRouter();
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      const articles = await newsAPI.getSoccerNews();
      setNews(articles);
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
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

  const heroArticle = news[0];
  const listArticles = news.slice(1);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Latest News</Text>
          <TouchableOpacity>
            <Ionicons name="search" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#37003C" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Latest News</Text>
        <TouchableOpacity>
          <Ionicons name="search" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {news.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={64} color="#E5E7EB" />
            <Text style={styles.emptyText}>No news available</Text>
          </View>
        ) : (
          <>
            {/* Hero Card - Full image with gradient overlay */}
            {heroArticle && (
              <TouchableOpacity
                style={styles.heroCard}
                onPress={() => router.push(`/newsDetail/${encodeURIComponent(heroArticle.id)}` as any)}
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
            )}

            {/* List Items - Title on left, thumbnail on right */}
            <View style={styles.listSection}>
              {listArticles.map((article) => (
                <TouchableOpacity
                  key={article.id}
                  style={styles.listItem}
                  onPress={() => router.push(`/newsDetail/${encodeURIComponent(article.id)}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemCategory}>{article.category}</Text>
                    <Text style={styles.listItemTitle} numberOfLines={2}>
                      {article.title}
                    </Text>
                    <Text style={styles.listItemMeta}>
                      {article.source} · {formatTimeAgo(article.publishedAt)}
                    </Text>
                  </View>
                  
                  {article.imageUrl && (
                    <View style={styles.listItemImageContainer}>
                      <Image
                        source={{ uri: article.imageUrl }}
                        style={styles.listItemImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  listSection: {
    paddingHorizontal: 16,
  },
  listItem: {
    flexDirection: 'row',
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