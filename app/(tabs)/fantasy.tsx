// app/(tabs)/fantasy.tsx
// Fantasy Football Dashboard — main entry point

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useMyTeams, useMyLeagues, useWorldCupLeague, useActiveGameweeks } from '../../hooks/useFantasy';
import { joinLeague } from '../../services/fantasyService';
import type { Gameweek } from '../../types/fantasy';

const PALETTE = {
  background: '#080E1A',
  surface: '#0F1828',
  surface2: '#1A2540',
  border: 'rgba(255,255,255,0.09)',
  text: '#FFFFFF',
  muted: '#8896A8',
  primary: '#10B981',
  secondary: '#38BDF8',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  gold: '#C9A84C',
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function getDeadlineMs(gw: Gameweek): number {
  if (!gw.deadline) return 0;
  const ts = gw.deadline as any;
  if (typeof ts === 'object' && typeof ts.toMillis === 'function') return ts.toMillis() - Date.now();
  if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).getTime() - Date.now();
  return 0;
}

export default function FantasyDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const userId = userProfile?.uid;

  const { data: teams, loading: teamsLoading, refetch: refetchTeams } = useMyTeams(userId);
  const { data: leagues, loading: leaguesLoading, refetch: refetchLeagues } = useMyLeagues(userId);
  const { data: worldCupLeague, loading: wcLoading, refetch: refetchWC } = useWorldCupLeague();
  const { data: activeGameweeks, loading: gwLoading, refetch: refetchGW } = useActiveGameweeks();

  const [refreshing, setRefreshing] = useState(false);
  const [joiningWC, setJoiningWC] = useState(false);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextGW = activeGameweeks?.[0] ?? null;
  const isMemberWC = worldCupLeague && userId && Array.isArray(worldCupLeague.members) && worldCupLeague.members.includes(userId);

  // Live countdown
  useEffect(() => {
    if (!nextGW) return;
    const update = () => {
      const ms = getDeadlineMs(nextGW);
      setCountdown(formatCountdown(ms));
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [nextGW]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchTeams(), refetchLeagues(), refetchWC(), refetchGW()]);
    setRefreshing(false);
  };

  const handleJoinWorldCup = async () => {
    if (!userId || !userProfile || !worldCupLeague) return;
    if (isMemberWC) {
      router.push(`/fantasy/league/${worldCupLeague.id}` as any);
      return;
    }
    setJoiningWC(true);
    try {
      await joinLeague(worldCupLeague.id, userId, userProfile.username, `${userProfile.username}'s WC Team`);
      router.push(`/fantasy/league/${worldCupLeague.id}` as any);
    } catch {
      Alert.alert('Could not join', 'Please try again.');
    } finally {
      setJoiningWC(false);
    }
  };

  const handleBuildSquad = () => {
    // Use loaded league id, or fall back to the known WC league id
    const leagueId = worldCupLeague?.id ?? 'wc2026';
    router.push(`/fantasy/team/${leagueId}` as any);
  };

  const isLoading = teamsLoading || leaguesLoading || wcLoading || gwLoading;
  const hasTeams = teams && teams.length > 0;
  const hasLeagues = leagues && leagues.length > 0;
  const showOnboarding = !isLoading && !hasTeams && !hasLeagues;

  const deadlineMs = nextGW ? getDeadlineMs(nextGW) : 0;
  const isUrgent = deadlineMs > 0 && deadlineMs < 3_600_000;

  const avgScore = 62;
  const highestScore = 98;
  const mostCaptained = 'Mbappe';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Fantasy</Text>
          <Text style={styles.topBarSub}>Sideline Fantasy Football</Text>
        </View>
        <TouchableOpacity
          style={styles.proButton}
          onPress={() => router.push('/fantasy/pro' as any)}
        >
          <Ionicons name="star" size={13} color={PALETTE.gold} />
          <Text style={styles.proButtonText}>PRO</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.primary} />}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* ── World Cup 2026 Hero Card ─────────────────────────────────── */}
        <LinearGradient
          colors={['#0B1D4E', '#0F3087', '#0A3040']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.wcHero}
        >
          <View style={styles.wcHeroGlowRing} />
          <Text style={styles.wcTrophy}>🏆</Text>
          <Text style={styles.wcTitle}>FIFA World Cup 2026</Text>
          <Text style={styles.wcSubtitle}>June 2026 · 48 Teams · USA / Canada / Mexico</Text>
          <Text style={styles.wcMembers}>
            {wcLoading
              ? 'Loading...'
              : worldCupLeague
                ? worldCupLeague.memberCount > 0
                  ? `${worldCupLeague.memberCount.toLocaleString()} managers playing`
                  : 'Be the first to play!'
                : 'Join the global fantasy league'}
          </Text>
          <View style={styles.wcButtons}>
            <TouchableOpacity style={styles.wcBtnJoin} onPress={handleJoinWorldCup} disabled={joiningWC}>
              {joiningWC
                ? <ActivityIndicator color={PALETTE.primary} size="small" />
                : <Text style={styles.wcBtnJoinText}>{isMemberWC ? 'VIEW LEAGUE' : 'JOIN NOW'}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.wcBtnBuild} onPress={handleBuildSquad}>
              <Text style={styles.wcBtnBuildText}>BUILD SQUAD</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* ── Deadline Countdown ──────────────────────────────────────── */}
        {nextGW && (
          <View style={[styles.deadlineBanner, isUrgent && styles.deadlineBannerUrgent]}>
            <Ionicons name="time-outline" size={16} color={isUrgent ? '#fff' : PALETTE.warning} />
            <Text style={[styles.deadlineLabel, isUrgent && styles.deadlineTextWhite]}>
              NEXT DEADLINE: GW {nextGW.number}
            </Text>
            <Text style={[styles.deadlineClock, isUrgent && styles.deadlineTextWhite]}>{countdown}</Text>
          </View>
        )}

        {/* ── How to Play ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to Play</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2 }}>
            {[
              { emoji: '🤝', step: '1', title: 'Join Free',      desc: 'Join the World Cup 2026 league. Compete with fans worldwide — 100% free.' },
              { emoji: '⚽', step: '2', title: 'Pick 18 Players', desc: 'Select 18 players from 48 nations. Stay within your £100m budget.' },
              { emoji: '🎖️', step: '3', title: 'Choose Captain', desc: 'Your captain scores double points. Vice-captain scores 1.5×.' },
              { emoji: '📈', step: '4', title: 'Score & Climb',   desc: 'Goals, assists, clean sheets earn points each gameweek.' },
            ].map((item) => (
              <View key={item.step} style={styles.howCard}>
                <View style={styles.howCardTop}>
                  <Text style={styles.howEmoji}>{item.emoji}</Text>
                  <View style={[styles.howStepBadge, { backgroundColor: PALETTE.primary }]}>
                    <Text style={styles.howStepText}>{item.step}</Text>
                  </View>
                </View>
                <Text style={styles.howTitle}>{item.title}</Text>
                <Text style={styles.howDesc}>{item.desc}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Onboarding ───────────────────────────────────────────────── */}
        {showOnboarding && (
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingTitle}>New to Fantasy Football?</Text>
            <Text style={styles.onboardingBody}>
              Pick players, set your captain, and score points based on real match performances.
              It's free — jump in now and climb the World Cup leaderboard!
            </Text>
            <TouchableOpacity style={styles.onboardingBtnGold} onPress={handleBuildSquad}>
              <Text style={styles.onboardingBtnGoldText}>Build Your Squad Now →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.onboardingBtnOrange} onPress={handleJoinWorldCup}>
              <Text style={styles.onboardingBtnOrangeText}>Join World Cup League</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.onboardingBtnOutline} onPress={() => router.push('/fantasy/browse' as any)}>
              <Text style={styles.onboardingBtnOutlineText}>Browse All Leagues</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── My Leagues ───────────────────────────────────────────────── */}
        {(hasLeagues || isLoading) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Leagues</Text>
            {leaguesLoading ? (
              <ActivityIndicator color={PALETTE.primary} style={{ paddingVertical: 20 }} />
            ) : (
              <FlatList
                horizontal
                data={[...(leagues ?? []), { league: null, member: null }]}
                keyExtractor={(_, i) => String(i)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                renderItem={({ item }) => {
                  if (!item.league) {
                    return (
                      <TouchableOpacity
                        style={styles.leagueCardAdd}
                        onPress={() => router.push('/fantasy/special' as any)}
                      >
                        <Ionicons name="add-circle" size={30} color={PALETTE.primary} />
                        <Text style={styles.leagueCardAddText}>Join / Create</Text>
                      </TouchableOpacity>
                    );
                  }
                  const { league, member } = item;
                  return (
                    <TouchableOpacity
                      style={styles.leagueCard}
                      onPress={() => router.push(`/fantasy/league/${league.id}` as any)}
                    >
                      <Text style={styles.leagueCardEmoji}>{league.emoji ?? '⚽'}</Text>
                      <Text style={styles.leagueCardName} numberOfLines={2}>{league.name}</Text>
                      <Text style={styles.leagueCardGW}>GW {league.currentGameweek}</Text>
                      <Text style={styles.leagueCardPts}>{member?.lastGameweekPoints ?? 0} pts</Text>
                      <Text style={styles.leagueCardRank}>#{member?.rank ?? '—'}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* ── My Teams ─────────────────────────────────────────────────── */}
        {(hasTeams || isLoading) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Teams</Text>
            {teamsLoading ? (
              <ActivityIndicator color={PALETTE.primary} style={{ paddingVertical: 20 }} />
            ) : (
              <FlatList
                horizontal
                data={teams ?? []}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.teamCard}
                    onPress={() => router.push(`/fantasy/team/${item.leagueId}` as any)}
                  >
                    <Text style={styles.teamCardName} numberOfLines={1}>{item.teamName}</Text>
                    <Text style={styles.teamCardFormation}>{item.formation}</Text>
                    <View style={styles.teamCardRow}>
                      <Text style={styles.teamCardBudget}>£{item.budgetRemaining.toFixed(1)}m</Text>
                      <Text style={styles.teamCardPts}>{item.gameweekPoints} pts</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No teams yet.</Text>}
              />
            )}
          </View>
        )}

        {/* ── GW Stats ─────────────────────────────────────────────────── */}
        {!gwLoading && nextGW && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>GW {nextGW.number} Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{avgScore}</Text>
                <Text style={styles.statLabel}>Avg Score</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{highestScore}</Text>
                <Text style={styles.statLabel}>Highest</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { fontSize: 14 }]} numberOfLines={1}>{mostCaptained}</Text>
                <Text style={styles.statLabel}>Most Captained</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Discover ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discover</Text>
          <TouchableOpacity
            style={styles.discoverCard}
            onPress={() => router.push('/fantasy/browse' as any)}
          >
            <View style={styles.discoverLeft}>
              <Text style={styles.discoverTitle}>Discover Leagues</Text>
              <Text style={styles.discoverBody}>Find public leagues from fans around the world and compete.</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={PALETTE.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Disclaimer ───────────────────────────────────────────────── */}
        <Text style={styles.disclaimer}>
          Sideline is independent and not affiliated with the Premier League, FIFA, UEFA, or any club.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PALETTE.border,
  },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: PALETTE.text },
  topBarSub: { fontSize: 11, color: PALETTE.muted, fontWeight: '600', marginTop: 1 },
  proButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  proButtonText: { fontSize: 11, fontWeight: '800', color: PALETTE.gold, letterSpacing: 0.8 },

  scrollContent: { padding: 16, gap: 14 },

  // World Cup Hero
  wcHero: {
    borderRadius: 24, overflow: 'hidden', padding: 28, alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  wcHeroGlowRing: {
    position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  wcTrophy: { fontSize: 48, marginBottom: 2 },
  wcTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.3 },
  wcSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', fontWeight: '500' },
  wcMembers: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textAlign: 'center', marginTop: 4 },
  wcButtons: { flexDirection: 'row', gap: 10, marginTop: 12, width: '100%' },
  wcBtnJoin: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  wcBtnJoinText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
  wcBtnBuild: {
    flex: 1, backgroundColor: PALETTE.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  wcBtnBuildText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  // Deadline Banner
  deadlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PALETTE.surface,
    borderRadius: 14, borderWidth: 1, borderColor: PALETTE.border, paddingHorizontal: 14, paddingVertical: 11,
  },
  deadlineBannerUrgent: { backgroundColor: '#3D0A0A', borderColor: PALETTE.danger + '60' },
  deadlineLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: PALETTE.muted, letterSpacing: 0.5 },
  deadlineClock: { fontSize: 14, fontWeight: '800', color: PALETTE.text, letterSpacing: 1 },
  deadlineTextWhite: { color: '#fff' },

  // How to Play
  howCard: {
    width: 148, backgroundColor: PALETTE.surface, borderRadius: 16, borderWidth: 1,
    borderColor: PALETTE.border, padding: 14, gap: 4,
  },
  howCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  howEmoji: { fontSize: 24 },
  howStepBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.primary },
  howStepText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  howTitle: { fontSize: 13, fontWeight: '700', color: PALETTE.text },
  howDesc: { fontSize: 11, color: PALETTE.muted, lineHeight: 15.5 },

  // Onboarding
  onboardingCard: {
    backgroundColor: PALETTE.surface, borderRadius: 20, borderWidth: 1,
    borderColor: PALETTE.border, padding: 24, gap: 10,
  },
  onboardingTitle: { fontSize: 19, fontWeight: '800', color: PALETTE.text, textAlign: 'center', letterSpacing: -0.2 },
  onboardingBody: { fontSize: 14, color: PALETTE.muted, textAlign: 'center', lineHeight: 21 },
  onboardingBtnGold: {
    backgroundColor: PALETTE.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  onboardingBtnGoldText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  onboardingBtnOrange: {
    backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: PALETTE.border,
  },
  onboardingBtnOrangeText: { color: PALETTE.text, fontWeight: '600', fontSize: 15 },
  onboardingBtnOutline: {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center',
  },
  onboardingBtnOutlineText: { color: PALETTE.muted, fontWeight: '600', fontSize: 14 },

  // Sections
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: PALETTE.text, letterSpacing: -0.1 },

  // League Cards
  leagueCard: {
    width: 176, height: 118, backgroundColor: PALETTE.surface, borderRadius: 16,
    borderWidth: 1, borderColor: PALETTE.border, padding: 14, gap: 3,
  },
  leagueCardEmoji: { fontSize: 20 },
  leagueCardName: { fontSize: 13, fontWeight: '700', color: PALETTE.text },
  leagueCardGW: { fontSize: 11, color: PALETTE.muted },
  leagueCardPts: { fontSize: 15, fontWeight: '800', color: PALETTE.primary, marginTop: 'auto' },
  leagueCardRank: { fontSize: 11, color: PALETTE.muted },
  leagueCardAdd: {
    width: 118, height: 118, backgroundColor: PALETTE.surface, borderRadius: 16,
    borderWidth: 1, borderColor: PALETTE.border,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  leagueCardAddText: { fontSize: 12, fontWeight: '600', color: PALETTE.muted },

  // Team Cards
  teamCard: {
    width: 160, backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 14, gap: 4,
  },
  teamCardName: { fontSize: 14, fontWeight: '800', color: PALETTE.text },
  teamCardFormation: { fontSize: 12, color: PALETTE.secondary, fontWeight: '700' },
  teamCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  teamCardBudget: { fontSize: 12, color: PALETTE.muted, fontWeight: '600' },
  teamCardPts: { fontSize: 14, fontWeight: '800', color: PALETTE.primary },
  emptyText: { fontSize: 13, color: PALETTE.muted, paddingVertical: 12, fontWeight: '600' },

  // GW Stats
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: PALETTE.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 12, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: PALETTE.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: PALETTE.muted, textTransform: 'uppercase', textAlign: 'center' },

  // Discover
  discoverCard: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  discoverLeft: { flex: 1 },
  discoverTitle: { fontSize: 15, fontWeight: '800', color: PALETTE.text },
  discoverBody: { fontSize: 12, color: PALETTE.muted, marginTop: 4, lineHeight: 17 },

  // Disclaimer
  disclaimer: {
    fontSize: 11, color: PALETTE.muted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8,
  },
});
