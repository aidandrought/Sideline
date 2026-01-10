// services/notificationService.ts
// Handles match notifications and reminders

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const NOTIFICATIONS_STORAGE_KEY = '@match_notifications';

export interface MatchNotification {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: string;
  notificationId?: string;
  createdAt: number;
}

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private initialized = false;

  async initialize() {
    if (this.initialized) return;

    try {
      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return false;
      }

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('match-reminders', {
          name: 'Match Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0066CC',
        });
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  }

  /**
   * Subscribe to match notifications
   */
  async subscribeToMatch(match: {
    id: number;
    home: string;
    away: string;
    league: string;
    date: string;
    time?: string;
  }): Promise<boolean> {
    try {
      await this.initialize();

      // Check if already subscribed
      const existing = await this.getSubscribedMatches();
      if (existing.some(m => m.matchId === match.id)) {
        console.log('Already subscribed to this match');
        return true;
      }

      // Calculate notification time (30 minutes before match)
      const matchDateTime = new Date(match.date);
      if (match.time) {
        const [hours, minutes] = match.time.split(':').map(Number);
        matchDateTime.setHours(hours, minutes, 0, 0);
      }

      const notificationTime = new Date(matchDateTime.getTime() - 30 * 60 * 1000); // 30 min before

      // Only schedule if match is in the future
      if (notificationTime > new Date()) {
        // Schedule notification
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚽ Match Starting Soon!',
            body: `${match.home} vs ${match.away} starts in 30 minutes`,
            data: { matchId: match.id, type: 'match_reminder' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notificationTime,
          },
        });

        // Also schedule a notification for when match starts
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🔴 LIVE NOW',
            body: `${match.home} vs ${match.away} has kicked off! Join the chat`,
            data: { matchId: match.id, type: 'match_live' },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: matchDateTime,
          },
        });

        // Save subscription
        const notification: MatchNotification = {
          matchId: match.id,
          homeTeam: match.home,
          awayTeam: match.away,
          league: match.league,
          matchDate: match.date,
          notificationId,
          createdAt: Date.now(),
        };

        await this.saveSubscription(notification);
        console.log(`Subscribed to match: ${match.home} vs ${match.away}`);
        return true;
      } else {
        console.log('Match has already started or passed');
        return false;
      }
    } catch (error) {
      console.error('Error subscribing to match:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from match notifications
   */
  async unsubscribeFromMatch(matchId: number): Promise<boolean> {
    try {
      const subscriptions = await this.getSubscribedMatches();
      const subscription = subscriptions.find(m => m.matchId === matchId);

      if (subscription?.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(subscription.notificationId);
      }

      // Remove from storage
      const updated = subscriptions.filter(m => m.matchId !== matchId);
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));

      console.log(`Unsubscribed from match: ${matchId}`);
      return true;
    } catch (error) {
      console.error('Error unsubscribing from match:', error);
      return false;
    }
  }

  /**
   * Check if subscribed to a match
   */
  async isSubscribed(matchId: number): Promise<boolean> {
    try {
      const subscriptions = await this.getSubscribedMatches();
      return subscriptions.some(m => m.matchId === matchId);
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Get all subscribed matches
   */
  async getSubscribedMatches(): Promise<MatchNotification[]> {
    try {
      const data = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (data) {
        const subscriptions: MatchNotification[] = JSON.parse(data);
        // Clean up old subscriptions (older than 24 hours)
        const now = Date.now();
        const valid = subscriptions.filter(m => {
          const matchDate = new Date(m.matchDate).getTime();
          return matchDate > now - 24 * 60 * 60 * 1000;
        });
        return valid;
      }
      return [];
    } catch (error) {
      console.error('Error getting subscribed matches:', error);
      return [];
    }
  }

  /**
   * Save subscription to storage
   */
  private async saveSubscription(notification: MatchNotification): Promise<void> {
    try {
      const existing = await this.getSubscribedMatches();
      existing.push(notification);
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      console.error('Error saving subscription:', error);
    }
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  /**
   * Get pending notifications count
   */
  async getPendingCount(): Promise<number> {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      return notifications.length;
    } catch (error) {
      console.error('Error getting pending count:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();