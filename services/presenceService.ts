// services/presenceService.ts
// Real-time user presence tracking with Firebase

import { onDisconnect, onValue, ref, set } from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export interface PresenceData {
  userId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
}

class PresenceService {
  private currentMatchId: string | null = null;
  private currentUserId: string | null = null;

  /**
   * Mark user as present in a chat room
   */
  async joinChat(matchId: string, userId: string, username: string) {
    try {
      this.currentMatchId = matchId;
      this.currentUserId = userId;

      const userPresenceRef = ref(realtimeDb, `presence/${matchId}/${userId}`);
      const presenceData: PresenceData = {
        userId,
        username,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      };

      // Set user as present
      await set(userPresenceRef, presenceData);

      // Setup auto-disconnect (remove presence when user leaves/disconnects)
      await onDisconnect(userPresenceRef).remove();

      // Update heartbeat every 30 seconds
      this.startHeartbeat(matchId, userId);

      console.log(`User ${username} joined chat ${matchId}`);
    } catch (error) {
      console.error('Error joining chat:', error);
    }
  }

  /**
   * Mark user as left the chat room
   */
  async leaveChat(matchId: string, userId: string) {
    try {
      const userPresenceRef = ref(realtimeDb, `presence/${matchId}/${userId}`);
      await set(userPresenceRef, null); // Remove presence
      
      this.stopHeartbeat();
      
      console.log(`User ${userId} left chat ${matchId}`);
    } catch (error) {
      console.error('Error leaving chat:', error);
    }
  }

  /**
   * Subscribe to active user count for a match
   */
  subscribeToActiveUsers(
    matchId: string, 
    callback: (count: number, users: PresenceData[]) => void
  ): () => void {
    const presenceRef = ref(realtimeDb, `presence/${matchId}`);

    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        const users: PresenceData[] = Object.values(data);
        
        // Filter out stale users (last seen > 2 minutes ago)
        const now = Date.now();
        const activeUsers = users.filter(user => 
          (now - user.lastSeen) < 120000 // 2 minutes
        );
        
        callback(activeUsers.length, activeUsers);
      } else {
        callback(0, []);
      }
    });

    return unsubscribe;
  }

  /**
   * Get current active user count (one-time)
   */
  async getActiveUserCount(matchId: string): Promise<number> {
    return new Promise((resolve) => {
      const presenceRef = ref(realtimeDb, `presence/${matchId}`);
      
      onValue(presenceRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const users: PresenceData[] = Object.values(data);
          const now = Date.now();
          const activeUsers = users.filter(user => 
            (now - user.lastSeen) < 120000
          );
          resolve(activeUsers.length);
        } else {
          resolve(0);
        }
      }, { onlyOnce: true });
    });
  }

  /**
   * Heartbeat to keep presence updated
   */
  private heartbeatInterval: any = null;

  private startHeartbeat(matchId: string, userId: string) {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        const userPresenceRef = ref(realtimeDb, `presence/${matchId}/${userId}`);
        const lastSeenRef = ref(realtimeDb, `presence/${matchId}/${userId}/lastSeen`);
        await set(lastSeenRef, Date.now());
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Cleanup on app close
   */
  async cleanup() {
    if (this.currentMatchId && this.currentUserId) {
      await this.leaveChat(this.currentMatchId, this.currentUserId);
    }
    this.stopHeartbeat();
  }
}

export const presenceService = new PresenceService();