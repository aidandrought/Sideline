// app/chat/[id].tsx
// FINAL VERSION: Real Firebase Chat + Pitch Visualization + 3 Tabs
// âœ… Each match has isolated chat room
// âœ… Real-time Firebase chat with reactions
// âœ… Pitch visualization with player positions
// âœ… Horizontal substitutes list

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { shadow } from '../../components/styleUtils';
import { footballAPI } from '../../services/footballApi';
import { useAuth } from '../../context/AuthContext';
import { chatService, ChatMessage } from '../../services/chatService';
import { EMOJI_REACTIONS } from '../../services/chatReactions';

type TabType = 'chat' | 'facts' | 'lineups';

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
  shooter?: string;
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
  substitutes: Array<{
    number: number;
    name: string;
    position: string;
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
  const titles: Record<PlayByPlayEventType, string> = {
    GOAL: 'Goal',
    YELLOW_CARD: 'Yellow Card',
    RED_CARD: 'Red Card',
    SUBSTITUTION: 'Substitution',
    CORNER: 'Corner',
    SHOT_ON_TARGET: 'Shot on Target',
    SHOT_OFF_TARGET: 'Shot Off Target',
    BLOCKED_SHOT: 'Shot Blocked',
    SAVE: 'Save',
    OFFSIDE: 'Offside',
    FOUL: 'Foul',
    VAR: 'VAR',
    START_1H: 'Kickoff',
    HT: 'Half-time',
    START_2H: 'Second Half',
    FT: 'Full-time',
    SHOT: 'Shot',
  };
  return titles[type];
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
      const on = details.playerOn || 'Player';
      const off = details.playerOff || 'player';
      return `${on} replaces ${off} (${teamName})`;
    }
    case 'CORNER':
      return `Corner, ${teamName}.`;
    case 'SHOT_ON_TARGET': {
      const shooter = details.shooter || 'Shot';
      return `Shot on target by ${shooter} (${teamName})`;
    }
    case 'SHOT_OFF_TARGET': {
      const shooter = details.shooter || 'Shot';
      return `Shot off target by ${shooter} (${teamName})`;
    }
    case 'SAVE': {
      const keeper = details.goalkeeper || 'Goalkeeper';
      return `Save by ${keeper}`;
    }
    case 'YELLOW_CARD': {
      const player = details.player || 'Player';
      return `Yellow card to ${player} (${teamName})`;
    }
    case 'RED_CARD': {
      const player = details.player || 'Player';
      return `Red card to ${player} (${teamName})`;
    }
    case 'OFFSIDE':
      return `Offside, ${teamName}`;
    case 'FOUL': {
      const player = details.player || 'Player';
      return `Foul by ${player} (${teamName})`;
    }
    case 'VAR':
      return `VAR check: ${details.varDecision || 'decision pending'}`;
    case 'START_1H':
      return 'First half begins';
    case 'HT':
      return 'Half-time';
    case 'START_2H':
      return 'Second half begins';
    case 'FT':
      return 'Full-time';
    default:
      return event.title;
  }
};

