// services/presenceService.ts
// Tracks active users in chat rooms

import { off, onValue, ref, remove, set } from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export interface UserPresence {
  odId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
}

class PresenceService {
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

  /**
   * Join a chat room - adds user to presence list
   */
  async joinChat(roomId: string, userId: string, username: string): Promise<void> {
    try {
      const presenceRef = ref(realtimeDb, `presence/${roomId}/${userId}`);
      
      await set(presenceRef, {
        odId: userId,
        username,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      });

      // Start heartbeat to keep presence updated
      this.startHeartbeat(roomId, userId);
    } catch (error) {
      console.error('Error joining chat:', error);
    }
  }

  /**
   * Leave a chat room - removes user from presence list
   */
  async leaveChat(roomId: string, userId: string): Promise<void> {
    try {
      // Stop heartbeat
      this.stopHeartbeat(roomId);

      const presenceRef = ref(realtimeDb, `presence/${roomId}/${userId}`);
      await remove(presenceRef);
    } catch (error) {
      console.error('Error leaving chat:', error);
    }
  }

  /**
   * Subscribe to active user count for a room
   */
  subscribeToActiveUsers(roomId: string, callback: (count: number) => void): () => void {
    const presenceRef = ref(realtimeDb, `presence/${roomId}`);
    
    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Filter out stale users (not seen in last 2 minutes)
        const now = Date.now();
        const activeUsers = Object.values(data as Record<string, UserPresence>)
          .filter(user => now - user.lastSeen < this.STALE_THRESHOLD);
        
        callback(activeUsers.length);
      } else {
        callback(0);
      }
    });

    return () => off(presenceRef);
  }

  /**
   * Get list of active users in a room
   */
  subscribeToUserList(roomId: string, callback: (users: UserPresence[]) => void): () => void {
    const presenceRef = ref(realtimeDb, `presence/${roomId}`);
    
    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = Date.now();
        const users = Object.values(data as Record<string, UserPresence>)
          .filter(user => now - user.lastSeen < this.STALE_THRESHOLD)
          .sort((a, b) => b.joinedAt - a.joinedAt);
        
        callback(users);
      } else {
        callback([]);
      }
    });

    return () => off(presenceRef);
  }

  /**
   * Start heartbeat to keep presence updated
   */
  private startHeartbeat(roomId: string, userId: string): void {
    // Clear any existing heartbeat
    this.stopHeartbeat(roomId);

    const interval = setInterval(async () => {
      try {
        const presenceRef = ref(realtimeDb, `presence/${roomId}/${userId}/lastSeen`);
        await set(presenceRef, Date.now());
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, 30000); // Update every 30 seconds

    this.heartbeatIntervals.set(roomId, interval);
  }

  /**
   * Stop heartbeat for a room
   */
  private stopHeartbeat(roomId: string): void {
    const interval = this.heartbeatIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(roomId);
    }
  }

  /**
   * Clean up all heartbeats (call on app close)
   */
  cleanup(): void {
    this.heartbeatIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.heartbeatIntervals.clear();
  }
}

export const presenceService = new PresenceService();