// app/leaderboard.tsx
// Prediction leaderboard — weekly and all-time tabs

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  getAllTimeLeaderboard,
  getUserPredictionStats,
  getWeekKey,
  getWeeklyLeaderboard,
  LeaderboardEntry,
} from '../services/predictionLeaderboardService';

type Tab = 'weekly' | 'alltime';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();

  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            border: '#2C2C2E',
            surface: '#1C1C1E',
            highlight: '#1B3A66',
            gold: '#FFD700',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5E5',
            surface: '#FFFFFF',
            highlight: '#E8F0FE',
            gold: '#F59E0B',
          },
    [isDark]
  );

  const [activeTab, setActiveTab] = useState<Tab>('weekly');
  const [weeklyEntries, setWeeklyEntries] = useState<LeaderboardEntry[]>([]);
  const [allTimeEntries, setAllTimeEntries] = useState<LeaderboardEntry[]>([]);
  const [userStats, setUserStats] = useState<{
    allTime: { totalPoints?: number; totalPredictions?: number; accuracy?: number };
    weekly: { weeklyPoints?: number; weeklyPredictions?: number; accuracy?: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const weekKey = getWeekKey();
  const weekLabel = weekKey.replace('-W', ' · Week ');

  const loadData = useCallback(async () => {
    try {
      const [weekly, allTime] = await Promise.all([
        getWeeklyLeaderboard(50),
        getAllTimeLeaderboard(50),
      ]);
      setWeeklyEntries(weekly);
      setAllTimeEntries(allTime);

      if (userProfile?.uid) {
        const stats = await getUserPredictionStats(userProfile.uid);
        setUserStats(stats);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userProfile?.uid]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const entries = activeTab === 'weekly' ? weeklyEntries : allTimeEntries;

  const myRank = useMemo(() => {
    const uid = userProfile?.uid;
    if (!uid) return null;
    const idx = entries.findIndex((e) => e.userId === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [entries, userProfile?.uid]);

  const renderRankBadge = (rank: number) => {
    if (rank <= 3) {
      return (
        <View style={[styles.medalBadge, { backgroundColor: MEDAL_COLORS[rank - 1] + '22' }]}>
          <Text style={[styles.medalEmoji]}>
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.rankBadge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.rankText, { color: palette.subtext }]}>{rank}</Text>
      </View>
    );
  };

  const renderEntry = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isMe = item.userId === userProfile?.uid;
    const points = activeTab === 'weekly' ? item.weeklyPoints : item.totalPoints;
    const predictions = activeTab === 'weekly' ? item.weeklyPredictions : item.totalPredictions;

    return (
      <View
        style={[
          styles.entryRow,
          { backgroundColor: isMe ? palette.highlight : palette.card, borderColor: palette.border },
          isMe && { borderColor: palette.accent, borderWidth: 1.5 },
        ]}
      >
        {renderRankBadge(index + 1)}

        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: palette.accent + '22' }]}>
            <Text style={[styles.avatarInitial, { color: palette.accent }]}>
              {item.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.entryInfo}>
          <Text style={[styles.entryUsername, { color: palette.text }]} numberOfLines={1}>
            {item.username}
            {isMe && <Text style={[styles.youBadge, { color: palette.accent }]}> (you)</Text>}
          </Text>
          <Text style={[styles.entryMeta, { color: palette.subtext }]}>
            {predictions} picks · {item.accuracy}% accuracy
          </Text>
        </View>

        <View style={styles.pointsPill}>
          <Text style={[styles.pointsValue, { color: palette.accent }]}>{points}</Text>
          <Text style={[styles.pointsLabel, { color: palette.subtext }]}>pts</Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      {/* My stats card */}
      {userStats && (
        <View style={[styles.myStatsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.myStatsTitle, { color: palette.text }]}>Your Stats</Text>
          <View style={styles.myStatsRow}>
            <View style={styles.myStatItem}>
              <Text style={[styles.myStatValue, { color: palette.accent }]}>
                {activeTab === 'weekly'
                  ? (userStats.weekly.weeklyPoints ?? 0)
                  : (userStats.allTime.totalPoints ?? 0)}
              </Text>
              <Text style={[styles.myStatLabel, { color: palette.subtext }]}>Points</Text>
            </View>
            <View style={[styles.myStatDivider, { backgroundColor: palette.border }]} />
            <View style={styles.myStatItem}>
              <Text style={[styles.myStatValue, { color: palette.accent }]}>
                {activeTab === 'weekly'
                  ? (userStats.weekly.weeklyPredictions ?? 0)
                  : (userStats.allTime.totalPredictions ?? 0)}
              </Text>
              <Text style={[styles.myStatLabel, { color: palette.subtext }]}>Picks</Text>
            </View>
            <View style={[styles.myStatDivider, { backgroundColor: palette.border }]} />
            <View style={styles.myStatItem}>
              <Text style={[styles.myStatValue, { color: palette.accent }]}>
                {activeTab === 'weekly'
                  ? (userStats.weekly.accuracy ?? 0)
                  : (userStats.allTime.accuracy ?? 0)}%
              </Text>
              <Text style={[styles.myStatLabel, { color: palette.subtext }]}>Accuracy</Text>
            </View>
            {myRank && (
              <>
                <View style={[styles.myStatDivider, { backgroundColor: palette.border }]} />
                <View style={styles.myStatItem}>
                  <Text style={[styles.myStatValue, { color: palette.gold }]}>#{myRank}</Text>
                  <Text style={[styles.myStatLabel, { color: palette.subtext }]}>Rank</Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {/* Scoring explanation */}
      <View style={[styles.scoringBanner, { backgroundColor: palette.accent + '15', borderColor: palette.accent + '30' }]}>
        <Ionicons name="information-circle-outline" size={15} color={palette.accent} />
        <Text style={[styles.scoringText, { color: palette.subtext }]}>
          Correct result prediction = <Text style={{ color: palette.accent, fontWeight: '600' }}>3 points</Text>
          {activeTab === 'weekly' ? `  ·  ${weekLabel}` : '  ·  All time'}
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: palette.subtext }]}>
        {activeTab === 'weekly' ? 'This Week' : 'All Time'} · Top {entries.length}
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🏆</Text>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>No predictions yet</Text>
      <Text style={[styles.emptySubtext, { color: palette.subtext }]}>
        Be the first to make a pick on a match preview to appear here.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Prediction League</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        {(['weekly', 'alltime'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: palette.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? palette.accent : palette.subtext }]}>
              {tab === 'weekly' ? 'This Week' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.userId}
          renderItem={renderEntry}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  myStatsCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  myStatsTitle: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  myStatsRow: { flexDirection: 'row', alignItems: 'center' },
  myStatItem: { flex: 1, alignItems: 'center' },
  myStatValue: { fontSize: 20, fontWeight: '700' },
  myStatLabel: { fontSize: 11, marginTop: 2 },
  myStatDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  scoringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  scoringText: { fontSize: 12, flex: 1 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  medalBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  medalEmoji: { fontSize: 20 },
  rankBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rankText: { fontSize: 13, fontWeight: '700' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarPlaceholder: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  entryInfo: { flex: 1 },
  entryUsername: { fontSize: 14, fontWeight: '600' },
  youBadge: { fontSize: 12, fontWeight: '500' },
  entryMeta: { fontSize: 12, marginTop: 2 },
  pointsPill: { alignItems: 'flex-end' },
  pointsValue: { fontSize: 18, fontWeight: '700' },
  pointsLabel: { fontSize: 11, marginTop: -2 },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
