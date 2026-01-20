import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { shadow } from '../components/styleUtils';
import { footballAPI, Match } from '../services/footballApi';

export default function LiveScreen() {
  const router = useRouter();
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadLiveMatches();
  }, []);

  const loadLiveMatches = async () => {
    try {
      const matches = await footballAPI.getLiveMatches();
      setLiveMatches(matches);
    } catch (error) {
      console.error('Error loading live matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLiveMatches();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {liveMatches.length > 0 ? `${liveMatches.length} LIVE Matches` : 'LIVE Matches'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading live matches...</Text>
          </View>
        ) : liveMatches.length > 0 ? (
          <>
            <View style={styles.liveHeader}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{liveMatches.length} MATCHES LIVE NOW</Text>
              </View>
            </View>

            {liveMatches.map((match) => (
              <TouchableOpacity
                key={match.id}
                style={styles.matchCard}
                onPress={() => router.push(`/chat/${match.id}` as any)}
              >
                <View style={styles.matchHeader}>
                  <Text style={styles.league}>{match.league}</Text>
                  <View style={styles.liveTag}>
                    <View style={styles.liveTagDot} />
                    <Text style={styles.liveTagText}>{match.minute}</Text>
                  </View>
                </View>

                <Text style={styles.score}>{match.score}</Text>
                <Text style={styles.teams}>{match.home} vs {match.away}</Text>

                {match.activeUsers && (
                  <View style={styles.activeUsers}>
                    <Ionicons name="people" size={14} color="#666" />
                    <Text style={styles.activeUsersText}>
                      {(match.activeUsers / 1000).toFixed(1)}k watching
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={64} color="#E5E7EB" />
            </View>
            <Text style={styles.emptyTitle}>No Live Matches Right Now</Text>
            <Text style={styles.emptySubtitle}>Check upcoming matches or come back later when games are live</Text>
            
            <TouchableOpacity 
              style={styles.upcomingButton}
              onPress={() => router.push('/upcoming')}
            >
              <Ionicons name="time-outline" size={20} color="#0066CC" />
              <Text style={styles.upcomingButtonText}>View Upcoming Matches</Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: 100,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  liveHeader: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 20,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  liveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 16,
    padding: 20,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  league: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveTagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  liveTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF3B30',
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
  },
  teams: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeUsers: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  activeUsersText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  emptyState: {
    paddingVertical: 100,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  upcomingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  upcomingButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0066CC',
  },
});
