// app/newsDetail/[id].tsx
// News Article Detail - PL App Style
// Features: Purple title, tag pills, full-width image, author/date, highlighted team names, NO comments

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { newsAPI, NewsArticle } from '../../services/newsApi';

// Teams to highlight in purple (clickable style)
const HIGHLIGHT_TEAMS = [
  'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Man City',
  'Manchester United', 'Man United', 'Tottenham', 'Newcastle', 'West Ham',
  'Aston Villa', 'Brighton', 'Fulham', 'Brentford', 'Crystal Palace',
  'Everton', 'Wolves', 'Wolverhampton Wanderers', 'Bournemouth', 'Nottingham Forest',
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Bayern Munich', 'Dortmund',
  'Borussia Dortmund', 'PSG', 'Paris Saint-Germain', 'Juventus', 'Inter Milan',
  'AC Milan', 'Roma', 'Napoli', 'Lazio', 'Inter', 'Milan',
  'Macclesfield', 'Morecambe', 'Hull City',
];

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
      const articleId = Array.isArray(id) ? id[0] : id;
      const decodedId = typeof articleId === 'string' ? decodeURIComponent(articleId) : '';
      const found = decodedId ? await newsAPI.getArticleById(decodedId) : null;
      setArticle(found);
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
        message: `${article.title}\n\nRead more on Sideline`,
        title: article.title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Render content with highlighted team names
  const renderHighlightedContent = (text: string) => {
    if (!text) return null;

    // Split text into paragraphs
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    return paragraphs.map((paragraph, pIndex) => {
      // Find all team mentions and their positions
      let segments: { text: string; isTeam: boolean }[] = [];
      let remainingText = paragraph;
      let lastIndex = 0;

      // Sort teams by length (longest first) to avoid partial matches
      const sortedTeams = [...HIGHLIGHT_TEAMS].sort((a, b) => b.length - a.length);

      // Create a regex pattern for all teams
      const teamPattern = new RegExp(
        `\\b(${sortedTeams.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
        'gi'
      );

      let match;
      let currentIndex = 0;
      const matches: { start: number; end: number; team: string }[] = [];

      while ((match = teamPattern.exec(paragraph)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          team: match[0],
        });
      }

      // Build segments
      if (matches.length === 0) {
        segments = [{ text: paragraph, isTeam: false }];
      } else {
        matches.forEach((m, i) => {
          // Add text before this match
          if (m.start > currentIndex) {
            segments.push({
              text: paragraph.slice(currentIndex, m.start),
              isTeam: false,
            });
          }
          // Add the team name
          segments.push({
            text: m.team,
            isTeam: true,
          });
          currentIndex = m.end;
        });
        // Add remaining text
        if (currentIndex < paragraph.length) {
          segments.push({
            text: paragraph.slice(currentIndex),
            isTeam: false,
          });
        }
      }

      return (
        <Text key={pIndex} style={styles.paragraph}>
          {segments.map((segment, sIndex) => (
            <Text
              key={sIndex}
              style={segment.isTeam ? styles.highlightedTeam : undefined}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      );
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#37003C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>News</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#37003C" />
        </View>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#37003C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>News</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="newspaper-outline" size={64} color="#E5E7EB" />
          <Text style={styles.errorText}>Article not found</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Get display tags (max 3 + overflow count)
  const displayTags = article.tags?.slice(0, 3) || ['news'];
  const overflowCount = (article.tags?.length || 1) - 3;

  return (
    <View style={styles.container}>
      {/* Header - PL Style */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#37003C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>News</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareText}>Share</Text>
          <Ionicons name="paper-plane-outline" size={18} color="#37003C" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Title - Large Purple */}
        <Text style={styles.title}>{article.title}</Text>

        {/* Tags Row */}
        <View style={styles.tagsRow}>
          {displayTags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {overflowCount > 0 && (
            <View style={styles.tagOverflow}>
              <Text style={styles.tagOverflowText}>+{overflowCount}</Text>
            </View>
          )}
        </View>

        {/* Full-width Image */}
        {article.imageUrl && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: article.imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Author · Date */}
        <Text style={styles.authorDate}>
          {article.author || 'Staff Writer'} · {formatDate(article.publishedAt)}
        </Text>

        {/* Description (Italic intro) */}
        <Text style={styles.description}>{article.description}</Text>

        {/* Article Content with highlighted teams */}
        <View style={styles.articleBody}>
          {renderHighlightedContent(article.content)}
        </View>

        {/* Read More Link */}
        {article.url && article.url !== '#' && (
          <TouchableOpacity style={styles.readMoreButton}>
            <Text style={styles.readMoreText}>
              Read full article on {article.source}
            </Text>
            <Ionicons name="open-outline" size={16} color="#37003C" />
          </TouchableOpacity>
        )}

        {/* Source Attribution */}
        <View style={styles.sourceAttribution}>
          <Text style={styles.sourceLabel}>Source</Text>
          <Text style={styles.sourceName}>{article.source}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 40,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#37003C',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
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
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#37003C',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // Title - Large Purple (PL Style)
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#37003C',
    lineHeight: 34,
    marginBottom: 16,
  },

  // Tags Row
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  tagOverflow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagOverflowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },

  // Image
  imageContainer: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#F5F5F7',
  },
  image: {
    width: '100%',
    height: '100%',
  },

  // Author & Date
  authorDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },

  // Description (Italic intro paragraph)
  description: {
    fontSize: 18,
    fontStyle: 'italic',
    fontWeight: '500',
    color: '#37003C',
    lineHeight: 26,
    marginBottom: 24,
  },

  // Article Body
  articleBody: {
    marginBottom: 24,
  },
  paragraph: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
    marginBottom: 20,
  },
  highlightedTeam: {
    color: '#37003C',
    fontWeight: '600',
  },

  // Read More Button
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#37003C',
    borderRadius: 8,
    marginBottom: 24,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37003C',
  },

  // Source Attribution
  sourceAttribution: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  sourceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  sourceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37003C',
  },
});