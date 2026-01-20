// app/chat/demo.tsx
// DEMO MATCH ONLY - Liverpool vs Arsenal
// This is ONLY for testing/demo purposes
// Real matches use chat/[id].tsx

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
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

type TabType = 'chat' | 'stats' | 'facts' | 'lineups';

interface Message {
  id: string;
  text: string;
  username: string;
  userId: string;
  matchMinute: number;
  reactions: Record<string, { count: number; userIds: string[] }>;
  replyTo?: string;
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
    row: number; // 0=GK, 1=def, 2=mid, 3=fw (matches your live renderer)
  }>;
}

const DEMO_EVENTS: Event[] = [
  { minute: 1, type: 'period', team: 'home', player: '', text: "Kickoff" },
  { minute: 12, type: 'yellow', team: 'away', player: 'Declan Rice', text: "🟨 Rice booked for a late challenge" },
  { minute: 23, type: 'goal', team: 'home', player: 'Salah', text: "⚽ GOAL! Salah finishes low to the corner (1-0)" },
  { minute: 45, type: 'period', team: 'home', player: '', text: "Half-time" },
  { minute: 53, type: 'goal', team: 'away', player: 'Saka', text: "⚽ GOAL! Saka equalizes with a curler (1-1)" },
  { minute: 58, type: 'goal', team: 'home', player: 'Salah', text: "⚽ GOAL! Salah again! Liverpool back in front (2-1)" },
  { minute: 61, type: 'substitution', team: 'home', player: 'Núñez', text: "🔁 Sub: Núñez ↔ Gakpo" },
  { minute: 64, type: 'yellow', team: 'away', player: 'Gabriel', text: "🟨 Gabriel booked" },
];

const DEMO_LINEUPS: { home: Lineup; away: Lineup } = {
  home: {
    formation: '4-3-3',
    players: [
      { number: 1, name: 'Alisson', position: 'GK', row: 0 },
      { number: 66, name: 'TAA', position: 'RB', row: 1 },
      { number: 4, name: 'Van Dijk', position: 'CB', row: 1 },
      { number: 5, name: 'Konaté', position: 'CB', row: 1 },
      { number: 26, name: 'Robertson', position: 'LB', row: 1 },
      { number: 8, name: 'Szoboszlai', position: 'CM', row: 2 },
      { number: 3, name: 'Mac Allister', position: 'CM', row: 2 },
      { number: 10, name: 'Gravenberch', position: 'CM', row: 2 },
      { number: 11, name: 'Salah', position: 'RW', row: 3 },
      { number: 18, name: 'Gakpo', position: 'ST', row: 3 },
      { number: 7, name: 'Diaz', position: 'LW', row: 3 },
    ],
  },
  away: {
    formation: '4-3-3',
    players: [
      { number: 22, name: 'Raya', position: 'GK', row: 0 },
      { number: 4, name: 'White', position: 'RB', row: 1 },
      { number: 2, name: 'Saliba', position: 'CB', row: 1 },
      { number: 6, name: 'Gabriel', position: 'CB', row: 1 },
      { number: 35, name: 'Zinchenko', position: 'LB', row: 1 },
      { number: 8, name: 'Ødegaard', position: 'CM', row: 2 },
      { number: 41, name: 'Rice', position: 'DM', row: 2 },
      { number: 29, name: 'Havertz', position: 'CM', row: 2 },
      { number: 7, name: 'Saka', position: 'RW', row: 3 },
      { number: 9, name: 'Jesus', position: 'ST', row: 3 },
      { number: 11, name: 'Martinelli', position: 'LW', row: 3 },
    ],
  },
};


// DEMO HARDCODED DATA - Only for this demo screen
const DEMO_MATCH = {
  id: 'demo_999999',
  league: 'Premier League (DEMO)',
  home: 'Liverpool',
  away: 'Arsenal',
  homeScore: 2,
  awayScore: 1,
  minute: "67' LIVE",
};

