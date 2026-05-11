// services/presenceService.ts
// RTDB-backed presence for match/community chats

import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { Platform } from 'react-native';
import { realtimeDb } from '../config/firebase';

export type RoomType = 'match' | 'community';

export interface PresenceRecord {
  userId: string;
  username: string;
  lastActive: object;
  platform: string;
  joinedAt: object;
  state: 'online';
}

const getRoomPath = (roomType: RoomType, roomId: string) => {
  const root = roomType === 'match' ? 'chats' : 'communities';
  return `presence/${root}/${roomId}`;
};

class PresenceService {
  async joinChatPresence(chatId: string, userId: string, username: string) {
    return this.enterRoom('match', chatId, userId, username);
  }

  async leaveChatPresence(chatId: string, userId: string) {
    return this.leaveRoom('match', chatId, userId);
  }

  subscribeChatViewerCount(chatId: string, callback: (count: number) => void) {
    return this.listenActiveCount('match', chatId, callback);
  }

  async enterRoom(roomType: RoomType, roomId: string, userId: string, username: string, sessionId?: string) {
    const roomPath = getRoomPath(roomType, roomId);
    const presenceKey = sessionId || userId;
    const userRef = ref(realtimeDb, `${roomPath}/${userId}`);
    const payload: PresenceRecord = {
      userId,
      username,
      platform: Platform.OS,
      lastActive: serverTimestamp(),
      joinedAt: serverTimestamp(),
      state: 'online',
    };
    try {
      await set(userRef, payload);
      await onDisconnect(userRef).remove();
      return presenceKey;
    } catch {
      return null;
    }
  }

  async heartbeat(roomType: RoomType, roomId: string, userId: string, sessionId?: string) {
    const roomPath = getRoomPath(roomType, roomId);
    const userRef = ref(realtimeDb, `${roomPath}/${userId}`);
    try {
      await update(userRef, {
        userId,
        lastActive: serverTimestamp(),
        state: 'online',
      });
    } catch {
      // heartbeat failures are non-fatal
    }
  }

  async leaveRoom(roomType: RoomType, roomId: string, userId: string, sessionId?: string) {
    const roomPath = getRoomPath(roomType, roomId);
    const userRef = ref(realtimeDb, `${roomPath}/${userId}`);
    try {
      await remove(userRef);
    } catch {
      // leave failures are non-fatal
    }
  }

  listenActiveCount(roomType: RoomType, roomId: string, callback: (count: number) => void) {
    const roomPath = getRoomPath(roomType, roomId);
    const roomRef = ref(realtimeDb, roomPath);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const value = snapshot.val();
        if (!value || typeof value !== 'object') {
          callback(0);
          return;
        }
        const rawEntries = Object.values(value);
        const now = Date.now();
        const maxInactivityMs = 90 * 1000;
        const uniqueUsers = new Set<string>();
        let fallbackCount = 0;
        rawEntries.forEach((entry: any) => {
          if (!entry || typeof entry !== 'object') return;
          if (!(entry?.state === 'online' || !entry?.state)) return;
          const lastActiveMs = typeof entry?.lastActive === 'number' ? entry.lastActive : null;
          // If lastActive is missing/pending (just joined), include them — don't filter out
          if (lastActiveMs !== null && now - lastActiveMs > maxInactivityMs) return;
          if (typeof entry?.userId === 'string' && entry.userId.length > 0) {
            uniqueUsers.add(entry.userId);
          } else {
            fallbackCount += 1;
          }
        });
        callback(uniqueUsers.size + fallbackCount);
      },
      () => callback(0)
    );

    return () => {
      unsubscribe();
    };
  }
}

export const presenceService = new PresenceService();