const buildPlayByPlayEvents = (rawEvents: any[], matchData: MatchData): PlayByPlayEvent[] => {
  console.log('ðŸ“Š Building play-by-play from', rawEvents.length, 'raw events');
  
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

    // ENHANCED EVENT TYPE DETECTION - captures MORE events!
    const normalizedType = (() => {
      const type = event.type?.toLowerCase() || '';
      const detail = event.detail?.toLowerCase() || '';
      const comments = event.comments?.toLowerCase() || '';
      
      // Goals
      if (type === 'goal') return 'GOAL';
      
      // Cards
      if (type === 'card') {
        if (detail.includes('yellow')) return 'YELLOW_CARD';
        if (detail.includes('red')) return 'RED_CARD';
      }
      
      // Substitutions
      if (type === 'subst') return 'SUBSTITUTION';
      
      // VAR
      if (type === 'var' || detail.includes('var')) return 'VAR';
      
      // Saves and shots
      if (detail.includes('save') || comments.includes('save')) return 'SAVE';
      if (detail.includes('penalty saved')) return 'SAVE';
      if (detail.includes('blocked')) return 'BLOCKED_SHOT';
      if (detail.includes('on target') || detail.includes('on goal')) return 'SHOT_ON_TARGET';
      if (detail.includes('off target') || detail.includes('off goal')) return 'SHOT_OFF_TARGET';
      if (detail.includes('woodwork') || detail.includes('post') || detail.includes('bar')) return 'SHOT_OFF_TARGET';
      
      // Defensive events
      if (detail.includes('offside')) return 'OFFSIDE';
      if (detail.includes('foul')) return 'FOUL';
      if (detail.includes('corner')) return 'CORNER';
      
      // Period events
      if (detail.includes('kickoff') || detail.includes('kick off')) return 'START_1H';
      if (detail.includes('half-time') || detail.includes('halftime')) return 'HT';
      if (detail.includes('second half')) return 'START_2H';
      if (detail.includes('full-time') || detail.includes('fulltime')) return 'FT';
      
      // Default to SHOT for unclassified events
      console.log('âš ï¸ Unclassified event:', type, detail, comments);
      return 'SHOT';
    })();

    const details: PlayByPlayDetails = {
      player: event.player?.name,
      reason: event.detail,
      playerOn: event.type === 'subst' ? event.player?.name : undefined,
      playerOff: event.type === 'subst' ? event.assist?.name : undefined,
      scorer: event.type === 'Goal' ? event.player?.name : undefined,
      assist: event.type === 'Goal' ? event.assist?.name : undefined,
      shooter: normalizedType.includes('SHOT') ? event.player?.name : undefined,
      goalkeeper: normalizedType === 'SAVE' ? event.player?.name : undefined,
      playerFouled: normalizedType === 'FOUL' ? event.assist?.name : undefined,
      varDecision: event.type === 'Var' ? event.detail : undefined,
    };

    if (normalizedType === 'GOAL') {
      const scoringTeam = team;
      if (scoringTeam === 'home') homeScore += 1;
      if (scoringTeam === 'away') awayScore += 1;
      details.score_home = homeScore;
      details.score_away = awayScore;
    }

    const playByPlayEvent: PlayByPlayEvent = {
      id: event.id ? `${event.id}` : `${event.time?.elapsed || 0}-${index}`,
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
    
    console.log(`âœ… Event ${index + 1}:`, playByPlayEvent.minute + "'", normalizedType, playByPlayEvent.description);
    
    return playByPlayEvent;
  });
};

