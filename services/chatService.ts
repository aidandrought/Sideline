// services/chatService.ts
// Firebase Realtime Database chat service
// Each matchId gets its OWN isolated chat room

import { off, onValue, push, ref, set } from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  reactions: { [emoji: string]: number };
  replyTo?: {
    messageId: string;
    username: string;
    text: string;
  };
  type: 'user' | 'system';
}

class ChatService {
  private activeSubscriptions: Map<string, () => void> = new Map();

  /**
   * Subscribe to chat messages for a specific match
   * Each matchId gets its own isolated chat room
   */
  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void): () => void {
    // Unsubscribe from previous subscription if exists
    this.unsubscribeFromChat(matchId);

    const chatRef = ref(realtimeDb, `chats/${matchId}`);
    const messages: ChatMessage[] = [];

    // Listen for all messages in this chat room
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messageList = Object.entries(data).map(([id, msg]: [string, any]) => ({
          id,
          matchId,
          ...msg
        }));
        // Sort by timestamp
        messageList.sort((a, b) => a.timestamp - b.timestamp);
        callback(messageList);
      } else {
        // Initialize with welcome message if empty
        this.initializeChatRoom(matchId).then(() => {
          callback([]);
        });
      }
    });

    // Store unsubscribe function
    this.activeSubscriptions.set(matchId, () => {
      off(chatRef);
    });

    return () => this.unsubscribeFromChat(matchId);
  }

  /**
   * Unsubscribe from a chat room
   */
  private unsubscribeFromChat(matchId: string) {
    const unsubscribe = this.activeSubscriptions.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.activeSubscriptions.delete(matchId);
    }
  }

  /**
   * Initialize a chat room with a welcome message
   */
  async initializeChatRoom(matchId: string): Promise<void> {
    const chatRef = ref(realtimeDb, `chats/${matchId}`);
    const newMessageRef = push(chatRef);
    
    await set(newMessageRef, {
      matchId,
      userId: 'system',
      username: 'Sideline',
      text: '⚽ Welcome to the match chat! Be respectful and enjoy the game!',
      timestamp: Date.now(),
      reactions: {},
      type: 'system'
    });
  }

  /**
   * Send a message to a specific match chat
   */
  async sendMessage(
    matchId: string,
    userId: string,
    username: string,
    text: string,
    replyTo?: ChatMessage['replyTo']
  ): Promise<ChatMessage> {
    const chatRef = ref(realtimeDb, `chats/${matchId}`);
    const newMessageRef = push(chatRef);
    
    const messageData: Omit<ChatMessage, 'id'> = {
      matchId,
      userId,
      username,
      text,
      timestamp: Date.now(),
      reactions: {},
      type: 'user',
      ...(replyTo && { replyTo })
    };

    await set(newMessageRef, messageData);

    return {
      id: newMessageRef.key!,
      ...messageData
    };
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(matchId: string, messageId: string, emoji: string): Promise<void> {
    const reactionRef = ref(realtimeDb, `chats/${matchId}/${messageId}/reactions/${emoji}`);
    
    // Get current count and increment
    onValue(reactionRef, async (snapshot) => {
      const currentCount = snapshot.val() || 0;
      await set(reactionRef, currentCount + 1);
    }, { onlyOnce: true });
  }

  /**
   * Send a system message (for goals, cards, etc.)
   */
  async sendSystemMessage(matchId: string, text: string): Promise<ChatMessage> {
    const chatRef = ref(realtimeDb, `chats/${matchId}`);
    const newMessageRef = push(chatRef);
    
    const messageData: Omit<ChatMessage, 'id'> = {
      matchId,
      userId: 'system',
      username: 'Sideline',
      text,
      timestamp: Date.now(),
      reactions: {},
      type: 'system'
    };

    await set(newMessageRef, messageData);

    return {
      id: newMessageRef.key!,
      ...messageData
    };
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    this.activeSubscriptions.forEach((unsubscribe, matchId) => {
      unsubscribe();
    });
    this.activeSubscriptions.clear();
  }
}

export const chatService = new ChatService();