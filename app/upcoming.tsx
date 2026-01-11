// app/upcoming.tsx
// Upcoming Matches Screen with working Notify Me functionality

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';

interface UpcomingMatch {
  id: string;
  home: string;
  away: string;
  homeIcon: string;
  awayIcon: string;
  league: string;
  kickoff: string;
  kickoffTime: Date;
  venue?: string;
}

// Sample upcoming matches
const SAMPLE_MATCHES: UpcomingMatch[] = [
  {
    id: 'upcoming_1',
    home: 'Manchester City',
    away: 'Chelsea',
    homeIcon: '🩵',
    awayIcon: '🔵',
    league: 'Premier League',
    kickoff: 'Tomorrow, 3:00 PM',
    kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    venue: 'Etihad Stadium',
  },
  {
    id: 'upcoming_2',
    home: 'Real Madrid',
    away: 'Barcelona',
    homeIcon: '⚪',
    awayIcon: '🔵🔴',
    league: 'La Liga',
    kickoff: 'Sunday, 9:00 PM',
    kickoffTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    venue: 'Santiago Bernabéu',
  },
  {
    id: 'upcoming_3',
    home: 'Bayern Munich',
    away: 'Borussia Dortmund',
    homeIcon: '🔴',
    awayIcon: '🟡',
    league: 'Bundesliga',
    kickoff: 'Saturday, 12:30 PM',
    kickoffTime: new Date(Date.now() + 36 * 60 * 60 * 1000),
    venue: 'Allianz Arena',
  },
  {
    id: 'upcoming_4',
    home: 'Inter Milan',
    away: 'AC Milan',
    homeIcon: '🔵⚫',
    awayIcon: '🔴⚫',
    league: 'Serie A',
    kickoff: 'Sunday, 2:45 PM',
    kickoffTime: new Date(Date.now() + 60 * 60 * 60 * 1000),
    venue: 'San Siro',
  },
  {
    id: 'upcoming_5',
    home: 'PSG',
    away: 'Marseille',
    homeIcon: '🔵🔴',
    awayIcon: '⚪',
    league: 'Ligue 1',
    kickoff: 'Sunday, 8:45 PM',
    kickoffTime: new Date(Date.now() + 72 * 60 * 60 * 1000),
    venue: 'Parc des Princes',
  },
];

export default function UpcomingScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [matches, setMatches] = useState<UpcomingMatch[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());
  const [loadingNotify, setLoadingNotify] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    if (userProfile?.uid) {
      loadSubscriptions();
    }
  }, [userProfile]);

  const loadMatches = async () => {
    try {
      setMatches(SAMPLE_MATCHES);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load user's match notification subscriptions from Firestore
   */
  const loadSubscriptions = async () => {
    if (!userProfile?.uid) return;
    
    try {
      const q = query(
        collection(db, 'matchNotifications'),
        where('userId', '==', userProfile.uid)
      );
      const snapshot = await getDocs(q);
      
      const subscribed = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        subscribed.add(data.matchId);
      });
      
      setSubscribedMatches(subscribed);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  /**
   * Toggle notification subscription for a match
   */
  const toggleNotification = async (match: UpcomingMatch) => {
    if (!userProfile?.uid) {
      Alert.alert('Sign In Required', 'Please sign in to receive match notifications.');
      return;
    }

    setLoadingNotify(match.id);
    const isCurrentlySubscribed = subscribedMatches.has(match.id);

    try {
      if (isCurrentlySubscribed) {
        // Unsubscribe
        const q = query(
          collection(db, 'matchNotifications'),
          where('userId', '==', userProfile.uid),
          where('matchId', '==', match.id)
        );
        const snapshot = await getDocs(q);
        
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        setSubscribedMatches((prev) => {
          const updated = new Set(prev);
          updated.delete(match.id);
          return updated;
        });

        Alert.alert(
          'Notification Removed',
          `You will no longer be notified when ${match.home} vs ${match.away} goes live.`
        );
      } else {
        // Subscribe
        await addDoc(collection(db, 'matchNotifications'), {
          matchId: match.id,
          userId: userProfile.uid,
          homeTeam: match.home,
          awayTeam: match.away,
          league: match.league,
          kickoffTime: match.kickoffTime,
          createdAt: new Date(),
          notified: false,
        });

        setSubscribedMatches((prev) => {
          const updated = new Set(prev);
          updated.add(match.id);
          return updated;
        });

        Alert.alert(
          'Notification Set! 🔔',
          `You'll be notified when ${match.home} vs ${match.away} goes live.`
        );
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      Alert.alert('Error', 'Failed to update notification. Please try again.');
    } finally {
      setLoadingNotify(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    if (userProfile?.uid) {
      await loadSubscriptions();
    }
    setRefreshing(false);
  };

  const renderMatchCard = (match: UpcomingMatch) => {
    const isSubscribed = subscribedMatches.has(match.id);
    const isLoading = loadingNotify === match.id;

    return (
      <View key={match.id} style={styles.matchCard}>
        {/* League Header */}
        <View style={styles.leagueHeader}>
          <Text style={styles.leagueName}>{match.league}</Text>
          <Text style={styles.kickoffTime}>{match.kickoff}</Text>
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          <View style={styles.team}>
            <Text style={styles.teamIcon}>{match.homeIcon}</Text>
            <Text style={styles.teamName} numberOfLines={1}>{match.home}</Text>
          </View>
          
          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          <View style={styles.team}>
            <Text style={styles.teamIcon}>{match.awayIcon}</Text>
            <Text style={styles.teamName} numberOfLines={1}>{match.away}</Text>
          </View>
        </View>

        {/* Venue */}
        {match.venue && (
          <View style={styles.venueContainer}>
            <Ionicons name="location-outline" size={14} color="#8E8E93" />
            <Text style={styles.venueText}>{match.venue}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.notifyButton,
              isSubscribed && styles.notifyButtonActive,
            ]}
            onPress={() => toggleNotification(match)}
            disabled={isLoading}
          >
            <Ionicons
              name={isSubscribed ? 'notifications' : 'notifications-outline'}
              size={18}
              color={isSubscribed ? '#FFF' : '#0066CC'}
            />
            <Text
              style={[
                styles.notifyButtonText,
                isSubscribed && styles.notifyButtonTextActive,
              ]}
            >
              {isLoading ? '...' : isSubscribed ? 'Notifying' : 'Notify Me'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.previewButton}
            onPress={() => router.push(`/matchPreview/${match.id}` as any)}
          >
            <Text style={styles.previewButtonText}>Preview</Text>
            <Ionicons name="chevron-forward" size={16} color="#0066CC" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upcoming Matches</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading matches...</Text>
          </View>
        ) : matches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#E5E7EB" />
            <Text style={styles.emptyText}>No upcoming matches</Text>
          </View>
        ) : (
          <>
            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle" size={20} color="#0066CC" />
              <Text style={styles.infoBannerText}>
                Tap "Notify Me" to get notified when a match goes live
              </Text>
            </View>

            {matches.map((match) => renderMatchCard(match))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#8E8E93',
    marginTop: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,102,204,0.1)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#0066CC',
    lineHeight: 20,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  leagueName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kickoffTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  vsContainer: {
    width: 50,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8E8E93',
  },
  venueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  venueText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
  },
  notifyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
  },
  notifyButtonTextActive: {
    color: '#FFF',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
});