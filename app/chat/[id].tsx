// app/chat/[id].tsx
// ESPN-style Match Detail (Header + Key Events + Lineups)

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { footballAPI } from '../../services/footballApi';
import { buildDecorMap, buildDecorNameMap, findPlayerDecor, normalizeFixtureEvents, PlayerDecor, UiEvent } from '../../services/eventsDecor';
import { MatchResultHeaderCard } from '../../components/matchDetail/MatchResultHeaderCard';
import { PlayByPlayRow } from '../../components/matchDetail/PlayByPlayRow';
import { TeamToggle } from '../../components/matchDetail/TeamToggle';
import { PlayerRow } from '../../components/matchDetail/PlayerRow';
import { LineupPitch } from '../../components/matchDetail/LineupPitch';
import { MatchEntryLoading } from '../../components/MatchEntryLoading';
import { ChatMessage, chatService } from '../../services/chatService';
import { presenceService } from '../../services/presenceService';
import { getCachedValue } from '../../services/cacheService';

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'HT', 'LIVE']);
const END_STATUSES = new Set(['FT', 'AET', 'PEN']);
const MATCH_LOADING_TTL_MS = 20 * 60 * 1000;
const SYNTHETIC_EVENT_WINDOW_MINUTES = 4;

type TabKey = 'chat' | 'events' | 'lineups';

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

type ScorerLine = { icon: 'goal' | 'yellow' | 'red'; text: string };

type MatchInfo = {
  homeId?: number;
  awayId?: number;
  homeName: string;
  awayName: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number;
  awayScore: number;
  statusShort: string;
  statusLong: string;
  minute?: number;
  kickoffAt?: string;
  leagueName?: string;
  leagueId?: number;
  season?: number;
};

const getAbbr = (name?: string) => {
  if (!name) return 'TBD';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((p) => p[0]).join('').slice(0, 3).toUpperCase();
};

const takeFirstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const mapStats = (statsResponse: any[]) => {
  if (!statsResponse || statsResponse.length === 0) return null;
  const homeStats = statsResponse[0]?.statistics || [];
  const awayStats = statsResponse[1]?.statistics || [];

  const getStat = (stats: any[], type: string) => {
    const stat = stats.find((s: any) => s.type === type);
    const value = stat?.value;
    if (typeof value === 'string') {
      return parseInt(value.replace('%', '')) || 0;
    }
    return value || 0;
  };

  return {
    possession: { home: getStat(homeStats, 'Ball Possession'), away: getStat(awayStats, 'Ball Possession') },
    shots: { home: getStat(homeStats, 'Total Shots'), away: getStat(awayStats, 'Total Shots') },
    shotsOnTarget: { home: getStat(homeStats, 'Shots on Goal'), away: getStat(awayStats, 'Shots on Goal') },
    saves: { home: getStat(homeStats, 'Goalkeeper Saves'), away: getStat(awayStats, 'Goalkeeper Saves') },
    corners: { home: getStat(homeStats, 'Corner Kicks'), away: getStat(awayStats, 'Corner Kicks') },
    fouls: { home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls') },
    offsides: { home: getStat(homeStats, 'Offsides'), away: getStat(awayStats, 'Offsides') },
    yellowCards: { home: getStat(homeStats, 'Yellow Cards'), away: getStat(awayStats, 'Yellow Cards') },
    redCards: { home: getStat(homeStats, 'Red Cards'), away: getStat(awayStats, 'Red Cards') },
  };
};

type MatchStats = NonNullable<ReturnType<typeof mapStats>>;
type TeamSide = 'home' | 'away';

const buildScorerLines = (events: any[], homeId?: number, awayId?: number) => {
  const homeLines: ScorerLine[] = [];
  const awayLines: ScorerLine[] = [];

  events.forEach((event) => {
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

const getOpposingSide = (side: TeamSide): TeamSide => (side === 'home' ? 'away' : 'home');

const getMinuteNumber = (minuteLabel?: string, fallbackMinute?: number) => {
  const parsed = Number.parseInt((minuteLabel || '').replace(/[^0-9]/g, ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallbackMinute && Number.isFinite(fallbackMinute) ? fallbackMinute : 0;
};

const getGoalkeeperName = (lineup: TeamLineup | null) => {
  if (!lineup) return undefined;
  const byGrid = lineup.startXI.find((player) => typeof player.grid === 'string' && player.grid.startsWith('1:'));
  return byGrid?.name || lineup.startXI[0]?.name || lineup.substitutes[0]?.name;
};

const countNearbyEvents = (
  events: UiEvent[],
  teamId: number | undefined,
  minute: number,
  types: UiEvent['type'][]
) =>
  events.filter((event) => {
    if (!teamId || event.teamId !== teamId) return false;
    if (!types.includes(event.type)) return false;
    return Math.abs(Math.floor(event.sortKey / 100) - minute) <= SYNTHETIC_EVENT_WINDOW_MINUTES;
  }).length;

const countMatchingEvents = (
  events: UiEvent[],
  teamId: number | undefined,
  matcher: (event: UiEvent) => boolean
) =>
  events.filter((event) => {
    if (teamId && event.teamId && event.teamId !== teamId) return false;
    return matcher(event);
  }).length;

const findRecentRawEvent = (
  events: any[],
  teamId: number | undefined,
  minute: number,
  matcher: (type: string, detail: string, comments: string) => boolean
) => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventTeamId = event?.team?.id;
    if (teamId && eventTeamId && eventTeamId !== teamId) continue;
    const elapsed = Number(event?.time?.elapsed ?? 0);
    if (elapsed > 0 && Math.abs(elapsed - minute) > SYNTHETIC_EVENT_WINDOW_MINUTES) continue;
    const type = String(event?.type || '').toLowerCase();
    const detail = String(event?.detail || '').toLowerCase();
    const comments = String(event?.comments || '').toLowerCase();
    if (matcher(type, detail, comments)) {
      return event;
    }
  }
  return null;
};

const findMatchingRawEvents = (
  events: any[],
  teamId: number | undefined,
  minute: number,
  matcher: (type: string, detail: string, comments: string) => boolean,
  mode: 'window' | 'all' = 'window'
) => {
  const matched: any[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventTeamId = event?.team?.id;
    if (teamId && eventTeamId && eventTeamId !== teamId) continue;
    const elapsed = Number(event?.time?.elapsed ?? 0);
    if (
      mode === 'window' &&
      elapsed > 0 &&
      Math.abs(elapsed - minute) > SYNTHETIC_EVENT_WINDOW_MINUTES
    ) {
      continue;
    }
    const type = String(event?.type || '').toLowerCase();
    const detail = String(event?.detail || '').toLowerCase();
    const comments = String(event?.comments || '').toLowerCase();
    if (matcher(type, detail, comments)) {
      matched.push(event);
    }
  }
  return matched;
};

const getRawEventMinuteLabel = (event: any, fallbackMinuteText: string) => {
  const elapsed = Number(event?.time?.elapsed ?? 0);
  const extra = Number(event?.time?.extra ?? 0);
  if (elapsed > 0) {
    return extra > 0 ? `${elapsed}'+${extra}` : `${elapsed}'`;
  }
  return fallbackMinuteText;
};

const getRawEventSortKey = (event: any, fallbackSortKey: number, sequence: number) => {
  const elapsed = Number(event?.time?.elapsed ?? 0);
  const extra = Number(event?.time?.extra ?? 0);
  if (elapsed > 0) {
    return elapsed * 100 + extra + sequence;
  }
  return fallbackSortKey + sequence;
};

const buildSyntheticStatDeltaEvents = ({
  previousStats,
  nextStats,
  rawEvents,
  matchInfo,
  minuteLabel,
  lineups,
  sequenceSeed,
}: {
  previousStats: MatchStats | null;
  nextStats: MatchStats | null;
  rawEvents: any[];
  matchInfo: MatchInfo;
  minuteLabel?: string;
  lineups: { home: TeamLineup | null; away: TeamLineup | null };
  sequenceSeed: number;
}) => {
  if (!nextStats) return [] as UiEvent[];

  const minuteNumber = getMinuteNumber(minuteLabel, matchInfo.minute);
  if (!minuteNumber) return [] as UiEvent[];

  const minuteText = minuteLabel && minuteLabel.trim().length > 0 ? minuteLabel : `${minuteNumber}'`;
  const normalizedRawEvents = normalizeFixtureEvents(rawEvents);
  const isInitialSnapshot = !previousStats;
  const effectivePreviousStats = previousStats ?? {
    possession: { home: 0, away: 0 },
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    saves: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 },
    yellowCards: { home: 0, away: 0 },
    redCards: { home: 0, away: 0 },
  };
  const events: UiEvent[] = [];
  let sequence = sequenceSeed;

  const pushEvent = (payload: {
    type: UiEvent['type'];
    text: string;
    subText?: string;
    teamId?: number;
    teamName?: string;
    playerName?: string;
    contextEvent?: any;
  }) => {
    sequence += 1;
    const eventMinuteText = payload.contextEvent ? getRawEventMinuteLabel(payload.contextEvent, minuteText) : minuteText;
    const eventSortKey = payload.contextEvent
      ? getRawEventSortKey(payload.contextEvent, minuteNumber * 100, sequence)
      : minuteNumber * 100 + sequence;
    events.push({
      id: `synthetic-${payload.type}-${payload.teamId || 'na'}-${eventSortKey}-${sequence}`,
      time: eventMinuteText,
      type: payload.type,
      icon: payload.type,
      text: payload.text,
      subText: payload.subText,
      sortKey: eventSortKey,
      teamId: payload.teamId,
      teamName: payload.teamName,
      playerName: payload.playerName,
      synthetic: true,
    });
  };

  (['home', 'away'] as TeamSide[]).forEach((side) => {
    const opponentSide = getOpposingSide(side);
    const teamId = side === 'home' ? matchInfo.homeId : matchInfo.awayId;
    const opponentTeamId = opponentSide === 'home' ? matchInfo.homeId : matchInfo.awayId;
    const teamName = side === 'home' ? matchInfo.homeName : matchInfo.awayName;
    const opponentTeamName = opponentSide === 'home' ? matchInfo.homeName : matchInfo.awayName;
    const keeperName = getGoalkeeperName(opponentSide === 'home' ? lineups.home : lineups.away);

    if (isInitialSnapshot) {
      const rawCornerHistoryCount = countMatchingEvents(
        normalizedRawEvents,
        teamId,
        (event) => event.type === 'corner'
      );
      const rawFoulHistoryCount = countMatchingEvents(
        normalizedRawEvents,
        teamId,
        (event) => event.type === 'foul'
      );
      const rawShotOnGoalHistoryCount = countMatchingEvents(
        normalizedRawEvents,
        teamId,
        (event) => event.type === 'shot' && /shot on goal|shot on target|saved/i.test(event.text)
      );
      const rawShotHistoryCount = countMatchingEvents(
        normalizedRawEvents,
        teamId,
        (event) => event.type === 'shot'
      );
      const rawSaveHistoryCount = countMatchingEvents(
        normalizedRawEvents,
        opponentTeamId,
        (event) => event.type === 'save'
      );
      const openShotTotal = Math.max(0, nextStats.shots[side] - nextStats.shotsOnTarget[side]);

      if (nextStats.corners[side] > 0 && rawCornerHistoryCount === 0) {
        pushEvent({
          type: 'corner',
          teamId,
          teamName,
          text: `Corner kick — ${teamName}`,
        });
      }

      if (nextStats.fouls[side] > 0 && rawFoulHistoryCount === 0) {
        pushEvent({
          type: 'foul',
          teamId,
          teamName,
          text: `Foul — ${teamName}`,
        });
      }

      if (nextStats.saves[opponentSide] > 0 && rawSaveHistoryCount === 0) {
        pushEvent({
          type: 'save',
          teamId: opponentTeamId,
          teamName: opponentTeamName,
          playerName: keeperName,
          text: keeperName
            ? `SAVE by ${keeperName} (${opponentTeamName})`
            : `Save — ${opponentTeamName}`,
        });
      }

      if (nextStats.shotsOnTarget[side] > rawShotOnGoalHistoryCount && nextStats.saves[opponentSide] === 0 && rawShotOnGoalHistoryCount === 0) {
        pushEvent({
          type: 'shot',
          teamId,
          teamName,
          text: `Shot on goal — ${teamName}`,
        });
      }

      return;
    }

    const cornerDelta = Math.max(0, nextStats.corners[side] - effectivePreviousStats.corners[side]);
    const foulDelta = Math.max(0, nextStats.fouls[side] - effectivePreviousStats.fouls[side]);
    const shotDelta = Math.max(0, nextStats.shots[side] - effectivePreviousStats.shots[side]);
    const shotOnTargetDelta = Math.max(0, nextStats.shotsOnTarget[side] - effectivePreviousStats.shotsOnTarget[side]);
    const savedAgainstDelta = Math.max(0, nextStats.saves[opponentSide] - effectivePreviousStats.saves[opponentSide]);

    const rawCornerCount = countNearbyEvents(normalizedRawEvents, teamId, minuteNumber, ['corner']);
    const rawFoulCount = countNearbyEvents(normalizedRawEvents, teamId, minuteNumber, ['foul']);
    const rawShotOnGoalCount = countNearbyEvents(
      normalizedRawEvents.filter((event) => /shot on goal|shot on target/i.test(event.text)),
      teamId,
      minuteNumber,
      ['shot']
    );
    const rawShotCount = countNearbyEvents(normalizedRawEvents, teamId, minuteNumber, ['shot']);
    const rawSaveCount = countNearbyEvents(normalizedRawEvents, opponentTeamId, minuteNumber, ['save']);
    const rawContextMode = 'window';
    const cornerContexts = findMatchingRawEvents(
      rawEvents,
      teamId,
      minuteNumber,
      (type, detail, comments) => type === 'corner' || detail.includes('corner') || comments.includes('corner'),
      rawContextMode
    );
    const foulContexts = findMatchingRawEvents(
      rawEvents,
      teamId,
      minuteNumber,
      (type, detail, comments) =>
        type === 'foul' || detail.includes('foul') || comments.includes('foul') || (type === 'card' && detail.includes('foul')),
      rawContextMode
    );
    const shotContexts = findMatchingRawEvents(
      rawEvents,
      teamId,
      minuteNumber,
      (type, detail, comments) => type === 'shot' || detail.includes('shot') || comments.includes('shot'),
      rawContextMode
    );
    const shotOnGoalContexts = findMatchingRawEvents(
      rawEvents,
      teamId,
      minuteNumber,
      (type, detail, comments) =>
        (type === 'shot' || detail.includes('shot') || comments.includes('shot')) &&
        (detail.includes('on target') || detail.includes('on goal') || detail.includes('target')),
      rawContextMode
    );
    const saveContexts = findMatchingRawEvents(
      rawEvents,
      opponentTeamId,
      minuteNumber,
      (type, detail, comments) => type === 'save' || detail.includes('save') || comments.includes('save'),
      rawContextMode
    );

    for (let index = rawCornerCount; index < cornerDelta; index += 1) {
      const cornerContext = cornerContexts[index - rawCornerCount] || cornerContexts[0] || findRecentRawEvent(
        rawEvents,
        teamId,
        minuteNumber,
        (type, detail, comments) => type === 'corner' || detail.includes('corner') || comments.includes('corner')
      );
      const taker = cornerContext?.player?.name;
      pushEvent({
        type: 'corner',
        teamId,
        teamName,
        playerName: taker,
        text: taker && taker !== 'Unknown'
          ? `Corner kick — ${teamName} (${taker})`
          : `Corner kick — ${teamName}`,
        contextEvent: cornerContext,
      });
    }

    for (let index = rawFoulCount; index < foulDelta; index += 1) {
      const foulContext = foulContexts[index - rawFoulCount] || foulContexts[0] || findRecentRawEvent(
        rawEvents,
        teamId,
        minuteNumber,
        (type, detail, comments) =>
          type === 'foul' || detail.includes('foul') || comments.includes('foul') || (type === 'card' && detail.includes('foul'))
      );
      const fouler = foulContext?.player?.name;
      pushEvent({
        type: 'foul',
        teamId,
        teamName,
        playerName: fouler,
        text: fouler && fouler !== 'Unknown'
          ? `Foul by ${fouler} (${teamName})`
          : `Foul — ${teamName}`,
        contextEvent: foulContext,
      });
    }

    const savedShotsToEmit = Math.max(0, Math.min(shotOnTargetDelta, savedAgainstDelta) - rawSaveCount);
    const shotsOnTargetToEmit = Math.max(0, shotOnTargetDelta - savedShotsToEmit - rawShotOnGoalCount);
    const rawOpenShotCount = Math.max(0, rawShotCount - rawShotOnGoalCount);
    const openPlayShotsToEmit = Math.max(0, shotDelta - shotOnTargetDelta - rawOpenShotCount);

    for (let index = 0; index < savedShotsToEmit; index += 1) {
      const shotContext = shotOnGoalContexts[index] || shotContexts[index] || shotContexts[0] || findRecentRawEvent(
        rawEvents,
        teamId,
        minuteNumber,
        (type, detail, comments) =>
          type === 'shot' ||
          detail.includes('shot') ||
          detail.includes('on target') ||
          detail.includes('on goal') ||
          comments.includes('shot')
      );
      const saveContext = saveContexts[index] || saveContexts[0] || findRecentRawEvent(
        rawEvents,
        opponentTeamId,
        minuteNumber,
        (type, detail, comments) => type === 'save' || detail.includes('save') || comments.includes('save')
      );
      const shooter = shotContext?.player?.name;
      const saver = saveContext?.player?.name || keeperName;
      const savedByText = saver ? `SAVE by ${saver} (${opponentTeamName})` : `Save — ${opponentTeamName}`;
      const shotByLine = shooter && shooter !== 'Unknown' ? `${shooter} (${teamName}) — shot on goal` : undefined;
      pushEvent({
        type: 'save',
        teamId: opponentTeamId,
        teamName: opponentTeamName,
        playerName: saver,
        text: savedByText,
        subText: shotByLine,
        contextEvent: saveContext || shotContext,
      });
    }

    for (let index = 0; index < shotsOnTargetToEmit; index += 1) {
      const shotContext = shotOnGoalContexts[index] || shotOnGoalContexts[0] || findRecentRawEvent(
        rawEvents,
        teamId,
        minuteNumber,
        (type, detail, comments) =>
          (type === 'shot' || detail.includes('shot') || comments.includes('shot')) &&
          (detail.includes('on target') || detail.includes('on goal') || detail.includes('target'))
      );
      const shooter = shotContext?.player?.name;
      pushEvent({
        type: 'shot',
        teamId,
        teamName,
        playerName: shooter,
        text: shooter && shooter !== 'Unknown'
          ? `${shooter} (${teamName}) — shot on goal`
          : `Shot on goal — ${teamName}`,
        contextEvent: shotContext,
      });
    }

    for (let index = 0; index < openPlayShotsToEmit; index += 1) {
      const shotContext = shotContexts[index] || shotContexts[0] || findRecentRawEvent(
        rawEvents,
        teamId,
        minuteNumber,
        (type, detail, comments) => type === 'shot' || detail.includes('shot') || comments.includes('shot')
      );
      const shooter = shotContext?.player?.name;
      const detail = String(shotContext?.detail || '').toLowerCase();
      let text = shooter && shooter !== 'Unknown'
        ? `${shooter} (${teamName}) — shot`
        : `Shot — ${teamName}`;
      if (detail.includes('blocked')) {
        text = shooter && shooter !== 'Unknown'
          ? `${shooter} (${teamName}) — shot blocked`
          : `Shot blocked — ${teamName}`;
      } else if (detail.includes('off target') || detail.includes('wide')) {
        text = shooter && shooter !== 'Unknown'
          ? `${shooter} (${teamName}) — shot off target`
          : `Shot off target — ${teamName}`;
      }
      pushEvent({
        type: 'shot',
        teamId,
        teamName,
        playerName: shooter,
        text,
        contextEvent: shotContext,
      });
    }
  });

  return events;
};

export default function MatchDetailScreen() {
  const params = useLocalSearchParams();
  const id = takeFirstParam(params.id as string | string[] | undefined);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userProfile } = useAuth();
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const messageBubbleRefs = useRef<Record<string, any>>({});
  const messageBubbleSizeRefs = useRef<Record<string, { width: number; height: number }>>({});
  const lastTapRef = useRef<{ id: string; ts: number }>({ id: '', ts: 0 });
  const pressStartXRef = useRef(0);
  const pressStartYRef = useRef(0);
  const suppressSwipeReplyRef = useRef(false);
  const suppressTapRef = useRef(false);
  const lastScrollOffsetRef = useRef(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fixtureId = useMemo(() => {
    return id ? Number(id) : NaN;
  }, [id]);
  const matchId = useMemo(() => {
    return id ? String(id) : '';
  }, [id]);
  const currentUserId = userProfile?.uid || user?.uid || '';
  const currentUsername =
    userProfile?.username ||
    (typeof userProfile?.email === 'string' ? userProfile.email.split('@')[0] : '') ||
    (typeof user?.email === 'string' ? user.email.split('@')[0] : '') ||
    'Fan';
  const loadingSeed = useMemo(() => {
    const cachedFixture = Number.isFinite(fixtureId)
      ? getCachedValue<any>(`fixture:base:${fixtureId}`, MATCH_LOADING_TTL_MS)
      : null;
    const routeKickoff = takeFirstParam(params.kickoff as string | string[] | undefined);
    const routeStatus = takeFirstParam(params.status as string | string[] | undefined);
    const routeMinute = takeFirstParam(params.minute as string | string[] | undefined);
    const parsedMinute = routeMinute ? Number(String(routeMinute).replace(/[^0-9]/g, '')) : undefined;
    return {
      homeName: takeFirstParam(params.home as string | string[] | undefined) || cachedFixture?.teams?.home?.name || 'Home',
      awayName: takeFirstParam(params.away as string | string[] | undefined) || cachedFixture?.teams?.away?.name || 'Away',
      homeLogo: takeFirstParam(params.homeLogo as string | string[] | undefined) || cachedFixture?.teams?.home?.logo || undefined,
      awayLogo: takeFirstParam(params.awayLogo as string | string[] | undefined) || cachedFixture?.teams?.away?.logo || undefined,
      league: takeFirstParam(params.league as string | string[] | undefined) || cachedFixture?.league?.name || 'Live Match',
      kickoffAt: routeKickoff || cachedFixture?.fixture?.date,
      statusShort: routeStatus || cachedFixture?.fixture?.status?.short || 'LIVE',
      statusLong: cachedFixture?.fixture?.status?.long || 'Live Match',
      minute: Number.isFinite(parsedMinute) ? parsedMinute : cachedFixture?.fixture?.status?.elapsed,
    };
  }, [fixtureId, params.away, params.awayLogo, params.home, params.homeLogo, params.kickoff, params.league, params.minute, params.status]);
  const cachedFixtureSeed = useMemo(
    () => (Number.isFinite(fixtureId) ? getCachedValue<any>(`fixture:base:${fixtureId}`, MATCH_LOADING_TTL_MS) : null),
    [fixtureId]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof mapStats> | null>(null);
  const [syntheticEvents, setSyntheticEvents] = useState<UiEvent[]>([]);
  const [lineups, setLineups] = useState<{ home: TeamLineup | null; away: TeamLineup | null }>({
    home: null,
    away: null,
  });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [records, setRecords] = useState<{ home?: string; away?: string }>({});
  const [minuteTickNow, setMinuteTickNow] = useState(Date.now());
  const matchInfoRef = useRef<MatchInfo | null>(null);
  const detailsFetchedRef = useRef(false);
  const detailsFetchInFlightRef = useRef(false);
  const minuteSyncRef = useRef<{ minute?: number; syncedAt: number }>({ minute: undefined, syncedAt: Date.now() });
  const liveMinuteTextRef = useRef<{ raw?: string; syncedAt: number }>({ raw: undefined, syncedAt: Date.now() });
  const liveScoreBaselineRef = useRef<{ home: number; away: number } | null>(null);
  const previousStatsRef = useRef<MatchStats | null>(null);
  const syntheticSequenceRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const sendingRef = useRef(false);
  const [debugGoalPreview, setDebugGoalPreview] = useState<{ nonce: number; side: 'home' | 'away' } | null>(null);
  const seenGoalNoncesRef = useRef<Set<number>>(new Set());
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const newMessageAnim = useRef(new Animated.Value(1)).current;
  const keyboardPadAnim = useRef(new Animated.Value(0)).current;
  const liveDotAnim = useRef(new Animated.Value(1)).current;
  const isNearBottomRef = useRef(true);
  const insetsRef = useRef({ bottom: 0 });
  const latestMessageIdRef = useRef<string | null>(null);
  const presenceSessionIdRef = useRef<string | null>(null);
  const guestPresenceIdRef = useRef(
    `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<{
    message: ChatMessage;
    centerX: number;
    bubbleTop: number;
    bubbleHeight: number;
  } | null>(null);
  const messageMenuAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    matchInfoRef.current = matchInfo;
  }, [matchInfo]);

  useEffect(() => {
    previousStatsRef.current = null;
    syntheticSequenceRef.current = 0;
    liveScoreBaselineRef.current = null;
    detailsFetchedRef.current = false;
    detailsFetchInFlightRef.current = false;
    setSyntheticEvents([]);
  }, [fixtureId]);

  const loadMatch = useCallback(async (options?: { silent?: boolean; includeDetails?: boolean }) => {
    if (!fixtureId || Number.isNaN(fixtureId)) return;
    const silent = options?.silent === true;
    const includeDetails = options?.includeDetails === true;
    const hasSeed = Boolean(loadingSeed.homeName || loadingSeed.awayName);
    // Pre-populate from route-param seed so the screen renders immediately
    // without blocking on the API call. API response will update it silently.
    if (!matchInfoRef.current && hasSeed) {
      const seedInfo: MatchInfo = {
        homeName: loadingSeed.homeName,
        awayName: loadingSeed.awayName,
        homeLogo: loadingSeed.homeLogo,
        awayLogo: loadingSeed.awayLogo,
        homeScore: 0,
        awayScore: 0,
        statusShort: String(loadingSeed.statusShort || 'NS').toUpperCase(),
        statusLong: loadingSeed.statusLong || 'Not Started',
        minute: loadingSeed.minute,
        kickoffAt: loadingSeed.kickoffAt,
        leagueName: loadingSeed.league,
      };
      setMatchInfo((prev) => prev ?? seedInfo);
      matchInfoRef.current = matchInfoRef.current ?? seedInfo;
    }
    const showFullScreenLoader = !silent && !matchInfoRef.current;
    if (showFullScreenLoader) {
      setLoading(true);
      setError(null);
    }
    if (includeDetails) {
      if (detailsFetchInFlightRef.current) return;
      detailsFetchInFlightRef.current = true;
      // Only show the loading spinner on the first fetch — subsequent live
      // refreshes update silently so content doesn't flash/twitch.
      if (!detailsFetchedRef.current) {
        setDetailsLoading(true);
      }
    }
    try {
      const liveBundle = includeDetails ? await footballAPI.getFixtureLive(fixtureId) : null;
      const baseFixture = await footballAPI.getFixtureById(fixtureId);
      const fixture = liveBundle?.fixture ?? baseFixture ?? cachedFixtureSeed;

      if (!fixture) {
        if (loadingSeed.homeName || loadingSeed.awayName) {
          setMatchInfo((prev) => prev ?? {
            homeName: loadingSeed.homeName,
            awayName: loadingSeed.awayName,
            homeLogo: loadingSeed.homeLogo,
            awayLogo: loadingSeed.awayLogo,
            homeScore: 0,
            awayScore: 0,
            statusShort: String(loadingSeed.statusShort || 'LIVE').toUpperCase(),
            statusLong: loadingSeed.statusLong,
            minute: loadingSeed.minute,
            kickoffAt: loadingSeed.kickoffAt,
            leagueName: loadingSeed.league,
          });
          if (showFullScreenLoader) setLoading(false);
          return;
        }
        setError('Match not found');
        if (showFullScreenLoader) setLoading(false);
        return;
      }

      const statusShort = fixture.fixture?.status?.short || '';
      const statusLong = fixture.fixture?.status?.long || '';
      const minute = fixture.fixture?.status?.elapsed ?? undefined;

      const info: MatchInfo = {
        homeId: fixture.teams?.home?.id,
        awayId: fixture.teams?.away?.id,
        homeName: fixture.teams?.home?.name || 'Home',
        awayName: fixture.teams?.away?.name || 'Away',
        homeLogo: fixture.teams?.home?.logo,
        awayLogo: fixture.teams?.away?.logo,
        homeScore: fixture.goals?.home ?? 0,
        awayScore: fixture.goals?.away ?? 0,
        statusShort,
        statusLong,
        minute,
        kickoffAt: fixture.fixture?.date,
        leagueName: fixture.league?.name,
        leagueId: fixture.league?.id,
        season: fixture.league?.season,
      };

      setMatchInfo(info);
      minuteSyncRef.current = { minute: info.minute, syncedAt: Date.now() };

      if (includeDetails) {
        const statsPromise =
          liveBundle?.statistics && liveBundle.statistics.length > 0
            ? Promise.resolve(liveBundle.statistics)
            : footballAPI.getFixtureStatistics(fixtureId);
        const eventsPromise =
          liveBundle?.events && liveBundle.events.length > 0
            ? Promise.resolve(liveBundle.events)
            : footballAPI.getFixtureEvents(fixtureId);
        const lineupsPromise =
          liveBundle?.lineups && liveBundle.lineups.length >= 2
            ? Promise.resolve(liveBundle.lineups)
            : footballAPI.getFixtureLineups(fixtureId);

        const [statsSettled, eventsSettled, lineupsSettled] = await Promise.allSettled([
          statsPromise,
          eventsPromise,
          lineupsPromise,
        ]);
        const statsRaw = statsSettled.status === 'fulfilled' ? (statsSettled.value || []) : [];
        const nextStats = mapStats(statsRaw || []);
        if (nextStats) {
          setStats(nextStats);
        }

        const eventsRaw = eventsSettled.status === 'fulfilled' ? (eventsSettled.value || []) : [];
        const lineupsRaw = lineupsSettled.status === 'fulfilled' ? (lineupsSettled.value || []) : [];

        const lineupMapped = (lineupsRaw || []).map(normalizeLineup);
        const homeLineup = lineupMapped.find((l) => l.teamId === info.homeId) || lineupMapped[0] || null;
        const awayLineup = lineupMapped.find((l) => l.teamId === info.awayId) || lineupMapped[1] || null;
        const nextSyntheticEvents = buildSyntheticStatDeltaEvents({
          previousStats: previousStatsRef.current,
          nextStats,
          rawEvents: eventsRaw || [],
          matchInfo: info,
          minuteLabel: liveMinuteTextRef.current.raw || (typeof info.minute === 'number' ? `${info.minute}'` : undefined),
          lineups: { home: homeLineup, away: awayLineup },
          sequenceSeed: syntheticSequenceRef.current,
        });

        previousStatsRef.current = nextStats;
        syntheticSequenceRef.current += nextSyntheticEvents.length;

        setEvents(eventsRaw || []);
        if (nextSyntheticEvents.length > 0) {
          setSyntheticEvents((prev) => [...nextSyntheticEvents, ...prev].slice(0, 40));
        }
        setLineups({ home: homeLineup, away: awayLineup });
        detailsFetchedRef.current = true;
      }

      if (info.homeId && info.awayId && info.leagueId && info.season) {
        const [homeRecord, awayRecord] = await Promise.all([
          footballAPI.getTeamRecord(info.homeId, info.leagueId, info.season),
          footballAPI.getTeamRecord(info.awayId, info.leagueId, info.season),
        ]);
        setRecords({ home: homeRecord?.record, away: awayRecord?.record });
      }
    } catch {
      if (loadingSeed.homeName || loadingSeed.awayName) {
        setMatchInfo((prev) => prev ?? {
          homeName: loadingSeed.homeName,
          awayName: loadingSeed.awayName,
          homeLogo: loadingSeed.homeLogo,
          awayLogo: loadingSeed.awayLogo,
          homeScore: 0,
          awayScore: 0,
          statusShort: String(loadingSeed.statusShort || 'LIVE').toUpperCase(),
          statusLong: loadingSeed.statusLong,
          minute: loadingSeed.minute,
          kickoffAt: loadingSeed.kickoffAt,
          leagueName: loadingSeed.league,
        });
      } else if (!silent) {
        setError('Unable to load match details');
      }
    } finally {
      if (showFullScreenLoader) setLoading(false);
      if (includeDetails) {
        detailsFetchInFlightRef.current = false;
        setDetailsLoading(false);
      }
    }
  }, [cachedFixtureSeed, fixtureId, loadingSeed.awayLogo, loadingSeed.awayName, loadingSeed.homeLogo, loadingSeed.homeName, loadingSeed.kickoffAt, loadingSeed.league, loadingSeed.minute, loadingSeed.statusLong, loadingSeed.statusShort]);

  useEffect(() => {
    void loadMatch({ includeDetails: false });
  }, [loadMatch]);

  useEffect(() => {
    if (!matchInfo || detailsFetchedRef.current || detailsFetchInFlightRef.current) return;
    const timeout = setTimeout(() => {
      void loadMatch({ silent: true, includeDetails: true });
    }, 250);
    return () => clearTimeout(timeout);
  }, [loadMatch, matchInfo]);

  useEffect(() => {
    if (activeTab === 'chat') return;
    // Use ref so matchInfo updates during a live game don't re-trigger this
    // effect — the 60-second interval below handles periodic live refreshes.
    const currentInfo = matchInfoRef.current;
    const isLive = currentInfo ? LIVE_STATUSES.has((currentInfo.statusShort || '').toUpperCase()) : false;
    // Always refresh when switching to lineups tab (lineup data may not have been available on first fetch)
    if (detailsFetchedRef.current && !isLive && activeTab !== 'lineups') return;
    void loadMatch({ silent: true, includeDetails: true });
  }, [activeTab, loadMatch]);

  useEffect(() => {
    if (!matchInfo) return;
    if (!LIVE_STATUSES.has(matchInfo.statusShort)) return;
    if (activeTab === 'chat') return;
    const interval = setInterval(() => {
      void loadMatch({ silent: true, includeDetails: true });
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab, matchInfo?.statusShort, matchInfo, loadMatch]);

  useEffect(() => {
    if (!fixtureId || Number.isNaN(fixtureId)) return;
    if (!matchInfo || !LIVE_STATUSES.has(matchInfo.statusShort)) return;
    let active = true;
    const syncMinuteFromLiveList = async () => {
      try {
        const liveMatches = await footballAPI.getLiveMatches({ preferCache: false });
        if (!active) return;
        const current = liveMatches.find((m) => m.id === fixtureId);
        if (current) {
          if (current.minute) {
            liveMinuteTextRef.current = { raw: current.minute, syncedAt: Date.now() };
          }
          const [homeScore, awayScore] = String(current.score || '')
            .split('-')
            .map((part) => Number.parseInt(part.trim(), 10));
          const hasValidScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
          if (hasValidScore) {
            const previous = liveScoreBaselineRef.current;
            if (!previous) {
              liveScoreBaselineRef.current = { home: homeScore, away: awayScore };
            } else {
              const homeScored = homeScore > previous.home;
              const awayScored = awayScore > previous.away;
              liveScoreBaselineRef.current = { home: homeScore, away: awayScore };
              if (homeScored || awayScored) {
                const scoringSide = homeScored ? 'home' : 'away';
                const nonce = Date.now();
                if (!seenGoalNoncesRef.current.has(nonce)) {
                  seenGoalNoncesRef.current.add(nonce);
                  setDebugGoalPreview({ nonce, side: scoringSide });
                  // Clear after animation (~3s) so re-entry does not replay
                  setTimeout(() => setDebugGoalPreview(null), 3200);
                }
              }
            }
          }
          setMatchInfo((prev) =>
            prev
              ? {
                  ...prev,
                  homeScore: Number.isFinite(homeScore) ? homeScore : prev.homeScore,
                  awayScore: Number.isFinite(awayScore) ? awayScore : prev.awayScore,
                }
              : prev
          );
        }
      } catch {
        // ignore minute sync failures
      }
    };
    void syncMinuteFromLiveList();
    const interval = setInterval(() => {
      void syncMinuteFromLiveList();
    }, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fixtureId, matchInfo?.statusShort, matchInfo]);

  useEffect(() => {
    if (!matchInfo || !LIVE_STATUSES.has(matchInfo.statusShort)) return;
    const timer = setInterval(() => setMinuteTickNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [matchInfo?.statusShort, matchInfo]);

  // Poll for kickoff while the match is still pregame but kickoff time has passed.
  // This ensures a user who opens the chat before the game goes live will see the
  // live status flip without needing a manual refresh.
  useEffect(() => {
    if (!matchInfo) return;
    if (LIVE_STATUSES.has(matchInfo.statusShort) || END_STATUSES.has(matchInfo.statusShort)) return;
    const kickoff = matchInfo.kickoffAt ? new Date(matchInfo.kickoffAt) : null;
    if (!kickoff || Number.isNaN(kickoff.getTime())) return;
    const msUntilKickoff = kickoff.getTime() - Date.now();
    // Only run this poll within 5 min before kickoff or after kickoff
    if (msUntilKickoff > 5 * 60 * 1000) return;
    const interval = setInterval(() => {
      void loadMatch({ silent: true, includeDetails: false });
    }, 30000);
    return () => clearInterval(interval);
  }, [matchInfo?.statusShort, matchInfo?.kickoffAt, loadMatch]);

  const statusLabel = useMemo(() => {
    if (!matchInfo) return '';
    if ((matchInfo.statusShort || '').toUpperCase() === 'HT') return 'HT';
    if (LIVE_STATUSES.has(matchInfo.statusShort)) return 'LIVE';
    if (END_STATUSES.has(matchInfo.statusShort)) return 'FT';
    if (matchInfo.statusShort === 'NS') return 'Pregame';
    return matchInfo.statusShort || 'Pregame';
  }, [matchInfo]);
  const isPregameChat = useMemo(() => {
    if (!matchInfo) return false;
    const short = (matchInfo.statusShort || '').toUpperCase();
    const isLive = LIVE_STATUSES.has(short);
    const isEnded = END_STATUSES.has(short);
    if (short === 'NS' || short === 'PST' || short === 'TBD') return true;
    const kickoff = matchInfo.kickoffAt ? new Date(matchInfo.kickoffAt) : null;
    if (kickoff && !Number.isNaN(kickoff.getTime()) && Date.now() < kickoff.getTime()) return true;
    if (!isLive && !isEnded && !matchInfo.minute) return true;
    if (!isLive && !isEnded && matchInfo.homeScore === 0 && matchInfo.awayScore === 0) return true;
    return false;
  }, [matchInfo]);

  useEffect(() => {
    if (!matchInfo || !fixtureId || Number.isNaN(fixtureId)) return;
    if (!END_STATUSES.has((matchInfo.statusShort || '').toUpperCase())) return;
    void footballAPI.rememberFinishedMatch({
      id: fixtureId,
      home: matchInfo.homeName,
      away: matchInfo.awayName,
      score: `${matchInfo.homeScore ?? 0}-${matchInfo.awayScore ?? 0}`,
      league: matchInfo.leagueName || 'Match',
      status: 'finished',
      date: matchInfo.kickoffAt || new Date().toISOString(),
      homeLogo: matchInfo.homeLogo,
      awayLogo: matchInfo.awayLogo,
      homeId: matchInfo.homeId,
      awayId: matchInfo.awayId,
      leagueId: matchInfo.leagueId,
    });
  }, [
    fixtureId,
    matchInfo?.awayId,
    matchInfo?.awayLogo,
    matchInfo?.awayName,
    matchInfo?.awayScore,
    matchInfo?.homeId,
    matchInfo?.homeLogo,
    matchInfo?.homeName,
    matchInfo?.homeScore,
    matchInfo?.kickoffAt,
    matchInfo?.leagueId,
    matchInfo?.leagueName,
    matchInfo?.statusShort,
    matchInfo,
  ]);

  const minuteLabel = useMemo(() => {
    if (!matchInfo) return undefined;
    const liveRaw = (liveMinuteTextRef.current.raw || '').trim();
    if (liveRaw) {
      const loweredLive = liveRaw.toLowerCase();
      if (
        loweredLive === 'ht' ||
        loweredLive === 'half-time' ||
        loweredLive === 'halftime' ||
        loweredLive.includes('half time')
      ) {
        return 'Half Time';
      }
      const baseMinuteLive = Number.parseInt(liveRaw, 10);
      if (Number.isFinite(baseMinuteLive) && LIVE_STATUSES.has(matchInfo.statusShort)) {
        const extraMinutes = Math.floor(Math.max(0, minuteTickNow - liveMinuteTextRef.current.syncedAt) / 60000);
        return `${baseMinuteLive + extraMinutes}'`;
      }
      if (!Number.isNaN(Number.parseInt(liveRaw, 10))) return liveRaw;
    }
    const short = (matchInfo.statusShort || '').toUpperCase();
    const long = (matchInfo.statusLong || '').toLowerCase();
    if (short === 'HT' || long.includes('half time') || long.includes('halftime')) {
      return 'Half Time';
    }
    if (!matchInfo.minute) return undefined;
    if (LIVE_STATUSES.has(matchInfo.statusShort)) {
      const syncedMinute = minuteSyncRef.current.minute ?? matchInfo.minute;
      const elapsedSinceSync = Math.max(0, minuteTickNow - minuteSyncRef.current.syncedAt);
      const extraMinutes = Math.floor(elapsedSinceSync / 60000);
      return `${syncedMinute + extraMinutes}'`;
    }
    return `${matchInfo.minute}'`;
  }, [matchInfo, minuteTickNow]);

  const decorMap = useMemo(() => buildDecorMap(events || []), [events]);
  const decorNameMap = useMemo(() => buildDecorNameMap(events || []), [events]);
  const uiEvents = useMemo(() => {
    const normalized = normalizeFixtureEvents(events || []);
    const dedupedSynthetic = syntheticEvents.filter((event) => {
      if (!event.synthetic) return true;
      return !normalized.some((rawEvent) => {
        if (rawEvent.teamId !== event.teamId) return false;
        if (rawEvent.type !== event.type) return false;
        return Math.abs(Math.floor(rawEvent.sortKey / 100) - Math.floor(event.sortKey / 100)) <= SYNTHETIC_EVENT_WINDOW_MINUTES;
      });
    });
    const sorted = [...normalized, ...dedupedSynthetic].sort((a, b) => b.sortKey - a.sortKey);
    return sorted;
  }, [events, syntheticEvents]);

  const scorerLines = useMemo(() => {
    if (!matchInfo) return { homeLines: [], awayLines: [] };
    return buildScorerLines(events, matchInfo.homeId, matchInfo.awayId);
  }, [events, matchInfo]);

  useEffect(() => {
    if (!matchId) return;
    const unsubscribe = chatService.subscribeToChat(matchId, setMessages);
    return unsubscribe;
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const presenceUserId = currentUserId || guestPresenceIdRef.current;
    const displayName = currentUserId ? currentUsername : 'Guest';
    let active = true;
    void presenceService
      .enterRoom('match', matchId, presenceUserId, displayName)
      .then((sessionId) => {
        if (!active) return;
        presenceSessionIdRef.current = sessionId;
      });
    const heartbeat = setInterval(() => {
      void presenceService.heartbeat('match', matchId, presenceUserId, presenceSessionIdRef.current || undefined);
    }, 25000);
    return () => {
      active = false;
      clearInterval(heartbeat);
      void presenceService.leaveRoom('match', matchId, presenceUserId, presenceSessionIdRef.current || undefined);
      presenceSessionIdRef.current = null;
    };
  }, [currentUserId, currentUsername, matchId]);

  // Live viewer count
  useEffect(() => {
    if (!matchId) return;
    const unsub = presenceService.listenActiveCount('match', matchId, (count) => {
      setViewerCount(count);
    });
    return unsub;
  }, [matchId]);

  // Pulse animation when a new message arrives
  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.id === latestMessageIdRef.current) return;
    latestMessageIdRef.current = latest.id;
    if (latest.userId === currentUserId) return; // don't pulse own messages
    Animated.sequence([
      Animated.timing(newMessageAnim, { toValue: 1.04, duration: 120, useNativeDriver: true }),
      Animated.timing(newMessageAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [currentUserId, messages, newMessageAnim]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    if (!isNearBottomRef.current) return;
    requestAnimationFrame(() => {
      chatListRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, activeTab]);

  useEffect(() => {
    insetsRef.current = insets;
    if (!keyboardVisible) {
      keyboardPadAnim.setValue(Math.max(insets.bottom, 8) + 4);
    }
  }, [insets, keyboardPadAnim, keyboardVisible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates?.height || 0);
      Animated.timing(keyboardPadAnim, {
        toValue: 10,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      const targetPad = Math.max(insetsRef.current.bottom, 8) + 4;
      Animated.timing(keyboardPadAnim, {
        toValue: targetPad,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardPadAnim]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(liveDotAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [liveDotAnim]);

  useEffect(() => {
    if (!messageMenu) {
      messageMenuAnim.setValue(0);
      return;
    }
    messageMenuAnim.setValue(0);
    Animated.spring(messageMenuAnim, {
      toValue: 1,
      stiffness: 320,
      damping: 24,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [messageMenu, messageMenuAnim]);

  const handleSend = async () => {
    const textToSend = message.trim();
    if (!textToSend || !matchId || sendingRef.current) return;
    if (!currentUserId) {
      setShowLoginPrompt(true);
      return;
    }
    sendingRef.current = true;
    setMessage('');
    const replyTarget = replyingTo;
    setReplyingTo(null);
    try {
      // Use the live-synced minute label for accuracy — parse to a number.
      const liveMinuteStr = liveMinuteTextRef.current.raw || (typeof matchInfo?.minute === 'number' ? `${matchInfo.minute}` : '');
      const liveMinuteNum = Number.parseInt(liveMinuteStr.replace(/[^0-9]/g, ''), 10);
      const currentMatchMinute = Number.isFinite(liveMinuteNum) ? liveMinuteNum : matchInfo?.minute;
      await chatService.sendMessage(
        matchId,
        currentUserId,
        currentUsername,
        textToSend,
        replyTarget
          ? {
              messageId: replyTarget.id,
              username: replyTarget.username,
              text: replyTarget.text,
            }
          : undefined,
        currentMatchMinute
      );
      setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error('Error sending message:', err);
      const code = (err as { code?: string } | null)?.code;
      if (code === 'moderation-blocked') {
        Alert.alert('Message Blocked', 'Hate speech and slurs are not allowed.');
      } else if (code === 'rate-limited') {
        Alert.alert('Slow Down', '30 messages in a minute is excessive. Please slow down.');
      } else if (code === 'rate-flagged') {
        Alert.alert('Account Flagged', 'Excessive spam was detected. Your account has been flagged for review.');
      }
      setMessage(textToSend);
      setReplyingTo(replyTarget);
    } finally {
      sendingRef.current = false;
    }
  };

  const getCompactMinute = (msg: ChatMessage) => {
    if (typeof msg.matchMinute === 'number' && Number.isFinite(msg.matchMinute)) {
      return `${msg.matchMinute}'`;
    }
    return '';
  };

  const openReply = (msg: ChatMessage) => {
    if (!currentUserId) {
      setShowLoginPrompt(true);
      return;
    }
    setReplyingTo(msg);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleLongPress = (msg: ChatMessage, centerX: number, bubbleTop: number, bubbleHeight: number) => {
    if (msg.type === 'system') return;
    if (!currentUserId) {
      setShowLoginPrompt(true);
      return;
    }
    suppressSwipeReplyRef.current = true;
    suppressTapRef.current = true;
    if (Platform.OS === 'ios') {
      void Haptics.selectionAsync().catch(() => null);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    }
    setMessageMenu({ message: msg, centerX, bubbleTop, bubbleHeight });
  };

  const addReaction = async (emoji: string, target?: ChatMessage) => {
    if (!target || !matchId) return;
    if (!currentUserId) {
      setMessageMenu(null);
      setShowLoginPrompt(true);
      return;
    }
    try {
      await chatService.toggleReaction(matchId, target.id, emoji, currentUserId);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      if ((error as { code?: string } | null)?.code === 'rate-limited') {
        Alert.alert('Slow Down', 'You are reacting too quickly.');
      }
    }
    setMessageMenu(null);
  };

  const toggleHeartReaction = async (msg: ChatMessage) => {
    if (!matchId) return;
    if (!currentUserId) {
      setShowLoginPrompt(true);
      return;
    }
    try {
      await chatService.toggleReaction(matchId, msg.id, '❤️', currentUserId);
    } catch (error) {
      console.error('Failed to toggle heart reaction:', error);
      if ((error as { code?: string } | null)?.code === 'rate-limited') {
        Alert.alert('Slow Down', 'You are reacting too quickly.');
      }
    }
  };

  const handleMessageTap = async (msg: ChatMessage) => {
    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    const now = Date.now();
    if (lastTapRef.current.id === msg.id && now - lastTapRef.current.ts < 300) {
      lastTapRef.current = { id: '', ts: 0 };
      void Haptics.selectionAsync().catch(() => null);
      await toggleHeartReaction(msg);
      return;
    }
    lastTapRef.current = { id: msg.id, ts: now };
  };

  const kickoffMs = useMemo(() => {
    if (!matchInfo?.kickoffAt) return null;
    const parsed = new Date(matchInfo.kickoffAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [matchInfo?.kickoffAt]);

  const chatWindow = useMemo(() => {
    if (!kickoffMs || !matchInfo) return null;
    return chatService.getChatWindow(kickoffMs, matchInfo.statusShort);
  }, [kickoffMs, matchInfo]);

  const chatOpen = useMemo(() => {
    if (!matchInfo) return false;
    const short = (matchInfo.statusShort || '').toUpperCase();
    if (LIVE_STATUSES.has(short)) return true;
    if (isPregameChat) return true;
    if (!kickoffMs) return false;
    return chatService.isChatOpen(kickoffMs, matchInfo.statusShort);
  }, [kickoffMs, matchInfo, isPregameChat]);

  const canSendChat = Boolean(chatOpen && currentUserId);

  const chatEndsSoon = useMemo(() => {
    if (!chatWindow) return false;
    if (!chatWindow.isEnded) return false;
    const msLeft = chatWindow.chatCloseTime - Date.now();
    return msLeft > 0 && msLeft <= 15 * 60 * 1000;
  }, [chatWindow, minuteTickNow]);

  const renderMessage = (msg: ChatMessage) => {
    const isCurrentUser = msg.userId === currentUserId;
    const isSystem = msg.type === 'system';
    const isLatestIncoming = !isCurrentUser && msg.id === latestMessageIdRef.current;

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <View style={styles.systemPill}>
            <Text style={styles.systemText}>{msg.text}</Text>
          </View>
        </View>
      );
    }

    return (
      <Animated.View style={isLatestIncoming ? { transform: [{ scale: newMessageAnim }] } : undefined}>
      <Pressable
        style={[styles.messageContainer, isCurrentUser && styles.currentUserMessageContainer]}
        onLongPress={(e) => {
          e.stopPropagation?.();
          const node = messageBubbleRefs.current[msg.id];
          const fallbackSize = messageBubbleSizeRefs.current[msg.id];
          const fallbackHeight = fallbackSize?.height ?? 46;
          const fallbackOpen = () =>
            handleLongPress(
              msg,
              Math.max(24, e.nativeEvent.pageX),
              Math.max(insets.top + 12, e.nativeEvent.pageY - fallbackHeight / 2),
              fallbackHeight
            );
          if (node?.measureInWindow) {
            try {
              node.measureInWindow((x: number, y: number, width: number, height: number) => {
                handleLongPress(
                  msg,
                  x + width / 2,
                  y,
                  height
                );
              });
              return;
            } catch {
              // fall back to the press location if native measurement is unavailable
            }
          }
          fallbackOpen();
        }}
        onPress={(e) => {
          e.stopPropagation?.();
          void handleMessageTap(msg);
        }}
        onPressIn={(e) => {
          e.stopPropagation?.();
          pressStartXRef.current = e.nativeEvent.pageX;
          pressStartYRef.current = e.nativeEvent.pageY;
          suppressSwipeReplyRef.current = false;
        }}
        onPressOut={(e) => {
          e.stopPropagation?.();
          if (suppressSwipeReplyRef.current) {
            suppressSwipeReplyRef.current = false;
            return;
          }
          const dx = e.nativeEvent.pageX - pressStartXRef.current;
          const dy = e.nativeEvent.pageY - pressStartYRef.current;
          const mostlyHorizontal = Math.abs(dy) < 28;
          const shouldReply = mostlyHorizontal && (isCurrentUser ? dx < -40 : dx > 40);
          if (shouldReply) {
            void Haptics.selectionAsync().catch(() => null);
            openReply(msg);
          }
        }}
      >
        <View style={[styles.messageWrapper, isCurrentUser && styles.currentUserMessageWrapper]}>
          <View style={[styles.messageMetaRow, isCurrentUser && styles.messageMetaRowCurrent]}>
            {!isCurrentUser ? <Text style={styles.username}>{msg.username}</Text> : <Text style={styles.usernameSelf}>You</Text>}
            <Text style={styles.messageTime}>{getCompactMinute(msg)}</Text>
          </View>

          {msg.replyTo && (
            <View style={styles.replyContext}>
              <Text style={styles.replyContextUser}>@{msg.replyTo.username}</Text>
              <Text style={styles.replyContextText} numberOfLines={1}>
                {msg.replyTo.text}
              </Text>
            </View>
          )}

          <View
            ref={(node) => {
              if (node) {
                messageBubbleRefs.current[msg.id] = node;
              } else {
                delete messageBubbleRefs.current[msg.id];
                delete messageBubbleSizeRefs.current[msg.id];
              }
            }}
            collapsable={false}
            onLayout={(event) => {
              messageBubbleSizeRefs.current[msg.id] = {
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              };
            }}
            style={[
              styles.messageBubble,
              isCurrentUser && styles.currentUserBubble,
            ]}
          >
            <Text style={[styles.messageText, isCurrentUser && styles.messageTextCurrent]}>{msg.text}</Text>
          </View>

          {Object.keys(msg.reactions || {}).length > 0 && (
            <View style={styles.reactions}>
              {Object.entries(msg.reactions).map(([emoji, reaction]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.reaction,
                    reaction.userIds?.includes(currentUserId) && styles.reactionActive,
                  ]}
                  onPress={() => void addReaction(emoji, msg)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{reaction.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Pressable>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <MatchEntryLoading
          homeName={loadingSeed.homeName}
          awayName={loadingSeed.awayName}
          homeLogo={loadingSeed.homeLogo}
          awayLogo={loadingSeed.awayLogo}
          league={loadingSeed.league}
          mode="chat"
        />
      </SafeAreaView>
    );
  }

  if (error || !matchInfo) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle" size={64} color="#FF453A" />
          <Text style={styles.errorText}>{error || 'Match unavailable'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderTeamLineupSection = (
    teamKey: 'home' | 'away',
    lineup: TeamLineup | null,
    teamName: string,
    teamLogo?: string
  ) => {
    const benchList = lineup ? buildBench(lineup, decorMap) : [];
    const pitchXI = lineup ? buildPitchXI(lineup, decorMap) : [];
    const displayFormation = deriveFormation(pitchXI) || lineup?.formation;

    return (
      <View style={styles.teamLineupBlock}>
        {displayFormation && (
          <View style={styles.formationRow}>
            <Text style={styles.formationLabel}>Formation</Text>
            <View style={styles.formationChip}>
              <Text style={styles.formationChipText}>{displayFormation}</Text>
            </View>
          </View>
        )}

        <View style={styles.lineupSectionHeader}>
          <Text style={styles.lineupSectionTitle}>Starting XI</Text>
          {pitchXI.length > 0 && (
            <View style={styles.lineupCountBadge}>
              <Text style={styles.lineupCountText}>{pitchXI.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.pitchWrap}>
          {pitchXI.length ? (
            <LineupPitch players={pitchXI} decorMap={decorMap} teamName={teamName} />
          ) : (
            <Text style={styles.emptyText}>{detailsLoading ? 'Loading lineups...' : 'Lineups unavailable'}</Text>
          )}
        </View>

        <View style={styles.lineupSectionHeader}>
          <Text style={styles.lineupSectionTitle}>Bench</Text>
          {benchList.length > 0 && (
            <View style={styles.lineupCountBadge}>
              <Text style={styles.lineupCountText}>{benchList.length}</Text>
            </View>
          )}
        </View>
        {benchList.length === 0 ? (
          <Text style={styles.emptyText}>No bench data</Text>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#E6E6E9" />
        </TouchableOpacity>
        <Text style={styles.leagueTitle} numberOfLines={1}>
          {matchInfo.leagueName || 'Match'}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <TouchableOpacity
        style={styles.headerCardWrap}
        activeOpacity={1}
      >
        <MatchResultHeaderCard
          homeName={matchInfo.homeName}
          awayName={matchInfo.awayName}
          homeAbbr={getAbbr(matchInfo.homeName)}
          awayAbbr={getAbbr(matchInfo.awayName)}
          homeLogo={matchInfo.homeLogo}
          awayLogo={matchInfo.awayLogo}
          homeScore={isPregameChat ? 0 : matchInfo.homeScore}
          awayScore={isPregameChat ? 0 : matchInfo.awayScore}
          statusLabel={statusLabel}
          homeRecord={records.home}
          awayRecord={records.away}
          homeLines={scorerLines.homeLines}
          awayLines={scorerLines.awayLines}
          minuteLabel={isPregameChat ? undefined : minuteLabel}
          centerLabel={isPregameChat ? 'VS' : undefined}
          aggregateLabel={takeFirstParam(params.aggregate as string | string[] | undefined) || undefined}
          competitionLabel={matchInfo.leagueName}
          debugGoalPreview={debugGoalPreview}
          animateGoalOnScoreChange={false}
          hideLiveStatus
          hideChevronChip
          compact
        />
      </TouchableOpacity>


      <View style={styles.tabsRow}>
        {(['chat', 'events', 'lineups'] as TabKey[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab(tab);
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'chat' ? 'Chat' : tab === 'events' ? 'Key Events' : 'Lineups'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'chat' && viewerCount > 0 && (
        <View style={styles.chatViewerBar} pointerEvents="none">
          <Animated.View style={[styles.activeDot, { opacity: liveDotAnim }]} />
          <Text style={styles.activeCountText}>
            {viewerCount > 1 ? `${viewerCount.toLocaleString()} in chat` : 'Live'}
          </Text>
        </View>
      )}

      {activeTab === 'chat' ? (
        <TouchableWithoutFeedback
          onPress={() => {
            if (keyboardVisible) Keyboard.dismiss();
          }}
          accessible={false}
        >
        <KeyboardAvoidingView
          style={styles.chatTab}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          {chatEndsSoon && (
            <View style={styles.chatWarningBanner}>
              <Ionicons name="warning-outline" size={14} color="#FFB34D" />
              <Text style={styles.chatWarningText}>Chat ends in 5 minutes</Text>
            </View>
          )}

          <FlatList
            ref={chatListRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.chatContent}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderMessage(item)}
            removeClippedSubviews
            windowSize={8}
            initialNumToRender={24}
            maxToRenderPerBatch={24}
            updateCellsBatchingPeriod={16}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onLayout={() => {
              chatListRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
              lastScrollOffsetRef.current = contentOffset.y;
              const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
              const nearBottom = distanceFromBottom < 80;
              isNearBottomRef.current = nearBottom;
              setShowScrollDown(!nearBottom);
            }}
            scrollEventThrottle={60}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles" size={42} color="#8E8E93" />
                <Text style={styles.emptyChatTitle}>Start the conversation</Text>
                <Text style={styles.emptyChatSubtitle}>Be the first to say something</Text>
              </View>
            }
          />

          {showScrollDown && (
            <TouchableOpacity
              style={styles.scrollDownBtn}
              onPress={() => {
                chatListRef.current?.scrollToEnd({ animated: true });
                setShowScrollDown(false);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-down" size={18} color="#fff" />
            </TouchableOpacity>
          )}

          {replyingTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewContent}>
                <Ionicons name="arrow-undo" size={16} color="#4DA3FF" />
                <Text style={styles.replyPreviewUser}>@{replyingTo.username}</Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyingTo.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          )}

          <Animated.View
            style={[
              styles.inputContainer,
              { paddingBottom: keyboardPadAnim },
            ]}
          >
            {currentUserId ? (
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                placeholder={chatOpen ? 'Message...' : 'Chat closed for this match'}
                placeholderTextColor="#8E8E93"
                value={message}
                onChangeText={setMessage}
                multiline
                editable={chatOpen}
                maxLength={500}
              />
            ) : (
              <TouchableOpacity
                style={styles.guestInputPrompt}
                activeOpacity={0.86}
                onPress={() => setShowLoginPrompt(true)}
              >
                <Ionicons name="lock-closed" size={15} color="#8E8E93" />
                <Text style={styles.guestInputPromptText}>Sign in to chat</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!message.trim() || !canSendChat}
            >
              <Ionicons name="send" size={18} color="#0B0B0B" />
            </TouchableOpacity>
          </Animated.View>

          {messageMenu && (
            <Modal visible transparent animationType="none" onRequestClose={() => setMessageMenu(null)}>
              <Pressable style={styles.emojiPickerOverlay} onPress={() => setMessageMenu(null)}>
                {(() => {
                const emojiWidth = 244;
                const replyWidth = 188;
                const emojiHeight = 48;
                const replyHeight = 50;
                const bubbleGap = 6;
                const bubbleTop = messageMenu.bubbleTop;
                // safeTop must clear the score header (~110px) + tab bar (~44px) + viewer bar (~24px)
                const safeTop = insets.top + 190;
                const safeBottom = windowHeight - keyboardHeight - Math.max(insets.bottom, 16) - 60;
                const menuScale = messageMenuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                });
                const menuTranslateY = messageMenuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                });
                const emojiLeft = Math.max(
                  12,
                  Math.min(windowWidth - emojiWidth - 12, messageMenu.centerX - emojiWidth / 2)
                );
                const replyLeft = Math.max(
                  12,
                  Math.min(windowWidth - replyWidth - 12, messageMenu.centerX - replyWidth / 2)
                );
                const preferredEmojiTop = bubbleTop - emojiHeight - bubbleGap;
                const preferredReplyTop = bubbleTop + messageMenu.bubbleHeight + bubbleGap;
                const stackedHeight = emojiHeight + bubbleGap + replyHeight;
                const stackedTop = Math.max(
                  safeTop,
                  Math.min(safeBottom - stackedHeight, preferredEmojiTop)
                );
                const hasRoomBelow = preferredReplyTop + replyHeight <= safeBottom;
                const emojiTop = hasRoomBelow ? Math.max(safeTop, preferredEmojiTop) : stackedTop;
                const replyTop = hasRoomBelow ? preferredReplyTop : emojiTop + emojiHeight + bubbleGap;

                  return (
                    <>
                      <Animated.View
                        style={[
                          styles.messageMenuEmojiPill,
                          {
                            left: emojiLeft,
                            top: emojiTop,
                            opacity: messageMenuAnim,
                            transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
                          },
                        ]}
                      >
                        {['❤️', '😂', '😮', '😢', '🔥', '👎'].map((emoji) => (
                          <TouchableOpacity
                            key={emoji}
                            style={styles.messageMenuEmojiButton}
                            onPress={() => void addReaction(emoji, messageMenu.message)}
                          >
                            <Text style={styles.emojiText}>{emoji}</Text>
                          </TouchableOpacity>
                        ))}
                      </Animated.View>

                      <Animated.View
                        style={[
                          styles.messageMenuActionCard,
                          {
                            left: replyLeft,
                            top: replyTop,
                            opacity: messageMenuAnim,
                            transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.messageMenuActionButton}
                          onPress={() => {
                            openReply(messageMenu.message);
                            setMessageMenu(null);
                          }}
                        >
                          <Ionicons name="arrow-undo" size={15} color="#E6E6E9" />
                          <Text style={styles.messageMenuActionText}>Reply</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    </>
                  );
                })()}
              </Pressable>
            </Modal>
          )}
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 10, paddingBottom: Math.max(insets.bottom, 24) }}
          >
          {activeTab === 'events' && (
          <View style={styles.section}>
            {detailsLoading ? (
              <View style={styles.tabLoadingContainer}>
                <ActivityIndicator size="large" color="#4DA3FF" />
              </View>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Key Events</Text>
                </View>

                {uiEvents.length === 0 ? (
                  <Text style={styles.emptyText}>Match facts timeline is warming up...</Text>
                ) : (
                  uiEvents.map((event) => <PlayByPlayRow key={`pbp-${event.id}`} event={event} />)
                )}

                <View style={styles.sectionDivider} />
                <Text style={styles.sectionTitle}>Match Statistics</Text>
                {stats ? (
                  <>
                    {Object.entries(stats).map(([label, value]) => (
                      <View key={label} style={styles.statRow}>
                        <Text style={styles.statValue}>{(value as any).home}</Text>
                        <View style={styles.statCenter}>
                          <Text style={styles.statLabel}>{label.replace(/([A-Z])/g, ' $1').replace(/^\w/, c => c.toUpperCase())}</Text>
                          <View style={styles.statBar}>
                            <View
                              style={[styles.statBarHome, { width: `${(value as any).home + (value as any).away > 0 ? ((value as any).home / ((value as any).home + (value as any).away)) * 100 : 50}%` }]}
                            />
                            <View
                              style={[styles.statBarAway, { width: `${(value as any).home + (value as any).away > 0 ? ((value as any).away / ((value as any).home + (value as any).away)) * 100 : 50}%` }]}
                            />
                          </View>
                        </View>
                        <Text style={styles.statValue}>{(value as any).away}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>Statistics unavailable</Text>
                )}
              </>
            )}
          </View>
        )}

        {activeTab === 'lineups' && (
          <View style={styles.section}>
            {detailsLoading ? (
              <View style={styles.tabLoadingContainer}>
                <ActivityIndicator size="large" color="#4DA3FF" />
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
                      homeLogo={matchInfo.homeLogo}
                      awayLogo={matchInfo.awayLogo}
                      homeFormation={homeFormation}
                      awayFormation={awayFormation}
                      homeLabel={matchInfo.homeName}
                      awayLabel={matchInfo.awayName}
                      onSelect={setSelectedTeam}
                    />
                  );
                })()}
                {selectedTeam === 'home'
                  ? renderTeamLineupSection('home', lineups.home, matchInfo.homeName, matchInfo.homeLogo)
                  : renderTeamLineupSection('away', lineups.away, matchInfo.awayName, matchInfo.awayLogo)}
              </>
            )}
          </View>
          )}
          </ScrollView>
        </TouchableWithoutFeedback>
      )}

      {/* Login prompt modal — shown when guest taps the chat input */}
      <Modal
        visible={showLoginPrompt}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLoginPrompt(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowLoginPrompt(false)}>
          <View style={styles.loginPromptOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.loginPromptSheet}>
                <View style={styles.loginPromptHandle} />
                <Ionicons name="chatbubbles" size={36} color="#4DA3FF" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <Text style={styles.loginPromptTitle}>Join the Live Chat</Text>
                <Text style={styles.loginPromptSubtitle}>
                  Sign in or create a free account to chat with fans during the match.
                </Text>
                <TouchableOpacity
                  style={styles.loginPromptPrimary}
                  onPress={() => { setShowLoginPrompt(false); router.push('/(auth)/login'); }}
                >
                  <Text style={styles.loginPromptPrimaryText}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.loginPromptSecondary}
                  onPress={() => { setShowLoginPrompt(false); router.push('/(auth)/signup'); }}
                >
                  <Text style={styles.loginPromptSecondaryText}>Create Account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.loginPromptGuest}
                  onPress={() => setShowLoginPrompt(false)}
                >
                  <Text style={styles.loginPromptGuestText}>Continue as Guest</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#A1A1A6',
  },
  tabLoadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#FF453A',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4DA3FF',
  },
  retryButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
  },
  leagueTitle: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#E6E6E9',
    textAlign: 'center',
  },
  topBarSpacer: {
    width: 24,
  },
  headerCardWrap: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 0,
  },
  debugGoalRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  debugGoalButton: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugGoalButtonText: {
    color: '#AFCFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    marginTop: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#FF3B30',
  },
  tabText: {
    color: '#A1A1A6',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#E6E6E9',
  },
  chatTab: {
    flex: 1,
  },
  chatViewerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,59,48,0.2)',
  },
  goalFlashOverlay: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    zIndex: 99,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  goalFlashLogo: {
    width: 42,
    height: 42,
    borderRadius: 22,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF77',
  },
  goalFlashTextWrap: {
    flex: 1,
  },
  goalFlashLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  goalFlashScore: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  goalFlashByline: {
    color: '#FFFFFFCC',
    fontSize: 12,
    marginTop: 1,
  },
  chatHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(18, 18, 20, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  activeCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  goalBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF33',
  },
  goalBannerText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chatWarningBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#2A2012',
    borderWidth: 1,
    borderColor: '#5A4022',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatWarningText: {
    color: '#FFB34D',
    fontSize: 12,
    fontWeight: '700',
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  scrollDownBtn: {
    position: 'absolute',
    bottom: 72,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,30,36,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 6,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  emptyChatSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  messageContainer: {
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  currentUserMessageContainer: {
    alignItems: 'flex-end',
  },
  messageWrapper: {
    alignSelf: 'flex-start',
    maxWidth: '78%',
    flexShrink: 1,
  },
  currentUserMessageWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  messageMetaRowCurrent: {
    justifyContent: 'flex-end',
  },
  username: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1A6',
  },
  usernameSelf: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C7C80',
  },
  messageTime: {
    fontSize: 10,
    color: '#7A7A80',
  },
  replyContext: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#111113',
    marginBottom: 6,
  },
  replyContextUser: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4DA3FF',
  },
  replyContextText: {
    fontSize: 11,
    color: '#A1A1A6',
  },
  messageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  currentUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#4DA3FF',
  },
  messageText: {
    fontSize: 13,
    color: '#E6E6E9',
  },
  messageTextCurrent: {
    color: '#0B0B0B',
  },
  systemMessage: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  systemPill: {
    backgroundColor: 'rgba(142,142,147,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  systemText: {
    fontSize: 11,
    color: '#6E6E73',
    fontWeight: '600',
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17171A',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 3,
  },
  reactionActive: {
    borderWidth: 1,
    borderColor: '#4DA3FF',
    backgroundColor: '#1B2B3C',
  },
  reactionEmoji: {
    fontSize: 11,
  },
  reactionCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D7D7DB',
    opacity: 0.76,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
  },
  replyPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  replyPreviewUser: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4DA3FF',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#A1A1A6',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    backgroundColor: '#0B0B0B',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1C1C1E',
    color: '#E6E6E9',
    fontSize: 13,
  },
  sendButton: {
    marginLeft: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4DA3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emojiPickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  messageMenuWrap: {
    position: 'absolute',
    width: 244,
    alignItems: 'center',
    gap: 4,
  },
  messageMenuEmojiPill: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 244,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: '#1C1D22',
    borderWidth: 1,
    borderColor: '#2A2C33',
  },
  messageMenuEmojiButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#282A31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 16,
  },
  messageMenuActionCard: {
    position: 'absolute',
    width: 188,
    borderRadius: 18,
    backgroundColor: '#181A1F',
    borderWidth: 1,
    borderColor: '#2A2C33',
    overflow: 'hidden',
  },
  messageMenuActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  messageMenuActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E6E6E9',
  },
  section: {
    marginBottom: 24,
  },
  teamLineupBlock: {
    marginTop: 12,
    marginBottom: 18,
  },
  formationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  formationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  formationChip: {
    backgroundColor: 'rgba(77,163,255,0.14)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  formationChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4DA3FF',
  },
  lineupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
    marginTop: 8,
  },
  lineupSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  lineupCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lineupCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A1A1A6',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 16,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E6E6E9',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  eventTime: {
    width: 56,
    fontSize: 12,
    fontWeight: '700',
    color: '#E6E6E9',
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
    color: '#C7C7CC',
  },
  emptyText: {
    color: '#A1A1A6',
    fontSize: 13,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statValue: {
    width: 40,
    textAlign: 'center',
    color: '#E6E6E9',
    fontWeight: '700',
  },
  statCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  statLabel: {
    color: '#A1A1A6',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  statBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2C2C2E',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  statBarHome: {
    backgroundColor: '#4DA3FF',
  },
  statBarAway: {
    backgroundColor: '#FF453A',
  },
  pitchWrap: {
    marginTop: 12,
    marginBottom: 16,
  },
  guestInputPrompt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guestInputPromptText: {
    color: '#8E8E93',
    fontSize: 15,
  },
  loginPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  loginPromptSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 36,
  },
  loginPromptHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3C',
    alignSelf: 'center',
    marginBottom: 20,
  },
  loginPromptTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  loginPromptSubtitle: {
    fontSize: 14,
    color: '#A1A1A6',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  loginPromptPrimary: {
    backgroundColor: '#4DA3FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginPromptPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginPromptSecondary: {
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginPromptSecondaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loginPromptGuest: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  loginPromptGuestText: {
    color: '#636366',
    fontSize: 14,
  },
});
