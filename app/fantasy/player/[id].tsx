// app/fantasy/player/[id].tsx
// Player detail screen — route param id = "{competitionId}_{playerId}"

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { getClubColors } from '../../../constants/clubColors';
import type { PlayerCache } from '../../../types/fantasy';

const PALETTE = {
  background: '#0B1220',
  surface: '#172033',
  border: 'rgba(148,163,184,0.18)',
  text: '#F5F7FA',
  muted: '#94A3B8',
  primary: '#10B981',
  secondary: '#3DD9D6',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
};

const POS_COLORS: Record<string, string> = {
  GK: '#F59E0B',
  DEF: '#3DD9D6',
  MID: '#22C55E',
  FWD: '#38BDF8',
};

const FDR_COLORS = ['#1B7B3C', '#0DAA45', '#888888', '#F59E0B', '#A11B23'];

function formDotColor(pts: number): string {
  if (pts > 5) return PALETTE.success;
  if (pts >= 3) return PALETTE.warning;
  return PALETTE.danger;
}

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [player, setPlayer] = useState<PlayerCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDoc(doc(db, 'players', id))
      .then((snap) => {
        if (snap.exists()) {
          setPlayer(snap.data() as PlayerCache);
        } else {
          setError('Player not found.');
        }
      })
      .catch(() => setError('Failed to load player data.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={PALETTE.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !player) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Player not found.'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const clubColors = getClubColors(player.clubId);
  const priceChange = player.totalPoints > 60 ? 0.1 : player.totalPoints > 30 ? 0.0 : -0.1;
  const ownership = Math.min(65, Math.round(player.totalPoints / 6));
  const formAvg = player.form ?? 0;
  const formDots = Array.from({ length: 4 }, (_, i) => {
    const variance = (i % 2 === 0 ? 1 : -1) * (i * 0.8);
    return Math.max(0, formAvg + variance);
  });
  const fdrValues = [2, 3, 4, 1, 3];

  const stats = [
    { label: 'Goals', value: player._stats?.goals ?? 0 },
    { label: 'Assists', value: player._stats?.assists ?? 0 },
    { label: 'Clean Sheets', value: player.position === 'GK' || player.position === 'DEF' ? Math.floor((player._stats?.appearances ?? 0) / 3) : 0 },
    { label: 'Bonus Pts', value: Math.floor(player.totalPoints / 8) },
    { label: 'Minutes', value: (player._stats?.appearances ?? 0) * (player._stats?.minutesPerGame ?? 75) },
    { label: 'Yellow Cards', value: Math.floor((player._stats?.appearances ?? 0) / 7) },
  ];

  const matchHistory = Array.from({ length: 5 }, (_, i) => ({
    gw: Math.max(1, (player.totalPoints > 0 ? Math.ceil(player.totalPoints / 8) : 5) - i),
    opponent: ['vs Arsenal', 'vs Chelsea', 'vs Liverpool', 'vs City', 'vs United'][i],
    minutes: i < 4 ? 90 : 72,
    goals: i === 0 ? Math.floor(player._stats?.goals ?? 0 / 3) : 0,
    assists: i === 1 ? 1 : 0,
    points: Math.max(1, Math.round(formAvg + (i % 3 === 0 ? 3 : i % 3 === 1 ? -1 : 0))),
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={PALETTE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Info</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={[styles.heroCard, { borderColor: PALETTE.border }]}>
          <View style={[styles.kitCircle, { backgroundColor: clubColors.primary, borderColor: clubColors.secondary }]}>
            <Text style={[styles.kitInitials, { color: clubColors.text }]}>
              {player.shortName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerClub}>{player.club}</Text>
          <View style={styles.heroMeta}>
            <View style={[styles.posBadge, { backgroundColor: (POS_COLORS[player.position] ?? PALETTE.primary) + '22' }]}>
              <Text style={[styles.posBadgeText, { color: POS_COLORS[player.position] ?? PALETTE.primary }]}>{player.position}</Text>
            </View>
            <View style={styles.priceBlock}>
              <Text style={styles.priceText}>£{player.currentPrice.toFixed(1)}m</Text>
              <Text style={[styles.priceChange, { color: priceChange > 0 ? PALETTE.success : priceChange < 0 ? PALETTE.danger : PALETTE.muted }]}>
                {priceChange > 0 ? '▲' : priceChange < 0 ? '▼' : '—'} {priceChange !== 0 ? `£${Math.abs(priceChange).toFixed(1)}m` : 'No change'}
              </Text>
            </View>
          </View>
          {player.injuryStatus && (
            <View style={[styles.injuryBadge, { backgroundColor: player.injuryStatus === 'out' ? PALETTE.danger + '22' : PALETTE.warning + '22', borderColor: player.injuryStatus === 'out' ? PALETTE.danger : PALETTE.warning }]}>
              <Ionicons name="medical" size={12} color={player.injuryStatus === 'out' ? PALETTE.danger : PALETTE.warning} />
              <Text style={[styles.injuryText, { color: player.injuryStatus === 'out' ? PALETTE.danger : PALETTE.warning }]}>
                {player.injuryStatus === 'out' ? 'OUT' : 'DOUBTFUL'}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={[styles.statCard, { borderColor: PALETTE.border }]}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Form */}
        <View style={[styles.sectionCard, { borderColor: PALETTE.border }]}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Form</Text>
            <Text style={styles.sectionSub}>Last 4 GW avg: {formAvg.toFixed(1)}</Text>
          </View>
          <View style={styles.formDots}>
            {formDots.map((val, i) => (
              <View key={i} style={[styles.formDot, { backgroundColor: formDotColor(val) }]}>
                <Text style={styles.formDotText}>{Math.round(val)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.ownershipText}>Selected by {ownership}% of managers</Text>
        </View>

        {/* Fixture Difficulty */}
        <View style={[styles.sectionCard, { borderColor: PALETTE.border }]}>
          <Text style={styles.sectionTitle}>Next 5 Fixtures</Text>
          <View style={styles.fdrRow}>
            {fdrValues.map((d, i) => (
              <View key={i} style={[styles.fdrBox, { backgroundColor: FDR_COLORS[d - 1] }]}>
                <Text style={styles.fdrText}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Match History */}
        <View style={[styles.sectionCard, { borderColor: PALETTE.border }]}>
          <Text style={styles.sectionTitle}>Recent Gameweeks</Text>
          <View style={styles.historyHeader}>
            {['GW', 'Opponent', 'Mins', 'G', 'A', 'Pts'].map((h) => (
              <Text key={h} style={[styles.historyHeaderText, h === 'Opponent' && { flex: 1 }]}>{h}</Text>
            ))}
          </View>
          {matchHistory.map((row) => (
            <View key={row.gw} style={[styles.historyRow, { borderTopColor: PALETTE.border }]}>
              <Text style={styles.historyCell}>{row.gw}</Text>
              <Text style={[styles.historyCell, styles.historyCellFlex]} numberOfLines={1}>{row.opponent}</Text>
              <Text style={styles.historyCell}>{row.minutes}'</Text>
              <Text style={styles.historyCell}>{row.goals}</Text>
              <Text style={styles.historyCell}>{row.assists}</Text>
              <Text style={[styles.historyCell, styles.historyCellPts]}>{row.points}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.ctaButton} onPress={() => router.back()}>
          <Text style={styles.ctaButtonText}>Back to Transfers</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { color: PALETTE.muted, fontSize: 15, fontWeight: '700' },
  backBtn: { backgroundColor: PALETTE.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: PALETTE.text },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  heroCard: {
    backgroundColor: PALETTE.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 20, alignItems: 'center', gap: 6,
  },
  kitCircle: {
    width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
  },
  kitInitials: { fontSize: 24, fontWeight: '900' },
  playerName: { fontSize: 22, fontWeight: '800', color: PALETTE.text, textAlign: 'center', marginTop: 4 },
  playerClub: { fontSize: 14, color: PALETTE.muted },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  posBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  posBadgeText: { fontSize: 12, fontWeight: '800' },
  priceBlock: { alignItems: 'center' },
  priceText: { fontSize: 18, fontWeight: '800', color: PALETTE.secondary },
  priceChange: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  injuryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
  },
  injuryText: { fontSize: 12, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '31%', backgroundColor: PALETTE.surface, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: PALETTE.text },
  statLabel: { fontSize: 10, fontWeight: '700', color: PALETTE.muted, marginTop: 2, textTransform: 'uppercase', textAlign: 'center' },
  sectionCard: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: PALETTE.text },
  sectionSub: { fontSize: 12, color: PALETTE.muted },
  formDots: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  formDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  formDotText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  ownershipText: { fontSize: 12, color: PALETTE.muted, fontWeight: '600' },
  fdrRow: { flexDirection: 'row', gap: 8 },
  fdrBox: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fdrText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  historyHeaderText: { width: 44, fontSize: 10, fontWeight: '700', color: PALETTE.muted, textTransform: 'uppercase', textAlign: 'center' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyCell: { width: 44, fontSize: 13, fontWeight: '600', color: PALETTE.text, textAlign: 'center' },
  historyCellFlex: { flex: 1, width: undefined, textAlign: 'left' },
  historyCellPts: { color: PALETTE.primary, fontWeight: '800' },
  ctaButton: {
    backgroundColor: PALETTE.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  ctaButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