const PlayByPlayRow = ({ event, matchData }: { event: PlayByPlayEvent; matchData: MatchData }) => {
  const minuteLabel = event.extraMinute ? `${event.minute}+${event.extraMinute}'` : `${event.minute}'`;
  const teamName = getTeamName(event.team, matchData);
  const teamAbbr = getTeamAbbreviation(teamName);
  const teamColor = event.team ? TEAM_COLORS[event.team] : TEAM_COLORS.neutral;
  const isGoal = event.type === 'GOAL';

  const iconName = (() => {
    switch (event.type) {
      case 'GOAL': return 'football';
      case 'YELLOW_CARD': return 'warning';
      case 'RED_CARD': return 'close-circle';
      case 'SUBSTITUTION': return 'swap-horizontal';
      case 'CORNER': return 'flag';
      case 'SHOT_ON_TARGET': return 'flash';
      case 'SHOT_OFF_TARGET': return 'arrow-forward-circle';
      case 'SAVE': return 'hand-left';
      case 'OFFSIDE': return 'walk';
      case 'FOUL': return 'alert-circle';
      case 'VAR': return 'search';
      default: return 'radio-button-on';
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
      </View>
    </View>
  );
};

export default function LiveMatchChat() {
  const { id } = useLocalSearchParams();
  const { userProfile } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const panResponderRefs = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const chatRoomId = useMemo(() => {
    const fixtureId = Array.isArray(id) ? id[0] : id;
    return fixtureId ? `match:${fixtureId}` : 'match:unknown';
  }, [id]);
  
  // START WITH CHAT TAB
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  // Match data state
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [playByPlayEvents, setPlayByPlayEvents] = useState<PlayByPlayEvent[]>([]);
  const [lineups, setLineups] = useState<{ home: Lineup | null; away: Lineup | null }>({ home: null, away: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  
  // REAL FIREBASE CHAT STATE
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  const [currentMatchMinute, setCurrentMatchMinute] = useState(0);
  const playByPlayListRef = useRef<FlatList<PlayByPlayEvent>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLiveStatus = (statusShort?: string) => {
    const liveStates = new Set(['1H', '2H', 'ET', 'HT', 'LIVE']);
    return statusShort ? liveStates.has(statusShort) : false;
  };

  const mapStats = (statsResponse: any[]) => {
    if (!statsResponse || statsResponse.length < 2) return null;
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
      corners: { home: getStat(homeStats, 'Corner Kicks'), away: getStat(awayStats, 'Corner Kicks') },
      fouls: { home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls') },
      offsides: { home: getStat(homeStats, 'Offsides'), away: getStat(awayStats, 'Offsides') },
      yellowCards: { home: getStat(homeStats, 'Yellow Cards'), away: getStat(awayStats, 'Yellow Cards') },
      redCards: { home: getStat(homeStats, 'Red Cards'), away: getStat(awayStats, 'Red Cards') },
    } as Stats;
  };

  const mapLineups = (lineupsResponse: any[]) => {
    if (!lineupsResponse || lineupsResponse.length < 2) {
      return { home: null, away: null };
    }

    const transformLineup = (teamData: any): Lineup => {
      const mapGridToRow = (grid: string): number => {
        const [rowStr] = grid.split(':');
        return parseInt(rowStr) - 1;
      };

      return {
        formation: teamData.formation,
        players: teamData.startXI.map((p: any) => ({
          number: p.player.number,
          name: p.player.name.split(' ').pop() || p.player.name,
          position: p.player.pos,
          row: mapGridToRow(p.player.grid),
        })),
        substitutes: (teamData.substitutes || []).map((p: any) => ({
          number: p.player.number,
          name: p.player.name,
          position: p.player.pos,
        })),
      };
    };

    return {
      home: transformLineup(lineupsResponse[0]),
      away: transformLineup(lineupsResponse[1]),
    };
  };

  const fetchLiveData = async () => {
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

    console.log('ðŸ”„ Fetching live data for fixture:', fixtureId);
    setError(null);
    
    try {
      const liveData = await footballAPI.getFixtureLive(fixtureId);
      
      if (!liveData.fixture) {
        setError('Match not found');
        setLoading(false);
        return;
      }

      const fixture = liveData.fixture;
      const statusShort = fixture.fixture?.status?.short;
      const elapsed = fixture.fixture?.status?.elapsed || 0;

      const mappedMatch: MatchData = {
        id: fixture.fixture.id,
        league: fixture.league.name,
        home: fixture.teams.home.name,
        away: fixture.teams.away.name,
        homeScore: fixture.goals.home || 0,
        awayScore: fixture.goals.away || 0,
        minute: elapsed ? `${elapsed}'` : statusShort,
        status: fixture.fixture?.status?.long,
        homeTeamId: fixture.teams.home.id,
        awayTeamId: fixture.teams.away.id,
        homeLogo: fixture.teams.home.logo,
        awayLogo: fixture.teams.away.logo,
      };

      setMatchData(mappedMatch);
      setCurrentMatchMinute(elapsed);
      setStats(mapStats(liveData.statistics));
      setLineups(mapLineups(liveData.lineups));
      
      // LOG WHAT API RETURNS
      console.log('ðŸ“Š Raw events from API:', liveData.events.length);
      console.log('ðŸ“Š Event types:', liveData.events.map((e: any) => `${e.time?.elapsed}' ${e.type} - ${e.detail}`));
      
      setPlayByPlayEvents(
        liveData.events.length > 0 ? buildPlayByPlayEvents(liveData.events, mappedMatch) : []
      );
      setLastUpdatedAt(Date.now());
      setLoading(false);

      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      if (isLiveStatus(statusShort)) {
        pollRef.current = setInterval(() => {
          fetchLiveData();
        }, 15000);
      }
    } catch (err) {
      console.error('âŒ Error fetching live data:', err);
      setError('Failed to load match data');
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchLiveData();
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [id])
  );

  // REAL FIREBASE CHAT SUBSCRIPTION
  useEffect(() => {
    console.log('ðŸ”¥ Subscribing to Firebase chat:', chatRoomId);
    const unsubscribe = chatService.subscribeToChat(chatRoomId, (newMessages) => {
      console.log('ðŸ“¨ Chat messages updated:', newMessages.length);
      setMessages(newMessages);
    });
    return () => {
      console.log('ðŸ”¥ Unsubscribing from Firebase chat');
      unsubscribe();
    };
  }, [chatRoomId]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const closeContextMenu = () => {
    setShowEmojiPicker(false);
    setSelectedMessage(null);
  };

  const handleLongPress = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setSelectedMessage(msg);
    setShowEmojiPicker(true);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!userProfile) return;
    const currentUserId = userProfile.uid;

    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== messageId || msg.type === 'system') return msg;
        const reactions = { ...(msg.reactions || {}) };
        const existing = reactions[emoji];
        const reaction = existing
          ? { count: existing.count, userIds: [...existing.userIds] }
          : { count: 0, userIds: [] };
        const hasReacted = reaction.userIds.includes(currentUserId);

        if (hasReacted) {
          reaction.userIds = reaction.userIds.filter(id => id !== currentUserId);
          reaction.count = reaction.userIds.length;
          if (reaction.count === 0) {
            delete reactions[emoji];
          } else {
            reactions[emoji] = reaction;
          }
        } else {
          reaction.userIds.push(currentUserId);
          reaction.count = reaction.userIds.length;
          reactions[emoji] = reaction;
        }

        return { ...msg, reactions };
      })
    );

    await chatService.toggleReaction(chatRoomId, messageId, emoji, currentUserId);
    closeContextMenu();
  };

  const toggleHeart = async (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    await toggleReaction(msg.id, '❤️');
  };

  const handleReply = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setReplyingTo(msg);
    closeContextMenu();
  };

  const handleSwipeReply = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setReplyingTo(msg);
  };

  const getPanResponder = (msg: ChatMessage) => {
    if (!panResponderRefs.current[msg.id]) {
      panResponderRefs.current[msg.id] = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (msg.type === 'system') return false;
          const { dx, dy } = gesture;
          return dx > 10 && Math.abs(dx) > Math.abs(dy);
        },
        onPanResponderRelease: (_, gesture) => {
          const { dx, dy } = gesture;
          if (dx > 40 && Math.abs(dy) < 20) {
            handleSwipeReply(msg);
          }
        }
      });
    }
    return panResponderRefs.current[msg.id];
  };

  const handleSend = async () => {
    if (!messageText.trim() || !userProfile) return;
    try {
      await chatService.sendMessage(
        chatRoomId,
        userProfile.uid,
        userProfile.username,
        messageText,
        replyingTo
          ? {
              messageId: replyingTo.id,
              username: replyingTo.username,
              text: replyingTo.text
            }
          : undefined,
        currentMatchMinute // Pass current game minute (e.g., 67)
      );
      setMessageText('');
      setReplyingTo(null);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    }
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

  const renderMessage = (msg: ChatMessage) => {
    const isCurrentUser = msg.userId === userProfile?.uid;
    const isSystem = msg.type === 'system';
    const myUid = userProfile?.uid;
    const panResponder = getPanResponder(msg);

    if (isSystem) {
      return (
        <View key={msg.id} style={styles.systemMessage}>
          <Text style={styles.systemText}>{msg.text}</Text>
        </View>
      );
    }

    return (
      <View
        key={msg.id}
        style={[
          styles.messageContainer,
          isCurrentUser && styles.currentUserMessageContainer
        ]}
        {...panResponder.panHandlers}
      >
          <Pressable
            onLongPress={() => handleLongPress(msg)}
            delayLongPress={350}
            onPressIn={() => {
              const now = Date.now();
              const last = lastTapRef.current[msg.id] || 0;
              if (now - last < 300) {
                toggleHeart(msg);
                lastTapRef.current[msg.id] = 0;
              } else {
                lastTapRef.current[msg.id] = now;
              }
            }}
          >
            <View
              style={[
                styles.messageWrapper,
                isCurrentUser && styles.currentUserMessageWrapper
              ]}
            >
              {/* Username and Match Minute on same line */}
              {!isCurrentUser && (
                <View style={styles.messageHeader}>
                  <Text style={styles.username}>{msg.username}</Text>
                  {msg.matchMinute !== undefined && (
                    <Text style={styles.matchMinute}>{msg.matchMinute}'</Text>
                  )}
                </View>
              )}

              {/* Current user: show match minute on right */}
              {isCurrentUser && msg.matchMinute !== undefined && (
                <Text style={styles.matchMinuteRight}>{msg.matchMinute}'</Text>
              )}

              {msg.replyTo && (
                <View style={styles.replyContext}>
                  <Text style={styles.replyContextUser}>@{msg.replyTo.username}</Text>
                  <Text style={styles.replyContextText} numberOfLines={1}>
                    {msg.replyTo.text}
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.messageBubble,
                  isCurrentUser && styles.currentUserBubble,
                  { backgroundColor: isCurrentUser ? '#0066CC' : '#2C2C2E' }
                ]}
              >
                <Text style={styles.messageText}>{msg.text}</Text>
              </View>
            </View>
          </Pressable>

          {Object.keys(msg.reactions || {}).length > 0 && (
            <View style={styles.reactions}>
              {Object.entries(msg.reactions).map(([emoji, reaction]) => {
                const reactionUserIds = reaction.userIds || [];
                const hasReacted = !!myUid && reactionUserIds.includes(myUid);
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reaction, hasReacted && styles.reactionHighlighted]}
                    onPress={() => toggleReaction(msg.id, emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    <Text style={[styles.reactionCount, hasReacted && styles.reactionCountHighlighted]}>
                      {reaction.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {showEmojiPicker && selectedMessage?.id === msg.id && (
            <View
              style={[
                styles.contextMenu,
                isCurrentUser ? styles.contextMenuRight : styles.contextMenuLeft
              ]}
            >
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => handleReply(msg)}
              >
                <Ionicons name="arrow-undo" size={16} color="#FFF" />
                <Text style={styles.contextMenuText}>Reply</Text>
              </TouchableOpacity>

              <View style={styles.contextMenuDivider} />

              <View style={styles.contextMenuEmojis}>
                {EMOJI_REACTIONS.map((emoji) => {
                  const hasReacted = !!myUid && msg.reactions?.[emoji]?.userIds?.includes(myUid);
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[
                        styles.contextMenuEmojiButton,
                        hasReacted && styles.contextMenuEmojiButtonActive
                      ]}
                      onPress={() => toggleReaction(msg.id, emoji)}
                    >
                      <Text style={styles.contextMenuEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
    );
  };

  // PITCH VISUALIZATION (from yesterday's version)
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
    const rowCount = positions.length;
    const rowTops = positions.map((_, index) => {
      if (rowCount === 1) return 50;
      const start = 85;
      const end = 15;
      const step = (start - end) / (rowCount - 1);
      return start - step * index;
    });

    return (
      <View style={styles.lineupContainer}>
        <View style={styles.lineupHeader}>
          <Text style={styles.lineupTeamName}>{teamName}</Text>
          <View style={styles.formationBadge}>
            <Text style={styles.formationText}>{lineup.formation}</Text>
          </View>
        </View>
        
        {/* GREEN PITCH WITH PLAYERS */}
        <View style={styles.pitch}>
          <View style={styles.pitchCenter} />
          <View style={styles.pitchCenterCircle} />
          
          {lineup.players.map((player) => {
            const row = player.row;
            const positionsInRow = positions[row];
            const playerIndexInRow = lineup.players.filter(p => p.row === row).indexOf(player);
            const position = positionsInRow[playerIndexInRow];
            const top = rowTops[row] ?? 50;

            if (!position) {
              return null;
            }
            
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

        {/* HORIZONTAL SUBSTITUTES */}
        {lineup.substitutes?.length > 0 && (
          <View style={styles.substitutesSection}>
            <Text style={styles.substitutesTitle}>Substitutes</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.substitutesHorizontal}
            >
              {lineup.substitutes.map((sub) => (
                <View key={`${sub.number}-${sub.name}`} style={styles.substituteChip}>
                  <Text style={styles.substituteNumber}>{sub.number}</Text>
                  <Text style={styles.substituteName} numberOfLines={1}>{sub.name}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

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

      {/* 3 TABS: Chat, Match Facts, Lineups */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Chat
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

      {/* TAB 1: CHAT (Real Firebase) */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={closeContextMenu}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-ellipses" size={48} color="#8E8E93" />
                <Text style={styles.emptyChatTitle}>Be the first to chat</Text>
                <Text style={styles.emptyChatSubtitle}>Start the conversation for this match</Text>
              </View>
            ) : (
              messages.map(renderMessage)
            )}
          </ScrollView>

          {replyingTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewContent}>
                <Ionicons name="return-down-forward" size={16} color="#8E8E93" />
                <Text style={styles.replyPreviewUser}>Replying to {replyingTo.username}</Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyingTo.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close-circle" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor="#8E8E93"
              value={messageText}
              onChangeText={setMessageText}
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={!messageText.trim()}
            >
              <Ionicons
                name="send"
                size={20}
                color={messageText.trim() ? '#0066CC' : '#5A5A5E'}
              />
            </TouchableOpacity>
          </View>

        </KeyboardAvoidingView>
      )}

      {/* TAB 2: MATCH FACTS (Stats + Play-by-Play) */}
      {activeTab === 'facts' && (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
          {/* Stats Section */}
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Match Statistics</Text>
            {stats ? (
              <>
                {renderStat('Possession', stats.possession.home, stats.possession.away)}
                {renderStat('Shots', stats.shots.home, stats.shots.away)}
                {renderStat('Shots on Target', stats.shotsOnTarget.home, stats.shotsOnTarget.away)}
                {renderStat('Corners', stats.corners.home, stats.corners.away)}
                {renderStat('Fouls', stats.fouls.home, stats.fouls.away)}
                {renderStat('Offsides', stats.offsides.home, stats.offsides.away)}
                {renderStat('Yellow Cards', stats.yellowCards.home, stats.yellowCards.away)}
                {renderStat('Red Cards', stats.redCards.home, stats.redCards.away)}
              </>
            ) : (
              <View style={styles.centerContent}>
                <ActivityIndicator color="#0066CC" />
                <Text style={styles.loadingText}>Loading statistics...</Text>
              </View>
            )}
          </View>

          {/* Play-by-Play Section */}
          <View style={styles.playByPlaySection}>
            <Text style={styles.sectionTitle}>Play-by-Play</Text>
            {playByPlayEvents.length > 0 ? (
              playByPlayEvents.map((event) => (
                <PlayByPlayRow key={event.id} event={event} matchData={matchData} />
              ))
            ) : (
              <View style={styles.centerContent}>
                <Text style={styles.emptyText}>No match events yet</Text>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* TAB 3: LINEUPS (Pitch + Horizontal Subs) */}
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
  
  // Chat styles
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyChatSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  messageContainer: {
    marginBottom: 16,
    alignItems: 'flex-start',
    position: 'relative',
  },
  currentUserMessageContainer: {
    alignItems: 'flex-end',
  },
  messageWrapper: {
    maxWidth: '75%',
  },
  currentUserMessageWrapper: {
    alignItems: 'flex-end',
  },
  username: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  matchMinute: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
  },
  matchMinuteRight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  replyContext: {
    backgroundColor: '#2C2C2E',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#0066CC',
  },
  replyContextUser: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 2,
  },
  replyContextText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
  },
  currentUserBubble: {},
  messageText: {
    fontSize: 16,
    color: '#FFF',
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionHighlighted: {
    backgroundColor: 'rgba(0, 102, 204, 0.2)',
    borderColor: '#0066CC',
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  reactionCountHighlighted: {
    color: '#0066CC',
    fontWeight: '700',
  },
  contextMenu: {
    position: 'absolute',
    top: -78,
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 10,
    ...shadow({ y: 4, blur: 12, opacity: 0.3, elevation: 10 }),
    zIndex: 1000,
    minWidth: 200,
  },
  contextMenuLeft: {
    left: 0,
  },
  contextMenuRight: {
    right: 0,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  contextMenuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  contextMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 6,
  },
  contextMenuEmojis: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 4,
  },
  contextMenuEmojiButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  contextMenuEmojiButtonActive: {
    backgroundColor: 'rgba(0, 102, 204, 0.25)',
  },
  contextMenuEmoji: {
    fontSize: 20,
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginVertical: 8,
  },
  systemText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  replyPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  replyPreviewUser: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  replyPreviewText: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 30,
    backgroundColor: '#1C1C1E',
    gap: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFF',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Play-by-Play styles
  playByPlaySection: {
    padding: 20,
    paddingTop: 0,
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
  
  // Lineups styles (WITH PITCH)
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
    ...shadow({ y: 2, blur: 4, opacity: 0.3, elevation: 5 }),
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
  substitutesSection: {
    marginTop: 20,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 12,
  },
  substitutesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  substitutesHorizontal: {
    gap: 8,
    paddingVertical: 4,
  },
  substituteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  substituteNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066CC',
  },
  substituteName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    maxWidth: 100,
  },
});
