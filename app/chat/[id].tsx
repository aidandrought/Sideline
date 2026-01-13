import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ChatMessage, chatService } from '../../services/chatService';
import { footballAPI, Lineup, Match, MatchEvent, Player } from '../../services/footballApi';

const AVAILABLE_EMOJIS = ['❤️', '😂', '🔥', '👍', '👎', '⚽', '😢'];

export default function ChatRoom() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { userProfile } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTapTimeRef = useRef<{ [key: string]: number }>({});

  const [activeTab, setActiveTab] = useState('CHAT');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineup, setLineup] = useState<{ home: Lineup; away: Lineup } | null>(null);

  const formatGameTime = (matchMinute?: number) => {
  if (!matchMinute) return '';
  const minutes = Math.floor(matchMinute);
  const seconds = Math.floor((matchMinute - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};


  useEffect(() => {
    loadMatchData();
    const unsubscribe = chatService.subscribeToChat(id as string, setMessages);
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const loadMatchData = async () => {
    try {
      const liveMatches = await footballAPI.getLiveMatches();
      const foundMatch = liveMatches.find(m => m.id.toString() === id);
      if (foundMatch) {
        setMatch(foundMatch);
        const [eventsData, lineupData] = await Promise.all([
          footballAPI.getMatchEvents(foundMatch.id),
          footballAPI.getMatchLineup(foundMatch.id)
        ]);
        setEvents(eventsData);
        setLineup(lineupData);
      }
    } catch (error) {
      console.error('Error loading match data:', error);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !userProfile) return;

    try {
      const newMessage = await chatService.sendMessage(
        id as string,
        userProfile.uid,
        userProfile.username,
        message,
        replyingTo ? {
          messageId: replyingTo.id,
          username: replyingTo.username,
          text: replyingTo.text
        } : undefined
      );

      // Update local state immediately
      setMessages(prev => [...prev, newMessage]);
      setMessage('');
      setReplyingTo(null);

      // Auto-scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleLongPress = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setSelectedMessage(msg);
    setShowEmojiPicker(true);
  };

  const handleDoubleTap = async (msg: ChatMessage) => {
  if (!msg || !userProfile) return;

  const emoji = '❤️'; // the emoji you toggle on double-tap
  const oldReaction = msg.reactions[emoji] || { count: 0, users: [] };
  const hasReacted = oldReaction.users.includes(userProfile.uid);

  const newUsers = hasReacted
    ? oldReaction.users.filter(u => u !== userProfile.uid)
    : [...oldReaction.users, userProfile.uid];

  const newCount = newUsers.length;

  const newReactions = { ...msg.reactions };
  if (newCount === 0) {
    delete newReactions[emoji]; // remove if count goes to 0
  } else {
    newReactions[emoji] = { count: newCount, users: newUsers };
  }

  // Update local state immediately
  setMessages(prev =>
    prev.map(m => (m.id === msg.id ? { ...m, reactions: newReactions } : m))
  );

  // Optional: call your service to persist (simulate backend)
  await chatService.toggleReaction(id as string, msg.id, emoji, userProfile.uid);
};
  const handleMessagePress = (msg: ChatMessage) => {
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[msg.id] || 0;
    
    if (now - lastTap < 300) {
      handleDoubleTap(msg);
    }
    lastTapTimeRef.current[msg.id] = now;
  };

  const addReaction = async (emoji: string) => {
  if (!selectedMessage || !userProfile) return;

  await chatService.toggleReaction(
    id as string,
    selectedMessage.id,
    emoji,
    userProfile.uid
  );

  setMessages(prev =>
    prev.map(msg => {
      if (msg.id === selectedMessage.id) {
        const oldReaction = msg.reactions[emoji] || { count: 0, users: [] };
        const hasReacted = oldReaction.users.includes(userProfile.uid);

        const newUsers = hasReacted
          ? oldReaction.users.filter(u => u !== userProfile.uid)
          : [...oldReaction.users, userProfile.uid];

        const newCount = newUsers.length;

        const newReactions = { ...msg.reactions };
        if (newCount === 0) {
          delete newReactions[emoji]; // Remove if 0
        } else {
          newReactions[emoji] = { count: newCount, users: newUsers };
        }

        return { ...msg, reactions: newReactions };
      }
      return msg;
    })
  );

  setShowEmojiPicker(false);
  setSelectedMessage(null);
};

  const renderChat = () => (
    <View style={styles.chatContainer}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesList}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <View key={msg.id} style={styles.systemMessage}>
                <Ionicons name="football" size={20} color="#FFD60A" />
                <Text style={styles.systemText}>{msg.text}</Text>
              </View>
            );
          }

          const isCurrentUser = msg.userId === userProfile?.uid;

          return (
            <TouchableOpacity
              key={msg.id}
              style={[
                styles.messageContainer,
                isCurrentUser && styles.currentUserMessageContainer
              ]}
              onLongPress={() => handleLongPress(msg)}
              onPress={() => handleMessagePress(msg)}
            >
              <View style={[
                styles.messageWrapper,
                isCurrentUser && styles.currentUserMessageWrapper
              ]}>
                {!isCurrentUser && (
                  <Text style={styles.username}>{msg.username}</Text>
                )}

                {msg.replyTo && (
                  <View style={styles.replyContext}>
                    <Text style={styles.replyContextUser}>{msg.replyTo.username}</Text>
                    <Text style={styles.replyContextText} numberOfLines={1}>
                      {msg.replyTo.text}
                    </Text>
                  </View>
                )}

                <View style={[
                  styles.messageBubble,
                  isCurrentUser && styles.currentUserBubble
                ]}>
                  <Text style={styles.messageText}>{msg.text}</Text>
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <View style={styles.reactions}>
                 {Object.entries(msg.reactions || {}).map(([emoji, data]) => {
                const reactedByMe = data.users.includes(userProfile?.uid || '');
          return (
        <View
      key={emoji}
      style={[
        styles.reaction,
        reactedByMe && { backgroundColor: '#5E5CE6' }, // highlight your emoji
      ]}
    >
      <Text style={styles.reactionEmoji}>{emoji}</Text>
      <Text style={styles.reactionCount}>{data.count}</Text>
    </View>
  );
})}

                    </View>
                  )}
                </View>

                <View style={[
                  styles.messageFooter,
                  isCurrentUser && styles.currentUserFooter
                ]}>
                    <Text style={styles.timestamp}>
  {formatGameTime(match?.minute ? Number(match.minute) : undefined)}
</Text>

                  {!isCurrentUser && (
                    <TouchableOpacity onPress={() => setReplyingTo(msg)}>
                      <Text style={styles.replyButton}>Reply</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Reply Preview */}
      {replyingTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>Replying to {replyingTo.username}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Ionicons name="close-circle" size={24} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.input}
          placeholder="Send a message"
          placeholderTextColor="#666"
          value={message}
          onChangeText={setMessage}
        />
        <TouchableOpacity
          style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPicker}>
            {AVAILABLE_EMOJIS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => addReaction(emoji)}
              >
                <Text style={styles.emojiButtonText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  const renderStats = () => (
    <ScrollView style={styles.statsContainer} showsVerticalScrollIndicator={false}>
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="stats-chart-outline" size={48} color="#E5E7EB" />
          <Text style={styles.emptyStateText}>No events yet</Text>
        </View>
      ) : (
        events.map((event, index) => (
          <View key={index} style={styles.statItem}>
            <Ionicons
              name={
                event.type === 'goal' ? 'football' :
                event.type === 'card' ? 'warning' :
                'swap-horizontal'
              }
              size={24}
              color="#FFD60A"
            />
            <Text style={styles.statText}>
              {event.time}' - {event.type === 'goal' ? 'Goal' : event.type === 'card' ? event.detail : 'Substitution'} by {event.player}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderLineup = () => {
    if (!lineup || !lineup.home || !lineup.away) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#E5E7EB" />
          <Text style={styles.emptyStateText}>Lineups not available</Text>
        </View>
      );
    }

    const formatPlayers = (players: Player[], formation: string) => {
      const lines = formation.split('-').map(Number);
      const goalkeeper = players.slice(0, 1);
      const defenders = players.slice(1, 1 + lines[0]);
      const midfielders = players.slice(1 + lines[0], 1 + lines[0] + lines[1]);
      const forwards = players.slice(1 + lines[0] + lines[1]);
      return { goalkeeper, defenders, midfielders, forwards };
    };

    const renderPlayerLine = (players: Player[], title?: string) => (
      <View style={styles.playerLine}>
        {title && <Text style={styles.lineTitle}>{title}</Text>}
        <View style={styles.playersRow}>
          {players.map((player, index) => (
            <View key={index} style={styles.player}>
              <View style={styles.playerCircle}>
                <Text style={styles.playerNumber}>{player.number}</Text>
              </View>
              <Text style={styles.playerName}>{player.name}</Text>
            </View>
          ))}
        </View>
      </View>
    );

    const renderTeamLineup = (team: Lineup) => {
      const { goalkeeper, defenders, midfielders, forwards } = formatPlayers(
        team.startXI,
        team.formation
      );

      return (
        <View style={styles.teamLineup}>
          <Text style={styles.teamName}>{team.team} - {team.formation}</Text>
          <View style={styles.pitch}>
            {renderPlayerLine(forwards, 'Attack')}
            {renderPlayerLine(midfielders, 'Midfield')}
            {renderPlayerLine(defenders, 'Defense')}
            {renderPlayerLine(goalkeeper, 'Goalkeeper')}
          </View>

          {team.substitutes && team.substitutes.length > 0 && (
            <View style={styles.subsSection}>
              <Text style={styles.subsTitle}>Substitutes</Text>
              <View style={styles.subsList}>
                {team.substitutes.map((player, index) => (
                  <View key={index} style={styles.sub}>
                    <Text style={styles.subNumber}>{player.number}</Text>
                    <Text style={styles.subName}>{player.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={styles.lineupContainer} showsVerticalScrollIndicator={false}>
        {renderTeamLineup(lineup.home)}
        <View style={styles.lineupDivider} />
        {renderTeamLineup(lineup.away)}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.matchInfo}>
          <Text style={styles.matchTitle}>
  {match ? `${match.home} ${match.score} ${match.away}` : 'Loading…'}
</Text>
{match?.minute && (
  <Text style={styles.matchMinute}>
    LIVE • {Math.floor(Number(match.minute))}'
  </Text>
)}

        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'CHAT' && styles.activeTab]}
          onPress={() => setActiveTab('CHAT')}
        >
          <Text style={[styles.tabText, activeTab === 'CHAT' && styles.activeTabText]}>CHAT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'STATS' && styles.activeTab]}
          onPress={() => setActiveTab('STATS')}
        >
          <Text style={[styles.tabText, activeTab === 'STATS' && styles.activeTabText]}>STATS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'LINEUP' && styles.activeTab]}
          onPress={() => setActiveTab('LINEUP')}
        >
          <Text style={[styles.tabText, activeTab === 'LINEUP' && styles.activeTabText]}>LINEUP</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'CHAT' && renderChat()}
      {activeTab === 'STATS' && renderStats()}
      {activeTab === 'LINEUP' && renderLineup()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#1C1C1E',
  },
  matchInfo: {
    alignItems: 'center',
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  matchMinute: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#5E5CE6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#FFF',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  messageContainer: {
    marginBottom: 20,
    alignItems: 'flex-start',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  replyContext: {
    backgroundColor: '#2C2C2E',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#5E5CE6',
  },
  replyContextUser: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5E5CE6',
    marginBottom: 2,
  },
  replyContextText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  messageBubble: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 12,
  },
  currentUserBubble: {
    backgroundColor: '#5E5CE6',
  },
  messageText: {
    fontSize: 16,
    color: '#FFF',
  },
  reactions: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 10,
  },
  currentUserFooter: {
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  replyButton: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5E5CE6',
  },
  systemMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  systemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD60A',
    flex: 1,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  replyContent: {
    flex: 1,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5E5CE6',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1C1C1E',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFF',
  },
  sendButton: {
    backgroundColor: '#5E5CE6',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiPicker: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 15,
    gap: 15,
  },
  emojiButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 25,
  },
  emojiButtonText: {
    fontSize: 28,
  },
  statsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    gap: 12,
  },
  statText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },
  lineupContainer: {
    flex: 1,
    paddingTop: 20,
  },
  teamLineup: {
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  teamName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  pitch: {
    backgroundColor: '#2C5E1A',
    borderRadius: 16,
    padding: 20,
  },
  lineupDivider: {
    height: 2,
    backgroundColor: '#2C2C2E',
    marginVertical: 30,
    marginHorizontal: 20,
  },
  playerLine: {
    marginBottom: 20,
  },
  lineTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD60A',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  playersRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    flexWrap: 'wrap',
    gap: 10,
  },
  player: {
    alignItems: 'center',
  },
  playerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  playerNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  playerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  subsSection: {
    marginTop: 20,
  },
  subsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 10,
  },
  subsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sub: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD60A',
    marginRight: 8,
  },
  subName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 15,
  },
});