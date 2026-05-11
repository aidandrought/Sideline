// app/results/[id].tsx
// Google-style results details screen
// Shows final score, scorers with assists, and match statistics

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { footballAPI } from '../../services/footballApi';
import { MatchResultHeaderCard } from '../../components/matchDetail/MatchResultHeaderCard';
import { MatchEntryLoading } from '../../components/MatchEntryLoading';
import { LineupPitch } from '../../components/matchDetail/LineupPitch';
import { PlayByPlayRow } from '../../components/matchDetail/PlayByPlayRow';
import { PlayerRow } from '../../components/matchDetail/PlayerRow';
import { TeamToggle } from '../../components/matchDetail/TeamToggle';
import { buildDecorMap, buildDecorNameMap, filterKeyEvents, findPlayerDecor, normalizeFixtureEvents, PlayerDecor } from '../../services/eventsDecor';
import { useTheme } from '../../context/ThemeContext';
import { chatService, PopularChatMessage } from '../../services/chatService';
import { getCachedValue } from '../../services/cacheService';

const MATCH_LOADING_TTL_MS = 20 * 60 * 1000;
const takeFirstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

interface MatchData {
  id: number;
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeLogo?: string;
  awayLogo?: string;
}

interface Stats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  saves: { home: number; away: number };
  xG: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

type TabKey = 'events' | 'lineups';

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

const EMPTY_LINEUPS = {
  home: null as TeamLineup | null,
  away: null as TeamLineup | null,
};

