// app/newsDetail/[id].tsx
// News article detail page - Shows source, author, full content (no reactions)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { newsAPI, NewsArticle } from '../../services/newsApi';

export default function NewsDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArticle();
  }, [id]);

  const loadArticle = async () => {
    try {
      const news = await newsAPI.getSoccerNews();
      const found = news.find(n => n.id === decodeURIComponent(id as string));
      if (found) setArticle(found);
    } catch (error) {
      console.error('Error loading article:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({
        title: article.title,
        message: `${article.title}\n\nRead more: ${article.url}`,
        url: article.url
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleOpenSource = () => {
    if (article?.url && article.url !== '#') {
      Linking.openURL(article.url);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading article...</Text>
        </View>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="newspaper-outline" size={64} color="#E5E7EB" />
          <Text style={styles.errorText}>Article not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
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
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Article Image */}
        {article.imageUrl && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: article.imageUrl }} style={styles.articleImage} />
          </View>
        )}

        {/* Article Content */}
        <View style={styles.articleContent}>
          {/* Source & Date Badge */}
          <View style={styles.metaRow}>
            <View style={styles.sourceBadge}>
              <Ionicons name="newspaper" size={14} color="#0066CC" />
              <Text style={styles.sourceText}>{article.source}</Text>
            </View>
            <Text style={styles.dateText}>{formatDate(article.publishedAt)}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{article.title}</Text>

          {/* Author Info */}
          {article.author && (
            <View style={styles.authorSection}>
              <View style={styles.authorAvatar}>
                <Ionicons name="person" size={16} color="#666" />
              </View>
              <View style={styles.authorInfo}>
                <Text style={styles.authorLabel}>Written by</Text>
                <Text style={styles.authorName}>{article.author}</Text>
              </View>
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Description */}
          {article.description && (
            <Text style={styles.description}>{article.description}</Text>
          )}

          {/* Full Content */}
          <Text style={styles.articleText}>
            {article.content || article.description}
          </Text>

          {/* Source Link */}
          <TouchableOpacity style={styles.sourceLink} onPress={handleOpenSource}>
            <Ionicons name="open-outline" size={18} color="#0066CC" />
            <Text style={styles.sourceLinkText}>Read full article at {article.source}</Text>
          </TouchableOpacity>

          {/* Article Info Box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Article Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Source:</Text>
              <Text style={styles.infoValue}>{article.source}</Text>
            </View>
            {article.author && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Author:</Text>
                <Text style={styles.infoValue}>{article.author}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Published:</Text>
              <Text style={styles.infoValue}>
                {new Date(article.publishedAt).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  headerButton: {
    padding: 5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#0066CC',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 250,
  },
  articleImage: {
    width: '100%',
    height: '100%',
  },
  articleContent: {
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  sourceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
  },
  dateText: {
    fontSize: 13,
    color: '#999',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000',
    lineHeight: 34,
    marginBottom: 20,
  },
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorLabel: {
    fontSize: 12,
    color: '#999',
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 20,
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    lineHeight: 26,
    marginBottom: 20,
  },
  articleText: {
    fontSize: 17,
    color: '#444',
    lineHeight: 28,
    marginBottom: 24,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    marginBottom: 24,
  },
  sourceLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0066CC',
  },
  infoBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#999',
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});