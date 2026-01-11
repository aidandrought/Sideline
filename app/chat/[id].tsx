// app/chat/[id].tsx
// Live Match Chat with Formation Display
// Features: Real formation on pitch, player images, goal/assist icons, separate chats per match

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ChatMessage, chatService } from '../../services/chatService';
import { footballAPI, Match, MatchEvent } from '../../services/footballApi';
import { presenceService } from '../../services/presenceService';
import {
  ExtendedLineup,
  MatchStats,
  PlayerWithImage,
  SAMPLE_CHAT_MESSAGES,
  SAMPLE_LINEUPS,
  SAMPLE_LIVE_MATCH,
  SAMPLE_MATCH_EVENTS,
  SAMPLE_MATCH_STATS,
} from '../../services/testData';

const { width } = Dimensions.get('window');
const AVAILABLE_EMOJIS = ['❤️', '😂', '🔥', '👍', '👎', '⚽', '😢'];

export default function ChatRoom() {
  const router = useRouter();
  const { id, communityId, teamName } = useLocalSearchParams();
  const matchId = Array.isArray(id) ? id[0] : id;
  const { userProfile } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const lastTapTimeRef = useRef<{ [key: string]: number }>({});

  const [activeTab, setActiveTab] = useState<'CHAT' | 'STATS' | 'LINEUP'>('CHAT');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineup, setLineup] = useState<{ home: ExtendedLineup; away: ExtendedLineup } | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [activeUsers, setActiveUsers] = useState(0);

  useEffect(() => {
    loadMatchData();
    
    // Generate unique chat room based on match ID (and community if applicable)
    const chatRoomId = communityId ? `${matchId}_community_${communityId}` : `match_${matchId}`;
    
    // Subscribe to chat messages
    const unsubscribeChat = chatService.subscribeToChat(chatRoomId, setMessages);

    // Join presence for this specific match
    if (userProfile) {
      presenceService.joinChat(chatRoomId, userProfile.uid, userProfile.username);
      
      const unsubscribePresence = presenceService.subscribeToActiveUsers(
        chatRoomId,
        (count) => setActiveUsers(count)
      );

      return () => {
        unsubscribeChat();
        unsubscribePresence();
        presenceService.leaveChat(chatRoomId, userProfile.uid);
      };
    }

    return unsubscribeChat;
  }, [matchId, communityId, userProfile]);

  const loadMatchData = async () => {
    // Check if this is the test match
    if (matchId === '999999' || matchId === SAMPLE_LIVE_MATCH.id.toString()) {
      setMatch(SAMPLE_LIVE_MATCH);
      setEvents(SAMPLE_MATCH_EVENTS);
      setLineup(SAMPLE_LINEUPS);
      setStats(SAMPLE_MATCH_STATS);
      
      // Initialize with sample messages if empty
      if (messages.length === 0) {
        setMessages(SAMPLE_CHAT_MESSAGES as ChatMessage[]);
      }
      return;
    }

    // Load real match data
    try {
      const liveMatches = await footballAPI.getLiveMatches();
      const foundMatch = liveMatches.find(m => m.id.toString() === matchId);
      
      if (foundMatch) {
        setMatch(foundMatch);
        const [eventsData] = await Promise.all([
          footballAPI.getMatchEvents(foundMatch.id),
        ]);
        setEvents(eventsData);
      }
    } catch (error) {
      console.error('Error loading match data:', error);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !userProfile) return;

    const chatRoomId = communityId ? `${matchId}_community_${communityId}` : `match_${matchId}`;

    try {
      await chatService.sendMessage(
        chatRoomId,
        userProfile.uid,
        userProfile.username,
        message,
        replyingTo ? {
          messageId: replyingTo.id,
          username: replyingTo.username,
          text: replyingTo.text
        } : undefined
      );

      setMessage('');
      setReplyingTo(null);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
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
    const chatRoomId = communityId ? `${matchId}_community_${communityId}` : `match_${matchId}`;
    await chatService.addReaction(chatRoomId, msg.id, '❤️');
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
    const chatRoomId = communityId ? `${matchId}_community_${communityId}` : `match_${matchId}`;
    await chatService.addReaction(chatRoomId, selectedMessage.id, emoji);
    setShowEmojiPicker(false);
    setSelectedMessage(null);
  };

  // Render Chat Tab
  const renderChatTab = () => (
    <View style={styles.chatContainer}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item: msg }) => {
          const isCurrentUser = msg.odId === userProfile?.uid;
          const isSystem = msg.type === 'system';

          if (isSystem) {
            return (
              <View style={styles.systemMessage}>
                <Text style={styles.systemText}>{msg.text}</Text>
              </View>
            );
          }

          return (
            <TouchableOpacity
              style={[styles.messageContainer, isCurrentUser && styles.currentUserMessageContainer]}
              onPress={() => handleMessagePress(msg)}
              onLongPress={() => handleLongPress(msg)}
              activeOpacity={0.8}
            >
              <View style={[styles.messageWrapper, isCurrentUser && styles.currentUserMessageWrapper]}>
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

                <View style={[styles.messageBubble, isCurrentUser && styles.currentUserBubble]}>
                  <Text style={styles.messageText}>{msg.text}</Text>
                </View>

                {Object.keys(msg.reactions || {}).length > 0 && (
                  <View style={styles.reactions}>
                    {Object.entries(msg.reactions).map(([emoji, count]) => (
                      <View key={emoji} style={styles.reaction}>
                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                        <Text style={styles.reactionCount}>{String(count)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={[styles.messageFooter, isCurrentUser && styles.currentUserFooter]}>
                  <Text style={styles.timestamp}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        }}
      />

      {/* Reply Preview */}
      {replyingTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewContent}>
            <Ionicons name="arrow-undo" size={16} color="#0066CC" />
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

      {/* Input */}
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
          style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render Stats Tab
  const renderStatsTab = () => {
    if (!stats || !match) return null;

    const statItems = [
      { label: 'Possession', home: `${stats.possession[0]}%`, away: `${stats.possession[1]}%`, homeVal: stats.possession[0] },
      { label: 'Shots', home: stats.shots[0], away: stats.shots[1], homeVal: (stats.shots[0] / (stats.shots[0] + stats.shots[1])) * 100 },
      { label: 'Shots on Target', home: stats.shotsOnTarget[0], away: stats.shotsOnTarget[1], homeVal: (stats.shotsOnTarget[0] / (stats.shotsOnTarget[0] + stats.shotsOnTarget[1])) * 100 },
      { label: 'Corners', home: stats.corners[0], away: stats.corners[1], homeVal: (stats.corners[0] / (stats.corners[0] + stats.corners[1])) * 100 },
      { label: 'Fouls', home: stats.fouls[0], away: stats.fouls[1], homeVal: (stats.fouls[0] / (stats.fouls[0] + stats.fouls[1])) * 100 },
      { label: 'Pass Accuracy', home: `${stats.passAccuracy[0]}%`, away: `${stats.passAccuracy[1]}%`, homeVal: stats.passAccuracy[0] },
    ];

    return (
      <ScrollView style={styles.statsContainer} showsVerticalScrollIndicator={false}>
        {/* Match Events */}
        <View style={styles.eventsSection}>
          <Text style={styles.sectionTitle}>Match Events</Text>
          {events.map((event, index) => (
            <View key={index} style={styles.eventItem}>
              <Text style={styles.eventTime}>{event.time}</Text>
              <View style={styles.eventIconContainer}>
                {event.type === 'goal' && <Text style={styles.eventIcon}>⚽</Text>}
                {event.type === 'card' && <Text style={styles.eventIcon}>🟨</Text>}
                {event.type === 'substitution' && <Text style={styles.eventIcon}>🔄</Text>}
              </View>
              <View style={styles.eventDetails}>
                <Text style={styles.eventPlayer}>{event.player}</Text>
                <Text style={styles.eventTeam}>{event.team}</Text>
                {event.detail && <Text style={styles.eventDetail}>{event.detail}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Statistics */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Match Statistics</Text>
          <View style={styles.statsTeamHeader}>
            <Text style={styles.statsTeamName}>{match.home}</Text>
            <Text style={styles.statsTeamName}>{match.away}</Text>
          </View>
          {statItems.map((stat, index) => (
            <View key={index} style={styles.statItem}>
              <Text style={styles.statValueLeft}>{stat.home}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValueRight}>{stat.away}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // Render Formation on Pitch
  const renderFormation = (team: ExtendedLineup, isAway: boolean) => {
    const formation = team.formation.split('-').map(n => parseInt(n));
    const players = team.startXI;
    
    // Arrange players into rows: GK, then formation rows
    const rows: PlayerWithImage[][] = [];
    let playerIndex = 0;
    
    // GK
    rows.push([players[playerIndex++]]);
    
    // Formation rows
    for (const count of formation) {
      const row: PlayerWithImage[] = [];
      for (let i = 0; i < count && playerIndex < players.length; i++) {
        row.push(players[playerIndex++]);
      }
      rows.push(row);
    }

    // Reverse for away team (they play top to bottom)
    const displayRows = isAway ? [...rows].reverse() : rows;

    return (
      <View style={[styles.teamFormation, isAway && styles.awayFormation]}>
        {displayRows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.formationRow}>
            {row.map((player) => (
              <View key={player.number} style={styles.playerContainer}>
                {/* Player Circle with Image or Initials */}
                <View style={[styles.playerCircle, { borderColor: team.teamColor }]}>
                  {player.imageUrl ? (
                    <Image 
                      source={{ uri: player.imageUrl }} 
                      style={styles.playerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.playerInitials, { backgroundColor: team.teamColor }]}>
                      <Text style={styles.playerInitialsText}>
                        {player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </Text>
                    </View>
                  )}
                  
                  {/* Goal indicator */}
                  {player.hasGoal && (
                    <View style={styles.goalBadge}>
                      <Text style={styles.goalBadgeText}>⚽</Text>
                    </View>
                  )}
                  
                  {/* Assist indicator */}
                  {player.hasAssist && (
                    <View style={styles.assistBadge}>
                      <Text style={styles.assistBadgeText}>👟</Text>
                    </View>
                  )}
                  
                  {/* Yellow card indicator */}
                  {player.hasYellowCard && (
                    <View style={styles.cardBadge}>
                      <View style={styles.yellowCard} />
                    </View>
                  )}
                </View>
                
                {/* Player number */}
                <View style={[styles.playerNumberBadge, { backgroundColor: team.teamColor }]}>
                  <Text style={styles.playerNumber}>{player.number}</Text>
                </View>
                
                {/* Player name */}
                <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
                
                {/* Rating if available */}
                {player.rating && (
                  <View style={[styles.ratingBadge, player.rating >= 8 ? styles.ratingHigh : styles.ratingNormal]}>
                    <Text style={styles.ratingText}>{player.rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  // Render Lineup Tab
  const renderLineupTab = () => {
    if (!lineup || !match) return (
      <View style={styles.noDataContainer}>
        <Ionicons name="people-outline" size={48} color="#666" />
        <Text style={styles.noDataText}>Lineups not available</Text>
      </View>
    );

    return (
      <ScrollView style={styles.lineupContainer} showsVerticalScrollIndicator={false}>
        {/* Formation Header */}
        <View style={styles.lineupHeader}>
          <View style={styles.lineupTeamInfo}>
            <Text style={styles.lineupTeamName}>{lineup.home.team}</Text>
            <Text style={styles.lineupFormation}>{lineup.home.formation}</Text>
          </View>
          <View style={styles.lineupTeamInfo}>
            <Text style={styles.lineupTeamName}>{lineup.away.team}</Text>
            <Text style={styles.lineupFormation}>{lineup.away.formation}</Text>
          </View>
        </View>

        {/* Pitch with Formations */}
        <View style={styles.pitch}>
          {/* Home Team (bottom half) */}
          <View style={styles.pitchHalf}>
            {renderFormation(lineup.home, false)}
          </View>
          
          {/* Center Line */}
          <View style={styles.centerLine}>
            <View style={styles.centerCircle} />
          </View>
          
          {/* Away Team (top half) */}
          <View style={styles.pitchHalf}>
            {renderFormation(lineup.away, true)}
          </View>
        </View>

        {/* Substitutes */}
        <View style={styles.subsSection}>
          <Text style={styles.subsSectionTitle}>Substitutes</Text>
          <View style={styles.subsRow}>
            <View style={styles.teamSubs}>
              <Text style={styles.teamSubsLabel}>{lineup.home.team}</Text>
              <Text style={styles.subsNames}>
                {lineup.home.substitutes.map(p => p.name).join(', ')}
              </Text>
            </View>
            <View style={styles.teamSubs}>
              <Text style={styles.teamSubsLabel}>{lineup.away.team}</Text>
              <Text style={styles.subsNames}>
                {lineup.away.substitutes.map(p => p.name).join(', ')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

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

      {/* Community Badge */}
      {communityId && (
        <View style={styles.communityBadge}>
          <Text style={styles.communityBadgeText}>{teamName} Supporters</Text>
        </View>
      )}

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        {['CHAT', 'STATS', 'LINEUP'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'CHAT' && renderChatTab()}
      {activeTab === 'STATS' && renderStatsTab()}
      {activeTab === 'LINEUP' && renderLineupTab()}

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
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#1C1C1E' },
  matchInfo: { flex: 1, alignItems: 'center', marginHorizontal: 16 },
  matchScore: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teamText: { fontSize: 14, fontWeight: '600', color: '#FFF', maxWidth: 80, textAlign: 'center' },
  scoreText: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  matchMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', marginRight: 4 },
  liveText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  activeUsersText: { fontSize: 12, color: '#8E8E93' },
  communityBadge: { alignSelf: 'center', backgroundColor: '#0066CC', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, marginTop: -8, marginBottom: 8 },
  communityBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#1C1C1E', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#0066CC' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  activeTabText: { color: '#FFF' },
  chatContainer: { flex: 1 },
  messagesList: { flex: 1 },
  messageContainer: { marginBottom: 16, alignItems: 'flex-start' },
  currentUserMessageContainer: { alignItems: 'flex-end' },
  messageWrapper: { maxWidth: '75%' },
  currentUserMessageWrapper: { alignItems: 'flex-end' },
  username: { fontSize: 13, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  replyContext: { backgroundColor: '#2C2C2E', padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#0066CC' },
  replyContextUser: { fontSize: 12, fontWeight: '700', color: '#0066CC', marginBottom: 2 },
  replyContextText: { fontSize: 12, color: '#8E8E93' },
  messageBubble: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 12 },
  currentUserBubble: { backgroundColor: '#0066CC' },
  messageText: { fontSize: 16, color: '#FFF' },
  reactions: { flexDirection: 'row', marginTop: 6, gap: 6, flexWrap: 'wrap' },
  reaction: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  reactionEmoji: { fontSize: 14, marginRight: 4 },
  reactionCount: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 },
  currentUserFooter: { justifyContent: 'flex-end' },
  timestamp: { fontSize: 11, color: '#8E8E93' },
  replyButton: { fontSize: 12, fontWeight: '600', color: '#0066CC' },
  systemMessage: { alignSelf: 'center', backgroundColor: '#2C2C2E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginVertical: 8 },
  systemText: { fontSize: 13, color: '#8E8E93' },
  replyPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1C1C1E', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#2C2C2E' },
  replyPreviewContent: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  replyPreviewUser: { fontSize: 13, fontWeight: '600', color: '#0066CC' },
  replyPreviewText: { fontSize: 13, color: '#8E8E93', flex: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 30, backgroundColor: '#1C1C1E', gap: 12 },
  textInput: { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: '#FFF', maxHeight: 100 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { backgroundColor: '#2C2C2E' },
  statsContainer: { flex: 1, padding: 16 },
  eventsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 16 },
  eventItem: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, marginBottom: 10 },
  eventTime: { fontSize: 13, fontWeight: '700', color: '#0066CC', width: 45 },
  eventIconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  eventIcon: { fontSize: 16 },
  eventDetails: { flex: 1 },
  eventPlayer: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  eventTeam: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  eventDetail: { fontSize: 12, color: '#666', marginTop: 4 },
  statsSection: { marginTop: 8 },
  statsTeamHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statsTeamName: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  statItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  statValueLeft: { fontSize: 15, fontWeight: '700', color: '#FFF', width: 50 },
  statLabel: { fontSize: 13, color: '#8E8E93', textAlign: 'center', flex: 1 },
  statValueRight: { fontSize: 15, fontWeight: '700', color: '#FFF', width: 50, textAlign: 'right' },
  lineupContainer: { flex: 1 },
  noDataContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noDataText: { fontSize: 16, color: '#666', marginTop: 12 },
  lineupHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#1C1C1E' },
  lineupTeamInfo: { alignItems: 'center' },
  lineupTeamName: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  lineupFormation: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  pitch: { backgroundColor: '#1B5E20', marginHorizontal: 12, borderRadius: 12, overflow: 'hidden', paddingVertical: 20 },
  pitchHalf: { paddingHorizontal: 8 },
  centerLine: { height: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 20, marginVertical: 16, alignItems: 'center', justifyContent: 'center' },
  centerCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', position: 'absolute' },
  teamFormation: { paddingVertical: 8 },
  awayFormation: {},
  formationRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 8 },
  playerContainer: { alignItems: 'center', width: 60 },
  playerCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, overflow: 'hidden', backgroundColor: '#333' },
  playerImage: { width: '100%', height: '100%' },
  playerInitials: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  playerInitialsText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  goalBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  goalBadgeText: { fontSize: 10 },
  assistBadge: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  assistBadgeText: { fontSize: 10 },
  cardBadge: { position: 'absolute', top: -4, left: -4 },
  yellowCard: { width: 10, height: 14, backgroundColor: '#FFD60A', borderRadius: 2 },
  playerNumberBadge: { position: 'absolute', bottom: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  playerNumber: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  playerName: { fontSize: 10, fontWeight: '600', color: '#FFF', marginTop: 4, textAlign: 'center' },
  ratingBadge: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ratingNormal: { backgroundColor: 'rgba(255,255,255,0.2)' },
  ratingHigh: { backgroundColor: '#34C759' },
  ratingText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  subsSection: { padding: 16, backgroundColor: '#1C1C1E', margin: 12, borderRadius: 12 },
  subsSectionTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  subsRow: { gap: 16 },
  teamSubs: { marginBottom: 12 },
  teamSubsLabel: { fontSize: 13, fontWeight: '700', color: '#0066CC', marginBottom: 4 },
  subsNames: { fontSize: 13, color: '#8E8E93', lineHeight: 20 },
  emojiPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  emojiPicker: { flexDirection: 'row', backgroundColor: '#2C2C2E', borderRadius: 20, padding: 12, gap: 8 },
  emojiButton: { padding: 8 },
  emojiText: { fontSize: 24 },
});