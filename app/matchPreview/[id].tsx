// app/matchPreview/[id].tsx
// Pre-match overview screen (before chat opens)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { footballAPI, Match } from '../../services/footballApi';
import { matchDetailService, TeamForm, TeamNews } from '../../services/matchDetailService';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';

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
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsUnavailable, setNewsUnavailable] = useState(false);
  const [newsErrorMessage, setNewsErrorMessage] = useState<string | null>(null);
  const [newsReactions, setNewsReactions] = useState<NewsReaction>({});
  const [loading, setLoading] = useState(true);
  const isLive = match?.status === 'live';

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
        setNewsLoading(true);
        const teamA = foundMatch.home;
        const teamB = foundMatch.away;

        const matchNewsResponse = await newsAPI.matchNews({
          teamA,
          teamB,
          competition: foundMatch.league,
          pageSize: 10
        });

        setRelatedNews(matchNewsResponse.articles);
        setNewsUnavailable(matchNewsResponse.articles.length < 10);
        setNewsErrorMessage(matchNewsResponse.isStale ? "News is temporarily rate-limited. Try again shortly." : null);
        setNewsLoading(false);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        setNewsErrorMessage('News is temporarily rate-limited. Try again shortly.');
      }
      console.error('Error loading match preview:', error);
      setNewsLoading(false);
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
      <View style={[styles.container, isLive && styles.containerLive]}>
        <View style={[styles.header, isLive && styles.headerLive]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={isLive ? '#FFF' : '#000'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isLive && styles.textLive]}>Match Preview</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, isLive && styles.subTextLive]}>Loading preview...</Text>
        </View>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.container, isLive && styles.containerLive]}>
        <View style={[styles.header, isLive && styles.headerLive]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={isLive ? '#FFF' : '#000'} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, isLive && styles.subTextLive]}>Match not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isLive && styles.containerLive]}>
      {/* Header */}
      <View style={[styles.header, isLive && styles.headerLive]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={isLive ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLive && styles.textLive]}>Match Preview</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Match Info Card */}
      <View style={[styles.matchCard, isLive && styles.cardLive]}>
        <Text style={[styles.league, isLive && styles.subTextLive]}>{match.league}</Text>
        <View style={styles.teamsContainer}>
          <Text style={[styles.team, isLive && styles.textLive]}>{match.home}</Text>
          <Text style={[styles.vs, isLive && styles.textLive]}>VS</Text>
          <Text style={[styles.team, isLive && styles.textLive]}>{match.away}</Text>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="calendar" size={18} color="#FFD60A" />
          <Text style={[styles.kickoffText, isLive && styles.textLive]}>{getKickoffTime()}</Text>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="location" size={18} color="#FFD60A" />
          <Text style={[styles.kickoffText, isLive && styles.textLive]}>Stadium TBD</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Team Form */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Recent Form</Text>
          
          <View style={styles.formContainer}>
            <View style={[styles.teamFormCard, isLive && styles.cardLive]}>
              <Text style={[styles.teamFormName, isLive && styles.textLive]}>{match.home}</Text>
              <View style={styles.formRow}>
                {homeForm?.last5.map((result, idx) => (
                  <View key={idx} style={styles.formBadge}>
                    <Text style={styles.formEmoji}>{getFormEmoji(result.result)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.teamFormCard, isLive && styles.cardLive]}>
              <Text style={[styles.teamFormName, isLive && styles.textLive]}>{match.away}</Text>
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
        {((homeNews?.injuries?.length ?? 0) > 0 || (awayNews?.injuries?.length ?? 0) > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Team News</Text>
            
            {homeNews?.injuries && homeNews.injuries.length > 0 && (
              <View style={[styles.newsCard, isLive && styles.cardLive]}>
                <Text style={[styles.newsTeam, isLive && styles.textLive]}>{match.home}</Text>
                {homeNews.injuries.map((injury, idx) => (
                  <View key={idx} style={styles.injuryItem}>
                    <Ionicons name="medical" size={16} color="#FF3B30" />
                    <Text style={[styles.injuryText, isLive && styles.subTextLive]}>
                      {injury.player} - {injury.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {awayNews?.injuries && awayNews.injuries.length > 0 && (
              <View style={[styles.newsCard, isLive && styles.cardLive]}>
                <Text style={[styles.newsTeam, isLive && styles.textLive]}>{match.away}</Text>
                {awayNews.injuries.map((injury, idx) => (
                  <View key={idx} style={styles.injuryItem}>
                    <Ionicons name="medical" size={16} color="#FF3B30" />
                    <Text style={[styles.injuryText, isLive && styles.subTextLive]}>
                      {injury.player} - {injury.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Related News */}
        {(newsLoading || relatedNews.length > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Latest News</Text>

            {newsLoading ? (
              <Text style={[styles.loadingText, isLive && styles.subTextLive]}>Loading news...</Text>
            ) : (
              <>
                {relatedNews.map((article) => (
                  <View key={article.id} style={[styles.articleCard, isLive && styles.cardLive]}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/news/reader', params: { url: article.url, title: article.title, source: article.source, author: article.author || '', publishedAt: article.publishedAt, imageUrl: article.imageUrl || '' } } as any)}
                    >
                      <Text style={[styles.articleTitle, isLive && styles.textLive]}>{article.title}</Text>
                      <Text style={[styles.articleDescription, isLive && styles.subTextLive]} numberOfLines={2}>
                        {article.description}
                      </Text>
                      <Text style={[styles.articleSource, isLive && styles.subTextLive]}>{article.source}</Text>
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
                {relatedNews.length > 0 && (
                  <TouchableOpacity
                    style={[styles.loadMoreButton, isLive && styles.cardLive]}
                    onPress={() => router.push({ pathname: '/(tabs)/explore', params: { initialTab: 'news', mode: 'news', q: `${match.home} ${match.away}` } } as any)}
                  >
                    <Text style={[styles.loadMoreText, isLive && styles.textLive]}>Load more</Text>
                  </TouchableOpacity>
                )}
                {newsErrorMessage && (
                  <Text style={[styles.newsUnavailable, isLive && styles.subTextLive]}>
                    News is temporarily rate-limited. Try again shortly.
                  </Text>
                )}
                {newsUnavailable && (
                  <Text style={[styles.newsUnavailable, isLive && styles.subTextLive]}>
                    More news not available
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Chat Opens In... Banner */}
      <View style={[styles.chatBanner, isLive && styles.cardLive]}>
        <Ionicons name="time-outline" size={20} color="#0066CC" />
        <Text style={[styles.chatBannerText, isLive && styles.textLive]}>Chat opens 45 minutes before kickoff</Text>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  containerLive: {
    backgroundColor: '#0A0A0A',
  },
  headerLive: {
    backgroundColor: '#1C1C1E',
  },
  cardLive: {
    backgroundColor: '#1C1C1E',
  },
  textLive: {
    color: '#FFF',
  },
  subTextLive: {
    color: '#8E8E93',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  matchCard: {
    backgroundColor: '#FFF',
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  league: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  teamsContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  team: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginVertical: 4,
  },
  vs: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
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
    color: '#000',
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
    color: '#000',
    marginBottom: 16,
  },
  formContainer: {
    gap: 12,
  },
  teamFormCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  teamFormName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  formEmoji: {
    fontSize: 18,
  },
  newsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  newsTeam: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
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
    color: '#666',
  },
  articleCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    lineHeight: 22,
  },
  articleDescription: {
    fontSize: 14,
    color: '#666',
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
    borderTopColor: '#E5E7EB',
  },
  newsUnavailable: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
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


