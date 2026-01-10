import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { footballAPI, Match } from '../services/footballApi';

export default function UpcomingScreen() {
  const router = useRouter();
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcomingMatches();
  }, []);

  const loadUpcomingMatches = async () => {
    try {
      const matches = await footballAPI.getUpcomingMatches();
      setUpcomingMatches(matches);
    } catch (error) {
      console.error('Error loading upcoming matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUpcomingMatches();
    setRefreshing(false);
  };

  const getDateLabel = (dateString: string): string => {
    const matchDate = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset time to compare only dates
    const matchDay = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

    if (matchDay.getTime() === todayDay.getTime()) {
      return 'Today';
    } else if (matchDay.getTime() === tomorrowDay.getTime()) {
      return 'Tomorrow';
    } else {
      // Return formatted date (e.g., "Jan 12")
      return matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const groupMatchesByDate = () => {
    const grouped: { [key: string]: Match[] } = {};

    upcomingMatches.forEach(match => {
      const dateLabel = getDateLabel(match.date);
      if (!grouped[dateLabel]) {
        grouped[dateLabel] = [];
      }
      grouped[dateLabel].push(match);
    });

    return grouped;
  };

  const groupedMatches = groupMatchesByDate();
  const dateLabels = Object.keys(groupedMatches);

  return (
    <View style={styles.container}>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading upcoming matches...</Text>
          </View>
        ) : dateLabels.length > 0 ? (
          dateLabels.map(dateLabel => (
            <View key={dateLabel} style={styles.dateSection}>
              <Text style={styles.dateTitle}>{dateLabel}</Text>
              
              {groupedMatches[dateLabel].map(match => (
                <TouchableOpacity
                  key={match.id}
                  style={styles.matchCard}
                  onPress={() => router.push(`/chat/${match.id}` as any)}
                >
                  <View style={styles.matchHeader}>
                    <Text style={styles.league}>{match.league}</Text>
                    <View style={styles.timeTag}>
                      <Ionicons name="time-outline" size={16} color="#0066CC" />
                      <Text style={styles.timeText}>{match.time}</Text>
                    </View>
                  </View>

                  <Text style={styles.teams}>{match.home} vs {match.away}</Text>

                  <View style={styles.matchFooter}>
                    <View style={styles.previewBadge}>
                      <Ionicons name="document-text-outline" size={14} color="#0066CC" />
                      <Text style={styles.previewText}>Match Preview</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={64} color="#E5E7EB" />
            </View>
            <Text style={styles.emptyTitle}>No Upcoming Matches</Text>
            <Text style={styles.emptySubtitle}>Check back later for scheduled fixtures</Text>
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
  dateSection: {
    marginTop: 20,
  },
  dateTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  league: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
  },
  teams: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  matchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066CC',
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
  },
});