// app/chat/[id].tsx
// REAL LIVE MATCH - Fully Isolated by Match ID
// ✅ Each match has its own chat room
// ✅ Each match has its own stats
// ✅ NO hardcoded fallbacks for real matches
// ✅ Firebase scoped by matchId

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type TabType = 'chat' | 'stats' | 'facts' | 'lineups';

interface MatchData {
  id: number;
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: string;
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
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

type PlayByPlayEventType =
  | 'GOAL'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'SUBSTITUTION'
  | 'CORNER'
  | 'SHOT'
  | 'SHOT_ON_TARGET'
  | 'SHOT_OFF_TARGET'
  | 'BLOCKED_SHOT'
  | 'SAVE'
  | 'OFFSIDE'
  | 'FOUL'
  | 'VAR'
  | 'START_1H'
  | 'HT'
  | 'START_2H'
  | 'FT';

interface PlayByPlayDetails {
  scorer?: string;
  assist?: string;
  score_home?: number;
  score_away?: number;
  player?: string;
  reason?: string;
  playerOn?: string;
  playerOff?: string;
  cornerSide?: string;
  shooter?: string;
  assistedBy?: string;
  distance?: string | number;
  bodyPart?: string;
  goalkeeper?: string;
  playerFouled?: string;
  varDecision?: string;
}

interface PlayByPlayEvent {
  id: string;
  minute: number;
  extraMinute?: number;
  timestamp: string | number;
  team: 'home' | 'away' | null;
  type: PlayByPlayEventType;
  title: string;
  description: string;
  details: PlayByPlayDetails;
}

interface Lineup {
  formation: string;
  players: Array<{
    number: number;
    name: string;
    position: string;
    row: number;
  }>;
}

const TEAM_COLORS = {
  home: '#2F80ED',
  away: '#FF3B30',
  neutral: '#8E8E93',
};

const getTeamAbbreviation = (teamName?: string) => {
  if (!teamName) return 'TBD';
  const words = teamName.split(' ').filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words
    .map(word => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
};

const getTeamName = (team: PlayByPlayEvent['team'], matchData: MatchData | null) => {
  if (!matchData || !team) return 'Unknown';
  return team === 'home' ? matchData.home : matchData.away;
};

const getEventTitle = (type: PlayByPlayEventType) => {
  switch (type) {
    case 'GOAL':
      return 'Goal';
    case 'YELLOW_CARD':
      return 'Yellow Card';
    case 'RED_CARD':
      return 'Red Card';
    case 'SUBSTITUTION':
      return 'Substitution';
    case 'CORNER':
      return 'Corner';
    case 'SHOT_ON_TARGET':
      return 'Shot on Target';
    case 'SHOT_OFF_TARGET':
      return 'Shot Off Target';
    case 'BLOCKED_SHOT':
      return 'Shot Blocked';
    case 'SAVE':
      return 'Save';
    case 'OFFSIDE':
      return 'Offside';
    case 'FOUL':
      return 'Foul';
    case 'VAR':
      return 'VAR';
    case 'START_1H':
      return 'Kickoff';
    case 'HT':
      return 'Half-time';
    case 'START_2H':
      return 'Second Half';
    case 'FT':
      return 'Full-time';
    case 'SHOT':
    default:
      return 'Shot';
  }
};

const formatEventDescription = (event: PlayByPlayEvent, matchData: MatchData | null) => {
  const teamName = getTeamName(event.team, matchData);
  const details = event.details;

  switch (event.type) {
    case 'GOAL': {
      const scorer = details.scorer || 'Unknown scorer';
      const assist = details.assist ? ` Assisted by ${details.assist}.` : '';
      return `Goal! ${scorer} scores for ${teamName}.${assist}`;
    }
    case 'SUBSTITUTION': {
      const on = details.playerOn || 'Substitution';
      const off = details.playerOff || 'player';
      return `Substitution, ${teamName}. ${on} replaces ${off}.`;
    }
    case 'CORNER':
      return `Corner, ${teamName}.`;
    case 'SHOT_ON_TARGET': {
      const shooter = details.shooter || 'Shot';
      const keeper = details.goalkeeper ? ` Saved by ${details.goalkeeper}.` : '';
      return `Shot on target by ${shooter} (${teamName}).${keeper}`;
    }
    case 'SHOT_OFF_TARGET': {
      const shooter = details.shooter || 'Shot';
      return `Shot off target by ${shooter} (${teamName}).`;
    }
    case 'BLOCKED_SHOT': {
      const shooter = details.shooter || 'Shot';
      return `Shot blocked by ${shooter} (${teamName}).`;
    }
    case 'SHOT': {
      const shooter = details.shooter || 'Shot';
      return `Shot by ${shooter} (${teamName}).`;
    }
    case 'SAVE': {
      const keeper = details.goalkeeper || 'Goalkeeper';
      const shooter = details.shooter ? ` to deny ${details.shooter}` : '';
      return `Save by ${keeper}${shooter}.`;
    }
    case 'YELLOW_CARD': {
      const player = details.player || 'Player';
      const reason = details.reason ? ` (${details.reason})` : '';
      return `Yellow card to ${player} (${teamName}).${reason}`;
    }
    case 'RED_CARD': {
      const player = details.player || 'Player';
      const reason = details.reason ? ` (${details.reason})` : '';
      return `Red card to ${player} (${teamName}).${reason}`;
    }
    case 'OFFSIDE': {
      const player = details.player || 'Player';
      return `Offside, ${player} (${teamName}).`;
    }
    case 'FOUL': {
      const player = details.player || 'Player';
      const fouled = details.playerFouled ? ` on ${details.playerFouled}` : '';
      return `Foul by ${player} (${teamName})${fouled}.`;
    }
    case 'VAR': {
      const decision = details.varDecision || 'decision pending';
      return `VAR check: ${decision}.`;
    }
    case 'START_1H':
      return 'First half begins.';
    case 'HT':
      return 'Half-time in this match.';
    case 'START_2H':
      return 'Second half begins.';
    case 'FT':
      return 'Full-time.';
    default:
      return event.title;
  }
};

const buildPlayByPlayEvents = (rawEvents: any[], matchData: MatchData): PlayByPlayEvent[] => {
  const sorted = [...rawEvents].sort((a, b) => {
    const minuteDiff = (a.time?.elapsed || 0) - (b.time?.elapsed || 0);
    if (minuteDiff !== 0) return minuteDiff;
    return (a.time?.extra || 0) - (b.time?.extra || 0);
  });

  let homeScore = 0;
  let awayScore = 0;

  return sorted.map((event, index) => {
    const team =
      event.team?.id === matchData.homeTeamId
        ? 'home'
        : event.team?.id === matchData.awayTeamId
          ? 'away'
          : null;

    const normalizedType = (() => {
      if (event.type === 'Goal') return 'GOAL';
      if (event.type === 'Card' && event.detail?.includes('Yellow')) return 'YELLOW_CARD';
      if (event.type === 'Card' && event.detail?.includes('Red')) return 'RED_CARD';
      if (event.type === 'subst') return 'SUBSTITUTION';
      if (event.type === 'Corner' || event.detail?.toLowerCase().includes('corner')) return 'CORNER';
      if (event.type === 'Var' || event.detail?.toLowerCase().includes('var')) return 'VAR';
      if (event.type === 'Offside' || event.detail?.toLowerCase().includes('offside')) return 'OFFSIDE';
      if (event.type === 'Foul' || event.detail?.toLowerCase().includes('foul')) return 'FOUL';
      if (event.detail?.toLowerCase().includes('save')) return 'SAVE';
      if (event.detail?.toLowerCase().includes('blocked shot')) return 'BLOCKED_SHOT';
      if (event.detail?.toLowerCase().includes('on target')) return 'SHOT_ON_TARGET';
      if (event.detail?.toLowerCase().includes('off target')) return 'SHOT_OFF_TARGET';
      if (event.type === 'Shot') return 'SHOT';
      if (event.type === 'Match' && event.detail?.toLowerCase().includes('1st')) return 'START_1H';
      if (event.type === 'Match' && event.detail?.toLowerCase().includes('half time')) return 'HT';
      if (event.type === 'Match' && event.detail?.toLowerCase().includes('2nd')) return 'START_2H';
      if (event.type === 'Match' && event.detail?.toLowerCase().includes('full')) return 'FT';
      return 'SHOT';
    })();

    const isShotLike = event.type === 'Shot' || event.detail?.toLowerCase().includes('shot');
    const details: PlayByPlayDetails = {
      player: event.player?.name,
      reason: event.detail,
      playerOn: event.type === 'subst' ? event.player?.name : undefined,
      playerOff: event.type === 'subst' ? event.assist?.name : undefined,
      scorer: event.type === 'Goal' ? event.player?.name : undefined,
      assist: event.type === 'Goal' ? event.assist?.name : undefined,
      shooter: isShotLike ? event.player?.name : undefined,
      assistedBy: isShotLike ? event.assist?.name : undefined,
      goalkeeper: normalizedType === 'SAVE' ? event.player?.name : undefined,
      playerFouled: event.assist?.name,
      varDecision: event.type === 'Var' ? event.detail : undefined,
    };

    if (normalizedType === 'GOAL') {
      const isOwnGoal = event.detail?.toLowerCase().includes('own goal');
      const scoringTeam = isOwnGoal ? (team === 'home' ? 'away' : 'home') : team;
      if (scoringTeam === 'home') homeScore += 1;
      if (scoringTeam === 'away') awayScore += 1;
      details.score_home = homeScore;
      details.score_away = awayScore;
    }

    if (normalizedType === 'SAVE' && event.assist?.name && !details.shooter) {
      details.shooter = event.assist.name;
    }

    const playByPlayEvent: PlayByPlayEvent = {
      id: event.id
        ? `${event.id}`
        : `${event.time?.elapsed || 0}-${event.time?.extra || 0}-${event.type}-${event.player?.id || event.player?.name || 'event'}-${index}`,
      minute: event.time?.elapsed || 0,
      extraMinute: event.time?.extra || undefined,
      timestamp: event.time?.elapsed ? event.time.elapsed * 60 * 1000 : Date.now(),
      team,
      type: normalizedType,
      title: getEventTitle(normalizedType),
      description: '',
      details,
    };

    playByPlayEvent.description = formatEventDescription(playByPlayEvent, matchData);

    return playByPlayEvent;
  });
};

const LiveStatsHeader = ({
  matchData,
  stats,
  latestMinute,
  isLive,
}: {
  matchData: MatchData;
  stats: Stats | null;
  latestMinute: number;
  isLive: boolean;
}) => {
  const homeAbbr = getTeamAbbreviation(matchData.home);
  const awayAbbr = getTeamAbbreviation(matchData.away);

  return (
    <View style={styles.liveStatsHeader}>
      <View style={styles.liveStatsTopRow}>
        <Text style={styles.liveStatsTitle}>LIVE STATS</Text>
        {isLive && (
          <View style={styles.livePill}>
            <Text style={styles.livePillText}>LIVE</Text>
            <Text style={styles.livePillMinute}>{latestMinute}'</Text>
          </View>
        )}
      </View>

      <View style={styles.liveStatsTeamsRow}>
        <View style={styles.liveStatsTeam}>
          {matchData.homeLogo ? (
            <Image source={{ uri: matchData.homeLogo }} style={styles.teamLogo} />
          ) : (
            <View style={[styles.teamBadge, { backgroundColor: TEAM_COLORS.home }]}>
              <Text style={styles.teamBadgeText}>{homeAbbr}</Text>
            </View>
          )}
          <Text style={styles.teamLabel}>{homeAbbr}</Text>
        </View>
        <View style={styles.liveStatsTeam}>
          {matchData.awayLogo ? (
            <Image source={{ uri: matchData.awayLogo }} style={styles.teamLogo} />
          ) : (
            <View style={[styles.teamBadge, { backgroundColor: TEAM_COLORS.away }]}>
              <Text style={styles.teamBadgeText}>{awayAbbr}</Text>
            </View>
          )}
          <Text style={styles.teamLabel}>{awayAbbr}</Text>
        </View>
      </View>

      <View style={styles.liveStatsRows}>
        <View style={styles.liveStatsRow}>
          <Text style={styles.liveStatsValue}>{stats?.shots.home ?? 0}</Text>
          <Text style={styles.liveStatsLabel}>Shots</Text>
          <Text style={styles.liveStatsValue}>{stats?.shots.away ?? 0}</Text>
        </View>
        <View style={styles.liveStatsRow}>
          <Text style={styles.liveStatsValue}>{stats?.shotsOnTarget.home ?? 0}</Text>
          <Text style={styles.liveStatsLabel}>Shots on Target</Text>
          <Text style={styles.liveStatsValue}>{stats?.shotsOnTarget.away ?? 0}</Text>
        </View>
        <View style={styles.liveStatsRow}>
          <Text style={styles.liveStatsValue}>{stats?.corners.home ?? 0}</Text>
          <Text style={styles.liveStatsLabel}>Corners</Text>
          <Text style={styles.liveStatsValue}>{stats?.corners.away ?? 0}</Text>
        </View>
        {(stats?.possession.home || stats?.possession.away) && (
          <View style={styles.liveStatsRow}>
            <Text style={styles.liveStatsValue}>{stats?.possession.home ?? 0}%</Text>
            <Text style={styles.liveStatsLabel}>Possession</Text>
            <Text style={styles.liveStatsValue}>{stats?.possession.away ?? 0}%</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const PlayByPlayRow = ({
  event,
  matchData,
}: {
  event: PlayByPlayEvent;
  matchData: MatchData;
}) => {
  const minuteLabel = event.extraMinute ? `${event.minute}+${event.extraMinute}'` : `${event.minute}'`;
  const teamName = getTeamName(event.team, matchData);
  const teamAbbr = getTeamAbbreviation(teamName);
  const teamColor = event.team ? TEAM_COLORS[event.team] : TEAM_COLORS.neutral;
  const isGoal = event.type === 'GOAL';
  const scoreline =
    isGoal && event.details.score_home !== undefined && event.details.score_away !== undefined
      ? `${matchData.home} ${event.details.score_home}–${event.details.score_away} ${matchData.away}`
      : null;

  const iconName = (() => {
    switch (event.type) {
      case 'GOAL':
        return 'football';
      case 'YELLOW_CARD':
        return 'warning';
      case 'RED_CARD':
        return 'close-circle';
      case 'SUBSTITUTION':
        return 'swap-horizontal';
      case 'CORNER':
        return 'flag';
      case 'SHOT_ON_TARGET':
        return 'flash';
      case 'SHOT_OFF_TARGET':
        return 'arrow-forward-circle';
      case 'BLOCKED_SHOT':
        return 'shield';
      case 'SAVE':
        return 'hand-left';
      case 'OFFSIDE':
        return 'walk';
      case 'FOUL':
        return 'alert-circle';
      case 'VAR':
        return 'search';
      case 'START_1H':
      case 'START_2H':
        return 'play';
      case 'HT':
      case 'FT':
        return 'stop-circle';
      case 'SHOT':
      default:
        return 'radio-button-on';
    }
  })();

  return (
    <View style={[styles.playByPlayRow, isGoal && styles.goalRow]}>
      <View style={styles.minuteBadge}>
        <Text style={styles.minuteText}>{minuteLabel}</Text>
      </View>
      <View style={[styles.eventIcon, { borderColor: teamColor }]}>
        <Ionicons name={iconName as any} size={16} color={teamColor} />
      </View>
      <View style={styles.eventContent}>
        <View style={styles.eventMetaRow}>
          <View style={[styles.teamIndicator, { backgroundColor: teamColor }]}>
            <Text style={styles.teamIndicatorText}>{teamAbbr}</Text>
          </View>
          <Text style={styles.eventTitle}>{event.title}</Text>
        </View>
        <Text style={styles.eventDescription}>{event.description}</Text>
        {scoreline && <Text style={styles.scorelineText}>{scoreline}</Text>}
      </View>
    </View>
  );
};

const JumpToLiveButton = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity style={styles.jumpToLiveButton} onPress={onPress}>
    <Ionicons name="caret-down" size={16} color="#FFF" />
    <Text style={styles.jumpToLiveText}>Jump to live</Text>
  </TouchableOpacity>
);

export default function LiveMatchChat() {
  const { id } = useLocalSearchParams(); // Real match ID from API
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  // Match data state
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [playByPlayEvents, setPlayByPlayEvents] = useState<PlayByPlayEvent[]>([]);
  const [lineups, setLineups] = useState<{ home: Lineup | null; away: Lineup | null }>({ home: null, away: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentMatchMinute, setCurrentMatchMinute] = useState(0);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [showJumpToLive, setShowJumpToLive] = useState(false);
  
  const playByPlayListRef = useRef<FlatList<PlayByPlayEvent>>(null);

  // ============================================
  // FETCH MATCH DATA FROM API (SCOPED BY ID)
  // ============================================
  
  useEffect(() => {
    if (!id) {
      setError('No match ID provided');
      setLoading(false);
      return;
    }
    
    fetchMatchData();
    fetchStats();
    fetchLineups();
  }, [id]);

  useEffect(() => {
    if (!id || !matchData) return;
    fetchEvents(matchData);
  }, [id, matchData]);

  useEffect(() => {
    if (!id || !matchData) return;
    const interval = setInterval(() => {
      fetchMatchData();
      fetchStats();
      fetchEvents(matchData);
    }, 30000);

    return () => clearInterval(interval);
  }, [id, matchData]);

  const fetchMatchData = async () => {
    try {
      const response = await fetch(
        `https://v3.football.api-sports.io/fixtures?id=${id}`,
        {
          headers: {
            'x-rapidapi-key': process.env.EXPO_PUBLIC_API_FOOTBALL_KEY || '',
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        }
      );
      
      const data = await response.json();
      
      if (data.response && data.response.length > 0) {
        const fixture = data.response[0];
        
        setMatchData({
          id: fixture.fixture.id,
          league: fixture.league.name,
          home: fixture.teams.home.name,
          away: fixture.teams.away.name,
          homeScore: fixture.goals.home || 0,
          awayScore: fixture.goals.away || 0,
          minute: fixture.fixture.status.elapsed ? `${fixture.fixture.status.elapsed}'` : fixture.fixture.status.short,
          status: fixture.fixture.status.long,
          homeTeamId: fixture.teams.home.id,
          awayTeamId: fixture.teams.away.id,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo,
        });
        
        setCurrentMatchMinute(fixture.fixture.status.elapsed || 0);
        setLoading(false);
      } else {
        setError('Match not found');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching match data:', err);
      setError('Failed to load match data');
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `https://v3.football.api-sports.io/fixtures/statistics?fixture=${id}`,
        {
          headers: {
            'x-rapidapi-key': process.env.EXPO_PUBLIC_API_FOOTBALL_KEY || '',
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        }
      );
      
      const data = await response.json();
      
      if (data.response && data.response.length >= 2) {
        const homeStats = data.response[0].statistics;
        const awayStats = data.response[1].statistics;
        
        const getStat = (stats: any[], type: string) => {
          const stat = stats.find((s: any) => s.type === type);
          const value = stat?.value;
          if (typeof value === 'string') {
            return parseInt(value.replace('%', '')) || 0;
          }
          return value || 0;
        };
        
        setStats({
          possession: {
            home: getStat(homeStats, 'Ball Possession'),
            away: getStat(awayStats, 'Ball Possession'),
          },
          shots: {
            home: getStat(homeStats, 'Total Shots'),
            away: getStat(awayStats, 'Total Shots'),
          },
          shotsOnTarget: {
            home: getStat(homeStats, 'Shots on Goal'),
            away: getStat(awayStats, 'Shots on Goal'),
          },
          corners: {
            home: getStat(homeStats, 'Corner Kicks'),
            away: getStat(awayStats, 'Corner Kicks'),
          },
          fouls: {
            home: getStat(homeStats, 'Fouls'),
            away: getStat(awayStats, 'Fouls'),
          },
          offsides: {
            home: getStat(homeStats, 'Offsides'),
            away: getStat(awayStats, 'Offsides'),
          },
          yellowCards: {
            home: getStat(homeStats, 'Yellow Cards'),
            away: getStat(awayStats, 'Yellow Cards'),
          },
          redCards: {
            home: getStat(homeStats, 'Red Cards'),
            away: getStat(awayStats, 'Red Cards'),
          },
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchEvents = async (currentMatch: MatchData) => {
    try {
      const response = await fetch(
        `https://v3.football.api-sports.io/fixtures/events?fixture=${id}`,
        {
          headers: {
            'x-rapidapi-key': process.env.EXPO_PUBLIC_API_FOOTBALL_KEY || '',
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        }
      );
      
      const data = await response.json();
      
      if (data.response && data.response.length > 0) {
        const normalizedEvents = buildPlayByPlayEvents(data.response, currentMatch);
        setPlayByPlayEvents(normalizedEvents);
      } else {
        setPlayByPlayEvents([]);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const fetchLineups = async () => {
    try {
      const response = await fetch(
        `https://v3.football.api-sports.io/fixtures/lineups?fixture=${id}`,
        {
          headers: {
            'x-rapidapi-key': process.env.EXPO_PUBLIC_API_FOOTBALL_KEY || '',
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        }
      );
      
      const data = await response.json();
      
      if (data.response && data.response.length >= 2) {
        const transformLineup = (teamData: any): Lineup => {
          const mapGridToRow = (grid: string): number => {
            const [rowStr] = grid.split(':');
            return parseInt(rowStr) - 1; // Convert 1-4 to 0-3
          };
          
          return {
            formation: teamData.formation,
            players: teamData.startXI.map((p: any) => ({
              number: p.player.number,
              name: p.player.name.split(' ').pop() || p.player.name,
              position: p.player.pos,
              row: mapGridToRow(p.player.grid),
            })),
          };
        };
        
        setLineups({
          home: transformLineup(data.response[0]),
          away: transformLineup(data.response[1]),
        });
      }
    } catch (err) {
      console.error('Error fetching lineups:', err);
    }
  };

  // ============================================
  // RENDER FUNCTIONS
  // ============================================
  
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

  const latestMinute = useMemo(() => {
    if (playByPlayEvents.length > 0) {
      return playByPlayEvents[playByPlayEvents.length - 1].minute;
    }
    return currentMatchMinute;
  }, [playByPlayEvents, currentMatchMinute]);

  const isLive = useMemo(() => {
    if (!matchData) return false;
    const status = matchData.status.toLowerCase();
    return (
      status.includes('half') ||
      status.includes('live') ||
      status.includes('in play') ||
      status.includes('kick')
    );
  }, [matchData]);

  const handlePlayByPlayScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const pinned = distanceFromBottom < 80;
    setIsPinnedToBottom(pinned);
    setShowJumpToLive(!pinned);
  };

  const scrollToLive = () => {
    playByPlayListRef.current?.scrollToEnd({ animated: true });
    setIsPinnedToBottom(true);
    setShowJumpToLive(false);
  };

  useEffect(() => {
    if (playByPlayEvents.length === 0) return;
    if (isPinnedToBottom) {
      requestAnimationFrame(() => {
        playByPlayListRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [playByPlayEvents, isPinnedToBottom]);

  const renderLineup = (team: 'home' | 'away') => {
    const lineup = team === 'home' ? lineups.home : lineups.away;
    const teamName = team === 'home' ? matchData?.home : matchData?.away;

    if (!lineup) {
      return (
        <View style={styles.lineupContainer}>
          <Text style={styles.lineupTeamName}>{teamName}</Text>
          <ActivityIndicator color="#0066CC" style={{ marginTop: 20 }} />
        </View>
      );
    }

    // Dynamic formation positioning
    const getFormationPositions = (formation: string) => {
      const rows = formation.split('-').map(n => parseInt(n));
      const positions = [[{ left: 50 }]]; // GK always centered
      
      rows.forEach(count => {
        const rowPositions = [];
        const gap = 100 / (count + 1);
        
        for (let i = 1; i <= count; i++) {
          rowPositions.push({ left: gap * i });
        }
        
        positions.push(rowPositions);
      });
      
      return positions;
    };

    const positions = getFormationPositions(lineup.formation);
    const rowTops = [85, 65, 40, 15];

    return (
      <View style={styles.lineupContainer}>
        <View style={styles.lineupHeader}>
          <Text style={styles.lineupTeamName}>{teamName}</Text>
          <View style={styles.formationBadge}>
            <Text style={styles.formationText}>{lineup.formation}</Text>
          </View>
        </View>
        
        <View style={styles.pitch}>
          <View style={styles.pitchCenter} />
          <View style={styles.pitchCenterCircle} />
          
          {lineup.players.map((player) => {
            const row = player.row;
            const positionsInRow = positions[row];
            const playerIndexInRow = lineup.players.filter(p => p.row === row).indexOf(player);
            const position = positionsInRow[playerIndexInRow];
            const top = rowTops[row];
            
            return (
              <View
                key={player.number}
                style={[
                  styles.playerDot,
                  { top: `${top}%`, left: `${position.left}%` }
                ]}
              >
                <View style={styles.playerCircle}>
                  <Text style={styles.playerNumber}>{player.number}</Text>
                </View>
                <Text style={styles.playerName}>{player.name}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ============================================
  // LOADING & ERROR STATES
  // ============================================
  
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={styles.loadingText}>Loading match data...</Text>
      </View>
    );
  }

  if (error || !matchData) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle" size={64} color="#FF3B30" />
        <Text style={styles.errorText}>{error || 'Match data unavailable'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.matchInfo}>
          <Text style={styles.league}>{matchData.league}</Text>
          <View style={styles.scoreContainer}>
            <Text style={styles.teamName}>{matchData.home}</Text>
            <View style={styles.score}>
              <Text style={styles.scoreText}>{matchData.homeScore}</Text>
              <Text style={styles.scoreSeparator}>-</Text>
              <Text style={styles.scoreText}>{matchData.awayScore}</Text>
            </View>
            <Text style={styles.teamName}>{matchData.away}</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{matchData.minute}</Text>
          </View>
        </View>
        
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Play-by-Play
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
          onPress={() => setActiveTab('stats')}
        >
          <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
            Stats
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'facts' && styles.tabActive]}
          onPress={() => setActiveTab('facts')}
        >
          <Text style={[styles.tabText, activeTab === 'facts' && styles.tabTextActive]}>
            Match Facts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'lineups' && styles.tabActive]}
          onPress={() => setActiveTab('lineups')}
        >
          <Text style={[styles.tabText, activeTab === 'lineups' && styles.tabTextActive]}>
            Lineups
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'chat' && (
        <View style={styles.playByPlayContainer}>
          <FlatList
            ref={playByPlayListRef}
            data={playByPlayEvents}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PlayByPlayRow event={item} matchData={matchData} />
            )}
            ListHeaderComponent={
              <LiveStatsHeader
                matchData={matchData}
                stats={stats}
                latestMinute={latestMinute}
                isLive={isLive}
              />
            }
            stickyHeaderIndices={[0]}
            contentContainerStyle={styles.playByPlayList}
            showsVerticalScrollIndicator={false}
            onScroll={handlePlayByPlayScroll}
            scrollEventThrottle={16}
            initialNumToRender={12}
            windowSize={6}
            removeClippedSubviews
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListEmptyComponent={
              <View style={styles.centerContent}>
                <Text style={styles.emptyText}>No match events yet</Text>
              </View>
            }
          />
          {showJumpToLive && <JumpToLiveButton onPress={scrollToLive} />}
        </View>
      )}

      {activeTab === 'stats' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {stats ? (
            <View style={styles.statsContainer}>
              <Text style={styles.sectionTitle}>Match Statistics</Text>
              {renderStat('Possession', stats.possession.home, stats.possession.away)}
              {renderStat('Shots', stats.shots.home, stats.shots.away)}
              {renderStat('Shots on Target', stats.shotsOnTarget.home, stats.shotsOnTarget.away)}
              {renderStat('Corners', stats.corners.home, stats.corners.away)}
              {renderStat('Fouls', stats.fouls.home, stats.fouls.away)}
              {renderStat('Offsides', stats.offsides.home, stats.offsides.away)}
              {renderStat('Yellow Cards', stats.yellowCards.home, stats.yellowCards.away)}
              {renderStat('Red Cards', stats.redCards.home, stats.redCards.away)}
            </View>
          ) : (
            <View style={styles.centerContent}>
              <ActivityIndicator color="#0066CC" />
              <Text style={styles.loadingText}>Loading statistics...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === 'facts' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {playByPlayEvents.length > 0 ? (
            <View style={styles.eventsContainer}>
              <Text style={styles.sectionTitle}>Match Events</Text>
              {playByPlayEvents.map(event => (
                <PlayByPlayRow key={event.id} event={event} matchData={matchData} />
              ))}
            </View>
          ) : (
            <View style={styles.centerContent}>
              <Text style={styles.emptyText}>No events yet</Text>
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === 'lineups' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {renderLineup('home')}
          <View style={{ height: 30 }} />
          {renderLineup('away')}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#2C2C2E',
  },
  matchInfo: {
    flex: 1,
    alignItems: 'center',
  },
  league: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  scoreSeparator: {
    fontSize: 20,
    fontWeight: '800',
    color: '#666',
    marginHorizontal: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3E',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0066CC',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#0066CC',
  },
  tabContent: {
    flex: 1,
  },
  
  // Play-by-play styles
  playByPlayContainer: {
    flex: 1,
  },
  playByPlayList: {
    paddingBottom: 80,
  },
  liveStatsHeader: {
    backgroundColor: '#1F1F21',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2F2F31',
  },
  liveStatsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveStatsTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFF',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  livePillMinute: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  liveStatsTeamsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  liveStatsTeam: {
    alignItems: 'center',
    gap: 4,
  },
  teamLogo: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  teamBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  teamLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  liveStatsRows: {
    gap: 8,
  },
  liveStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveStatsValue: {
    width: 60,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  liveStatsLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#A0A0A0',
  },
  playByPlayRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
  },
  goalRow: {
    backgroundColor: 'rgba(47, 128, 237, 0.12)',
  },
  minuteBadge: {
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
  },
  minuteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  eventIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  eventContent: {
    flex: 1,
    gap: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  teamIndicatorText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  eventDescription: {
    fontSize: 12,
    color: '#C7C7CC',
    lineHeight: 16,
  },
  scorelineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  jumpToLiveButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0066CC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  jumpToLiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  
  // Stats styles
  statsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    width: 40,
    textAlign: 'center',
  },
  statCenter: {
    flex: 1,
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  statBar: {
    height: 8,
    backgroundColor: '#3C3C3E',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statBarHome: {
    backgroundColor: '#0066CC',
  },
  statBarAway: {
    backgroundColor: '#FF3B30',
  },
  
  // Events styles
  eventsContainer: {
    padding: 16,
    gap: 12,
  },
  
  // Lineup styles
  lineupContainer: {
    padding: 20,
  },
  lineupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  lineupTeamName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  formationBadge: {
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  formationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
  },
  pitch: {
    height: 500,
    backgroundColor: '#1A5C3A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    position: 'relative',
    overflow: 'hidden',
  },
  pitchCenter: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  pitchCenterCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    transform: [{ translateX: -40 }, { translateY: -40 }],
  },
  playerDot: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  playerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0066CC',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  playerNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  playerName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
