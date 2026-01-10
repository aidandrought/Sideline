// services/chatService.ts
// Real-time chat service using Firebase Realtime Database
// Each game and community has its own unique chat room

import { off, onValue, push, ref, set, update } from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export interface ChatMessage {
  id: string;
  odId: string;
  username: string;
  text: string;
  timestamp: number;
  reactions: { [emoji: string]: number };
  replyTo?: {
    messageId: string;
    username: string;
    text: string;
  };
  type?: 'user' | 'system';
}

export type ChatRoomType = 'match' | 'community' | 'team' | 'league';

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  name: string;
  description?: string;
  createdAt: number;
  messageCount: number;
  lastActivity: number;
}

class ChatService {
  /**
   * Get the Firebase path for a chat room
   * Ensures unique paths for different types of chats
   */
  private getChatPath(roomId: string, roomType: ChatRoomType = 'match'): string {
    switch (roomType) {
      case 'match':
        // Format: chats/matches/{matchId}/messages
        return `chats/matches/${roomId}/messages`;
      case 'community':
        // Format: chats/communities/{communityId}/messages
        return `chats/communities/${roomId}/messages`;
      case 'team':
        // Format: chats/teams/{teamId}/messages
        return `chats/teams/${roomId}/messages`;
      case 'league':
        // Format: chats/leagues/{leagueId}/messages
        return `chats/leagues/${roomId}/messages`;
      default:
        return `chats/general/${roomId}/messages`;
    }
  }

  /**
   * Subscribe to chat messages for a specific room
   */
  subscribeToChat(
    roomId: string, 
    callback: (messages: ChatMessage[]) => void,
    roomType: ChatRoomType = 'match'
  ): () => void {
    const chatPath = this.getChatPath(roomId, roomType);
    const messagesRef = ref(realtimeDb, chatPath);

    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messages: ChatMessage[] = Object.entries(data)
          .map(([id, msg]: [string, any]) => ({
            id,
            odId: msg.userId,
            username: msg.username,
            text: msg.text,
            timestamp: msg.timestamp,
            reactions: msg.reactions || {},
            replyTo: msg.replyTo,
            type: msg.type || 'user'
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
        
        callback(messages);
      } else {
        callback([]);
      }
    });

    return () => off(messagesRef);
  }

  /**
   * Send a message to a chat room
   */
  async sendMessage(
    roomId: string,
    userId: string,
    username: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    roomType: ChatRoomType = 'match'
  ): Promise<ChatMessage> {
    const chatPath = this.getChatPath(roomId, roomType);
    const messagesRef = ref(realtimeDb, chatPath);
    const newMessageRef = push(messagesRef);

    const messageData = {
      odId: userId,
      username,
      text,
      timestamp: Date.now(),
      reactions: {},
      replyTo: replyTo,
      type: 'user' as const
    };

    await set(newMessageRef, messageData);

    // Update room metadata
    await this.updateRoomMetadata(roomId, roomType);

    return {
      id: newMessageRef.key || Date.now().toString(),
      ...messageData
    };
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(
    roomId: string, 
    messageId: string, 
    emoji: string,
    roomType: ChatRoomType = 'match'
  ): Promise<void> {
    const chatPath = this.getChatPath(roomId, roomType);
    const reactionRef = ref(realtimeDb, `${chatPath}/${messageId}/reactions/${emoji}`);
    
    // Get current count and increment
    return new Promise((resolve, reject) => {
      onValue(reactionRef, async (snapshot) => {
        const currentCount = snapshot.val() || 0;
        try {
          await set(reactionRef, currentCount + 1);
          off(reactionRef);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, { onlyOnce: true });
    });
  }

  /**
   * Send a system message (goals, cards, etc.)
   */
  async sendSystemMessage(
    roomId: string, 
    text: string, 
    icon: string,
    roomType: ChatRoomType = 'match'
  ): Promise<ChatMessage> {
    const chatPath = this.getChatPath(roomId, roomType);
    const messagesRef = ref(realtimeDb, chatPath);
    const newMessageRef = push(messagesRef);

    const messageData = {
      odId: 'system',
      username: 'System',
      text: `${icon} ${text}`,
      timestamp: Date.now(),
      reactions: {},
      type: 'system' as const
    };

    await set(newMessageRef, messageData);

    return {
      id: newMessageRef.key || Date.now().toString(),
      ...messageData
    };
  }

  /**
   * Update room metadata (last activity, message count)
   */
  private async updateRoomMetadata(roomId: string, roomType: ChatRoomType): Promise<void> {
    try {
      const roomPath = roomType === 'match' 
        ? `chats/matches/${roomId}/metadata`
        : `chats/${roomType}s/${roomId}/metadata`;
      
      const metadataRef = ref(realtimeDb, roomPath);
      await update(metadataRef, {
        lastActivity: Date.now()
      });
    } catch (error) {
      console.error('Error updating room metadata:', error);
    }
  }

  /**
   * Initialize a chat room (if it doesn't exist)
   */
  async initializeChatRoom(
    roomId: string, 
    roomType: ChatRoomType, 
    name: string,
    description?: string
  ): Promise<void> {
    try {
      const roomPath = roomType === 'match' 
        ? `chats/matches/${roomId}/metadata`
        : `chats/${roomType}s/${roomId}/metadata`;
      
      const metadataRef = ref(realtimeDb, roomPath);
      await set(metadataRef, {
        id: roomId,
        type: roomType,
        name,
        description: description || '',
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
    } catch (error) {
      console.error('Error initializing chat room:', error);
    }
  }

  /**
   * Get chat room info
   */
  async getChatRoomInfo(roomId: string, roomType: ChatRoomType): Promise<ChatRoom | null> {
    return new Promise((resolve) => {
      const roomPath = roomType === 'match' 
        ? `chats/matches/${roomId}/metadata`
        : `chats/${roomType}s/${roomId}/metadata`;
      
      const metadataRef = ref(realtimeDb, roomPath);
      onValue(metadataRef, (snapshot) => {
        const data = snapshot.val();
        off(metadataRef);
        resolve(data || null);
      }, { onlyOnce: true });
    });
  }

  /**
   * Get message count for a room
   */
  async getMessageCount(roomId: string, roomType: ChatRoomType = 'match'): Promise<number> {
    return new Promise((resolve) => {
      const chatPath = this.getChatPath(roomId, roomType);
      const messagesRef = ref(realtimeDb, chatPath);
      
      onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        off(messagesRef);
        resolve(data ? Object.keys(data).length : 0);
      }, { onlyOnce: true });
    });
  }
}

export const chatService = new ChatService();