export default function ResultsDetails() {
  const { isDark } = useTheme();
  const params = useLocalSearchParams();
  const id = takeFirstParam(params.id as string | string[] | undefined);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [lineups, setLineups] = useState<{ home: TeamLineup | null; away: TeamLineup | null }>({
    home: null,
    away: null,
  });
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [activeTab, setActiveTab] = useState<TabKey>('events');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popularMessages, setPopularMessages] = useState<PopularChatMessage[]>([]);
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
      league: takeFirstParam(params.league as string | string[] | undefined) || cachedFixture?.league?.name || 'Match Result',
    };
  }, [id, params.away, params.awayLogo, params.home, params.homeLogo, params.league]);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#FFFFFF',
            subtext: '#A1A1A6',
            border: '#2C2C2E',
            accent: '#4DA3FF',
            tabInactive: '#9A9AA0',
            tabActive: '#FFFFFF',
            statTrack: '#2C2C2E',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#111827',
            subtext: '#6B7280',
            border: '#E5E7EB',
            accent: '#0066CC',
            tabInactive: '#6B7280',
            tabActive: '#111827',
            statTrack: '#E5E7EB',
          },
    [isDark]
  );

  const mapStats = (statsResponse: any[]) => {
    if (!statsResponse || statsResponse.length < 2) return null;
    const homeStats = statsResponse[0]?.statistics || [];
    const awayStats = statsResponse[1]?.statistics || [];
    
    const getStat = (stats: any[], type: string) => {
      const stat = stats.find((s: any) => s.type === type);
      const value = stat?.value;
      if (typeof value === 'string') {
        return parseFloat(value.replace('%', '')) || 0;
      }
      return value || 0;
    };

    return {
      possession: { home: getStat(homeStats, 'Ball Possession'), away: getStat(awayStats, 'Ball Possession') },
      shots: { home: getStat(homeStats, 'Total Shots'), away: getStat(awayStats, 'Total Shots') },
      shotsOnTarget: { home: getStat(homeStats, 'Shots on Goal'), away: getStat(awayStats, 'Shots on Goal') },
      corners: { home: getStat(homeStats, 'Corner Kicks'), away: getStat(awayStats, 'Corner Kicks') },
      saves: { home: getStat(homeStats, 'Goalkeeper Saves'), away: getStat(awayStats, 'Goalkeeper Saves') },
      xG: {
        home: getStat(homeStats, 'Expected Goals') || getStat(homeStats, 'xG'),
        away: getStat(awayStats, 'Expected Goals') || getStat(awayStats, 'xG'),
      },
      fouls: { home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls') },
      offsides: { home: getStat(homeStats, 'Offsides'), away: getStat(awayStats, 'Offsides') },
      yellowCards: { home: getStat(homeStats, 'Yellow Cards'), away: getStat(awayStats, 'Yellow Cards') },
      redCards: { home: getStat(homeStats, 'Red Cards'), away: getStat(awayStats, 'Red Cards') },
    } as Stats;
  };

  const normalizeLineup = (raw: any): TeamLineup => {
    if (!raw) {
      return { teamName: '', startXI: [], substitutes: [] };
    }
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
        (id) => typeof id === 'number' && starterIds.has(id)
      );
      if (outgoing && !replacements.has(outgoing)) {
        replacements.set(outgoing, sub.id);
      }
    });

    lineup.startXI.forEach((starter) => {
      if (!starter.id || replacements.has(starter.id)) return;
      const decor = decorMap.get(starter.id);
      const incoming = [decor?.replacedBy?.id, decor?.replacedWho?.id].find(
        (id) => typeof id === 'number' && subIds.has(id)
      );
      if (incoming) {
        replacements.set(starter.id, incoming);
      }
    });

    return lineup.startXI.map((player) => {
      if (!player.id) return player;
      const incomingId = replacements.get(player.id);
      if (!incomingId) return player;
      const incoming = subById.get(incomingId);
      const playerDecor = decorMap.get(player.id);
      return {
        id: incomingId,
        name: incoming?.name || playerDecor?.replacedBy?.name || player.name,
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

  const buildScorerLines = (eventsRaw: any[], homeId?: number, awayId?: number) => {
    const homeLines: { icon: 'goal' | 'yellow' | 'red'; text: string }[] = [];
    const awayLines: { icon: 'goal' | 'yellow' | 'red'; text: string }[] = [];

    eventsRaw.forEach((event) => {
      const type = (event?.type || '').toLowerCase();
      const detail = (event?.detail || '').toLowerCase();
      const elapsed = event?.time?.elapsed ?? 0;
      const extra = event?.time?.extra ?? 0;
      const minute = extra ? `${elapsed}'+${extra}` : `${elapsed}'`;
      const player = event?.player?.name || 'Player';
      const teamId = event?.team?.id;
      const target = teamId === homeId ? homeLines : teamId === awayId ? awayLines : null;
      if (!target) return;

      if (type === 'goal') {
        const pen = detail.includes('penalty') ? ' Pen' : '';
        target.push({ icon: 'goal', text: `${player} - ${minute}${pen}` });
      }

      if (type === 'card') {
        if (detail.includes('yellow')) {
          target.push({ icon: 'yellow', text: `${player} - ${minute}` });
        } else if (detail.includes('red')) {
          target.push({ icon: 'red', text: `${player} - ${minute}` });
        }
      }
    });

    return { homeLines, awayLines };
  };

  const buildRouteFallbackMatch = useCallback((fixtureId: number): MatchData | null => {
    const home = takeFirstParam(params.home as string | string[] | undefined);
    const away = takeFirstParam(params.away as string | string[] | undefined);
    if (!home || !away) return null;

    const [homeScoreRaw, awayScoreRaw] = String(takeFirstParam(params.score as string | string[] | undefined) || '').split('-');
    const homeScore = Number(homeScoreRaw);
    const awayScore = Number(awayScoreRaw);

    return {
      id: fixtureId,
      league: takeFirstParam(params.league as string | string[] | undefined) || 'Match Result',
      home,
      away,
      homeScore: Number.isFinite(homeScore) ? homeScore : 0,
      awayScore: Number.isFinite(awayScore) ? awayScore : 0,
      status: takeFirstParam(params.status as string | string[] | undefined) || 'FT',
      homeTeamId: 0,
      awayTeamId: 0,
      homeLogo: takeFirstParam(params.homeLogo as string | string[] | undefined) || undefined,
      awayLogo: takeFirstParam(params.awayLogo as string | string[] | undefined) || undefined,
    };
  }, [params.away, params.awayLogo, params.home, params.homeLogo, params.league, params.score, params.status]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('No match ID provided');
        setLoading(false);
        return;
      }

      const fixtureId = Number(id);
      if (Number.isNaN(fixtureId)) {
        setError('Invalid match ID');
        setLoading(false);
        return;
      }

      try {
        const fixture = await footballAPI.getFixtureById(fixtureId);
        const topMessagesPromise = chatService.getTopMessages(String(fixtureId), 3).catch(() => [] as PopularChatMessage[]);
        
        if (!fixture) {
          const fallbackMatch = buildRouteFallbackMatch(fixtureId);
          if (fallbackMatch) {
            setMatchData(fallbackMatch);
            setStats(null);
            setEvents([]);
            setPopularMessages(await topMessagesPromise);
            setLoading(false);
            return;
          }
          setError('Match not found');
          setLoading(false);
          return;
        }

        const mappedMatch: MatchData = {
          id: fixture.fixture.id,
          league: fixture.league.name,
          home: fixture.teams.home.name,
          away: fixture.teams.away.name,
          homeScore: fixture.goals.home || 0,
          awayScore: fixture.goals.away || 0,
          status: fixture.fixture?.status?.short || 'FT',
          homeTeamId: fixture.teams.home.id,
          awayTeamId: fixture.teams.away.id,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo,
        };
        setMatchData(mappedMatch);

        // Load initial tab data (events + stats) before clearing the loading screen
        const [statsRaw, eventsRaw, topMessages] = await Promise.allSettled([
          footballAPI.getFixtureStatistics(fixtureId),
          footballAPI.getFixtureEvents(fixtureId),
          topMessagesPromise,
        ]);
        if (statsRaw.status === 'fulfilled') setStats(mapStats(statsRaw.value || []));
        if (eventsRaw.status === 'fulfilled') setEvents(eventsRaw.value || []);
        if (topMessages.status === 'fulfilled') setPopularMessages(topMessages.value);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching match data:', err);
        setError('Failed to load match data');
        setLoading(false);
      }
    };

    fetchData();
  }, [buildRouteFallbackMatch, id]);

  useEffect(() => {
    const fixtureId = Number(id);
    if (Number.isNaN(fixtureId) || !matchData || activeTab !== 'lineups') return;
    if (lineups.home || lineups.away) return;

    let active = true;
    const loadLineups = async () => {
      setTabLoading(true);
      try {
        const lineupsRaw = await footballAPI.getFixtureLineups(fixtureId);
        if (!active) return;
        const lineupMapped = (lineupsRaw || []).map(normalizeLineup);
        const homeLineup = lineupMapped.find((l) => l.teamId === matchData.homeTeamId) || lineupMapped[0] || null;
        const awayLineup = lineupMapped.find((l) => l.teamId === matchData.awayTeamId) || lineupMapped[1] || null;
        setLineups({ home: homeLineup, away: awayLineup });
      } catch (err) {
        console.error('Error loading lineups:', err);
        if (active) setLineups(EMPTY_LINEUPS);
      } finally {
        if (active) setTabLoading(false);
      }
    };

    void loadLineups();
    return () => {
      active = false;
    };
  }, [activeTab, id, lineups.away, lineups.home, matchData]);

  const renderStat = (label: string, homeValue: number, awayValue: number) => {
    const total = homeValue + awayValue;
    const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
    const awayPercent = 100 - homePercent;

    return (
      <View style={styles.statBlock}>
        <Text style={[styles.statLabel, { color: palette.subtext }]}>{label}</Text>
        <View style={styles.statRow}>
          <Text style={[styles.statValue, { color: palette.text }]}>{homeValue}</Text>
          <View style={styles.statCenter}>
            <View style={[styles.statBar, { backgroundColor: palette.statTrack }]}>
              <View style={[styles.statBarHome, { width: `${homePercent}%` }]} />
              <View style={[styles.statBarAway, { width: `${awayPercent}%` }]} />
            </View>
          </View>
          <Text style={[styles.statValue, { color: palette.text }]}>{awayValue}</Text>
        </View>
      </View>
    );
  };

  const summarizeReactions = (message: PopularChatMessage) => {
    return Object.entries(message.reactions || {})
      .sort(([, a], [, b]) => (b?.count || 0) - (a?.count || 0))
      .map(([emoji, data]) => `${emoji} ${data?.count || 0}`)
      .join('  ');
  };

  const decorMap = useMemo(() => buildDecorMap(events || []), [events]);
  const decorNameMap = useMemo(() => buildDecorNameMap(events || []), [events]);
  const uiEvents = useMemo(() => {
    const normalized = normalizeFixtureEvents(events || []);
    return normalized.sort((a, b) => b.sortKey - a.sortKey);
  }, [events]);
  const keyEvents = useMemo(() => filterKeyEvents(uiEvents), [uiEvents]);
  const scorerLines = useMemo(() => {
    if (!matchData) return { homeLines: [], awayLines: [] };
    return buildScorerLines(events, matchData.homeTeamId, matchData.awayTeamId);
  }, [events, matchData]);

  const renderTeamLineupSection = (
    teamKey: 'home' | 'away',
    lineup: TeamLineup | null,
    teamName: string,
    teamLogo?: string
  ) => {
    const benchList = lineup ? buildBench(lineup, decorMap) : [];
    const pitchXI = lineup ? buildPitchXI(lineup, decorMap) : [];
    const displayFormation = deriveFormation(pitchXI) || lineup?.formation || 'N/A';

    return (
      <View style={styles.teamLineupBlock}>
        <View style={styles.teamLineupHeader}>
          <Text style={[styles.teamLineupName, { color: palette.text }]}>{teamName}</Text>
          <View style={styles.teamLineupMeta}>
            <Text style={[styles.teamLineupFormation, { color: palette.subtext }]}>{displayFormation}</Text>
            {teamLogo ? <Image source={{ uri: teamLogo }} style={styles.teamTinyLogo} resizeMode="contain" /> : null}
          </View>
        </View>

        <View style={styles.pitchWrap}>
          {pitchXI.length ? (
            <LineupPitch players={pitchXI} decorMap={decorMap} teamName={teamName} />
          ) : (
            <Text style={[styles.emptyText, { color: palette.subtext }]}>Lineups unavailable</Text>
          )}
        </View>

        <Text style={[styles.benchLabel, { color: palette.subtext }]}>Bench</Text>
        {benchList.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.subtext }]}>No bench data</Text>
        ) : (
          benchList.map((player) => (
            <PlayerRow
              key={`${teamKey}-bench-${player.id || player.name}`}
              number={player.number}
              name={player.name}
              decor={findPlayerDecor(player, decorMap, decorNameMap)}
              relatedDecor={
                findPlayerDecor(
                  {
                    id: decorMap.get(player.id || -1)?.replacedWho?.id ?? decorMap.get(player.id || -1)?.replacedBy?.id,
                    name: decorMap.get(player.id || -1)?.replacedWho?.name ?? decorMap.get(player.id || -1)?.replacedBy?.name,
                  },
                  decorMap,
                  decorNameMap
                )
              }
            />
          ))
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
        <MatchEntryLoading
          homeName={loadingSeed.homeName}
          awayName={loadingSeed.awayName}
          homeLogo={loadingSeed.homeLogo}
          awayLogo={loadingSeed.awayLogo}
          league={loadingSeed.league}
          mode="result"
        />
      </SafeAreaView>
    );
  }

  if (error || !matchData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>{error || 'Match data unavailable'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { backgroundColor: palette.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>{matchData.league}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.headerCardWrap}>
        <MatchResultHeaderCard
          homeName={matchData.home}
          awayName={matchData.away}
          homeAbbr={matchData.home.slice(0, 3).toUpperCase()}
          awayAbbr={matchData.away.slice(0, 3).toUpperCase()}
          homeLogo={matchData.homeLogo}
          awayLogo={matchData.awayLogo}
          homeScore={matchData.homeScore}
          awayScore={matchData.awayScore}
          statusLabel={matchData.status}
          aggregateLabel={takeFirstParam(params.aggregate as string | string[] | undefined) || undefined}
          competitionLabel={matchData.league}
          homeLines={scorerLines.homeLines}
          awayLines={scorerLines.awayLines}
          showRecords={false}
          lightMode={!isDark}
        />
      </View>

      <View style={[styles.tabsRow, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        {(['events', 'lineups'] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && [styles.tabActive, { borderBottomColor: palette.accent }]]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? palette.tabActive : palette.tabInactive },
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === 'events' ? 'Key Events' : 'Lineups'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {activeTab === 'events' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#F3F4F6' : '#111827' }]}>Match Facts</Text>
            {stats ? (
              <>
                {renderStat('Possession', stats.possession.home, stats.possession.away)}
                {renderStat('xG', stats.xG.home, stats.xG.away)}
                {renderStat('Shots', stats.shots.home, stats.shots.away)}
                {renderStat('Shots on Target', stats.shotsOnTarget.home, stats.shotsOnTarget.away)}
                {renderStat('Saves', stats.saves.home, stats.saves.away)}
                {renderStat('Corners', stats.corners.home, stats.corners.away)}
                {renderStat('Fouls', stats.fouls.home, stats.fouls.away)}
                {renderStat('Offsides', stats.offsides.home, stats.offsides.away)}
                {renderStat('Yellow Cards', stats.yellowCards.home, stats.yellowCards.away)}
                {renderStat('Red Cards', stats.redCards.home, stats.redCards.away)}
              </>
            ) : (
              <Text style={[styles.emptyText, { color: palette.subtext }]}>No statistics available</Text>
            )}

            <View style={[styles.sectionDivider, { backgroundColor: palette.border }]} />
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Key Events</Text>
            {uiEvents.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.subtext }]}>No events available</Text>
            ) : (
              uiEvents.map((event) => <PlayByPlayRow key={`play-${event.id}`} event={event} lightMode={!isDark} />)
            )}

            {popularMessages.length > 0 && (
              <>
                <View style={[styles.sectionDivider, { backgroundColor: palette.border }]} />
                <Text style={[styles.sectionTitle, { color: isDark ? '#F3F4F6' : '#111827' }]}>Top Reactions</Text>
                {popularMessages.map((msg) => (
                  <View key={`popular-${msg.id}`} style={[styles.popularCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                    <View style={styles.popularHeader}>
                      <Text style={[styles.popularUser, { color: palette.text }]}>@{msg.username}</Text>
                      <Text style={[styles.popularMeta, { color: palette.subtext }]}>
                        {typeof msg.matchMinute === 'number' ? `${msg.matchMinute}'` : 'FT'} - {msg.totalReactions} total
                      </Text>
                    </View>
                    <Text style={[styles.popularMeta, { color: palette.subtext, marginBottom: 6 }]}>
                      {summarizeReactions(msg) || 'No reactions'}
                    </Text>
                    <Text style={[styles.popularText, { color: isDark ? '#E5E7EB' : '#111827' }]} numberOfLines={4}>
                      {msg.text}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {activeTab === 'lineups' && (
          <View style={styles.section}>
            {tabLoading ? (
              <View style={styles.tabLoadingContainer}>
                <ActivityIndicator size="large" color={palette.accent} />
              </View>
            ) : (
              <>
                {(() => {
                  const homePitchXI = lineups.home ? buildPitchXI(lineups.home, decorMap) : [];
                  const awayPitchXI = lineups.away ? buildPitchXI(lineups.away, decorMap) : [];
                  const homeFormation = deriveFormation(homePitchXI) || lineups.home?.formation;
                  const awayFormation = deriveFormation(awayPitchXI) || lineups.away?.formation;
                  return (
                    <TeamToggle
                      selected={selectedTeam}
                      homeLogo={matchData.homeLogo}
                      awayLogo={matchData.awayLogo}
                      homeFormation={homeFormation}
                      awayFormation={awayFormation}
                      homeLabel={matchData.home}
                      awayLabel={matchData.away}
                      onSelect={setSelectedTeam}
                    />
                  );
                })()}
                {selectedTeam === 'home'
                  ? renderTeamLineupSection('home', lineups.home, matchData.home, matchData.homeLogo)
                  : renderTeamLineupSection('away', lineups.away, matchData.away, matchData.awayLogo)}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tabLoadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentContainer: {
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerCardWrap: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0066CC',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    fontWeight: '800',
  },
  section: {
    marginBottom: 12,
  },
  teamLineupBlock: {
    marginTop: 12,
    marginBottom: 18,
  },
  teamLineupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  teamLineupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamLineupName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  teamLineupFormation: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  teamTinyLogo: {
    width: 16,
    height: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
  },
  eventTime: {
    width: 56,
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  eventIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  eventIconText: {
    fontSize: 14,
  },
  eventText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
  },
  pitchWrap: {
    marginTop: 12,
    marginBottom: 16,
  },
  benchLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  lineupGroup: {
    marginBottom: 8,
  },
  lineupGroupLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A1A1A6',
    marginBottom: 4,
  },
  benchTitle: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: '800',
    color: '#A1A1A6',
  },
  resultHeader: {
    padding: 20,
    backgroundColor: '#2C2C2E',
    marginBottom: 12,
  },
  leagueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
  },
  scorelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLogo: {
    width: 60,
    height: 60,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E6E6E9',
    textAlign: 'center',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 80,
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E6E6E9',
  },
  scoreDash: {
    fontSize: 28,
    fontWeight: '900',
    color: '#777',
    marginHorizontal: 8,
  },
  statusBadge: {
    alignSelf: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  scorersSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3E',
  },
  scorersRow: {
    flexDirection: 'row',
    gap: 16,
  },
  scorersColumnLeft: {
  flex: 1,
  gap: 8,
  alignItems: 'flex-start',
},
scorersColumnRight: {
  flex: 1,
  gap: 8,
  alignItems: 'flex-end',
},
scorerText: {
  fontSize: 13,
  color: '#E6E6E9',
  lineHeight: 18,
},
scorerTextLeft: {
  textAlign: 'left',
},
scorerTextRight: {
  textAlign: 'right',
},
  statsContainer: {
    padding: 20,
    backgroundColor: '#1C1C1E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  statBlock: {
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    width: 44,
    textAlign: 'center',
  },
  statCenter: {
    flex: 1,
    marginHorizontal: 10,
  },
  statBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
    textAlign: 'center',
  },
  statBarHome: {
    backgroundColor: '#0066CC',
  },
  statBarAway: {
    backgroundColor: '#FF3B30',
  },
  popularCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  popularHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  popularUser: {
    fontSize: 13,
    fontWeight: '800',
  },
  popularMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  popularText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
});
