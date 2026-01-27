// app/matchPreview/[id].tsx
// Pre-match overview screen (before chat opens)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { footballAPI, Match } from '../../services/footballApi';
import { matchDetailService, TeamNews } from '../../services/matchDetailService';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { getOrFetchCached } from '../../services/cacheService';

const MATCH_NEWS_TTL_MS = 30 * 60 * 1000;
const ACCENT = '#2B5BC7';

interface NewsReaction {
  [articleId: string]: 'up' | 'down' | null;
}

export default function MatchPreviewScreen() {
  const router = useRouter();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { id } = useLocalSearchParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [homeRecentForm, setHomeRecentForm] = useState<('W' | 'D' | 'L')[] | null>(null);
  const [awayRecentForm, setAwayRecentForm] = useState<('W' | 'D' | 'L')[] | null>(null);
  const [homeNews, setHomeNews] = useState<TeamNews | null>(null);
  const [awayNews, setAwayNews] = useState<TeamNews | null>(null);
  const [relatedNews, setRelatedNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsErrorMessage, setNewsErrorMessage] = useState<string | null>(null);
  const [newsReactions, setNewsReactions] = useState<NewsReaction>({});
  const [loading, setLoading] = useState(true);
  const [venueLabel, setVenueLabel] = useState('Venue TBD');
  const isLive = match?.status === 'live';
  const matchQuery = match ? `"${match.home}" OR "${match.away}"` : '';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/index');
    }
  };

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
        setVenueLabel(getVenueLabel(foundMatch));

        // Load team news and form (these would need team IDs in real implementation)
        // For now using mock data
        setHomeNews(await matchDetailService.getTeamNews(0));
        setAwayNews(await matchDetailService.getTeamNews(0));

        // Search for news about this fixture
        setNewsLoading(true);
        const teamA = foundMatch.home;
        const teamB = foundMatch.away;
        const cacheKey = `news:match:${teamA.toLowerCase()}:${teamB.toLowerCase()}`;

        const matchNewsResponse = await getOrFetchCached(
          cacheKey,
          MATCH_NEWS_TTL_MS,
          () => newsAPI.searchMatchNews({ teamA, teamB, limit: 5, page: 1 })
        );

        let combinedNews = dedupeArticles(matchNewsResponse);
        if (combinedNews.length < 3 && foundMatch.league) {
          const competitionKey = `news:competition:${foundMatch.league.toLowerCase()}`;
          const competitionNewsResponse = await getOrFetchCached(
            competitionKey,
            MATCH_NEWS_TTL_MS,
            async () => {
              const response = await newsAPI.searchNewsQuery({ q: foundMatch.league, page: 1, pageSize: 10 });
              return response.articles || [];
            }
          );
          combinedNews = dedupeArticles([...combinedNews, ...competitionNewsResponse]);
        }

        setRelatedNews(combinedNews.slice(0, 5));
        setNewsErrorMessage(null);
        setNewsLoading(false);

        const [homeFixtures, awayFixtures] = await Promise.all([
          foundMatch.homeId ? footballAPI.getTeamLastFixtures(foundMatch.homeId, 5) : Promise.resolve([]),
          foundMatch.awayId ? footballAPI.getTeamLastFixtures(foundMatch.awayId, 5) : Promise.resolve([])
        ]);

        setHomeRecentForm(homeFixtures.length === 5 ? buildFormFromFixtures(homeFixtures, foundMatch.home) : null);
        setAwayRecentForm(awayFixtures.length === 5 ? buildFormFromFixtures(awayFixtures, foundMatch.away) : null);

        if (!foundMatch.venueName) {
          const fixture = await footballAPI.getFixtureById(foundMatch.id);
          if (fixture?.fixture?.venue) {
            setVenueLabel(getVenueLabel({ venueName: fixture.fixture.venue.name, venueCity: fixture.fixture.venue.city }));
          }
        }
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

  const buildFormFromFixtures = (
    fixtures: { home: string; away: string; homeGoals?: number; awayGoals?: number }[],
    teamName: string
  ) => {
    const normalizedTeam = teamName.toLowerCase();
    const results = fixtures.map(fixture => {
      const isHome = fixture.home.toLowerCase() === normalizedTeam;
      const homeGoals = fixture.homeGoals ?? 0;
      const awayGoals = fixture.awayGoals ?? 0;
      const teamGoals = isHome ? homeGoals : awayGoals;
      const oppGoals = isHome ? awayGoals : homeGoals;
      if (teamGoals > oppGoals) return 'W';
      if (teamGoals < oppGoals) return 'L';
      return 'D';
    });
    return results.length === 5 ? results : null;
  };

  const getArticleImage = (article: any) =>
    article?.imageUrl || article?.urlToImage || article?.image || article?.thumbnail || '';

  const getVenueLabel = (fixture: { venueName?: string; venueCity?: string } | null) => {
    if (!fixture?.venueName) return 'Venue TBD';
    if (fixture.venueCity) return `${fixture.venueName} \u2022 ${fixture.venueCity}`;
    return fixture.venueName;
  };

  const dedupeArticles = (articles: NewsArticle[]) => {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = (article.url || `${article.title}-${article.publishedAt}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };


  if (loading) {
  return (
      <View style={[styles.container, isLive && styles.containerLive]}>
        <View style={[styles.header, isLive && styles.headerLive]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={isLive ? '#FFF' : '#000'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, styles.headerTitleCentered, isLive && styles.textLive]}>Match Preview</Text>
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
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={28} color={isLive ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, styles.headerTitleCentered, isLive && styles.textLive]}>Match Preview</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Match Info Card */}
      <View style={[styles.matchCard, isLive && styles.cardLive]}>
        <View style={[styles.matchCardAccent, isLive && styles.matchCardAccentLive]} />
        <Text style={[styles.league, isLive && styles.subTextLive]}>{match.league}</Text>
        <View style={styles.matchupWrapper}>
          <View style={styles.matchupRow}>
            <View style={styles.teamColumnLeft}>
              <View style={styles.leftTeamInner}>
                {match.homeLogo ? (
                  <Image source={{ uri: match.homeLogo, cache: 'force-cache' }} style={styles.teamCrest} resizeMode="contain" />
                ) : (
                  <View style={styles.teamCrestPlaceholder} />
                )}
                <View style={styles.teamNameWrap}>
                  <Text style={[styles.teamName, styles.teamNameLeft, isLive && styles.textLive]} numberOfLines={1} ellipsizeMode="tail">
                    {match.home}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.centerPillWrap}>
              <View style={[styles.scorePill, isLive && styles.scorePillLive]}>
                <Text style={[styles.scorePillText, isLive && styles.textLive]}>VS</Text>
              </View>
            </View>

            <View style={styles.teamColumnRight}>
              <View style={styles.rightTeamInner}>
                <View style={styles.teamNameWrap}>
                  <Text style={[styles.teamName, styles.teamNameRight, isLive && styles.textLive]} numberOfLines={1} ellipsizeMode="tail">
                    {match.away}
                  </Text>
                </View>
                {match.awayLogo ? (
                  <Image source={{ uri: match.awayLogo, cache: 'force-cache' }} style={styles.teamCrest} resizeMode="contain" />
                ) : (
                  <View style={styles.teamCrestPlaceholder} />
                )}
              </View>
            </View>
          </View>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="calendar" size={18} color="#FFD60A" />
          <Text style={[styles.kickoffText, isLive && styles.textLive]}>{getKickoffTime()}</Text>
        </View>
        <View style={styles.kickoffInfo}>
          <Ionicons name="location" size={18} color="#FFD60A" />
          <Text style={[styles.kickoffText, isLive && styles.textLive]}>{venueLabel}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Team Form */}
        {(homeRecentForm || awayRecentForm) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Recent Form</Text>
            <View style={[styles.sectionDivider, isLive && styles.sectionDividerLive]} />
            
            <View style={styles.formContainer}>
              {homeRecentForm && (
                <View style={[styles.teamFormCard, isLive && styles.cardLive]}>
                  <Text style={[styles.teamFormName, isLive && styles.textLive]}>{match.home}</Text>
                  <View style={styles.formRow}>
                    {homeRecentForm.map((result, idx) => (
                      <View key={`${result}-${idx}`} style={[styles.formPill, styles[`formPill${result}` as const]]}>
                        <Text style={styles.formPillText}>{result}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {awayRecentForm && (
                <View style={[styles.teamFormCard, isLive && styles.cardLive]}>
                  <Text style={[styles.teamFormName, isLive && styles.textLive]}>{match.away}</Text>
                  <View style={styles.formRow}>
                    {awayRecentForm.map((result, idx) => (
                      <View key={`${result}-${idx}`} style={[styles.formPill, styles[`formPill${result}` as const]]}>
                        <Text style={styles.formPillText}>{result}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
            {(!homeRecentForm || !awayRecentForm) && (
              <Text style={[styles.formUnavailable, isLive && styles.subTextLive]}>
                Form unavailable{!homeRecentForm && !awayRecentForm ? '' : ` for ${!homeRecentForm ? match.home : match.away}`}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Recent Form</Text>
            <View style={[styles.sectionDivider, isLive && styles.sectionDividerLive]} />
            <Text style={[styles.formUnavailable, isLive && styles.subTextLive]}>Form unavailable</Text>
          </View>
        )}

        {/* Team News & Injuries */}
        {((homeNews?.injuries?.length ?? 0) > 0 || (awayNews?.injuries?.length ?? 0) > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Team News</Text>
            <View style={[styles.sectionDivider, isLive && styles.sectionDividerLive]} />
            
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
        <View style={styles.section}>
            <View style={styles.newsTitleBlock}>
              <View style={[styles.newsPill, isLive && styles.newsPillLive]}>
                <Text style={[styles.newsPillText, isLive && styles.textLive]}>MATCH NEWS</Text>
              </View>
              <Text style={[styles.sectionTitle, isLive && styles.textLive]}>Latest News</Text>
              <View style={[styles.sectionDivider, isLive && styles.sectionDividerLive]} />
            </View>

            {newsLoading ? (
              <Text style={[styles.loadingText, isLive && styles.subTextLive]}>Loading news...</Text>
            ) : (
              <>
                {relatedNews.slice(0, 5).map((article) => (
                  <View key={article.id} style={[styles.articleCard, isLive && styles.cardLive]}>
                    <TouchableOpacity
                      onPress={() => openArticle(article)}
                      onPressIn={() => prefetchArticle(article)}
                    >
                      <View style={styles.articleRow}>
                        {getArticleImage(article) ? (
                          <Image source={{ uri: getArticleImage(article), cache: 'force-cache' }} style={styles.articleThumb} resizeMode="cover" />
                        ) : (
                          <View style={styles.articleThumbPlaceholder}>
                            <Ionicons name="image-outline" size={18} color="#9AA3AF" />
                          </View>
                        )}
                        <View style={styles.articleTextCol}>
                          <Text style={[styles.articleTitle, isLive && styles.textLive]} numberOfLines={2}>
                            {article.title}
                          </Text>
                          <Text style={[styles.articleDescription, isLive && styles.subTextLive]} numberOfLines={2}>
                            {article.description}
                          </Text>
                          <Text style={[styles.articleSource, isLive && styles.subTextLive]} numberOfLines={1}>
                            {article.source}
                          </Text>
                        </View>
                      </View>
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
                          size={14} 
                          color={newsReactions[article.id] === 'up' ? '#2F9E5B' : '#9AA3AF'} 
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
                          size={14} 
                          color={newsReactions[article.id] === 'down' ? '#D14343' : '#9AA3AF'} 
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {relatedNews.length > 0 && (
                  <TouchableOpacity
                    style={[styles.loadMoreButton, isLive && styles.loadMoreButtonLive]}
                    onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: matchQuery } })}
                  >
                    <Text style={[styles.loadMoreText, isLive && styles.textLive]}>See more news</Text>
                  </TouchableOpacity>
                )}
                {newsErrorMessage && (
                  <Text style={[styles.newsUnavailable, isLive && styles.subTextLive]}>
                    News is temporarily rate-limited. Try again shortly.
                  </Text>
                )}
                {!newsLoading && relatedNews.length === 0 && (
                  <View style={[styles.emptyNewsCard, isLive && styles.cardLive]}>
                    <Text style={[styles.emptyNewsText, isLive && styles.subTextLive]}>
                      No recent news found for this matchup. Check back closer to kickoff.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

        <View style={{ height: 28 }} />
      </ScrollView>

      {/* Chat Opens In... Banner */}
      <View style={styles.chatBannerWrap}>
        <View style={[styles.chatBanner, isLive && styles.cardLive]}>
          <Ionicons name="time-outline" size={20} color={ACCENT} />
          <Text style={[styles.chatBannerText, isLive && styles.textLive]}>Chat opens 45 minutes before kickoff</Text>
        </View>
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
    position: 'relative',
  },
  backButton: {
    zIndex: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  headerTitleCentered: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
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
    margin: 16,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  matchCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: ACCENT,
  },
  matchCardAccentLive: {
    backgroundColor: '#2A3A52',
  },
  league: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  matchupWrapper: {
    alignSelf: 'center',
    maxWidth: 420,
    width: '86%',
    marginBottom: 10,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  teamColumnLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  teamColumnRight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  leftTeamInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    maxWidth: '100%',
  },
  rightTeamInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    maxWidth: '100%',
  },
  teamNameWrap: {
    flex: 1,
    width: '100%',
  },
  teamCrest: {
    width: 22,
    height: 22,
  },
  teamCrestPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flexShrink: 1,
    width: '100%',
  },
  teamNameLeft: {
    textAlign: 'right',
  },
  teamNameRight: {
    textAlign: 'left',
  },
  centerPillWrap: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePill: {
    width: 72,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1F2933',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillLive: {
    backgroundColor: '#1D2430',
  },
  scorePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
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
    marginBottom: 16,
  },
  newsTitleBlock: {
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 0,
  },
  sectionDivider: {
    height: 2,
    width: 44,
    backgroundColor: ACCENT,
    borderRadius: 2,
    marginBottom: 10,
  },
  sectionDividerLive: {
    backgroundColor: '#2A3A52',
  },
  formContainer: {
    gap: 12,
  },
  teamFormCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
  },
  teamFormName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  formRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  formPill: {
    minWidth: 30,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  formPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1F2933',
  },
  formPillW: {
    backgroundColor: '#E7F7ED',
    borderWidth: 1,
    borderColor: '#B8E6C6',
  },
  formPillD: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#C9D8F7',
  },
  formPillL: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F3C2C2',
  },
  formUnavailable: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
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
    marginBottom: 10,
  },
  articleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  articleThumb: {
    width: 88,
    height: 66,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  articleThumbPlaceholder: {
    width: 88,
    height: 66,
    borderRadius: 10,
    backgroundColor: '#EEF0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleTextCol: {
    flex: 1,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
    lineHeight: 22,
  },
  articleDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    lineHeight: 20,
  },
  articleSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 0,
  },
  articleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F3',
  },
  newsUnavailable: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  emptyNewsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF0F3',
  },
  emptyNewsText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  newsPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F1FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  newsPillLive: {
    backgroundColor: '#263246',
  },
  newsPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.4,
  },
  thumbButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  thumbButtonActive: {
    backgroundColor: '#E6EBF3',
  },
  loadMoreButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  loadMoreButtonLive: {
    backgroundColor: '#1D2430',
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
  },
  chatBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    maxWidth: 320,
  },
  chatBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'center',
  },
  chatBannerWrap: {
    width: '100%',
    alignItems: 'center',
  },
});



