// app/matchPreview/[id].tsx
// Pre-match overview screen (before chat opens)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { auth, db } from '../../config/firebase';
import { analyticsService } from '../../services/analyticsService';
import { monitoringService } from '../../services/monitoringService';
import { FinishedMatch, footballAPI, HeadToHeadMatch, Match } from '../../services/footballApi';
import { getMatchPhase } from '../../services/matchPhase';
import { buildMatchRouteDescriptor } from '../../services/matchNavigation';
import { isPregameWindow } from '../../services/matchTime';
import { matchDetailService } from '../../services/matchDetailService';
import { newsAPI, NewsArticle, RateLimitError } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { getCachedValue } from '../../services/cacheService';
import { LineupPitch } from '../../components/matchDetail/LineupPitch';
import { MatchEntryLoading } from '../../components/MatchEntryLoading';
import { MatchResultHeaderCard } from '../../components/matchDetail/MatchResultHeaderCard';
import { PlayerRow } from '../../components/matchDetail/PlayerRow';
import { TeamToggle } from '../../components/matchDetail/TeamToggle';
import { buildDecorMap, filterKeyEvents, normalizeFixtureEvents, PlayerDecor } from '../../services/eventsDecor';
import { NewsImage } from '../../components/NewsImage';
import { teamPrimaryColor } from '../../services/teamTint';
import { newsPersonalizationService } from '../../services/newsPersonalizationService';

const ACCENT = '#2B5BC7';
const MATCH_LOADING_TTL_MS = 20 * 60 * 1000;

interface NewsReaction {
  [articleId: string]: 'up' | 'down' | null;
}

interface Stats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

type MeetingTab = 'events' | 'lineups';

type LineupPlayer = {
  id?: number;
  name: string;
  number?: number;
  grid?: string;
};

type TeamLineup = {
  teamId?: number;
  teamName: string;
  teamLogo?: string;
  formation?: string;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
};

type PredictionPick = 'home' | 'draw' | 'away';
type PredictionTally = { home: number; draw: number; away: number; total: number };

const takeFirstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function MatchPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const params = useLocalSearchParams();
  const id = takeFirstParam(params.id as string | string[] | undefined);
  const [match, setMatch] = useState<Match | null>(null);
  const [homeRecentForm, setHomeRecentForm] = useState<('W' | 'D' | 'L')[] | null>(null);
  const [awayRecentForm, setAwayRecentForm] = useState<('W' | 'D' | 'L')[] | null>(null);
  const [homeCompetitionRecord, setHomeCompetitionRecord] = useState<string | null>(null);
  const [awayCompetitionRecord, setAwayCompetitionRecord] = useState<string | null>(null);
  const [relatedNews, setRelatedNews] = useState<NewsArticle[]>([]);
  const [lastMeeting, setLastMeeting] = useState<HeadToHeadMatch | null>(null);
  const [lastMeetingModalVisible, setLastMeetingModalVisible] = useState(false);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsErrorMessage, setNewsErrorMessage] = useState<string | null>(null);
  const [newsReactions, setNewsReactions] = useState<NewsReaction>({});
  const [loading, setLoading] = useState(true);
  const [venueLabel, setVenueLabel] = useState('Venue TBD');
  const [lastMeetingStats, setLastMeetingStats] = useState<Stats | null>(null);
  const [lastMeetingLineups, setLastMeetingLineups] = useState<{ home: TeamLineup | null; away: TeamLineup | null }>({
    home: null,
    away: null,
  });
  const [lastMeetingEvents, setLastMeetingEvents] = useState<any[]>([]);
  const [lastMeetingLoading, setLastMeetingLoading] = useState(false);
  const [lastMeetingTab, setLastMeetingTab] = useState<MeetingTab>('events');
  const [lastMeetingSelectedTeam, setLastMeetingSelectedTeam] = useState<'home' | 'away'>('home');
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionTally, setPredictionTally] = useState<PredictionTally>({ home: 0, draw: 0, away: 0, total: 0 });
  const [myPrediction, setMyPrediction] = useState<PredictionPick | null>(null);
  const [predictionExpanded, setPredictionExpanded] = useState(false);
  const activeLoadRef = useRef<string | null>(null);
  const loadingSeed = useMemo(() => {
    const routeMatchId = Number(id);
    const cachedFixture = Number.isFinite(routeMatchId)
      ? getCachedValue<any>(`fixture:base:${routeMatchId}`, MATCH_LOADING_TTL_MS)
      : null;
    return {
      homeName: takeFirstParam(params.home as string | string[] | undefined) || cachedFixture?.teams?.home?.name || 'Home',
      awayName: takeFirstParam(params.away as string | string[] | undefined) || cachedFixture?.teams?.away?.name || 'Away',
      homeLogo: takeFirstParam(params.homeLogo as string | string[] | undefined) || cachedFixture?.teams?.home?.logo || undefined,
      awayLogo: takeFirstParam(params.awayLogo as string | string[] | undefined) || cachedFixture?.teams?.away?.logo || undefined,
      league: takeFirstParam(params.league as string | string[] | undefined) || cachedFixture?.league?.name || 'Match Preview',
      kickoff: takeFirstParam(params.kickoff as string | string[] | undefined) || cachedFixture?.fixture?.date || '',
      status: takeFirstParam(params.status as string | string[] | undefined) || cachedFixture?.fixture?.status?.short || 'upcoming',
      score: takeFirstParam(params.score as string | string[] | undefined) || '',
      minute: takeFirstParam(params.minute as string | string[] | undefined) || '',
    };
  }, [id, params.away, params.awayLogo, params.home, params.homeLogo, params.kickoff, params.league, params.minute, params.score, params.status]);
  const phaseInfo = getMatchPhase({ kickoffAt: match?.date, status: match?.status });
  const isLive = phaseInfo.phase === 'live';
  const matchQuery = match ? `"${match.home}" OR "${match.away}"` : '';
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            surface: '#0A0A0A',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            border: '#2C2C2E',
            placeholder: '#2C2C2E',
            pill: '#1D2430',
            pillText: '#E6E6E9',
            divider: '#2A3A52',
            newsPill: '#263246',
            thumbBg: '#2A2A2E',
            thumbActive: '#3A4252',
            loadMoreBg: '#1D2430',
            loadMoreBorder: '#2A3A52',
            bannerBg: '#1C1C1E',
            bannerBorder: '#2A2A2E',
          }
        : {
            background: '#FFFFFF',
            surface: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: ACCENT,
            border: '#EEF0F3',
            placeholder: '#E5E7EB',
            pill: '#1F2933',
            pillText: '#FFFFFF',
            divider: ACCENT,
            newsPill: '#E8F1FF',
            thumbBg: '#F3F4F6',
            thumbActive: '#E6EBF3',
            loadMoreBg: '#EEF4FF',
            loadMoreBorder: ACCENT,
            bannerBg: '#F0F7FF',
            bannerBorder: '#E1E7F3',
          },
    [isDark]
  );
  useEffect(() => {
    relatedNews.slice(0, 4).forEach((article) => prefetchArticle(article));
  }, [relatedNews, prefetchArticle]);

  useEffect(() => {
    if (!user?.uid || relatedNews.length === 0) return;
    let active = true;
    void newsPersonalizationService.getUserFeedbackForArticles(user.uid, relatedNews).then((map) => {
      if (!active) return;
      setNewsReactions(map as NewsReaction);
    });
    return () => {
      active = false;
    };
  }, [user?.uid, relatedNews]);

  const getFormPillStyle = (result: 'W' | 'D' | 'L') => {
    if (!isDark) return styles[`formPill${result}` as const];
    if (result === 'W') return styles.formPillWDark;
    if (result === 'D') return styles.formPillDDark;
    return styles.formPillLDark;
  };

  const getTeamAbbr = (name: string, shortName?: string, code?: string) => {
    if (shortName && shortName.trim()) return shortName.trim().slice(0, 4).toUpperCase();
    if (code && code.trim()) return code.trim().slice(0, 4).toUpperCase();
    return name.slice(0, 3).toUpperCase();
  };

  const getCompactTeamName = (name?: string | null) => {
    const value = String(name || '').trim();
    const normalized = value.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    const aliases: Record<string, string> = {
      'manchester united': 'Man United',
      'manchester city': 'Man City',
      'tottenham hotspur': 'Tottenham',
      'paris saint germain': 'PSG',
      'paris saintgermain': 'PSG',
      'borussia dortmund': 'Dortmund',
      'borussia monchengladbach': 'Gladbach',
      'bayern munich': 'Bayern',
      'real madrid': 'Real Madrid',
      'atletico madrid': 'Atletico',
      'inter milan': 'Inter',
      'ac milan': 'Milan',
    };
    return aliases[normalized] || value;
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/' as any);
    }
  };

  useEffect(() => {
    loadMatchData();
  }, [id]);

  useEffect(() => {
    if (!match?.id) return;
    analyticsService.track('preview_opened', { matchId: String(match.id), league: match.league });
  }, [match?.id]);

  const mapFixtureToMatch = (fixture: any): Match | null => {
    if (!fixture?.fixture?.id || !fixture?.teams?.home?.name || !fixture?.teams?.away?.name) {
      return null;
    }
    const shortStatus = String(fixture?.fixture?.status?.short || '').toUpperCase();
    const status: Match['status'] =
      shortStatus === 'FT' || shortStatus === 'AET' || shortStatus === 'PEN'
        ? 'finished'
        : shortStatus === '1H' || shortStatus === '2H' || shortStatus === 'HT' || shortStatus === 'ET' || shortStatus === 'P'
          ? 'live'
          : 'upcoming';

    return {
      id: fixture.fixture.id,
      home: fixture.teams.home.name,
      away: fixture.teams.away.name,
      homeShortName: fixture.teams.home.short_name || fixture.teams.home.shortName,
      awayShortName: fixture.teams.away.short_name || fixture.teams.away.shortName,
      homeCode: fixture.teams.home.code,
      awayCode: fixture.teams.away.code,
      homeLogo: fixture.teams.home.logo || (fixture.teams.home.id ? `https://media.api-sports.io/football/teams/${fixture.teams.home.id}.png` : undefined),
      awayLogo: fixture.teams.away.logo || (fixture.teams.away.id ? `https://media.api-sports.io/football/teams/${fixture.teams.away.id}.png` : undefined),
      homeId: fixture.teams.home.id,
      awayId: fixture.teams.away.id,
      leagueId: fixture.league?.id,
      league: fixture.league?.name || 'League',
      date: fixture.fixture.date,
      score: fixture.goals?.home !== null && fixture.goals?.away !== null ? `${fixture.goals.home}-${fixture.goals.away}` : undefined,
      minute: fixture.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : undefined,
      status,
      venueName: fixture.fixture?.venue?.name,
      venueCity: fixture.fixture?.venue?.city,
    };
  };

  const loadMatchData = async () => {
    const routeMatchId = Array.isArray(id) ? id[0] : id;
    const loadKey = String(routeMatchId || '');
    activeLoadRef.current = loadKey;
    const isStale = () => activeLoadRef.current !== loadKey;

    try {
      const parsedMatchId = Number(routeMatchId);
      setLoading(true);
      setHomeRecentForm(null);
      setAwayRecentForm(null);
      setHomeCompetitionRecord(null);
      setAwayCompetitionRecord(null);
      setRelatedNews([]);
      setLastMeeting(null);
      setLastMeetingStats(null);
      setLastMeetingLineups({ home: null, away: null });
      setLastMeetingEvents([]);
      setNewsErrorMessage(null);
      setNewsLoading(true);

      let targetMatch: Match | undefined;
      let fixtureById: any | null = null;
      if (Number.isFinite(parsedMatchId)) {
        fixtureById = await footballAPI.getFixtureById(parsedMatchId);
        if (isStale()) return;
        const fixture = fixtureById;
        const mappedMatch = mapFixtureToMatch(fixture);
        if (mappedMatch) {
          targetMatch = mappedMatch;
        }
      }
      if (!targetMatch) {
        const upcoming = await footballAPI.getUpcomingMatches();
        if (isStale()) return;
        targetMatch = upcoming.find(m => m.id.toString() === routeMatchId);
      }

      if (!targetMatch && Number.isFinite(parsedMatchId) && loadingSeed.homeName !== 'Home' && loadingSeed.awayName !== 'Away') {
        targetMatch = {
          id: parsedMatchId,
          home: loadingSeed.homeName,
          away: loadingSeed.awayName,
          homeLogo: loadingSeed.homeLogo,
          awayLogo: loadingSeed.awayLogo,
          league: loadingSeed.league,
          date: loadingSeed.kickoff || new Date().toISOString(),
          status: loadingSeed.status?.toLowerCase?.() === 'finished' ? 'finished' : loadingSeed.status?.toLowerCase?.() === 'live' ? 'live' : 'upcoming',
          score: loadingSeed.score || undefined,
          minute: loadingSeed.minute || undefined,
        };
      }

      if (targetMatch) {
        const kickoff = new Date(targetMatch.date);
        const now = new Date();
        const normalizedStatus = (targetMatch.status || '').toLowerCase();

        if (normalizedStatus === 'finished') {
          router.replace(buildMatchRouteDescriptor(targetMatch) as any);
          return;
        }

        if (!Number.isNaN(kickoff.getTime())) {
          if (now.getTime() >= kickoff.getTime() || isPregameWindow(kickoff, now)) {
            router.replace(buildMatchRouteDescriptor(targetMatch) as any);
            return;
          }
        }

        if (isStale()) return;
        setMatch(targetMatch);
        setVenueLabel(getVenueLabel({
          venueName: fixtureById?.fixture?.venue?.name || targetMatch.venueName,
          venueCity: fixtureById?.fixture?.venue?.city || targetMatch.venueCity,
        }));
        setLoading(false);

        const competitionLeagueId = targetMatch.leagueId ?? fixtureById?.league?.id ?? null;
        const seasonPromise = fixtureById?.league?.season
          ? Promise.resolve(fixtureById.league.season as number)
          : competitionLeagueId
            ? footballAPI.getCurrentSeason(competitionLeagueId).catch(() => null)
            : Promise.resolve<number | null>(null);
        void (async () => {
          const [homeFallbackFixtures, awayFallbackFixtures] = await Promise.all([
            targetMatch?.homeId ? footballAPI.getTeamLastFixtures(targetMatch.homeId, 5) : Promise.resolve([]),
            targetMatch?.awayId ? footballAPI.getTeamLastFixtures(targetMatch.awayId, 5) : Promise.resolve([]),
          ]);
          if (isStale()) return;

          setHomeRecentForm(buildFormFromFixtures(homeFallbackFixtures, targetMatch.home, targetMatch.homeId));
          setAwayRecentForm(buildFormFromFixtures(awayFallbackFixtures, targetMatch.away, targetMatch.awayId));

          const competitionSeason = await seasonPromise;
          const hasCompetitionScope =
            !!targetMatch?.homeId &&
            !!targetMatch?.awayId &&
            !!competitionLeagueId &&
            !!competitionSeason;
          if (!hasCompetitionScope) return;

          const [homeCompetitionFixtures, awayCompetitionFixtures, homeRecord, awayRecord] = await Promise.all([
            footballAPI.getTeamCompetitionLastFinishedFixtures(
              targetMatch.homeId as number,
              competitionLeagueId as number,
              competitionSeason as number,
              5
            ),
            footballAPI.getTeamCompetitionLastFinishedFixtures(
              targetMatch.awayId as number,
              competitionLeagueId as number,
              competitionSeason as number,
              5
            ),
            footballAPI.getTeamRecord(
              targetMatch.homeId as number,
              competitionLeagueId as number,
              competitionSeason as number
            ),
            footballAPI.getTeamRecord(
              targetMatch.awayId as number,
              competitionLeagueId as number,
              competitionSeason as number
            ),
          ]);
          if (isStale()) return;

          const homeFixtures = mergeRecentFixtures(homeCompetitionFixtures, homeFallbackFixtures);
          const awayFixtures = mergeRecentFixtures(awayCompetitionFixtures, awayFallbackFixtures);

          setHomeRecentForm(buildFormFromFixtures(homeFixtures, targetMatch.home, targetMatch.homeId));
          setAwayRecentForm(buildFormFromFixtures(awayFixtures, targetMatch.away, targetMatch.awayId));
          setHomeCompetitionRecord(homeRecord?.record || null);
          setAwayCompetitionRecord(awayRecord?.record || null);
        })();

        void (async () => {
          try {
            const teamA = targetMatch.home;
            const teamB = targetMatch.away;

            // Always fetch both teams in parallel — each has Firestore caching so
            // subsequent users get instant results from the shared cache.
            const [teamAResult, teamBResult] = await Promise.all([
              newsAPI.teamNews({ teamName: teamA, leagueContext: targetMatch.league, pageSize: 8 }).catch(() => ({ articles: [] })),
              newsAPI.teamNews({ teamName: teamB, leagueContext: targetMatch.league, pageSize: 8 }).catch(() => ({ articles: [] })),
            ]);
            if (isStale()) return;

            const combined = dedupeArticles([...(teamAResult.articles || []), ...(teamBResult.articles || [])]);
            setRelatedNews(combined.slice(0, 6));
            setNewsErrorMessage(null);
          } catch (error) {
            if (error instanceof RateLimitError) {
              setNewsErrorMessage('News is temporarily rate-limited. Try again shortly.');
            }
            console.error('Error loading match news:', error);
          } finally {
            if (!isStale()) {
              setNewsLoading(false);
            }
          }
        })();

        void (async () => {
          if (targetMatch.homeId && targetMatch.awayId) {
            const h2h = await footballAPI.getHeadToHeadLastMeeting(targetMatch.homeId, targetMatch.awayId);
            if (isStale()) return;
            setLastMeeting(h2h);
            if (h2h?.id) {
              setLastMeetingStats(null);
              setLastMeetingLineups({ home: null, away: null });
              setLastMeetingEvents([]);
            } else {
              setLastMeetingStats(null);
              setLastMeetingLineups({ home: null, away: null });
              setLastMeetingEvents([]);
            }
          } else {
            if (isStale()) return;
            setLastMeeting(null);
            setLastMeetingStats(null);
            setLastMeetingLineups({ home: null, away: null });
            setLastMeetingEvents([]);
          }
        })();

        void (async () => {
          if (!targetMatch.venueName && !fixtureById) {
            const fixture = await footballAPI.getFixtureById(targetMatch.id);
            if (isStale()) return;
            if (fixture?.fixture?.venue) {
              setVenueLabel(getVenueLabel({ venueName: fixture.fixture.venue.name, venueCity: fixture.fixture.venue.city }));
            }
          }
        })();
      } else {
        setHomeCompetitionRecord(null);
        setAwayCompetitionRecord(null);
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

  const loadLastMeetingDetails = async (fixtureId: number, tab: MeetingTab, loadKey?: string) => {
    const isStale = () => (loadKey ? activeLoadRef.current !== loadKey : false);
    setLastMeetingLoading(true);
    try {
      const fixture = await footballAPI.getFixtureById(fixtureId);
      if (isStale()) return;
      if (!fixture) {
        if (tab === 'events') {
          setLastMeetingStats(null);
          setLastMeetingEvents([]);
        } else {
          setLastMeetingLineups({ home: null, away: null });
        }
        return;
      }

      const mapped = {
        homeTeamId: fixture.teams?.home?.id,
        awayTeamId: fixture.teams?.away?.id,
      };

      if (tab === 'events') {
        const [statsRaw, eventsRaw] = await Promise.all([
          footballAPI.getFixtureStatistics(fixtureId),
          footballAPI.getFixtureEvents(fixtureId),
        ]);
        if (isStale()) return;
        setLastMeetingStats(mapStats(statsRaw || []));
        setLastMeetingEvents(eventsRaw || []);
        return;
      }

      const lineupsRaw = await footballAPI.getFixtureLineups(fixtureId);
      if (isStale()) return;
      const lineupMapped = (lineupsRaw || []).map(normalizeLineup);
      const homeLineup = lineupMapped.find((l) => l.teamId === mapped.homeTeamId) || lineupMapped[0] || null;
      const awayLineup = lineupMapped.find((l) => l.teamId === mapped.awayTeamId) || lineupMapped[1] || null;
      setLastMeetingLineups({ home: homeLineup, away: awayLineup });
    } catch (error) {
      console.error('Error loading last meeting details:', error);
      if (tab === 'events') {
        setLastMeetingStats(null);
        setLastMeetingEvents([]);
      } else {
        setLastMeetingLineups({ home: null, away: null });
      }
    } finally {
      setLastMeetingLoading(false);
    }
  };

  useEffect(() => {
    if (!lastMeetingModalVisible || !lastMeeting?.id) return;
    if (lastMeetingTab === 'events' && (lastMeetingStats || lastMeetingEvents.length > 0)) return;
    if (lastMeetingTab === 'lineups' && (lastMeetingLineups.home || lastMeetingLineups.away)) return;
    void loadLastMeetingDetails(lastMeeting.id, lastMeetingTab, activeLoadRef.current || undefined);
  }, [
    lastMeeting?.id,
    lastMeetingEvents.length,
    lastMeetingLineups.away,
    lastMeetingLineups.home,
    lastMeetingModalVisible,
    lastMeetingStats,
    lastMeetingTab,
  ]);

  const handleNewsReaction = async (article: NewsArticle, reaction: 'up' | 'down') => {
    if (!user?.uid) {
      Alert.alert('Sign in to react', 'Create an account or log in to like or dislike news articles.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log In', onPress: () => router.push('/(auth)/login' as any) },
        { text: 'Sign Up', onPress: () => router.push('/(auth)/signup' as any) },
      ]);
      return;
    }
    const nextReaction = newsReactions[article.id] === reaction ? null : reaction;
    setNewsReactions(prev => ({
      ...prev,
      [article.id]: nextReaction
    }));
    try {
      await newsPersonalizationService.recordReaction(user.uid, article, nextReaction);
    } catch (error) {
      console.error('Error saving news reaction:', error);
    }
  };

  const loadPredictionState = async (targetMatchId: string, uid?: string) => {
    if (!uid) {
      setPredictionTally({ home: 0, draw: 0, away: 0, total: 0 });
      setMyPrediction(null);
      return;
    }
    try {
      setPredictionLoading(true);
      const [allVotesSnap, myVoteSnap] = await Promise.all([
        getDocs(query(collection(db, 'matchPredictions'), where('matchId', '==', targetMatchId))),
        getDoc(doc(db, 'matchPredictions', `${uid}_${targetMatchId}`)),
      ]);
      const tally: PredictionTally = { home: 0, draw: 0, away: 0, total: 0 };
      allVotesSnap.forEach((voteDoc) => {
        const data = voteDoc.data() as { prediction?: PredictionPick };
        const pick = data.prediction;
        if (!pick) return;
        tally[pick] += 1;
        tally.total += 1;
      });
      setPredictionTally(tally);
      setMyPrediction((myVoteSnap.data() as { prediction?: PredictionPick } | undefined)?.prediction ?? null);
    } catch (error) {
      console.error('Error loading match prediction:', error);
      monitoringService.error('match_prediction_load_failed', error, { matchId: targetMatchId });
      if ((error as { code?: string } | null)?.code === 'permission-denied') {
        analyticsService.track('firebase_permission_error', { area: 'match_prediction_load', matchId: targetMatchId });
      }
      setPredictionTally({ home: 0, draw: 0, away: 0, total: 0 });
      setMyPrediction(null);
    } finally {
      setPredictionLoading(false);
    }
  };

  useEffect(() => {
    const targetMatchId = match?.id?.toString();
    if (!targetMatchId) return;
    if (!auth.currentUser?.uid) {
      setPredictionTally({ home: 0, draw: 0, away: 0, total: 0 });
      setMyPrediction(null);
      return;
    }
    void loadPredictionState(targetMatchId, auth.currentUser.uid);
  }, [match?.id, user?.uid]);

  const submitPrediction = async (pick: PredictionPick) => {
    if (!match) return;
    if (myPrediction) {
      Alert.alert('Vote Locked', 'You have already submitted your prediction for this match.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Sign In Required', 'Please sign in to submit predictions');
      return;
    }
    const matchId = match.id.toString();
    try {
      setPredictionLoading(true);
      await setDoc(doc(db, 'matchPredictions', `${uid}_${matchId}`), {
        userId: uid,
        matchId,
        prediction: pick,
        updatedAt: new Date().toISOString(),
      });
      setMyPrediction(pick);
      analyticsService.track('prediction_submitted', { matchId, pick });
      await loadPredictionState(matchId, uid);
    } catch (error) {
      console.error('Error submitting match prediction:', error);
      monitoringService.error('match_prediction_submit_failed', error, { matchId });
      const code = (error as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        analyticsService.track('firebase_permission_error', { area: 'match_prediction_submit', matchId });
        Alert.alert('Vote Locked', 'Predictions cannot be changed after submission.');
      } else {
        Alert.alert('Error', 'Unable to submit prediction right now');
      }
    } finally {
      setPredictionLoading(false);
    }
  };

  const getKickoffTime = () => {
    if (!match) return '';
    const date = new Date(match.date);
    return date.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const mapStats = (statsResponse: any[]): Stats | null => {
    if (!statsResponse || statsResponse.length < 2) return null;
    const homeStats = statsResponse[0]?.statistics || [];
    const awayStats = statsResponse[1]?.statistics || [];

    const getStat = (stats: any[], type: string) => {
      const stat = stats.find((s: any) => s.type === type);
      const value = stat?.value;
      if (typeof value === 'string') return parseInt(value.replace('%', ''), 10) || 0;
      return value || 0;
    };

    return {
      possession: { home: getStat(homeStats, 'Ball Possession'), away: getStat(awayStats, 'Ball Possession') },
      shots: { home: getStat(homeStats, 'Total Shots'), away: getStat(awayStats, 'Total Shots') },
      shotsOnTarget: { home: getStat(homeStats, 'Shots on Goal'), away: getStat(awayStats, 'Shots on Goal') },
      corners: { home: getStat(homeStats, 'Corner Kicks'), away: getStat(awayStats, 'Corner Kicks') },
      fouls: { home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls') },
      offsides: { home: getStat(homeStats, 'Offsides'), away: getStat(awayStats, 'Offsides') },
      yellowCards: { home: getStat(homeStats, 'Yellow Cards'), away: getStat(awayStats, 'Yellow Cards') },
      redCards: { home: getStat(homeStats, 'Red Cards'), away: getStat(awayStats, 'Red Cards') },
    };
  };

  const normalizeLineup = (raw: any): TeamLineup => {
    if (!raw) return { teamName: '', startXI: [], substitutes: [] };
    return {
      teamId: raw.team?.id,
      teamName: raw.team?.name || '',
      teamLogo: raw.team?.logo,
      formation: raw.formation,
      startXI: (raw.startXI || []).map((entry: any) => ({
        id: entry?.player?.id,
        name: entry?.player?.name || '',
        number: entry?.player?.number ?? undefined,
        grid: entry?.player?.grid,
      })),
      substitutes: (raw.substitutes || []).map((entry: any) => ({
        id: entry?.player?.id,
        name: entry?.player?.name || '',
        number: entry?.player?.number ?? undefined,
      })),
    };
  };

  const buildBench = (lineup: TeamLineup, decorMap: Map<number, PlayerDecor>) => {
    const bench = [...lineup.substitutes];
    const benchIds = new Set(bench.map((p) => p.id).filter(Boolean));

    lineup.startXI.forEach((player) => {
      if (!player.id || benchIds.has(player.id)) return;
      const decor = decorMap.get(player.id);
      if (decor?.subbedOutMinute) {
        bench.push(player);
        benchIds.add(player.id);
      }
    });

    return bench;
  };

  const buildPitchXI = (lineup: TeamLineup, decorMap: Map<number, PlayerDecor>) => {
    const starterIds = new Set(lineup.startXI.map((p) => p.id).filter(Boolean) as number[]);
    const subById = new Map(
      lineup.substitutes
        .filter((p) => p.id)
        .map((p) => [p.id as number, p] as const)
    );
    const subIds = new Set(Array.from(subById.keys()));
    const replacements = new Map<number, number>();

    lineup.substitutes.forEach((sub) => {
      if (!sub.id) return;
      const decor = decorMap.get(sub.id);
      const outgoing = [decor?.replacedWho?.id, decor?.replacedBy?.id].find(
        (playerId) => typeof playerId === 'number' && starterIds.has(playerId)
      );
      if (outgoing && !replacements.has(outgoing)) {
        replacements.set(outgoing, sub.id);
      }
    });

    lineup.startXI.forEach((starter) => {
      if (!starter.id || replacements.has(starter.id)) return;
      const decor = decorMap.get(starter.id);
      const incoming = [decor?.replacedBy?.id, decor?.replacedWho?.id].find(
        (playerId) => typeof playerId === 'number' && subIds.has(playerId)
      );
      if (incoming) replacements.set(starter.id, incoming);
    });

    return lineup.startXI.map((player) => {
      if (!player.id) return player;
      const incomingId = replacements.get(player.id);
      if (!incomingId) return player;
      const incoming = subById.get(incomingId);
      const decor = decorMap.get(player.id);
      return {
        id: incomingId,
        name: incoming?.name || decor?.replacedBy?.name || player.name,
        number: incoming?.number ?? undefined,
        grid: player.grid,
      };
    });
  };

  const deriveFormation = (players: LineupPlayer[]) => {
    const rows = players
      .map((p) => {
        if (!p.grid || !p.grid.includes(':')) return null;
        const [rowStr] = p.grid.split(':');
        const row = Number(rowStr);
        return Number.isFinite(row) ? row : null;
      })
      .filter((row): row is number => row !== null)
      .sort((a, b) => a - b);
    if (!rows.length) return undefined;
    const counts = new Map<number, number>();
    rows.forEach((row) => counts.set(row, (counts.get(row) || 0) + 1));
    const ordered = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
    if (ordered.length && ordered[0][1] === 1) ordered.shift();
    if (!ordered.length) return undefined;
    return ordered.map(([, count]) => count).join('-');
  };

  const renderStat = (label: string, homeValue: number, awayValue: number) => {
    const total = homeValue + awayValue;
    const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
    const awayPercent = 100 - homePercent;
    return (
      <View style={styles.statRow}>
        <Text style={styles.statValue}>{homeValue}</Text>
        <View style={styles.statCenter}>
          <Text style={styles.statLabel}>{label}</Text>
          <View style={styles.statBar}>
            <View style={[styles.statBarHome, { width: `${homePercent}%` }]} />
            <View style={[styles.statBarAway, { width: `${awayPercent}%` }]} />
          </View>
        </View>
        <Text style={styles.statValue}>{awayValue}</Text>
      </View>
    );
  };

  const buildFormFromFixtures = (
    fixtures: Pick<FinishedMatch, 'home' | 'away' | 'homeGoals' | 'awayGoals' | 'homeId' | 'awayId'>[],
    teamName: string,
    teamId?: number
  ) => {
    const normalizeTeam = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(fc|cf|sc|afc|rcd|ac|as|club|united)\b/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedTeam = normalizeTeam(teamName);
    const results = fixtures
      .map(fixture => {
        // Prefer ID-based matching (works for national teams with inconsistent names)
        let isHome: boolean;
        let isAway: boolean;
        if (teamId && (fixture.homeId || fixture.awayId)) {
          isHome = fixture.homeId === teamId;
          isAway = fixture.awayId === teamId;
        } else {
          const homeTeam = normalizeTeam(fixture.home);
          const awayTeam = normalizeTeam(fixture.away);
          isHome = homeTeam === normalizedTeam || homeTeam.startsWith(`${normalizedTeam} `) || normalizedTeam.startsWith(`${homeTeam} `);
          isAway = awayTeam === normalizedTeam || awayTeam.startsWith(`${normalizedTeam} `) || normalizedTeam.startsWith(`${awayTeam} `);
        }
        if (!isHome && !isAway) return null;
        const homeGoals = fixture.homeGoals ?? 0;
        const awayGoals = fixture.awayGoals ?? 0;
        const teamGoals = isHome ? homeGoals : awayGoals;
        const oppGoals = isHome ? awayGoals : homeGoals;
        if (teamGoals > oppGoals) return 'W';
        if (teamGoals < oppGoals) return 'L';
        return 'D';
      })
      .filter((result): result is 'W' | 'D' | 'L' => !!result);
    return results.length > 0 ? results.slice(0, 5) : null;
  };

  const mergeRecentFixtures = (
    primary: FinishedMatch[],
    fallback: FinishedMatch[],
    limit: number = 5
  ) => {
    const seen = new Set<string>();
    return [...primary, ...fallback].filter((fixture) => {
      const key = String(fixture.id || `${fixture.home}-${fixture.away}-${fixture.date}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
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

  const formatLastMeetingDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const lastMeetingDecorMap = useMemo(() => buildDecorMap(lastMeetingEvents || []), [lastMeetingEvents]);
  const lastMeetingUiEvents = useMemo(() => {
    const normalized = normalizeFixtureEvents(lastMeetingEvents || []);
    return normalized.sort((a, b) => b.sortKey - a.sortKey);
  }, [lastMeetingEvents]);
  const lastMeetingKeyEvents = useMemo(() => filterKeyEvents(lastMeetingUiEvents), [lastMeetingUiEvents]);

  const renderMeetingLineupSection = (
    teamKey: 'home' | 'away',
    lineup: TeamLineup | null,
    teamName: string,
    teamLogo?: string
  ) => {
    const benchList = lineup ? buildBench(lineup, lastMeetingDecorMap) : [];
    const pitchXI = lineup ? buildPitchXI(lineup, lastMeetingDecorMap) : [];
    const displayFormation = deriveFormation(pitchXI) || lineup?.formation || 'N/A';

    return (
      <View style={styles.meetingLineupBlock}>
        <View style={styles.meetingLineupHeader}>
          <Text style={[styles.meetingLineupName, { color: palette.text }]}>{teamName}</Text>
          <View style={styles.meetingLineupMeta}>
            <Text style={[styles.meetingLineupFormation, { color: palette.subtext }]}>{displayFormation}</Text>
            {teamLogo ? <Image source={{ uri: teamLogo }} style={styles.teamTinyLogo} resizeMode="contain" /> : null}
          </View>
        </View>

        <View style={styles.meetingPitchWrap}>
          {pitchXI.length ? (
            <LineupPitch players={pitchXI} decorMap={lastMeetingDecorMap} teamName={teamName} />
          ) : (
            <Text style={[styles.formUnavailable, { color: palette.subtext }]}>Lineups unavailable</Text>
          )}
        </View>

        <Text style={[styles.meetingBenchLabel, { color: palette.subtext }]}>Bench</Text>
        {benchList.length === 0 ? (
          <Text style={[styles.formUnavailable, { color: palette.subtext }]}>No bench data</Text>
        ) : (
          benchList.map((player) => (
            <PlayerRow
              key={`${teamKey}-meeting-bench-${player.id || player.name}`}
              number={player.number}
              name={player.name}
              decor={player.id ? lastMeetingDecorMap.get(player.id) : undefined}
            />
          ))
        )}
      </View>
    );
  };


  const bannerBottomInset = Math.max(insets.bottom, 0);
  const bannerReserveSpace = 48 + bannerBottomInset;
  const homeTeamName = match?.home || 'Home';
  const awayTeamName = match?.away || 'Away';

  useEffect(() => {
    if (myPrediction) {
      setPredictionExpanded(false);
    }
  }, [myPrediction]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }, isLive && styles.containerLive]} edges={['top']}>
        <MatchEntryLoading
          homeName={loadingSeed.homeName}
          awayName={loadingSeed.awayName}
          homeLogo={loadingSeed.homeLogo}
          awayLogo={loadingSeed.awayLogo}
          league={loadingSeed.league}
          mode="preview"
        />
      </SafeAreaView>
    );
  }

  if (!match) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }, isLive && styles.containerLive]} edges={['top']}>
        <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }, isLive && styles.headerLive]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={palette.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: palette.subtext }, isLive && styles.subTextLive]}>Match not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const homeColor = teamPrimaryColor(match.home);
  const awayColor = teamPrimaryColor(match.away);
  const pollDrawColor = '#8A929F';
  const homePct = predictionTally.total > 0 ? Math.round((predictionTally.home / predictionTally.total) * 100) : 0;
  const drawPct = predictionTally.total > 0 ? Math.round((predictionTally.draw / predictionTally.total) * 100) : 0;
  const awayPct = predictionTally.total > 0 ? 100 - homePct - drawPct : 0;
  const shortTeam = (name: string) => name.split(' ').slice(-1)[0] ?? name;
  const getSegmentTextColor = (hex: string) => {
    const cleaned = hex.replace('#', '');
    const normalized = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#111827' : '#FFFFFF';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }, isLive && styles.containerLive]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }, isLive && styles.headerLive]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }, isLive && styles.textLive]}>Match Preview</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.screenBody, { backgroundColor: palette.surface }, isLive && styles.screenBodyLive]}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={!phaseInfo.chatOpen ? { paddingBottom: bannerReserveSpace } : undefined}
      >
        {/* Match Info Card */}
        <View style={styles.headerCardWrap}>
          <MatchResultHeaderCard
            homeName={match.home}
            awayName={match.away}
            homeAbbr={getTeamAbbr(match.home, match.homeShortName, match.homeCode)}
            awayAbbr={getTeamAbbr(match.away, match.awayShortName, match.awayCode)}
            homeLogo={match.homeLogo}
            awayLogo={match.awayLogo}
            homeScore={0}
            awayScore={0}
            statusLabel="PREVIEW"
            competitionLabel={match.league}
            centerLabel="VS"
            aggregateLabel={takeFirstParam(params.aggregate as string | string[] | undefined) || undefined}
            homeLines={[]}
            awayLines={[]}
            showRecords={false}
            showScorersToggle={false}
            detailRows={[
              { icon: 'calendar-outline', text: getKickoffTime() },
              { icon: 'location-outline', text: venueLabel },
            ]}
            lightMode={!isDark}
          />
        </View>

        {!isLive && (
          <View style={styles.section}>
            <View style={[styles.pollCard, { backgroundColor: palette.card }, isDark && { borderWidth: 1, borderColor: palette.border }]}>
              {/* Header */}
              <View style={styles.pollHeader}>
                <View style={styles.pollTitleRow}>
                  <Ionicons name="bar-chart-outline" size={12} color={palette.accent} />
                  <Text style={[styles.pollLabel, { color: palette.accent }]}>FAN POLL</Text>
                </View>
                <Text style={[styles.pollVoteCount, { color: palette.subtext }]}>
                  {predictionTally.total} {predictionTally.total === 1 ? 'vote' : 'votes'}
                </Text>
              </View>

              {myPrediction ? (
                /* POST-VOTE: segmented bar */
                <View style={styles.pollBarWrapper}>
                  <View style={styles.pollBarLabelRow}>
                    <Text style={[styles.pollBarLabelL, { color: homeColor }]} numberOfLines={1}>
                      {shortTeam(match.home)} {homePct}%
                    </Text>
                    <Text style={[styles.pollBarLabelM, { color: pollDrawColor }]}>
                      Draw {drawPct}%
                    </Text>
                    <Text style={[styles.pollBarLabelR, { color: awayColor }]} numberOfLines={1}>
                      {awayPct}% {shortTeam(match.away)}
                    </Text>
                  </View>
                  <View style={styles.pollBar}>
                    {predictionTally.home > 0 && <View style={[styles.pollBarSeg, { flex: predictionTally.home, backgroundColor: homeColor }]} />}
                    {predictionTally.draw > 0 && <View style={[styles.pollBarSeg, { flex: predictionTally.draw, backgroundColor: pollDrawColor }]} />}
                    {predictionTally.away > 0 && <View style={[styles.pollBarSeg, { flex: predictionTally.away, backgroundColor: awayColor }]} />}
                  </View>
                  <Text style={[styles.pollHint, { color: palette.subtext }]}>
                    Your pick is locked in
                  </Text>
                </View>
              ) : (
                /* PRE-VOTE: three tap buttons */
                <>
                  <View style={styles.pollBtnRow}>
                    {([
                      { key: 'home' as PredictionPick, label: match.home },
                      { key: 'draw' as PredictionPick, label: 'Draw' },
                      { key: 'away' as PredictionPick, label: match.away },
                    ]).map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.pollBtn, { borderColor: palette.border, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}
                        onPress={() => submitPrediction(option.key)}
                        disabled={predictionLoading || !auth.currentUser?.uid}
                        activeOpacity={0.72}
                      >
                        <Text style={[styles.pollBtnText, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.pollHint, { color: palette.subtext }]}>
                    {!auth.currentUser?.uid ? 'Sign in to cast your vote' : 'Who wins? Tap to predict'}
                  </Text>
                </>
              )}
            </View>
          </View>
        )}
        {/* Team Form */}
        {(homeRecentForm || awayRecentForm) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }, isLive && styles.textLive]}>Recent Form</Text>
            <Text style={[styles.formScopeLabel, { color: palette.subtext }, isLive && styles.subTextLive]}>
              Based on latest completed matches
            </Text>
            <View style={[styles.sectionDivider, { backgroundColor: palette.divider }, isLive && styles.sectionDividerLive]} />
            
            <View style={styles.formContainer}>
              {homeRecentForm && (
                <View
                  style={[
                    styles.teamFormCard,
                    { backgroundColor: palette.card, borderColor: palette.border },
                    isDark && { borderWidth: 1 },
                    isLive && styles.cardLive
                  ]}
                >
                  <Text
                    style={[styles.teamFormName, { color: palette.text }, isLive && styles.textLive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {getCompactTeamName(match.home)}
                  </Text>
                  {homeCompetitionRecord && (
                    <Text style={[styles.teamFormRecord, { color: palette.subtext }, isLive && styles.subTextLive]}>
                      Record: {homeCompetitionRecord}
                    </Text>
                  )}
                  <View style={styles.formRow}>
                    {homeRecentForm.map((result, idx) => (
                      <View key={`${result}-${idx}`} style={[styles.formPill, getFormPillStyle(result)]}>
                        <Text style={[styles.formPillText, isDark && styles.formPillTextDark]}>{result}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {awayRecentForm && (
                <View
                  style={[
                    styles.teamFormCard,
                    { backgroundColor: palette.card, borderColor: palette.border },
                    isDark && { borderWidth: 1 },
                    isLive && styles.cardLive
                  ]}
                >
                  <Text
                    style={[styles.teamFormName, { color: palette.text }, isLive && styles.textLive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {getCompactTeamName(match.away)}
                  </Text>
                  {awayCompetitionRecord && (
                    <Text style={[styles.teamFormRecord, { color: palette.subtext }, isLive && styles.subTextLive]}>
                      Record: {awayCompetitionRecord}
                    </Text>
                  )}
                  <View style={styles.formRow}>
                    {awayRecentForm.map((result, idx) => (
                      <View key={`${result}-${idx}`} style={[styles.formPill, getFormPillStyle(result)]}>
                        <Text style={[styles.formPillText, isDark && styles.formPillTextDark]}>{result}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
            {(!homeRecentForm || !awayRecentForm) && (
              <Text style={[styles.formUnavailable, { color: palette.subtext }, isLive && styles.subTextLive]}>
                Form unavailable{!homeRecentForm && !awayRecentForm ? '' : ` for ${!homeRecentForm ? match.home : match.away}`}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }, isLive && styles.textLive]}>Recent Form</Text>
            <View style={[styles.sectionDivider, { backgroundColor: palette.divider }, isLive && styles.sectionDividerLive]} />
            <Text style={[styles.formUnavailable, { color: palette.subtext }, isLive && styles.subTextLive]}>Form unavailable</Text>
          </View>
        )}

        {/* Last Meeting */}
        {lastMeeting && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }, isLive && styles.textLive]}>Last Meeting</Text>
            <View style={[styles.sectionDivider, { backgroundColor: palette.divider }, isLive && styles.sectionDividerLive]} />
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push(`/results/${lastMeeting.id}` as any)}
            >
              <View
                style={[
                  styles.lastMeetingCard,
                  { backgroundColor: palette.card, borderColor: palette.border },
                  isDark && { borderWidth: 1 },
                  isLive && styles.cardLive
                ]}
              >
                <Text style={[styles.lastMeetingLeagueTop, { color: palette.accent }]} numberOfLines={1}>
                  {lastMeeting.league}
                </Text>
                <View style={styles.lastMeetingRow}>
                  <View style={styles.lastMeetingTeam}>
                    {lastMeeting.homeLogo ? (
                      <Image source={{ uri: lastMeeting.homeLogo, cache: 'force-cache' }} style={styles.lastMeetingLogo} resizeMode="contain" />
                    ) : null}
                    <Text style={[styles.lastMeetingTeamName, { color: palette.text }]} numberOfLines={1}>
                      {lastMeeting.home}
                    </Text>
                  </View>
                  <Text style={[styles.lastMeetingScore, { color: palette.text }]}>{lastMeeting.score}</Text>
                  <View style={styles.lastMeetingTeam}>
                    {lastMeeting.awayLogo ? (
                      <Image source={{ uri: lastMeeting.awayLogo, cache: 'force-cache' }} style={styles.lastMeetingLogo} resizeMode="contain" />
                    ) : null}
                    <Text style={[styles.lastMeetingTeamName, { color: palette.text }]} numberOfLines={1}>
                      {lastMeeting.away}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.lastMeetingDateBottom, { color: palette.subtext }]}>{formatLastMeetingDate(lastMeeting.date)}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Fan Community — hidden until World Cup watch parties launch */}
        {false && (match?.homeId || match?.awayId) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }, isLive && styles.textLive]}>Fan Community</Text>
            <View style={[styles.sectionDivider, { backgroundColor: palette.divider }, isLive && styles.sectionDividerLive]} />
            <View style={styles.communityCardsRow}>
              {match?.homeId && (
                <TouchableOpacity
                  style={[styles.communityCard, { backgroundColor: palette.card, borderColor: palette.accent }, isLive && styles.cardLive]}
                  onPress={() => router.push({ pathname: '/teamCommunity/[id]', params: { id: String(match?.homeId || '') } } as any)}
                  activeOpacity={0.75}
                >
                  {match?.homeLogo ? (
                    <Image source={{ uri: match?.homeLogo || '', cache: 'force-cache' }} style={styles.communityCardLogo} resizeMode="contain" />
                  ) : (
                    <Ionicons name="people" size={26} color={palette.accent} />
                  )}
                  <Text style={[styles.communityCardName, { color: palette.text }]} numberOfLines={1}>{match?.home}</Text>
                  <Text style={[styles.communityCardSub, { color: palette.accent }]}>Fan Hub →</Text>
                </TouchableOpacity>
              )}
              {match?.awayId && (
                <TouchableOpacity
                  style={[styles.communityCard, { backgroundColor: palette.card, borderColor: palette.accent }, isLive && styles.cardLive]}
                  onPress={() => router.push({ pathname: '/teamCommunity/[id]', params: { id: String(match?.awayId || '') } } as any)}
                  activeOpacity={0.75}
                >
                  {match?.awayLogo ? (
                    <Image source={{ uri: match?.awayLogo || '', cache: 'force-cache' }} style={styles.communityCardLogo} resizeMode="contain" />
                  ) : (
                    <Ionicons name="people" size={26} color={palette.accent} />
                  )}
                  <Text style={[styles.communityCardName, { color: palette.text }]} numberOfLines={1}>{match?.away}</Text>
                  <Text style={[styles.communityCardSub, { color: palette.accent }]}>Fan Hub →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Related News */}
        <View style={styles.section}>
            <View style={styles.newsTitleBlock}>
              <View style={[styles.newsPill, { backgroundColor: palette.newsPill }, isLive && styles.newsPillLive]}>
                <Text style={[styles.newsPillText, { color: palette.accent }, isLive && styles.textLive]}>MATCH NEWS</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: palette.text }, isLive && styles.textLive]}>Match News</Text>
              <View style={[styles.sectionDivider, { backgroundColor: palette.divider }, isLive && styles.sectionDividerLive]} />
            </View>

            {newsLoading ? (
              <Text style={[styles.loadingText, { color: palette.subtext }, isLive && styles.subTextLive]}>Loading news...</Text>
            ) : (
              <>
                {relatedNews.slice(0, 5).map((article) => (
                  <View
                    key={article.id}
                    style={[
                      styles.articleCard,
                      { backgroundColor: palette.card, borderColor: palette.border },
                      isDark && { borderWidth: 1 },
                      isLive && styles.cardLive
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => openArticle(article)}
                      onPressIn={() => prefetchArticle(article)}
                    >
                      <View style={styles.articleRow}>
                        <NewsImage uri={getArticleImage(article)} style={styles.articleThumb} resizeMode="cover" />
                        <View style={styles.articleTextCol}>
                          <Text style={[styles.articleTitle, { color: palette.text }, isLive && styles.textLive]} numberOfLines={2}>
                            {article.title}
                          </Text>
                          <Text style={[styles.articleDescription, { color: palette.subtext }, isLive && styles.subTextLive]} numberOfLines={2}>
                            {article.description}
                          </Text>
                          <Text style={[styles.articleSource, { color: palette.accent }, isLive && styles.subTextLive]} numberOfLines={1}>
                            {article.source}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Thumbs Up/Down */}
                    <View style={[styles.articleActions, { borderTopColor: palette.border }]}>
                      <TouchableOpacity
                        style={[
                          styles.thumbButton,
                          { backgroundColor: palette.thumbBg },
                          newsReactions[article.id] === 'up' && { backgroundColor: palette.thumbActive }
                        ]}
                        onPress={() => { void handleNewsReaction(article, 'up'); }}
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
                          { backgroundColor: palette.thumbBg },
                          newsReactions[article.id] === 'down' && { backgroundColor: palette.thumbActive }
                        ]}
                        onPress={() => { void handleNewsReaction(article, 'down'); }}
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
                    style={[
                      styles.loadMoreButton,
                      { backgroundColor: palette.loadMoreBg, borderColor: palette.loadMoreBorder },
                      isLive && styles.loadMoreButtonLive
                    ]}
                    onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: matchQuery } })}
                  >
                    <Text style={[styles.loadMoreText, { color: palette.accent }, isLive && styles.textLive]}>See more news</Text>
                  </TouchableOpacity>
                )}
                {newsErrorMessage && (
                  <Text style={[styles.newsUnavailable, { color: palette.subtext }, isLive && styles.subTextLive]}>
                    News is temporarily rate-limited. Try again shortly.
                  </Text>
                )}
                {!newsLoading && relatedNews.length === 0 && (
                  <View
                    style={[
                      styles.emptyNewsCard,
                      { backgroundColor: palette.card, borderColor: palette.border },
                      isDark && { borderWidth: 1 },
                      isLive && styles.cardLive
                    ]}
                  >
                    <Text style={[styles.emptyNewsText, { color: palette.subtext }, isLive && styles.subTextLive]}>
                      No recent news found for this matchup. Check back closer to kickoff.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

        <View style={{ height: 8 }} />
      </ScrollView>
      </View>

      <Modal
        visible={lastMeetingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLastMeetingModalVisible(false)}
      >
        <View style={styles.lastMeetingModalOverlay}>
          <View style={[styles.lastMeetingModalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.lastMeetingModalHeader}>
              <Text style={[styles.lastMeetingModalTitle, { color: palette.text }]}>Last Meeting</Text>
              <TouchableOpacity onPress={() => setLastMeetingModalVisible(false)}>
                <Ionicons name="close" size={20} color={palette.subtext} />
              </TouchableOpacity>
            </View>

            {lastMeeting ? (
              <>
                <View style={styles.lastMeetingRow}>
                  <View style={styles.lastMeetingTeam}>
                    {lastMeeting.homeLogo ? (
                      <Image source={{ uri: lastMeeting.homeLogo, cache: 'force-cache' }} style={styles.lastMeetingLogoLarge} resizeMode="contain" />
                    ) : null}
                    <Text style={[styles.lastMeetingTeamName, { color: palette.text }]} numberOfLines={1}>
                      {lastMeeting.home}
                    </Text>
                  </View>
                  <Text style={[styles.lastMeetingScoreLarge, { color: palette.text }]}>{lastMeeting.score}</Text>
                  <View style={styles.lastMeetingTeam}>
                    {lastMeeting.awayLogo ? (
                      <Image source={{ uri: lastMeeting.awayLogo, cache: 'force-cache' }} style={styles.lastMeetingLogoLarge} resizeMode="contain" />
                    ) : null}
                    <Text style={[styles.lastMeetingTeamName, { color: palette.text }]} numberOfLines={1}>
                      {lastMeeting.away}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.lastMeetingDateBottom, { color: palette.subtext }]}>{formatLastMeetingDate(lastMeeting.date)}</Text>
                {lastMeetingLoading ? (
                  <Text style={[styles.loadingText, { color: palette.subtext }]}>Loading lineup and stats...</Text>
                ) : (
                  <ScrollView style={styles.meetingModalScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.meetingModalBody}>
                    <View style={styles.meetingTabsRow}>
                      <TouchableOpacity
                        style={[styles.meetingTab, lastMeetingTab === 'events' && styles.meetingTabActive]}
                        onPress={() => setLastMeetingTab('events')}
                      >
                        <Text style={[styles.meetingTabText, lastMeetingTab === 'events' && styles.meetingTabTextActive]}>Events</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.meetingTab, lastMeetingTab === 'lineups' && styles.meetingTabActive]}
                        onPress={() => setLastMeetingTab('lineups')}
                      >
                        <Text style={[styles.meetingTabText, lastMeetingTab === 'lineups' && styles.meetingTabTextActive]}>Lineups</Text>
                      </TouchableOpacity>
                    </View>

                    {lastMeetingTab === 'events' ? (
                      lastMeetingStats ? (
                        <View style={styles.meetingStatsWrap}>
                          {renderStat('Possession', lastMeetingStats.possession.home, lastMeetingStats.possession.away)}
                          {renderStat('Shots', lastMeetingStats.shots.home, lastMeetingStats.shots.away)}
                          {renderStat('Shots on Target', lastMeetingStats.shotsOnTarget.home, lastMeetingStats.shotsOnTarget.away)}
                          {renderStat('Corners', lastMeetingStats.corners.home, lastMeetingStats.corners.away)}
                          {renderStat('Fouls', lastMeetingStats.fouls.home, lastMeetingStats.fouls.away)}
                          {renderStat('Offsides', lastMeetingStats.offsides.home, lastMeetingStats.offsides.away)}
                          {renderStat('Yellow Cards', lastMeetingStats.yellowCards.home, lastMeetingStats.yellowCards.away)}
                          {renderStat('Red Cards', lastMeetingStats.redCards.home, lastMeetingStats.redCards.away)}
                          <View style={styles.sectionDivider} />
                          <Text style={[styles.meetingEventsTitle, { color: palette.text }]}>Key Events</Text>
                          {lastMeetingKeyEvents.length === 0 ? (
                            <Text style={[styles.formUnavailable, { color: palette.subtext }]}>No events available</Text>
                          ) : (
                            lastMeetingKeyEvents.map((event) => (
                              <View key={event.id} style={styles.meetingEventRow}>
                                <Text style={styles.meetingEventTime}>{event.time}</Text>
                                <View style={styles.meetingEventIconWrap}>
                                  {event.icon === 'goal' ? <Ionicons name="football-outline" size={14} color="#4DA3FF" /> : null}
                                  {event.icon === 'yellow' ? <View style={{ width: 10, height: 14, borderRadius: 1.5, backgroundColor: '#F5C542' }} /> : null}
                                  {event.icon === 'red' ? <View style={{ width: 10, height: 14, borderRadius: 1.5, backgroundColor: '#FF453A' }} /> : null}
                                  {event.icon === 'sub' ? <Ionicons name="swap-horizontal" size={14} color="#4DA3FF" /> : null}
                                  {event.icon === 'var' ? <Ionicons name="time-outline" size={14} color="#8E8E93" /> : null}
                                  {event.icon === 'other' ? <Ionicons name="ellipse" size={8} color="#8E8E93" /> : null}
                                </View>
                                <Text style={[styles.meetingEventText, { color: palette.text }]}>{event.text}</Text>
                              </View>
                            ))
                          )}
                        </View>
                      ) : (
                        <Text style={[styles.formUnavailable, { color: palette.subtext }]}>No statistics available</Text>
                      )
                    ) : (
                      <>
                        <TeamToggle
                          selected={lastMeetingSelectedTeam}
                          homeLogo={lastMeeting.homeLogo}
                          awayLogo={lastMeeting.awayLogo}
                          homeFormation={deriveFormation(lastMeetingLineups.home ? buildPitchXI(lastMeetingLineups.home, lastMeetingDecorMap) : []) || lastMeetingLineups.home?.formation}
                          awayFormation={deriveFormation(lastMeetingLineups.away ? buildPitchXI(lastMeetingLineups.away, lastMeetingDecorMap) : []) || lastMeetingLineups.away?.formation}
                          homeLabel={lastMeeting.home}
                          awayLabel={lastMeeting.away}
                          onSelect={setLastMeetingSelectedTeam}
                        />
                        {lastMeetingSelectedTeam === 'home'
                          ? renderMeetingLineupSection('home', lastMeetingLineups.home, lastMeeting.home, lastMeeting.homeLogo)
                          : renderMeetingLineupSection('away', lastMeetingLineups.away, lastMeeting.away, lastMeeting.awayLogo)}
                      </>
                    )}
                    </View>
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={[styles.lastMeetingResultButton, { borderColor: palette.accent }]}
                  onPress={() => {
                    setLastMeetingModalVisible(false);
                    router.push(`/results/${lastMeeting.id}` as any);
                  }}
                >
                  <Text style={[styles.lastMeetingResultButtonText, { color: palette.accent }]}>Open Full Result</Text>
                  <Ionicons name="open-outline" size={14} color={palette.accent} />
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Chat Opens In... Banner */}
      {!phaseInfo.chatOpen && (
        <View
          style={[
            styles.chatBannerWrap,
            { backgroundColor: palette.bannerBg, borderTopColor: palette.bannerBorder },
            isLive && styles.chatBannerWrapLive,
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: bannerBottomInset,
              paddingTop: 12,
            },
          ]}
        >
          <View style={styles.chatBanner}>
            <Ionicons name="time-outline" size={18} color={palette.accent} />
            <Text style={[styles.chatBannerText, { color: palette.accent }, isLive && styles.textLive]}>
              Chat opens 45 minutes before kickoff
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 44,
    backgroundColor: '#FFF',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },
  backButton: {
    zIndex: 20,
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  containerLive: {
    backgroundColor: '#0A0A0A',
  },
  headerLive: {
    backgroundColor: '#1C1C1E',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  screenBodyLive: {
    backgroundColor: '#0A0A0A',
  },
  cardLive: {
    backgroundColor: '#1C1C1E',
  },
  textLive: {
    color: '#E6E6E9',
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
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    padding: 10,
    borderRadius: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  matchCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: ACCENT,
  },
  matchCardAccentLive: {
    backgroundColor: '#2A3A52',
  },
  league: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    textAlign: 'center',
  },
  matchupWrapper: {
    alignSelf: 'center',
    maxWidth: 420,
    width: '86%',
    marginBottom: 8,
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
    maxWidth: '100%',
  },
  rightTeamInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    maxWidth: '100%',
  },
  teamNameWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  nameLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  teamCrest: {
    width: 26,
    height: 26,
  },
  teamCrestPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E7EB',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flexShrink: 1,
    minWidth: 0,
    lineHeight: 22,
  },
  teamNameLeft: {
    textAlign: 'right',
  },
  teamNameRight: {
    textAlign: 'left',
  },
  centerPillWrap: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePill: {
    width: 42,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#1F2933',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillLive: {
    backgroundColor: '#1D2430',
  },
  scorePillText: {
    fontSize: 10,
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
  headerCardWrap: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 0,
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
  pollCard: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pollTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pollLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  pollVoteCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  pollBtnRow: {
    flexDirection: 'row',
    gap: 7,
  },
  pollBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollBtnText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pollBarWrapper: {
    gap: 5,
  },
  pollBarLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pollBarLabelL: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  pollBarLabelM: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  pollBarLabelR: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  pollBar: {
    height: 9,
    borderRadius: 99,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 2,
  },
  pollBarSeg: {
    borderRadius: 99,
  },
  pollHint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
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
  teamFormRecord: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  formScopeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
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
  formPillTextDark: {
    color: '#F8FAFC',
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
  formPillWDark: {
    backgroundColor: '#14532D',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  formPillDDark: {
    backgroundColor: '#713F12',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  formPillLDark: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#EF4444',
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
  lastMeetingCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  lastMeetingLeagueTop: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  lastMeetingDateBottom: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  meetingTabsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },
  meetingModalBody: {
    marginTop: 8,
    marginBottom: 8,
  },
  meetingModalScroll: {
    maxHeight: 460,
  },
  meetingTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  meetingTabActive: {
    borderBottomColor: ACCENT,
  },
  meetingTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  meetingTabTextActive: {
    color: '#000',
  },
  meetingStatsWrap: {
    gap: 8,
  },
  meetingEventsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  meetingEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  meetingEventTime: {
    width: 52,
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1A6',
  },
  meetingEventIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  meetingEventIconText: {
    fontSize: 13,
  },
  meetingEventText: {
    flex: 1,
    fontSize: 13,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    width: 34,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  statCenter: {
    flex: 1,
    marginHorizontal: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
    textAlign: 'center',
  },
  statBar: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  statBarHome: {
    backgroundColor: '#0066CC',
  },
  statBarAway: {
    backgroundColor: '#FF3B30',
  },
  meetingLineupBlock: {
    marginTop: 10,
  },
  meetingLineupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  meetingLineupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meetingLineupName: {
    fontSize: 15,
    fontWeight: '800',
  },
  meetingLineupFormation: {
    fontSize: 12,
    fontWeight: '700',
  },
  teamTinyLogo: {
    width: 16,
    height: 16,
  },
  meetingPitchWrap: {
    marginBottom: 12,
  },
  meetingBenchLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  newsTeam: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  lastMeetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lastMeetingTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  lastMeetingLogo: {
    width: 28,
    height: 28,
  },
  lastMeetingLogoLarge: {
    width: 36,
    height: 36,
  },
  lastMeetingTeamName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  lastMeetingScore: {
    fontSize: 20,
    fontWeight: '900',
  },
  lastMeetingScoreLarge: {
    fontSize: 28,
    fontWeight: '900',
  },
  lastMeetingMeta: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  lastMeetingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  lastMeetingModalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    maxHeight: '88%',
  },
  lastMeetingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lastMeetingModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  lastMeetingResultButton: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lastMeetingResultButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  communityCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  communityCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  communityCardLogo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  communityCardName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  communityCardSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  articleCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
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
    marginBottom: 2,
    lineHeight: 22,
  },
  articleDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
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
    paddingTop: 4,
    paddingBottom: 2,
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
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 10,
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
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 8,
    width: '100%',
  },
  chatBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'center',
  },
  chatBannerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: '#F0F7FF',
    borderTopWidth: 1,
    borderTopColor: '#E1E7F3',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  chatBannerWrapLive: {
    backgroundColor: '#1C1C1E',
    borderTopColor: '#2A2A2E',
  },
});
