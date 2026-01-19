// app/chat/[id].tsx
// REAL LIVE MATCH - Fully Isolated by Match ID
// ✅ Each match has its own chat room
// ✅ Each match has its own stats
// ✅ NO hardcoded fallbacks for real matches
// ✅ Firebase scoped by matchId

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

type TabType = 'chat' | 'stats' | 'facts' | 'lineups';

interface Message {
  id: string;
  text: string;
  username: string;
  userId: string;
  matchMinute: number;
  reactions: Record<string, { count: number; userIds: string[] }>;
  replyTo?: string;
  timestamp: any;
}

interface MatchData {
  id: number;
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: string;
  status: string;
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

interface Event {
  minute: number;
  type: 'goal' | 'yellow' | 'red' | 'substitution' | 'period';
  team: 'home' | 'away';
  player: string;
  text: string;
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

export default function LiveMatchChat() {
  const { id } = useLocalSearchParams(); // Real match ID from API
  const { userProfile } = useAuth();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  // Match data state
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [lineups, setLineups] = useState<{ home: Lineup | null; away: Lineup | null }>({ home: null, away: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Chat state - scoped to THIS match only
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [currentMatchMinute, setCurrentMatchMinute] = useState(0);
  
  const flatListRef = useRef<FlatList>(null);
  const lastTapRef = useRef<{ [key: string]: number }>({});
  const replyAnimValue = useRef(new Animated.Value(0)).current;

  const EMOJI_REACTIONS = ['❤️', '🔥', '😂', '😢', '👎', '👏', '🎉'];

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
    fetchEvents();
    fetchLineups();
  }, [id]);

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

  const fetchEvents = async () => {
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
        const transformedEvents = data.response.map((event: any) => {
          const getEventType = (type: string, detail: string): Event['type'] => {
            if (type === 'Goal') return 'goal';
            if (type === 'Card' && detail === 'Yellow Card') return 'yellow';
            if (type === 'Card' && detail === 'Red Card') return 'red';
            if (type === 'subst') return 'substitution';
            return 'period';
          };
          
          return {
            minute: event.time.elapsed,
            type: getEventType(event.type, event.detail),
            team: event.team.id === matchData?.id ? 'home' : 'away',
            player: event.player.name,
            text: event.detail,
          };
        });
        
        setEvents(transformedEvents);
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
  // FIREBASE CHAT - SCOPED BY MATCH ID
  // ============================================
  
  useEffect(() => {
    if (!id) return;
    
    // Real-time listener for THIS match's messages only
    const messagesRef = collection(db, 'matches', id as string, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      
      setMessages(msgs);
    }, (error) => {
      console.error('Error listening to messages:', error);
    });
    
    return () => unsubscribe();
  }, [id]);

  // ============================================
  // CHAT INTERACTIONS
  // ============================================
  
  useEffect(() => {
    Animated.timing(replyAnimValue, {
      toValue: replyTo ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [replyTo]);

  const sendMessage = async () => {
    if (!messageText.trim() || !id) return;

    try {
      const messagesRef = collection(db, 'matches', id as string, 'messages');
      
      await addDoc(messagesRef, {
        text: messageText,
        username: userProfile?.username || 'Guest',
        userId: userProfile?.uid || 'guest',
        matchMinute: currentMatchMinute,
        timestamp: Timestamp.now(),
        reactions: {},
        replyTo: replyTo || null,
      });
      
      setMessageText('');
      setReplyTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleDoubleTap = async (messageId: string) => {
    if (!id) return;
    const currentUserId = userProfile?.uid || 'guest';
    
    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;
      
      const reactions = { ...message.reactions };
      const heartReaction = reactions['❤️'] || { count: 0, userIds: [] };
      
      if (heartReaction.userIds.includes(currentUserId)) {
        heartReaction.count--;
        heartReaction.userIds = heartReaction.userIds.filter(id => id !== currentUserId);
        
        if (heartReaction.count === 0) {
          delete reactions['❤️'];
        } else {
          reactions['❤️'] = heartReaction;
        }
      } else {
        heartReaction.count++;
        heartReaction.userIds.push(currentUserId);
        reactions['❤️'] = heartReaction;
      }
      
      const messageRef = doc(db, 'matches', id as string, 'messages', messageId);
      await updateDoc(messageRef, { reactions });
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!id) return;
    const currentUserId = userProfile?.uid || 'guest';
    
    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;
      
      const reactions = { ...message.reactions };
      const emojiReaction = reactions[emoji] || { count: 0, userIds: [] };
      
      if (emojiReaction.userIds.includes(currentUserId)) {
        emojiReaction.count--;
        emojiReaction.userIds = emojiReaction.userIds.filter(id => id !== currentUserId);
        
        if (emojiReaction.count === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = emojiReaction;
        }
      } else {
        emojiReaction.count++;
        emojiReaction.userIds.push(currentUserId);
        reactions[emoji] = emojiReaction;
      }
      
      const messageRef = doc(db, 'matches', id as string, 'messages', messageId);
      await updateDoc(messageRef, { reactions });
      
      setShowContextMenu(null);
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const handleReply = (message: Message) => {
    setReplyTo(message.id);
    setShowContextMenu(null);
  };

  const getReplyToMessage = (replyToId: string | undefined): Message | null => {
    if (!replyToId) return null;
    return messages.find(m => m.id === replyToId) || null;
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

  const renderEvent = (event: Event, index: number) => {
    const getEventIcon = () => {
      switch (event.type) {
        case 'goal': return 'football';
        case 'yellow': return 'warning';
        case 'red': return 'close-circle';
        case 'substitution': return 'swap-horizontal';
        default: return 'time';
      }
    };

    const getEventColor = () => {
      switch (event.type) {
        case 'goal': return '#34C759';
        case 'yellow': return '#FFD60A';
        case 'red': return '#FF3B30';
        case 'substitution': return '#0066CC';
        default: return '#666';
      }
    };

    return (
      <View key={index} style={styles.eventCard}>
        <Text style={styles.eventMinute}>{event.minute}'</Text>
        <Ionicons name={getEventIcon() as any} size={20} color={getEventColor()} />
        <Text style={styles.eventText}>{event.text}</Text>
      </View>
    );
  };

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
    <View style={styles.container}>
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
            Chat
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
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: Message }) => {
              const isCurrentUser = item.userId === (userProfile?.uid || 'guest');
              const replyToMsg = getReplyToMessage(item.replyTo);
              const currentUserId = userProfile?.uid || 'guest';
              
              return (
                <View style={[
                  styles.messageContainer,
                  isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
                ]}>
                  <Pressable
                    onLongPress={() => setShowContextMenu(item.id)}
                    delayLongPress={400}
                    onPressIn={() => {
                      const now = Date.now();
                      if (lastTapRef.current[item.id] && (now - lastTapRef.current[item.id]) < 300) {
                        handleDoubleTap(item.id);
                        delete lastTapRef.current[item.id];
                      } else {
                        lastTapRef.current[item.id] = now;
                      }
                    }}
                  >
                    <View style={[
                      styles.messageBubble,
                      isCurrentUser ? styles.messageBubbleRight : styles.messageBubbleLeft
                    ]}>
                      <View style={styles.messageHeader}>
                        {!isCurrentUser && (
                          <Text style={styles.bubbleUsername}>{item.username}</Text>
                        )}
                        <Text style={[
                          styles.matchMinute,
                          isCurrentUser && styles.matchMinuteRight
                        ]}>
                          {item.matchMinute}'
                        </Text>
                      </View>
                      
                      {replyToMsg && (
                        <View style={styles.replyIndicator}>
                          <Ionicons name="return-down-forward" size={10} color="#666" />
                          <Text style={styles.replyText} numberOfLines={1}>
                            @{replyToMsg.username}: {replyToMsg.text}
                          </Text>
                        </View>
                      )}
                      
                      <Text style={styles.bubbleText}>{item.text}</Text>
                    </View>
                  </Pressable>
                  
                  {Object.keys(item.reactions || {}).length > 0 && (
                    <View style={[
                      styles.reactionsRow,
                      isCurrentUser ? styles.reactionsRowRight : styles.reactionsRowLeft
                    ]}>
                      {Object.entries(item.reactions || {}).map(([emoji, data]: [string, { count: number; userIds: string[] }]) => {
                        const hasReacted = data.userIds.includes(currentUserId);
                        
                        return (
                          <TouchableOpacity
                            key={emoji}
                            style={[
                              styles.reactionBubble,
                              hasReacted && styles.reactionBubbleHighlighted
                            ]}
                            onPress={() => handleAddReaction(item.id, emoji)}
                          >
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                            <Text style={[
                              styles.reactionCount,
                              hasReacted && styles.reactionCountHighlighted
                            ]}>
                              {data.count}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  
                  {showContextMenu === item.id && (
                    <View style={[
                      styles.contextMenu,
                      isCurrentUser ? styles.contextMenuRight : styles.contextMenuLeft
                    ]}>
                      <TouchableOpacity
                        style={styles.contextMenuItem}
                        onPress={() => handleReply(item)}
                      >
                        <Ionicons name="arrow-undo" size={16} color="#FFF" />
                        <Text style={styles.contextMenuText}>Reply</Text>
                      </TouchableOpacity>
                      
                      <View style={styles.contextMenuDivider} />
                      
                      <View style={styles.contextMenuEmojis}>
                        {EMOJI_REACTIONS.map(emoji => {
                          const hasReacted = item.reactions[emoji]?.userIds.includes(currentUserId);
                          
                          return (
                            <TouchableOpacity
                              key={emoji}
                              style={[
                                styles.contextMenuEmojiButton,
                                hasReacted && styles.contextMenuEmojiButtonActive
                              ]}
                              onPress={() => handleAddReaction(item.id, emoji)}
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
            }}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => setShowContextMenu(null)}
          />

          <View style={styles.inputContainer}>
            {replyTo && (
              <Animated.View 
                style={[
                  styles.replyingTo,
                  {
                    opacity: replyAnimValue,
                    transform: [{
                      translateY: replyAnimValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      })
                    }]
                  }
                ]}
              >
                <View style={styles.replyingToContent}>
                  <Ionicons name="return-down-forward" size={14} color="#0066CC" />
                  <View style={styles.replyingToTextContainer}>
                    <Text style={styles.replyingToUsername}>
                      @{messages.find(m => m.id === replyTo)?.username}
                    </Text>
                    <Text style={styles.replyingToText} numberOfLines={1}>
                      {messages.find(m => m.id === replyTo)?.text}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Ionicons name="close" size={18} color="#666" />
                </TouchableOpacity>
              </Animated.View>
            )}
            
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Say something..."
                placeholderTextColor="#666"
                value={messageText}
                onChangeText={setMessageText}
                onSubmitEditing={sendMessage}
                multiline
                maxLength={300}
              />
              <TouchableOpacity 
                style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]} 
                onPress={sendMessage}
                disabled={!messageText.trim()}
              >
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
          {events.length > 0 ? (
            <View style={styles.eventsContainer}>
              <Text style={styles.sectionTitle}>Match Events</Text>
              {events.map(renderEvent)}
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
    </View>
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
  messagesList: {
    padding: 6,
    paddingBottom: 6,
  },
  messageContainer: {
    marginBottom: 4,
    maxWidth: '80%',
  },
  messageContainerLeft: {
    alignSelf: 'flex-start',
  },
  messageContainerRight: {
    alignSelf: 'flex-end',
  },
  messageBubble: {
    borderRadius: 14,
    padding: 6,
    paddingHorizontal: 10,
  },
  messageBubbleLeft: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageBubbleRight: {
    backgroundColor: '#0066CC',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  bubbleUsername: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0066CC',
    flex: 1,
  },
  matchMinute: {
    fontSize: 9,
    color: '#666',
    fontWeight: '500',
  },
  matchMinuteRight: {
    color: 'rgba(255,255,255,0.5)',
  },
  bubbleText: {
    fontSize: 13,
    color: '#FFF',
    lineHeight: 17,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  replyText: {
    fontSize: 10,
    color: '#666',
    fontStyle: 'italic',
    flex: 1,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 3,
  },
  reactionsRowLeft: {
    justifyContent: 'flex-start',
  },
  reactionsRowRight: {
    justifyContent: 'flex-end',
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionBubbleHighlighted: {
    backgroundColor: 'rgba(0, 102, 204, 0.25)',
    borderColor: '#0066CC',
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 10,
    color: '#CCC',
    fontWeight: '600',
  },
  reactionCountHighlighted: {
    color: '#0066CC',
    fontWeight: '700',
  },
  contextMenu: {
    position: 'absolute',
    top: -80,
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
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
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: '#2C2C2E',
    borderTopWidth: 1,
    borderTopColor: '#3C3C3E',
  },
  replyingTo: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    borderLeftColor: '#0066CC',
  },
  replyingToContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  replyingToTextContainer: {
    flex: 1,
  },
  replyingToUsername: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 2,
  },
  replyingToText: {
    fontSize: 11,
    color: '#999',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#3C3C3E',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
    maxHeight: 100,
    paddingVertical: 10,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#3C3C3E',
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
    padding: 20,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  eventMinute: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
    width: 40,
  },
  eventText: {
    fontSize: 14,
    color: '#FFF',
    flex: 1,
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