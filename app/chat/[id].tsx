// app/chat/[id].tsx
// Match chat screen - Each match has its own unique chat room

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ChatMessage, chatService } from '../../services/chatService';
import { footballAPI, Lineup, Match, MatchEvent } from '../../services/footballApi';
import { presenceService } from '../../services/presenceService';
import { SAMPLE_CHAT_MESSAGES, SAMPLE_LINEUPS, SAMPLE_LIVE_MATCH, SAMPLE_MATCH_EVENTS } from '../../services/testData';

const AVAILABLE_EMOJIS = ['❤️', '😂', '🔥', '👍', '👎', '⚽', '😢'];

export default function ChatRoom() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const matchId = id as string;
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
  const [activeUsers, setActiveUsers] = useState(0);

  useEffect(() => {
    loadMatchData();
    
    // Subscribe to match-specific chat room
    // The chat path is: chats/matches/{matchId}/messages
    const unsubscribeChat = chatService.subscribeToChat(matchId, setMessages, 'match');

    // Join presence for this specific match
    if (userProfile) {
      presenceService.joinChat(matchId, userProfile.uid, userProfile.username);
      
      // Subscribe to active users for this match
      const unsubscribePresence = presenceService.subscribeToActiveUsers(
        matchId,
        (count) => setActiveUsers(count)
      );

      return () => {
        unsubscribeChat();
        unsubscribePresence();
        presenceService.leaveChat(matchId, userProfile.uid);
      };
    }

    return unsubscribeChat;
  }, [matchId, userProfile]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const loadMatchData = async () => {
    try {
      // Check if this is the test match
      if (matchId === SAMPLE_LIVE_MATCH.id.toString()) {
        setMatch(SAMPLE_LIVE_MATCH);
        setEvents(SAMPLE_MATCH_EVENTS);
        setLineup(SAMPLE_LINEUPS);
        
        // Initialize with sample messages if chat is empty
        if (messages.length === 0) {
          setMessages(SAMPLE_CHAT_MESSAGES as ChatMessage[]);
        }
        return;
      }

      // Load real match data
      const liveMatches = await footballAPI.getLiveMatches();
      const foundMatch = liveMatches.find(m => m.id.toString() === matchId);
      
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
      // Send to match-specific chat room
      await chatService.sendMessage(
        matchId,
        userProfile.uid,
        userProfile.username,
        message,
        replyingTo ? {
          messageId: replyingTo.id,
          username: replyingTo.username,
          text: replyingTo.text
        } : undefined,
        'match'
      );

      setMessage('');
      setReplyingTo(null);

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
    if (msg.type === 'system') return;
    await chatService.addReaction(matchId, msg.id, '❤️', 'match');
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
    if (!selectedMessage) return;
    
    await chatService.addReaction(matchId, selectedMessage.id, emoji, 'match');
    
    setShowEmojiPicker(false);
    setSelectedMessage(null);
  };

  const renderChatTab = () => (
    <View style={styles.chatContainer}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesList}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => {
          const isCurrentUser = msg.odId === userProfile?.uid;
          const isSystem = msg.type === 'system';

          if (isSystem) {
            return (
              <View key={msg.id} style={styles.systemMessage}>
                <Text style={styles.systemText}>{msg.text}</Text>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={msg.id}
              style={[
                styles.messageContainer,
                isCurrentUser && styles.currentUserMessageContainer
              ]}
              onPress={() => handleMessagePress(msg)}
              onLongPress={() => handleLongPress(msg)}
              activeOpacity={0.8}
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
                    <Text style={styles.replyContextUser}>@{msg.replyTo.username}</Text>
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
                </View>

                {Object.keys(msg.reactions || {}).length > 0 && (
                  <View style={styles.reactions}>
                    {Object.entries(msg.reactions).map(([emoji, count]) => (
                      <View key={emoji} style={styles.reaction}>
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                        <Text style={styles.reactionCount}>{count}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={[
                  styles.messageFooter,
                  isCurrentUser && styles.currentUserFooter
                ]}>
                  <Text style={styles.timestamp}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
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
          <View style={styles.replyPreviewContent}>
            <Ionicons name="arrow-undo" size={16} color="#5E5CE6" />
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

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Message..."
          placeholderTextColor="#8E8E93"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity 
          style={styles.sendButton}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEventsTab = () => (
    <ScrollView style={styles.eventsContainer} showsVerticalScrollIndicator={false}>
      {events.length > 0 ? (
        events.map((event, index) => (
          <View key={index} style={styles.eventItem}>
            <View style={styles.eventTime}>
              <Text style={styles.eventTimeText}>{event.time}</Text>
            </View>
            <View style={styles.eventContent}>
              <View style={styles.eventIconContainer}>
                {event.type === 'goal' && <Text style={styles.eventIcon}>⚽</Text>}
                {event.type === 'card' && <Text style={styles.eventIcon}>🟨</Text>}
                {event.type === 'substitution' && <Text style={styles.eventIcon}>🔄</Text>}
              </View>
              <View style={styles.eventDetails}>
                <Text style={styles.eventPlayer}>{event.player}</Text>
                <Text style={styles.eventTeam}>{event.team}</Text>
                {event.detail && (
                  <Text style={styles.eventDetail}>{event.detail}</Text>
                )}
              </View>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.noEvents}>
          <Ionicons name="timer-outline" size={48} color="#666" />
          <Text style={styles.noEventsText}>No events yet</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderLineupTab = () => (
    <ScrollView style={styles.lineupContainer} showsVerticalScrollIndicator={false}>
      {lineup ? (
        <>
          <View style={styles.lineupSection}>
            <Text style={styles.lineupTeam}>{lineup.home.team}</Text>
            <Text style={styles.lineupFormation}>{lineup.home.formation}</Text>
            {lineup.home.startXI.map((player, index) => (
              <View key={index} style={styles.playerItem}>
                <Text style={styles.playerNumber}>{player.number}</Text>
                <Text style={styles.playerName}>{player.name}</Text>
                <Text style={styles.playerPosition}>{player.position}</Text>
              </View>
            ))}
          </View>
          <View style={styles.lineupDivider} />
          <View style={styles.lineupSection}>
            <Text style={styles.lineupTeam}>{lineup.away.team}</Text>
            <Text style={styles.lineupFormation}>{lineup.away.formation}</Text>
            {lineup.away.startXI.map((player, index) => (
              <View key={index} style={styles.playerItem}>
                <Text style={styles.playerNumber}>{player.number}</Text>
                <Text style={styles.playerName}>{player.name}</Text>
                <Text style={styles.playerPosition}>{player.position}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.noEvents}>
          <Ionicons name="people-outline" size={48} color="#666" />
          <Text style={styles.noEventsText}>Lineups not available</Text>
        </View>
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.matchInfo}>
          {match && (
            <>
              <View style={styles.matchScore}>
                <Text style={styles.teamText}>{match.home}</Text>
                <Text style={styles.scoreText}>{match.score}</Text>
                <Text style={styles.teamText}>{match.away}</Text>
              </View>
              <View style={styles.matchMeta}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{match.minute}</Text>
                </View>
                <Text style={styles.activeUsersText}>
                  {activeUsers > 0 ? `${activeUsers.toLocaleString()} watching` : 'Join the chat'}
                </Text>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity>
          <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        {['CHAT', 'EVENTS', 'LINEUPS'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'CHAT' && renderChatTab()}
      {activeTab === 'EVENTS' && renderEventsTab()}
      {activeTab === 'LINEUPS' && renderLineupTab()}

      {/* Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity 
          style={styles.emojiPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPicker}>
            {AVAILABLE_EMOJIS.map((emoji) => (
              <TouchableOpacity 
                key={emoji}
                style={styles.emojiButton}
                onPress={() => addReaction(emoji)}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1C1C1E',
  },
  matchInfo: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  matchScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    maxWidth: 80,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  matchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    marginRight: 4,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  activeUsersText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#5E5CE6',
  },
  tabText: {
    fontSize: 14,
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
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  messageContainer: {
    marginBottom: 16,
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
    fontSize: 13,
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
    gap: 12,
  },
  currentUserFooter: {
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 11,
    color: '#8E8E93',
  },
  replyButton: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5E5CE6',
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
    color: '#5E5CE6',
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
    backgroundColor: '#5E5CE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiPicker: {
    flexDirection: 'row',
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 12,
    gap: 8,
  },
  emojiButton: {
    padding: 8,
  },
  emojiText: {
    fontSize: 24,
  },
  eventsContainer: {
    flex: 1,
    padding: 16,
  },
  eventItem: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  eventTime: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2C2C2E',
  },
  eventTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  eventContent: {
    flex: 1,
    flexDirection: 'row',
    paddingLeft: 12,
  },
  eventIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eventIcon: {
    fontSize: 18,
  },
  eventDetails: {
    flex: 1,
  },
  eventPlayer: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  eventTeam: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  eventDetail: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  noEvents: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noEventsText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  lineupContainer: {
    flex: 1,
    padding: 16,
  },
  lineupSection: {
    marginBottom: 24,
  },
  lineupTeam: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  lineupFormation: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 16,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  playerNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5E5CE6',
    width: 30,
  },
  playerName: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
  },
  playerPosition: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lineupDivider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 16,
  },
});