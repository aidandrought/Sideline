// app/communityChat/[id].tsx
// Community chat screen - For team and league community discussions

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ChatMessage, chatService } from '../../services/chatService';
import { Community, communityService } from '../../services/communityService';
import { presenceService } from '../../services/presenceService';

const AVAILABLE_EMOJIS = ['❤️', '😂', '🔥', '👍', '⚽', '🎉', '💪'];

type ChatRoomType = 'team' | 'league' | 'community';

export default function CommunityChatScreen() {
  const router = useRouter();
  const { id, name, type } = useLocalSearchParams();
  const { userProfile } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [activeUsers, setActiveUsers] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  useEffect(() => {
    loadCommunity();
    
    // Subscribe to chat
    const unsubscribeChat = chatService.subscribeToChat(
      id as string, 
      setMessages
    );

    // Join presence
    if (userProfile) {
      presenceService.joinChat(id as string, userProfile.uid, userProfile.username);
      
      const unsubscribePresence = presenceService.subscribeToActiveUsers(
        id as string,
        (count) => setActiveUsers(count)
      );

      return () => {
        unsubscribeChat();
        unsubscribePresence();
        presenceService.leaveChat(id as string, userProfile.uid);
      };
    }

    return unsubscribeChat;
  }, [id, userProfile]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const loadCommunity = () => {
    const comm = communityService.getCommunityById(id as string);
    if (comm) {
      setCommunity(comm);
    } else {
      // Create a basic community object from params
      setCommunity({
        id: id as string,
        name: name as string || 'Community',
        description: '',
        icon: '💬',
        color: '#0066CC',
        type: (type === 'league' ? 'league' : 'team'),
        members: '0',
        activeNow: '0',
        trending: false
      });
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !userProfile) return;

    try {
      const chatType = community?.type === 'team' ? 'team' : 
                       community?.type === 'league' ? 'league' : 'community';
      
      await chatService.sendMessage(
        id as string,
        userProfile.uid,
        userProfile.username,
        message,
        replyingTo ? {
          messageId: replyingTo.id,
          username: replyingTo.username,
          text: replyingTo.text
        } : undefined,
        chatType as ChatRoomType
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

  const addReaction = async (emoji: string) => {
    if (!selectedMessage) return;
    
    const chatType = community?.type === 'team' ? 'team' : 
                     community?.type === 'league' ? 'league' : 'community';
    
    await chatService.addReaction(
      id as string, 
      selectedMessage.id, 
      emoji,
      chatType as ChatRoomType
    );
    
    setShowEmojiPicker(false);
    setSelectedMessage(null);
  };

  const renderMessage = (msg: ChatMessage) => {
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
            isCurrentUser && styles.currentUserBubble,
            { backgroundColor: isCurrentUser ? (community?.color || '#0066CC') : '#1C1C1E' }
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
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: community?.color || '#0066CC' }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <View style={styles.headerTitle}>
            <Text style={styles.communityIcon}>{community?.icon}</Text>
            <Text style={styles.communityName} numberOfLines={1}>
              {community?.name || name}
            </Text>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.activeDot} />
            <Text style={styles.activeCount}>{activeUsers} online</Text>
            <Text style={styles.memberCount}>• {community?.members} members</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="information-circle-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Chat Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>{community?.icon || '💬'}</Text>
            <Text style={styles.emptyChatTitle}>Welcome to {community?.name}!</Text>
            <Text style={styles.emptyChatSubtitle}>
              Be the first to start the conversation
            </Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

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
            <Ionicons name="close" size={20} color="#666" />
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
          style={[
            styles.sendButton,
            { backgroundColor: community?.color || '#0066CC' }
          ]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
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
      )}
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  communityIcon: {
    fontSize: 20,
  },
  communityName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  activeCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  memberCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 8,
  },
  headerAction: {
    padding: 4,
  },
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
  emptyChatIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  emptyChatSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
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
    color: '#0066CC',
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
  emojiPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
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
});

type CommunityType = 'team' | 'league' | 'custom';