const DEMO_MESSAGES: Message[] = [
  { 
    id: '1', 
    text: 'What a goal by Salah! 🔥', 
    username: 'LiverpoolFan', 
    userId: 'user1', 
    matchMinute: 58, 
    reactions: { 
      '🔥': { count: 5, userIds: ['user2', 'user3', 'user4', 'user5', 'user6'] },
      '❤️': { count: 3, userIds: ['user7', 'user8', 'user9'] }
    }
  },
  // ... other demo messages
];

const DEMO_STATS = {
  possession: { home: 58, away: 42 },
  shots: { home: 15, away: 12 },
  shotsOnTarget: { home: 7, away: 4 },
  corners: { home: 6, away: 3 },
  fouls: { home: 8, away: 11 },
  offsides: { home: 2, away: 1 },
  yellowCards: { home: 1, away: 2 },
  redCards: { home: 0, away: 0 },
};

export default function DemoMatch() {
  const [events] = useState<Event[]>(DEMO_EVENTS);
  const [lineups] = useState<{ home: Lineup; away: Lineup }>({
    home: DEMO_LINEUPS.home,
    away: DEMO_LINEUPS.away,
  });
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<string | null>(null);
  const [currentMatchMinute] = useState(67);
  
  const flatListRef = useRef<FlatList>(null);
  const lastTapRef = useRef<{ [key: string]: number }>({});
  const replyAnimValue = useRef(new Animated.Value(0)).current;

  const EMOJI_REACTIONS = ['❤️', '🔥', '😂', '😢', '👎', '👏', '🎉'];

  useEffect(() => {
    Animated.timing(replyAnimValue, {
      toValue: replyTo ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [replyTo]);

  const sendMessage = () => {
    if (!messageText.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      username: userProfile?.username || 'Guest',
      userId: userProfile?.uid || 'guest',
      matchMinute: currentMatchMinute,
      reactions: {},
      replyTo: replyTo || undefined,
    };

    setMessages(prev => [...prev, newMessage]);
    setMessageText('');
    setReplyTo(null);
  };

  const handleDoubleTap = (messageId: string) => {
    const currentUserId = userProfile?.uid || 'guest';
    
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions };
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
        
        return { ...msg, reactions };
      }
      return msg;
    }));
  };

  const handleAddReaction = (messageId: string, emoji: string) => {
    const currentUserId = userProfile?.uid || 'guest';
    
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions };
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
        
        return { ...msg, reactions };
      }
      return msg;
    }));
    
    setShowContextMenu(null);
  };

  const handleReply = (message: Message) => {
    setReplyTo(message.id);
    setShowContextMenu(null);
  };

  const getReplyToMessage = (replyToId: string | undefined): Message | null => {
    if (!replyToId) return null;
    return messages.find(m => m.id === replyToId) || null;
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

const renderLineupsSimple = (team: 'home' | 'away') => {
  const lineup = team === 'home' ? lineups.home : lineups.away;
  const teamName = team === 'home' ? DEMO_MATCH.home : DEMO_MATCH.away;

  // Group by row (GK/DEF/MID/FWD)
  const groups = [
    { label: 'GK', row: 0 },
    { label: 'DEF', row: 1 },
    { label: 'MID', row: 2 },
    { label: 'FWD', row: 3 },
  ];

  return (
    <View style={styles.lineupsBlock}>
      <View style={styles.lineupsHeaderRow}>
        <Text style={styles.lineupsTeamName}>{teamName}</Text>
        <Text style={styles.lineupsFormation}>{lineup.formation}</Text>
      </View>

      {groups.map(g => {
        const players = lineup.players.filter(p => p.row === g.row);
        return (
          <View key={g.label} style={styles.lineupsGroup}>
            <Text style={styles.lineupsGroupLabel}>{g.label}</Text>
            {players.map(p => (
              <View key={p.number} style={styles.lineupsPlayerRow}>
                <Text style={styles.lineupsNumber}>{p.number}</Text>
                <Text style={styles.lineupsName}>{p.name}</Text>
                <Text style={styles.lineupsPos}>{p.position}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
};

  return (
    <View style={styles.container}>
      {/* Header with DEMO badge */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.matchInfo}>
          <View style={styles.demoBadge}>
            <Text style={styles.demoText}>DEMO</Text>
          </View>
          <Text style={styles.league}>{DEMO_MATCH.league}</Text>
          <View style={styles.scoreContainer}>
            <Text style={styles.teamName}>{DEMO_MATCH.home}</Text>
            <View style={styles.score}>
              <Text style={styles.scoreText}>{DEMO_MATCH.homeScore}</Text>
              <Text style={styles.scoreSeparator}>-</Text>
              <Text style={styles.scoreText}>{DEMO_MATCH.awayScore}</Text>
            </View>
            <Text style={styles.teamName}>{DEMO_MATCH.away}</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{DEMO_MATCH.minute}</Text>
          </View>
        </View>
        
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
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
    style={[styles.tab, activeTab === 'facts' && styles.tabActive]}
    onPress={() => setActiveTab('facts')}
  >
    <Text style={[styles.tabText, activeTab === 'facts' && styles.tabTextActive]}>
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
    style={[styles.tab, activeTab === 'lineups' && styles.tabActive]}
    onPress={() => setActiveTab('lineups')}
  >
    <Text style={[styles.tabText, activeTab === 'lineups' && styles.tabTextActive]}>
      Lineups
    </Text>
  </TouchableOpacity>
</View>



      {/* Chat Tab */}
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
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Match Statistics (DEMO)</Text>
            {renderStat('Possession', DEMO_STATS.possession.home, DEMO_STATS.possession.away)}
            {renderStat('Shots', DEMO_STATS.shots.home, DEMO_STATS.shots.away)}
            {renderStat('Shots on Target', DEMO_STATS.shotsOnTarget.home, DEMO_STATS.shotsOnTarget.away)}
            {renderStat('Corners', DEMO_STATS.corners.home, DEMO_STATS.corners.away)}
            {renderStat('Fouls', DEMO_STATS.fouls.home, DEMO_STATS.fouls.away)}
            {renderStat('Offsides', DEMO_STATS.offsides.home, DEMO_STATS.offsides.away)}
            {renderStat('Yellow Cards', DEMO_STATS.yellowCards.home, DEMO_STATS.yellowCards.away)}
            {renderStat('Red Cards', DEMO_STATS.redCards.home, DEMO_STATS.redCards.away)}
          </View>
        </ScrollView>
      )}
      {activeTab === 'facts' && (
  <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
    <View style={styles.eventsContainer}>
      
      {events.map(renderEvent)}
    </View>
  </ScrollView>
)}

{activeTab === 'lineups' && (
  <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
    <View style={{ padding: 20 }}>
      {renderLineupsSimple('home')}
      <View style={{ height: 20 }} />
      {renderLineupsSimple('away')}
      <View style={{ height: 40 }} />
    </View>
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
  demoBadge: {
    backgroundColor: '#FFD60A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  demoText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
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
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 6,
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
  eventsContainer: {
  padding: 20,
},
eventCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#2C2C2E',
  padding: 12,
  borderRadius: 10,
  marginBottom: 10,
  gap: 12,
},
eventMinute: {
  fontSize: 14,
  fontWeight: '800',
  color: '#0066CC',
  width: 40,
},
eventText: {
  fontSize: 14,
  color: '#FFF',
  flex: 1,
},

lineupsBlock: {
  backgroundColor: '#2C2C2E',
  borderRadius: 12,
  padding: 14,
},
lineupsHeaderRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
},
lineupsTeamName: {
  fontSize: 16,
  fontWeight: '800',
  color: '#FFF',
},
lineupsFormation: {
  fontSize: 12,
  fontWeight: '800',
  color: '#0066CC',
},
lineupsGroup: {
  marginTop: 10,
},
lineupsGroupLabel: {
  fontSize: 12,
  fontWeight: '800',
  color: '#999',
  marginBottom: 6,
},
lineupsPlayerRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 6,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(255,255,255,0.06)',
},
lineupsNumber: {
  width: 34,
  fontSize: 12,
  fontWeight: '800',
  color: '#FFF',
},
lineupsName: {
  flex: 1,
  fontSize: 13,
  fontWeight: '700',
  color: '#FFF',
},
lineupsPos: {
  width: 44,
  textAlign: 'right',
  fontSize: 12,
  fontWeight: '700',
  color: '#999',
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
});