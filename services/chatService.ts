// services/chatService.ts
// Firebase-backed realtime chat service

import {
  DataSnapshot,
  get,
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
import { realtimeDb } from '../config/firebase';
import { analyticsService } from './analyticsService';
import { moderateChatText } from './moderationService';
import { monitoringService } from './monitoringService';

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

export interface PopularChatMessage extends ChatMessage {
  totalReactions: number;
  replyCount: number;
  popularityScore: number;
}

const normalizeSnapshot = (snapshot: DataSnapshot): ChatMessage[] => {
  const raw = snapshot.val() || {};
  return Object.entries(raw).map(([id, value]) => {
    const msg = value as any;
    const ts =
      typeof msg.timestamp === 'number'
        ? msg.timestamp
        : typeof msg.clientTimestamp === 'number'
          ? msg.clientTimestamp
          : 0;
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
  private lastReactionAtByUser = new Map<string, number>();
  private messageTimestampsByUser = new Map<string, number[]>();

  private enforceRateLimit(map: Map<string, number>, key: string, minIntervalMs: number, label: string) {
    const now = Date.now();
    const last = map.get(key) ?? 0;
    if (now - last < minIntervalMs) {
      const err = new Error(`${label} rate limited`);
      (err as any).code = 'rate-limited';
      throw err;
    }
    map.set(key, now);
  }

  private enforceMessageRatePolicy(userId: string) {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const existing = this.messageTimestampsByUser.get(userId) || [];
    const withinWindow = existing.filter((ts) => ts >= oneMinuteAgo);
    const nextCount = withinWindow.length + 1;

    if (nextCount >= 60) {
      this.messageTimestampsByUser.set(userId, [...withinWindow, now]);
      monitoringService.warn('chat_user_flagged_for_spam', {
        userId,
        messagesInLastMinute: nextCount,
      });
      const err = new Error('User flagged for excessive messaging');
      (err as any).code = 'rate-flagged';
      throw err;
    }

    if (nextCount >= 30) {
      this.messageTimestampsByUser.set(userId, [...withinWindow, now]);
      const err = new Error('Message rate limited');
      (err as any).code = 'rate-limited';
      throw err;
    }

    this.messageTimestampsByUser.set(userId, [...withinWindow, now]);
  }

  subscribeToChat(matchId: string, callback: (messages: ChatMessage[]) => void) {
    const messagesRef = query(
      ref(realtimeDb, `chats/${matchId}/messages`),
      orderByChild('timestamp'),
      limitToLast(200)
    );

    const unsubscribe = onValue(
      messagesRef,
      (snapshot) => {
        callback(normalizeSnapshot(snapshot));
      },
      () => callback([])
    );

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
    this.enforceMessageRatePolicy(userId);
    const moderation = moderateChatText(text);
    if (!moderation.allowed) {
      analyticsService.track('moderation_blocked_message', { reason: moderation.reason, matchedTerm: moderation.matchedTerm });
      const err = new Error('Message blocked due to hate speech');
      (err as any).code = 'moderation-blocked';
      throw err;
    }
    const messagesRef = ref(realtimeDb, `chats/${matchId}/messages`);
    const newRef = push(messagesRef);
    const clientTimestamp = Date.now();
    const payload = {
      userId,
      username,
      text: moderation.cleanedText,
      timestamp: serverTimestamp(),
      clientTimestamp,
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
      text: moderation.cleanedText,
      timestamp: clientTimestamp,
      matchMinute,
      reactions: {},
      replyTo,
      type: 'user',
    } as ChatMessage;
  }

  async toggleReaction(matchId: string, messageId: string, emoji: string, userId: string) {
    this.enforceRateLimit(this.lastReactionAtByUser, `${userId}:${emoji}`, 500, 'reaction');
    const messageRef = ref(realtimeDb, `chats/${matchId}/messages/${messageId}`);
    try {
      await runTransaction(messageRef, (current) => {
      if (!current) return current;
      const reactions = current.reactions || {};
      const existing = reactions[emoji] || { count: 0, userIds: [] as string[] };
      const userIds = Array.isArray(existing.userIds) ? existing.userIds : [];
      const hasReacted = userIds.includes(userId);
      const nextUserIds = hasReacted ? userIds.filter((id: string) => id !== userId) : [...userIds, userId];

      if (nextUserIds.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = { count: nextUserIds.length, userIds: nextUserIds };
      }

      return { ...current, reactions };
      });
    } catch (error) {
      monitoringService.error('chat_toggle_reaction_failed', error, { matchId, messageId, emoji });
      throw error;
    }
  }

  async sendSystemMessage(matchId: string, text: string, matchMinute?: number) {
    const messagesRef = ref(realtimeDb, `chats/${matchId}/messages`);
    const newRef = push(messagesRef);
    const clientTimestamp = Date.now();
    const payload = {
      userId: 'system',
      username: 'System',
      text,
      timestamp: serverTimestamp(),
      clientTimestamp,
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
      timestamp: clientTimestamp,
      matchMinute,
      reactions: {},
      type: 'system',
    } as ChatMessage;
  }

  async getTopMessages(matchId: string, topN: number = 3): Promise<PopularChatMessage[]> {
    const messagesRef = query(
      ref(realtimeDb, `chats/${matchId}/messages`),
      orderByChild('timestamp'),
      limitToLast(300)
    );
    const snapshot = await get(messagesRef);
    const messages = normalizeSnapshot(snapshot);
    if (messages.length === 0) return [];

    const replyCountByMessageId = new Map<string, number>();
    messages.forEach((msg) => {
      const parentId = msg.replyTo?.messageId;
      if (!parentId) return;
      replyCountByMessageId.set(parentId, (replyCountByMessageId.get(parentId) || 0) + 1);
    });

    const scored = messages
      .map((msg) => {
        const totalReactions = Object.values(msg.reactions || {}).reduce(
          (sum, value) => sum + (value?.count || 0),
          0
        );
        const replyCount = replyCountByMessageId.get(msg.id) || 0;
        const popularityScore = totalReactions + replyCount;
        return {
          ...msg,
          totalReactions,
          replyCount,
          popularityScore,
        } as PopularChatMessage;
      })
      .filter((msg) => msg.totalReactions > 0 || msg.replyCount > 0)
      .sort((a, b) => {
        if (b.popularityScore !== a.popularityScore) return b.popularityScore - a.popularityScore;
        return b.timestamp - a.timestamp;
      });

    return scored.slice(0, topN);
  }

  getChatWindow(matchStartTime: number, matchStatus: string, matchEndTime?: number) {
    const minutesBeforeStart = 45 * 60 * 1000;
    const minutesAfterEnd = 15 * 60 * 1000;
    const fallbackDuration = 2 * 60 * 60 * 1000;
    const chatOpenTime = matchStartTime - minutesBeforeStart;
    const normalizedStatus = (matchStatus || '').toUpperCase();
    const isEnded = normalizedStatus === 'FT' || normalizedStatus === 'AET' || normalizedStatus === 'PEN';
    const isLive =
      normalizedStatus === 'LIVE' ||
      normalizedStatus === '1H' ||
      normalizedStatus === '2H' ||
      normalizedStatus === 'HT' ||
      normalizedStatus === 'ET' ||
      normalizedStatus === 'BT' ||
      normalizedStatus === 'P' ||
      normalizedStatus === 'INT';
    const now = Date.now();
    const derivedEndTime = isLive
      ? Math.max(matchEndTime ?? 0, matchStartTime + fallbackDuration, now)
      : (matchEndTime ?? (matchStartTime + fallbackDuration));
    const chatCloseTime = derivedEndTime + minutesAfterEnd;

    return {
      chatOpenTime,
      chatCloseTime,
      matchEndTime: derivedEndTime,
      isEnded,
    };
  }

  isChatOpen(matchStartTime: number, matchStatus: string, matchEndTime?: number): boolean {
    const now = Date.now();
    const { chatOpenTime, chatCloseTime } = this.getChatWindow(matchStartTime, matchStatus, matchEndTime);
    return now >= chatOpenTime && now <= chatCloseTime;
  }

  /**
   * Get hot community threads by recent message count (last 24 hours)
   */
  async getHotCommunityThreads(communityIds: string[], topN: number = 3): Promise<{
    communityId: string;
    messageCount: number;
    lastMessage: string;
    lastMessageAt: number;
  }[]> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const results: { communityId: string; messageCount: number; lastMessage: string; lastMessageAt: number }[] = [];

    await Promise.allSettled(
      communityIds.slice(0, 20).map(async (communityId) => {
        try {
          const messagesRef = query(
            ref(realtimeDb, `chats/${communityId}/messages`),
            orderByChild('timestamp'),
            limitToLast(100)
          );
          const snapshot = await get(messagesRef);
          const messages = normalizeSnapshot(snapshot);
          const recent = messages.filter((m) => m.timestamp > cutoff && m.type !== 'system');
          if (recent.length === 0) return;
          const last = recent[recent.length - 1];
          results.push({
            communityId,
            messageCount: recent.length,
            lastMessage: last.text || '',
            lastMessageAt: last.timestamp,
          });
        } catch { /* ignore per-community errors */ }
      })
    );

    return results
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, topN);
  }
}

export const chatService = new ChatService();
