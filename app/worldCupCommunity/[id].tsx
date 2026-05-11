// app/worldCupCommunity/[id].tsx
// World Cup Community Screen

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { CommunityEntryLoading } from '../../components/CommunityEntryLoading';
import { NewsImage } from '../../components/NewsImage';
import { shadow } from '../../components/styleUtils';
import { communityService } from '../../services/communityService';
import { useTheme } from '../../context/ThemeContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { footballAPI, Match } from '../../services/footballApi';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { TEAM_HISTORY } from '../../services/teamCommunityHistoryData';
import {
  buildWorldCupGroupFixtures,
  normalizeWorldCupTeamName,
  WORLD_CUP_2026_GROUPS,
  WORLD_CUP_2026_TEAMS,
  WorldCupTeam,
} from '../../services/worldCup2026Data';
import { useOpenArticle } from '../../hooks/useOpenArticle';


type TabKey = 'groups' | 'fixtures' | 'history' | 'news';

type GroupTeam = WorldCupTeam & {
  logo?: string;
  placeholder?: boolean;
};

type GroupData = {
  group: string;
  teams: GroupTeam[];
};

const AFFILIATION_LINES = [
  'Sideline is an independent fan platform and is not affiliated with, endorsed by, or sponsored by FIFA or any league, club, or federation.',
  'All team/league names are used for identification/news reporting purposes.',
];


const DEFAULT_GROUPS_2026: GroupData[] = WORLD_CUP_2026_GROUPS;

const getFlagUrl = (code?: string) => {
  if (!code) return '';
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
};

const resolveWorldCupHistory = (team: WorldCupTeam): string | undefined => {
  const candidates = [team.name, ...(team.aliases || [])];
  for (const name of candidates) {
    const direct = TEAM_HISTORY[name];
    if (direct) return direct;
    const normalized = normalizeWorldCupTeamName(name);
    const normalizedMatch = Object.keys(TEAM_HISTORY).find((key) => normalizeWorldCupTeamName(key) === normalized);
    if (normalizedMatch) return TEAM_HISTORY[normalizedMatch];
  }
  return undefined;
};

