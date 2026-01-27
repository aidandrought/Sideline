// services/chatService.ts
// Firebase-backed realtime chat service

import {
  DataSnapshot,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  set,
} from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  matchMinute?: number; // Game minute when message sent (e.g., 67)
  reactions: {
    [emoji: string]: {
      count: number;
      userIds: string[];
    };
  };
  replyTo?: {
    messageId: string;
    username: string;
    text: string;
  };
  type?: 'user' | 'system';
}

const normalizeSnapshot = (snapshot: DataSnapshot): ChatMessage[] => {
  const raw = snapshot.val() || {};
  return Object.entries(raw).map(([id, value]) => {
    const msg = value as any;
    const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
    return {
      id,
      userId: msg.userId || 'unknown',
      username: msg.username || 'Unknown',
      text: msg.text || '',
      timestamp: ts,
      matchMinute: msg.matchMinute,
      reactions: msg.reactions || {},
      replyTo: msg.replyTo,
      type: msg.type || 'user',
    } as ChatMessage;
  }).sort((a, b) => a.timestamp - b.timestamp);
};

export class ChatService {
  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void) {
    const messagesRef = query(
      ref(realtimeDb, `chats/${matchId}/messages`),
      orderByChild('timestamp'),
      limitToLast(200)
    );

    const unsubscribe = onValue(messagesRef, (snapshot) => {
      callback(normalizeSnapshot(snapshot));
    });

    return () => unsubscribe();
  }

  async sendMessage(
    matchId: string,
    userId: string,
    username: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    matchMinute?: number
  ) {
    const messagesRef = ref(realtimeDb, `chats/${matchId}/messages`);
    const newRef = push(messagesRef);
    const payload = {
      userId,
      username,
      text,
      timestamp: serverTimestamp(),
      matchMinute,
      reactions: {},
      replyTo: replyTo || null,
      type: 'user',
    };
    await set(newRef, payload);
    return {
      id: newRef.key || '',
      userId,
      username,
      text,
      timestamp: Date.now(),
      matchMinute,
      reactions: {},
      replyTo,
      type: 'user',
    } as ChatMessage;
  }

  async toggleReaction(matchId: string, messageId: string, emoji: string, userId: string) {
    const messageRef = ref(realtimeDb, `chats/${matchId}/messages/${messageId}`);
    await runTransaction(messageRef, (current) => {
      if (!current) return current;
      const reactions = current.reactions || {};
      const existing = reactions[emoji] || { count: 0, userIds: [] as string[] };
      const userIds = Array.isArray(existing.userIds) ? existing.userIds : [];
      const hasReacted = userIds.includes(userId);
      const nextUserIds = hasReacted ? userIds.filter(id => id !== userId) : [...userIds, userId];

      if (nextUserIds.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = { count: nextUserIds.length, userIds: nextUserIds };
      }

      return { ...current, reactions };
    });
  }

  async sendSystemMessage(matchId: string, text: string, matchMinute?: number) {
    const messagesRef = ref(realtimeDb, `chats/${matchId}/messages`);
    const newRef = push(messagesRef);
    const payload = {
      userId: 'system',
      username: 'System',
      text,
      timestamp: serverTimestamp(),
      matchMinute,
      reactions: {},
      type: 'system',
    };
    await set(newRef, payload);
    return {
      id: newRef.key || '',
      userId: 'system',
      username: 'System',
      text,
      timestamp: Date.now(),
      matchMinute,
      reactions: {},
      type: 'system',
    } as ChatMessage;
  }

  isChatOpen(matchStartTime: number, matchStatus: string): boolean {
    const now = Date.now();
    const minutesBeforeStart = 45 * 60 * 1000;
    const minutesAfterEnd = 10 * 60 * 1000;
    const chatOpenTime = matchStartTime - minutesBeforeStart;

    if (matchStatus === 'FT' || matchStatus === 'AET' || matchStatus === 'PEN') {
      const chatCloseTime = now - minutesAfterEnd;
      return now >= chatOpenTime && now <= chatCloseTime;
    }

    return now >= chatOpenTime;
  }
}

export const chatService = new ChatService();
