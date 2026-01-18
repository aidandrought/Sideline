// app/upcoming.tsx
// ✅ FIXED: Uses real API data with automatic timezone conversion

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebaseConfig';
import { footballAPI, Match } from '../services/footballApi';

export default function UpcomingScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());
  const [loadingNotify, setLoadingNotify] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);
  
  useEffect(() => {
  const unsub = onAuthStateChanged(auth, (user) => {
    if (!user) {
      console.log('Auth not ready yet');
      return;
    }

    console.log('Auth ready, uid:', user.uid);
    loadSubscriptions(user.uid);
  });

  return unsub;
}, []);


  // ✅ FIXED: Actually load from API instead of sample data
  const loadMatches = async () => {
    try {
      setLoading(true);
      const upcomingMatches = await footballAPI.getUpcomingMatches();
      console.log('Loaded upcoming matches:', upcomingMatches.length);
      setMatches(upcomingMatches);
    } catch (error) {
      console.error('Error loading matches:', error);
      Alert.alert('Error', 'Failed to load upcoming matches');
    } finally {
      setLoading(false);
    }
  };

    const loadSubscriptions = async (uid: string) => {


    try {
      const q = query(
        collection(db, 'matchNotifications'),
        where('userId', '==', uid)
      );
      const snapshot = await getDocs(q);
      const subscribed = new Set<string>();
      snapshot.forEach((doc) => {
        subscribed.add(doc.data().matchId);
      });
      setSubscribedMatches(subscribed);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  const onRefresh = async () => {
  setRefreshing(true);
  await loadMatches();

  const uid = auth.currentUser?.uid;
  if (uid) {
    await loadSubscriptions(uid);
  }

  setRefreshing(false);
};

  const handleNotifyMe = async (matchId: string) => {
    if (!userProfile?.uid) {
      Alert.alert('Sign In Required', 'Please sign in to receive notifications');
      return;
    }

    setLoadingNotify(matchId);

    try {
      const isSubscribed = subscribedMatches.has(matchId);

      if (isSubscribed) {
        // Unsubscribe
        const q = query(
          collection(db, 'matchNotifications'),
          where('userId', '==', userProfile.uid),
          where('matchId', '==', matchId)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
        });

        setSubscribedMatches((prev) => {
          const newSet = new Set(prev);
          newSet.delete(matchId);
          return newSet;
        });
      } else {
        // Subscribe
        await addDoc(collection(db, 'matchNotifications'), {
          userId: userProfile.uid,
          matchId,
          createdAt: new Date().toISOString(),
        });

        setSubscribedMatches((prev) => new Set(prev).add(matchId));
      }
    } catch (error) {
      console.error('Error updating notification:', error);
      Alert.alert('Error', 'Failed to update notification preference');
    } finally {
      setLoadingNotify(null);
    }
  };

  // ✅ FIXED: Format time with automatic timezone
  const formatMatchTime = (match: Match) => {
    const date = new Date(match.date);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if today
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    // Get day name for dates beyond tomorrow
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Get time in user's local timezone
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    
    if (isToday) {
      return `Today, ${time}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${time}`;
    } else {
      return `${dayName}, ${time}`;
    }
  };

  const renderMatchCard = (match: Match) => {
    const isSubscribed = subscribedMatches.has(match.id.toString());
    const isLoading = loadingNotify === match.id.toString();

    return (
      <View key={match.id} style={styles.matchCard}>
        {/* League Header */}
        <View style={styles.matchHeader}>
          <Text style={styles.leagueName}>{match.league.toUpperCase()}</Text>
          <Text style={styles.matchTime}>{formatMatchTime(match)}</Text>
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Home Team */}
          <View style={styles.team}>
            {match.homeLogo ? (
              <Image source={{ uri: match.homeLogo }} 
              style={styles.teamIcon} 
              resizeMode="contain"
              />
            ) : (
              <View style={[styles.teamIcon, styles.teamIconPlaceholder]}>
                <Text style={styles.teamIconText}>{match.home[0]}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {match.home}
            </Text>
          </View>

          <Text style={styles.vsText}>vs</Text>

          {/* Away Team */}
          <View style={styles.team}>
            {match.awayLogo ? (
              <Image source={{ uri: match.awayLogo }} style={styles.teamIcon} resizeMode="contain" />
            ) : (
              <View style={[styles.teamIcon, styles.teamIconPlaceholder]}>
                <Text style={styles.teamIconText}>{match.away[0]}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {match.away}
            </Text>
          </View>
        </View>

        {/* Venue */}
        {match.league && (
          <View style={styles.venueContainer}>
            <Ionicons name="location-outline" size={14} color="#999" />
            <Text style={styles.venueText}>{match.league}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.notifyButton, isSubscribed && styles.notifyButtonActive]}
            onPress={() => handleNotifyMe(match.id.toString())}
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
            <Text style={styles.emptySubtext}>
              Check back soon for scheduled matches
            </Text>
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

            {/* Matches List */}
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
    paddingTop: 70,
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
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#0066CC',
    marginLeft: 10,
    flex: 1,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  leagueName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
  },
  matchTime: {
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
  width: 60,
  height: 60,
  marginBottom: 8,
},
teamIconPlaceholder: {
  width: 60,
  height: 60,
  backgroundColor: '#E5E7EB',
  borderRadius: 30,
  marginBottom: 8,
},
  teamIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#999',
  },
  teamName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginHorizontal: 12,
  },
  venueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  venueText: {
    fontSize: 13,
    color: '#999',
    marginLeft: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  notifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#0066CC',
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  notifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
    marginLeft: 6,
  },
  notifyButtonTextActive: {
    color: '#FFF',
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
    marginRight: 4,
  },
});