export default function WorldCupCommunityScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [community, setCommunity] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('groups');
  const [communityNews, setCommunityNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupData[]>(DEFAULT_GROUPS_2026);
  const [teamMap, setTeamMap] = useState<Record<string, number>>({});
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  // World Cup gold/scarlet palette gives the community a distinct tournament feel.
  const WC_ACCENT = isDark ? '#E6B020' : '#B8880E';
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0A0A0B',
            card: '#18150E',
            text: '#F0E8D0',
            subtext: '#A89B7A',
            accent: WC_ACCENT,
            border: '#2E2719',
            placeholder: '#2E2719',
            tabBg: '#18150E',
            tabActive: '#2E2412',
            headerBg: '#18150E',
            headerAccent: WC_ACCENT,
          }
        : {
            background: '#FBF8F0',
            card: '#FFFFFF',
            text: '#1A1200',
            subtext: '#6B5B2E',
            accent: WC_ACCENT,
            border: '#E8DEC0',
            placeholder: '#F0E8D0',
            tabBg: '#FFFFFF',
            tabActive: '#FDF3D0',
            headerBg: '#FFFDF5',
            headerAccent: WC_ACCENT,
          },
    [isDark, WC_ACCENT]
  );

  useEffect(() => {
    void loadCommunity();
  }, [params.id]);

  useEffect(() => {
    if (community?.name) {
      void loadCommunityNews(community.name);
    }
  }, [community?.name]);

  useEffect(() => {
    if (!community?.docId) {
      setGroups(DEFAULT_GROUPS_2026);
      return;
    }
    void loadGroups(community.docId);
  }, [community?.docId]);

  useEffect(() => {
    void loadTeamMap();
  }, []);

  useEffect(() => {
    void loadUpcomingMatches();
  }, []);

  const fallbackFixtures = useMemo(() => buildWorldCupGroupFixtures(), []);

  const historyEntries = useMemo(
    () =>
      WORLD_CUP_2026_TEAMS.map((team) => ({
        team,
        history: resolveWorldCupHistory(team),
      })),
    []
  );

  const missingHistoryTeams = historyEntries
    .filter((entry) => !entry.history)
    .map((entry) => entry.team.name);

  const loadCommunity = async () => {
    setLoading(true);
    try {
      const numericId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
      const seededName = Array.isArray(params.name) ? params.name[0] : params.name;
      const comm = await communityService.getCommunityById(numericId, 'worldcup');
      const fallback = { id: numericId, name: seededName || 'World Cup', type: 'worldcup' };
      setCommunity(comm || fallback);
    } catch (error) {
      console.error('Error loading world cup community:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeTeamName = normalizeWorldCupTeamName;

  const loadTeamMap = async () => {
    try {
      const allTeams = await communityService.getCommunitiesByType('team');
      const nationalTeams = allTeams.filter(team =>
        team.isNationalTeam || (team.league || '').toLowerCase().includes('world cup')
      );
      const map: Record<string, number> = {};
      nationalTeams.forEach(team => {
        map[normalizeTeamName(team.name)] = team.id;
      });
      WORLD_CUP_2026_TEAMS.forEach(team => {
        const id = map[normalizeTeamName(team.name)];
        if (!id) return;
        team.aliases?.forEach(alias => {
          map[normalizeTeamName(alias)] = id;
        });
      });
      setTeamMap(map);
    } catch (error) {
      console.error('Error loading world cup team map:', error);
    }
  };

  const loadGroups = async (docId: string) => {
    try {
      const snapshot = await getDocs(collection(db, 'communities', docId, 'groups'));
      if (snapshot.empty) {
        setGroups(DEFAULT_GROUPS_2026);
        return;
      }
      const docs = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as { group?: string; teams?: GroupTeam[] };
        return {
          group: data.group || docSnap.id,
          teams: data.teams || [],
        } as GroupData;
      });
      const sorted = docs.sort((a, b) => a.group.localeCompare(b.group));
      setGroups(sorted);
    } catch (error) {
      if (__DEV__) {
        console.warn('Error loading world cup groups (check rules):', error);
      }
      setGroups(DEFAULT_GROUPS_2026);
    }
  };

  const loadUpcomingMatches = async () => {
    setUpcomingLoading(true);
    try {
      const matches = await footballAPI.getLeagueUpcomingMatches(1, 104);
      setUpcomingMatches(matches);
    } catch (error) {
      if (__DEV__) {
        console.warn('Error loading World Cup fixtures:', error);
      }
      setUpcomingMatches([]);
    } finally {
      setUpcomingLoading(false);
    }
  };

  const loadCommunityNews = async (query: string) => {
    const trimmed = query.trim() || 'FIFA World Cup 2026';
    setNewsLoading(true);
    setNewsError(null);
    try {
      const { articles } = await newsAPI.leagueNews({ leagueName: trimmed, pageSize: 15 });
      setCommunityNews(articles);
    } catch (error) {
      if (error instanceof RateLimitError) {
        setNewsError('News is temporarily rate-limited. Try again shortly.');
      } else {
        setNewsError('Unable to load news right now.');
      }
    } finally {
      setNewsLoading(false);
    }
  };

  const showBracket = community?.stage === 'knockout';

  const formatFixtureDate = (dateString?: string) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Date TBD';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <CommunityEntryLoading
        name={community?.name || (Array.isArray(params.name) ? params.name[0] : params.name) || 'World Cup'}
        primaryColor={palette.accent}
        secondaryColor={isDark ? '#101923' : '#DDE8F5'}
        label="Loading community"
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { backgroundColor: palette.card }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: palette.card, borderColor: palette.border }]}
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.headerLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
            <Ionicons name="trophy-outline" size={26} color={palette.accent} />
          </View>
          <Text style={[styles.headerTitle, { color: palette.text }]}>{community?.name || 'World Cup'}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: palette.tabBg, borderColor: palette.border }]}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'groups' && { backgroundColor: palette.tabActive }
          ]}
          onPress={() => setActiveTab('groups')}
        >
          <Text
            style={[
              styles.tabText,
              { color: palette.subtext },
              activeTab === 'groups' && { color: palette.accent }
            ]}
          >
            Groups
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'fixtures' && { backgroundColor: palette.tabActive }
          ]}
          onPress={() => setActiveTab('fixtures')}
        >
          <Text
            style={[
              styles.tabText,
              { color: palette.subtext },
              activeTab === 'fixtures' && { color: palette.accent }
            ]}
            numberOfLines={1}
          >
            Fixtures
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'history' && { backgroundColor: palette.tabActive }
          ]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            style={[
              styles.tabText,
              { color: palette.subtext },
              activeTab === 'history' && { color: palette.accent }
            ]}
            numberOfLines={1}
          >
            History
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'news' && { backgroundColor: palette.tabActive }
          ]}
          onPress={() => setActiveTab('news')}
        >
          <Text
            style={[
              styles.tabText,
              { color: palette.subtext },
              activeTab === 'news' && { color: palette.accent }
            ]}
          >
            News
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'news' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Latest News</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/news', params: { mode: 'community', q: community?.name || 'World Cup' } } as any)}
              >
                <Text style={[styles.seeAllText, { color: palette.accent }]}>See All</Text>
              </TouchableOpacity>
            </View>
            {newsLoading ? (
              <View style={styles.newsLoading}>
                <ActivityIndicator size="small" color={palette.accent} />
                <Text style={[styles.newsLoadingText, { color: palette.subtext }]}>Loading news...</Text>
              </View>
            ) : newsError ? (
              <Text style={[styles.newsErrorText, { color: palette.subtext }]}>{newsError}</Text>
            ) : communityNews.length === 0 ? (
              <View style={[styles.newsEmptyCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                <Text style={[styles.newsEmptyText, { color: palette.subtext }]}>No recent news found.</Text>
              </View>
            ) : (
              communityNews.map(article => (
                <View key={article.id} style={[styles.newsCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                  <TouchableOpacity onPress={() => openArticle(article)} onPressIn={() => prefetchArticle(article)}>
                    <View style={styles.newsRow}>
                      {article.imageUrl ? (
                        <NewsImage uri={article.imageUrl} style={styles.newsThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.newsThumbPlaceholder, { backgroundColor: palette.placeholder }]}>
                          <Ionicons name="image-outline" size={18} color={palette.subtext} />
                        </View>
                      )}
                      <View style={styles.newsTextCol}>
                        <Text style={[styles.newsTitle, { color: palette.text }]} numberOfLines={2}>{article.title}</Text>
                        <Text style={[styles.newsDescription, { color: palette.subtext }]} numberOfLines={2}>{article.description}</Text>
                        <Text style={[styles.newsSource, { color: palette.accent }]} numberOfLines={1}>{article.source}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'groups' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>{showBracket ? 'Bracket' : 'Groups'}</Text>
            </View>
            {showBracket ? (
              <View style={[styles.groupCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                <Text style={[styles.groupTitle, { color: palette.accent }]}>Round of 16</Text>
                <Text style={[styles.bracketRow, { color: palette.subtext }]}>Matchups will appear after group stage.</Text>
              </View>
            ) : (
              groups.map(group => (
                <View key={group.group} style={[styles.groupCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                  <Text style={[styles.groupTitle, { color: palette.accent }]}>{`Group ${group.group}`}</Text>
                  {group.teams.map(team => {
                    const flagUrl = team.logo || getFlagUrl(team.code);
                    const teamId = team.placeholder ? undefined : teamMap[normalizeTeamName(team.name)];
                    const Wrapper = teamId ? TouchableOpacity : View;
                    const wrapperProps = teamId
                      ? { onPress: () => router.push(`/teamCommunity/${teamId}` as any) }
                      : {};
                    return (
                      <Wrapper key={team.name} style={styles.groupRow} {...wrapperProps}>
                        {flagUrl ? (
                          <Image source={{ uri: flagUrl }} style={styles.groupFlag} resizeMode="cover" />
                        ) : (
                          <View style={[styles.groupFlagPlaceholder, { backgroundColor: palette.placeholder }]}>
                            <Ionicons name="flag" size={14} color={palette.subtext} />
                          </View>
                        )}
                        <Text style={[styles.groupTeam, { color: palette.text }]}>{team.name}</Text>
                        <Text style={[styles.groupPts, { color: palette.subtext }]}>{team.placeholder ? 'TBD' : '0 pts'}</Text>
                      </Wrapper>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'fixtures' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Upcoming Fixtures</Text>
              <Text style={[styles.fixtureCount, { color: palette.subtext }]}>
                {upcomingMatches.length > 0 ? `${upcomingMatches.length} scheduled` : `${fallbackFixtures.length} group games`}
              </Text>
            </View>
            {upcomingLoading ? (
              <View style={styles.newsLoading}>
                <ActivityIndicator size="small" color={palette.accent} />
                <Text style={[styles.newsLoadingText, { color: palette.subtext }]}>Loading fixtures...</Text>
              </View>
            ) : upcomingMatches.length > 0 ? (
              upcomingMatches.map(match => (
                <TouchableOpacity
                  key={match.id}
                  style={[styles.fixtureCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}
                  onPress={() => router.push(`/matchPreview/${match.id}` as any)}
                >
                  <View style={styles.fixtureMetaRow}>
                    <Text style={[styles.fixtureLeague, { color: palette.accent }]} numberOfLines={1}>
                      {match.league || 'FIFA World Cup'}
                    </Text>
                    <Text style={[styles.fixtureDate, { color: palette.subtext }]}>{formatFixtureDate(match.date)}</Text>
                  </View>
                  <View style={styles.fixtureTeamsRow}>
                    <View style={styles.fixtureTeam}>
                      {match.homeLogo ? (
                        <Image source={{ uri: match.homeLogo }} style={styles.fixtureLogo} resizeMode="contain" />
                      ) : (
                        <View style={[styles.fixtureLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                          <Ionicons name="flag" size={16} color={palette.subtext} />
                        </View>
                      )}
                      <Text style={[styles.fixtureTeamName, { color: palette.text }]} numberOfLines={2}>{match.home}</Text>
                    </View>
                    <Text style={[styles.fixtureVs, { color: palette.subtext }]}>vs</Text>
                    <View style={styles.fixtureTeam}>
                      {match.awayLogo ? (
                        <Image source={{ uri: match.awayLogo }} style={styles.fixtureLogo} resizeMode="contain" />
                      ) : (
                        <View style={[styles.fixtureLogoPlaceholder, { backgroundColor: palette.placeholder }]}>
                          <Ionicons name="flag" size={16} color={palette.subtext} />
                        </View>
                      )}
                      <Text style={[styles.fixtureTeamName, { color: palette.text }]} numberOfLines={2}>{match.away}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              fallbackFixtures.map(fixture => (
                <View key={fixture.id} style={[styles.fixtureCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]}>
                  <View style={styles.fixtureMetaRow}>
                    <Text style={[styles.fixtureLeague, { color: palette.accent }]}>{`Group ${fixture.group}`}</Text>
                    <Text style={[styles.fixtureDate, { color: palette.subtext }]}>Date TBD</Text>
                  </View>
                  <View style={styles.fixtureTeamsRow}>
                    <View style={styles.fixtureTeam}>
                      <Image source={{ uri: getFlagUrl(fixture.home.code) }} style={styles.fixtureLogo} resizeMode="cover" />
                      <Text style={[styles.fixtureTeamName, { color: palette.text }]} numberOfLines={2}>{fixture.home.name}</Text>
                    </View>
                    <Text style={[styles.fixtureVs, { color: palette.subtext }]}>vs</Text>
                    <View style={styles.fixtureTeam}>
                      <Image source={{ uri: getFlagUrl(fixture.away.code) }} style={styles.fixtureLogo} resizeMode="cover" />
                      <Text style={[styles.fixtureTeamName, { color: palette.text }]} numberOfLines={2}>{fixture.away.name}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'history' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Team History</Text>
              <Text style={[styles.fixtureCount, { color: palette.subtext }]}>{`${historyEntries.length} teams`}</Text>
            </View>
            {missingHistoryTeams.length > 0 && (
              <View style={[styles.historyNeededCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.historyNeededTitle, { color: palette.text }]}>History Needed</Text>
                <Text style={[styles.historyNeededText, { color: palette.subtext }]}>
                  {missingHistoryTeams.join(', ')}
                </Text>
              </View>
            )}
            {historyEntries.map(({ team, history }) => {
              const teamId = teamMap[normalizeTeamName(team.name)];
              const Wrapper = teamId ? TouchableOpacity : View;
              const wrapperProps = teamId
                ? { onPress: () => router.push(`/teamCommunity/${teamId}` as any) }
                : {};
              return (
                <Wrapper key={team.name} style={[styles.historyCard, { backgroundColor: palette.card, borderColor: palette.border }, isDark && { borderWidth: 1 }]} {...wrapperProps}>
                  <View style={styles.historyHeader}>
                    <Image source={{ uri: getFlagUrl(team.code) }} style={styles.groupFlag} resizeMode="cover" />
                    <Text style={[styles.historyTeamName, { color: palette.text }]}>{team.name}</Text>
                    {teamId ? <Ionicons name="chevron-forward" size={18} color={palette.subtext} /> : null}
                  </View>
                  <Text style={[styles.historyBody, { color: palette.subtext }]}>
                    {history || `${team.name} need a custom World Cup history writeup.`}
                  </Text>
                </Wrapper>
              );
            })}
          </View>
        )}

        <View style={[styles.disclaimerFooter, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={palette.accent} />
          <View style={styles.disclaimerFooterTextWrap}>
            {AFFILIATION_LINES.map((line) => (
              <Text key={`footer-${line}`} style={[styles.disclaimerFooterText, { color: palette.subtext }]}>
                {line}
              </Text>
            ))}
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
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  headerLogo: {
    width: 24,
    height: 24,
  },
  headerLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabItemActive: {
    backgroundColor: '#E8F1FF',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  tabTextActive: {
    color: '#0066CC',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
  },
  newsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  newsLoadingText: {
    fontSize: 13,
    color: '#666',
  },
  newsErrorText: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  newsEmptyCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    marginTop: 12,
  },
  newsEmptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  newsCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  newsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  newsThumb: {
    width: 84,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  newsThumbPlaceholder: {
    width: 84,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#EEF0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsTextCol: {
    flex: 1,
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
    marginBottom: 6,
    lineHeight: 18,
  },
  newsSource: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066CC',
  },
  groupCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  groupFlag: {
    width: 22,
    height: 16,
    borderRadius: 3,
    marginRight: 8,
    backgroundColor: '#E5E7EB',
  },
  groupFlagPlaceholder: {
    width: 22,
    height: 16,
    borderRadius: 3,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTeam: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  groupPts: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  bracketRow: {
    fontSize: 13,
    color: '#666',
    paddingVertical: 8,
  },
  fixtureCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  fixtureCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    padding: 14,
    marginBottom: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  fixtureMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  fixtureLeague: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  fixtureDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  fixtureTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fixtureTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  fixtureLogo: {
    width: 38,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  fixtureLogoPlaceholder: {
    width: 38,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixtureTeamName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  fixtureVs: {
    width: 30,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historyNeededCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  historyNeededTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  historyNeededText: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    padding: 14,
    marginBottom: 12,
    ...shadow({ y: 1, blur: 4, opacity: 0.05, elevation: 2 }),
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTeamName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  historyBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  disclaimerFooter: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  disclaimerFooterTextWrap: {
    flex: 1,
    gap: 5,
  },
  disclaimerFooterText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
