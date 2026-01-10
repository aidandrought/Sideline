// app/matchPreview/[id].tsx
// Pre-match overview screen (before chat opens)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { footballAPI, Match } from '../../services/footballApi';
import { matchDetailService, TeamForm, TeamNews } from '../../services/matchDetailService';
import { newsAPI, NewsArticle } from '../../services/newsApi';

interface NewsReaction {
  [articleId: string]: 'up' | 'down' | null;
}

export default function MatchPreviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [homeForm, setHomeForm] = useState<TeamForm | null>(null);
  const [awayForm, setAwayForm] = useState<TeamForm | null>(null);
  const [homeNews, setHomeNews] = useState<TeamNews | null>(null);
  const [awayNews, setAwayNews] = useState<TeamNews | null>(null);
  const [relatedNews, setRelatedNews] = useState<NewsArticle[]>([]);
  const [newsReactions, setNewsReactions] = useState<NewsReaction>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatchData();
  }, [id]);

  const loadMatchData = async () => {
    try {
      // Get match details
      const upcoming = await footballAPI.getUpcomingMatches();
      const foundMatch = upcoming.find(m => m.id.toString() === id);
      
      if (foundMatch) {
        setMatch(foundMatch);

        // Load team news and form (these would need team IDs in real implementation)
        // For now using mock data
        setHomeForm(await matchDetailService.getTeamForm(0));
        setAwayForm(await matchDetailService.getTeamForm(0));
        setHomeNews(await matchDetailService.getTeamNews(0));
        setAwayNews(await matchDetailService.getTeamNews(0));

        // Search for news about this fixture
        const searchQuery = `${foundMatch.home} ${foundMatch.away}`;
        const news = await newsAPI.searchNews(searchQuery);
        setRelatedNews(news.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading match preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewsReaction = (articleId: string, reaction: 'up' | 'down') => {
    setNewsReactions(prev => ({
      ...prev,
      [articleId]: prev[articleId] === reaction ? null : reaction
    }));
  };

  const getKickoffTime = () => {
    if (!match) return '';
    const date = new Date(match.date);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles'
    });
  };

  const getFormEmoji = (result: 'W' | 'D' | 'L') => {
    if (result === 'W') return '✅';
    if (result === 'D') return '➖';
    return '❌';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Match Preview</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading preview...</Text>
        </View>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Match not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match Preview</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Match Info Card */}
      <View style={styles.matchCard}>
        <Text style={styles.league}>{match.league}</Text>
        <View style={styles.teamsContainer}>
          <Text style={styles.team}>{match.home}</Text>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.team}>{match.away}</Text>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="calendar" size={18} color="#FFD60A" />
          <Text style={styles.kickoffText}>{getKickoffTime()}</Text>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="location" size={18} color="#FFD60A" />
          <Text style={styles.kickoffText}>Stadium TBD</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Team Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Form</Text>
          
          <View style={styles.formContainer}>
            <View style={styles.teamFormCard}>
              <Text style={styles.teamFormName}>{match.home}</Text>
              <View style={styles.formRow}>
                {homeForm?.last5.map((result, idx) => (
                  <View key={idx} style={styles.formBadge}>
                    <Text style={styles.formEmoji}>{getFormEmoji(result.result)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.teamFormCard}>
              <Text style={styles.teamFormName}>{match.away}</Text>
              <View style={styles.formRow}>
                {awayForm?.last5.map((result, idx) => (
                  <View key={idx} style={styles.formBadge}>
                    <Text style={styles.formEmoji}>{getFormEmoji(result.result)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Team News & Injuries */}
        {(homeNews?.injuries.length || awayNews?.injuries.length) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team News</Text>
            
            {homeNews?.injuries && homeNews.injuries.length > 0 && (
              <View style={styles.newsCard}>
                <Text style={styles.newsTeam}>{match.home}</Text>
                {homeNews.injuries.map((injury, idx) => (
                  <View key={idx} style={styles.injuryItem}>
                    <Ionicons name="medical" size={16} color="#FF3B30" />
                    <Text style={styles.injuryText}>
                      {injury.player} - {injury.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {awayNews?.injuries && awayNews.injuries.length > 0 && (
              <View style={styles.newsCard}>
                <Text style={styles.newsTeam}>{match.away}</Text>
                {awayNews.injuries.map((injury, idx) => (
                  <View key={idx} style={styles.injuryItem}>
                    <Ionicons name="medical" size={16} color="#FF3B30" />
                    <Text style={styles.injuryText}>
                      {injury.player} - {injury.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Related News */}
        {relatedNews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest News</Text>
            
            {relatedNews.map((article) => (
              <View key={article.id} style={styles.articleCard}>
                <TouchableOpacity
                  onPress={() => router.push(`/newsDetail/${encodeURIComponent(article.id)}` as any)}
                >
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  <Text style={styles.articleDescription} numberOfLines={2}>
                    {article.description}
                  </Text>
                  <Text style={styles.articleSource}>{article.source}</Text>
                </TouchableOpacity>

                {/* Thumbs Up/Down */}
                <View style={styles.articleActions}>
                  <TouchableOpacity
                    style={[
                      styles.thumbButton,
                      newsReactions[article.id] === 'up' && styles.thumbButtonActive
                    ]}
                    onPress={() => handleNewsReaction(article.id, 'up')}
                  >
                    <Ionicons 
                      name="thumbs-up" 
                      size={18} 
                      color={newsReactions[article.id] === 'up' ? '#34C759' : '#666'} 
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.thumbButton,
                      newsReactions[article.id] === 'down' && styles.thumbButtonActive
                    ]}
                    onPress={() => handleNewsReaction(article.id, 'down')}
                  >
                    <Ionicons 
                      name="thumbs-down" 
                      size={18} 
                      color={newsReactions[article.id] === 'down' ? '#FF3B30' : '#666'} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Chat Opens In... Banner */}
      <View style={styles.chatBanner}>
        <Ionicons name="time-outline" size={20} color="#0066CC" />
        <Text style={styles.chatBannerText}>Chat opens 45 minutes before kickoff</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#1C1C1E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  matchCard: {
    backgroundColor: '#1C1C1E',
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  league: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 16,
  },
  teamsContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  team: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginVertical: 4,
  },
  vs: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginVertical: 8,
  },
  kickoffInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  kickoffText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 16,
  },
  formContainer: {
    gap: 12,
  },
  teamFormCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
  },
  teamFormName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formBadge: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  formEmoji: {
    fontSize: 18,
  },
  newsCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  newsTeam: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
  },
  injuryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  injuryText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  articleCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
    lineHeight: 22,
  },
  articleDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
    lineHeight: 20,
  },
  articleSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 12,
  },
  articleActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  thumbButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  thumbButtonActive: {
    backgroundColor: '#3C3C3E',
  },
  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 16,
    gap: 8,
  },
  chatBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
  },
});


