// app/fantasy/team/[id]/transfers.tsx
// Transfer market screen

import { Ionicons } from '@expo/vector-icons';
import { FlatList as FlashList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../../config/firebase';
import { useAuth } from '../../../../context/AuthContext';
import { getClubColors } from '../../../../constants/clubColors';
import { getPlayerPool, type FantasyPlayer, type PlayerPosition } from '../../../../services/fantasyService';
import type { FantasyTeam } from '../../../../services/fantasyService';

const PALETTE = {
  background: '#0B1220',
  surface: '#172033',
  surface2: '#10192A',
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

const POS_TABS: Array<PlayerPosition | 'ALL'> = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const SORT_OPTIONS = ['Points ↓', 'Price ↓', 'Form ↓'] as const;
type SortOption = typeof SORT_OPTIONS[number];

interface PendingTransfer {
  out: FantasyPlayer;
  in: FantasyPlayer;
}

function KitSwatch({ player, size = 40 }: { player: FantasyPlayer; size?: number }) {
  const colors = getClubColors(player.clubId);
  const initials = player.shortName.slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.secondary }}>
      <Text style={{ color: colors.text, fontSize: size * 0.28, fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

export default function TransfersScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();

  const [allPlayers, setAllPlayers] = useState<FantasyPlayer[]>([]);
  const [squad, setSquad] = useState<FantasyPlayer[]>([]);
  const [originalSquad, setOriginalSquad] = useState<FantasyPlayer[]>([]);
  const [budget, setBudget] = useState(100);
  const [transfersRemaining, setTransfersRemaining] = useState(1);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [outgoing, setOutgoing] = useState<FantasyPlayer | null>(null);
  const [posFilter, setPosFilter] = useState<PlayerPosition | 'ALL'>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('Points ↓');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (!leagueId || !userProfile?.uid) { setLoading(false); return; }
    const init = async () => {
      setLoading(true);
      try {
        const teamSnap = await getDoc(doc(db, 'fantasyTeams', `${userProfile.uid}_${leagueId}`));
        const leagueSnap = await getDoc(doc(db, 'fantasyLeagues', leagueId));
        let competitionIds = [39];
        if (leagueSnap.exists()) {
          const lData = leagueSnap.data() as any;
          if (lData.rulesConfig?.competitionPool?.length) {
            competitionIds = lData.rulesConfig.competitionPool;
          }
        }
        if (teamSnap.exists()) {
          const teamData = teamSnap.data() as FantasyTeam;
          setSquad(teamData.players);
          setOriginalSquad(teamData.players);
          setBudget(teamData.budgetRemaining);
          setTransfersRemaining(teamData.transfersRemaining ?? 1);
        }
        const pools = await Promise.all(competitionIds.map((id) => getPlayerPool(id)));
        const merged = new Map<number, FantasyPlayer>();
        for (const pool of pools) for (const p of pool) if (!merged.has(p.id)) merged.set(p.id, p);
        setAllPlayers(Array.from(merged.values()));
      } catch {
        // silently fall through — show empty state
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [leagueId, userProfile?.uid]);

  const budgetRemaining = useMemo(() => {
    const spent = squad.reduce((s, p) => s + p.price, 0);
    return budget - spent + originalSquad.reduce((s, p) => s + p.price, 0);
  }, [squad, budget, originalSquad]);

  const squadIds = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPlayers
      .filter((p) => posFilter === 'ALL' || p.position === posFilter)
      .filter((p) => !q || `${p.name} ${p.clubName}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortOption === 'Price ↓') return b.price - a.price;
        if (sortOption === 'Form ↓') return b.form - a.form;
        return b.totalPoints - a.totalPoints;
      });
  }, [allPlayers, posFilter, search, sortOption]);

  const handlePlayerPress = useCallback((player: FantasyPlayer) => {
    const inSquad = squadIds.has(player.id);
    if (inSquad) {
      setOutgoing(player);
    } else if (outgoing) {
      // Confirm swap
      const newSquad = squad.map((p) => (p.id === outgoing.id ? player : p));
      setSquad(newSquad);
      setPendingTransfers((prev) => [...prev, { out: outgoing, in: player }]);
      setBudget((prev) => prev + outgoing.price - player.price);
      setOutgoing(null);
    } else {
      // Show info
      router.push(`/fantasy/player/${player.leagueId}_${player.id}` as any);
    }
  }, [outgoing, squad, squadIds, router]);

  const removeTransfer = (index: number) => {
    const t = pendingTransfers[index];
    setSquad((prev) => prev.map((p) => (p.id === t.in.id ? t.out : p)));
    setBudget((prev) => prev - t.out.price + t.in.price);
    setPendingTransfers((prev) => prev.filter((_, i) => i !== index));
  };

  const cancelAll = () => {
    setSquad(originalSquad);
    setBudget(budget + pendingTransfers.reduce((s, t) => s + t.in.price - t.out.price, 0));
    setPendingTransfers([]);
    setOutgoing(null);
  };

  const handleConfirm = async () => {
    if (pendingTransfers.length === 0) return;
    if (!userProfile?.uid || !leagueId) return;
    setCommitting(true);
    const optimisticSquad = [...squad];
    try {
      const functions = getFunctions();
      const commitTransfers = httpsCallable(functions, 'commitTransfers');
      await commitTransfers({ leagueId, players: squad });
      setOriginalSquad(optimisticSquad);
      setPendingTransfers([]);
      Alert.alert('Transfers confirmed', `${pendingTransfers.length} transfer${pendingTransfers.length > 1 ? 's' : ''} saved.`);
    } catch (err: any) {
      // Revert
      setSquad(originalSquad);
      Alert.alert('Transfer failed', err?.message ?? 'Please try again.');
    } finally {
      setCommitting(false);
    }
  };

  const isOverBudget = budgetRemaining < 0;
  const transferCost = Math.max(0, pendingTransfers.length - transfersRemaining) * 4;

  const renderPlayer = useCallback(({ item }: { item: FantasyPlayer }) => {
    const inSquad = squadIds.has(item.id);
    const isSelectedOut = outgoing?.id === item.id;
    const clubCount = squad.filter((p) => p.clubId === item.clubId && p.id !== item.id).length;
    const posCount = squad.filter((p) => p.position === item.position && !inSquad).length;
    const overBudgetForThis = !inSquad && budgetRemaining < item.price;
    const unavailable = !inSquad && (clubCount >= 3 || overBudgetForThis);

    return (
      <TouchableOpacity
        style={[
          styles.playerRow,
          isSelectedOut && { borderColor: PALETTE.danger, borderWidth: 1.5 },
        ]}
        onPress={() => handlePlayerPress(item)}
        activeOpacity={0.8}
      >
        <KitSwatch player={item} size={42} />
        <View style={styles.playerInfo}>
          <View style={styles.playerNameRow}>
            <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
            {inSquad && (
              <View style={styles.squadBadge}>
                <Text style={styles.squadBadgeText}>SQUAD</Text>
              </View>
            )}
          </View>
          <Text style={styles.playerMeta}>
            {item.clubName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3)} ·{' '}
            <Text style={{ color: POS_COLORS[item.position] ?? PALETTE.primary }}>{item.position}</Text>
            {' · '}Form {item.form.toFixed(1)}
          </Text>
        </View>
        <View style={styles.playerStats}>
          <Text style={styles.playerPrice}>£{item.price.toFixed(1)}m</Text>
          <Text style={styles.playerPoints}>{item.gameweekPoints} pts</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addRemoveBtn,
            inSquad ? styles.btnRemove : unavailable ? styles.btnDisabled : styles.btnAdd,
          ]}
          onPress={() => inSquad ? setOutgoing(isSelectedOut ? null : item) : (unavailable ? null : handlePlayerPress(item))}
          disabled={unavailable && !inSquad}
        >
          <Ionicons
            name={inSquad ? 'remove' : 'add'}
            size={18}
            color={inSquad ? PALETTE.danger : unavailable ? PALETTE.muted : PALETTE.primary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [squadIds, outgoing, squad, budgetRemaining, handlePlayerPress]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={PALETTE.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={PALETTE.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.budgetAmount, isOverBudget && { color: PALETTE.danger }]}>
            £{budgetRemaining.toFixed(1)}m
          </Text>
          <Text style={styles.budgetLabel}>remaining</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerStat}>{squad.length}/15</Text>
          <Text style={styles.headerStatLabel}>players</Text>
        </View>
      </View>

      <View style={styles.transfersBar}>
        <Ionicons name="swap-horizontal-outline" size={14} color={PALETTE.secondary} />
        <Text style={styles.transfersText}>
          {transfersRemaining} free transfer{transfersRemaining !== 1 ? 's' : ''} remaining
        </Text>
        {outgoing && (
          <View style={styles.swapHint}>
            <Text style={styles.swapHintText}>Select incoming player for {outgoing.shortName}</Text>
          </View>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        {POS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.posTab, posFilter === tab && styles.posTabActive]}
            onPress={() => setPosFilter(tab)}
          >
            <Text style={[styles.posTabText, posFilter === tab && styles.posTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSortMenu((v) => !v)}>
          <Ionicons name="funnel-outline" size={15} color={PALETTE.secondary} />
          <Text style={styles.sortBtnText}>{sortOption}</Text>
          <Ionicons name={showSortMenu ? 'chevron-up' : 'chevron-down'} size={12} color={PALETTE.muted} />
        </TouchableOpacity>
      </View>

      {showSortMenu && (
        <View style={styles.sortMenu}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.sortMenuItem, sortOption === opt && styles.sortMenuItemActive]}
              onPress={() => { setSortOption(opt); setShowSortMenu(false); }}
            >
              <Text style={[styles.sortMenuText, sortOption === opt && { color: PALETTE.primary }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={PALETTE.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search players or clubs"
          placeholderTextColor={PALETTE.muted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={PALETTE.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Player List */}
      <FlashList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPlayer}
        getItemLayout={(_, index) => ({ length: 72, offset: 72 * index, index })}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        ListFooterComponent={<View style={{ height: pendingTransfers.length > 0 ? 180 : insets.bottom + 20 }} />}
        ListHeaderComponent={<View style={{ height: 4 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No players match your filters.</Text>
          </View>
        }
      />

      {/* Pending Changes Panel */}
      {pendingTransfers.length > 0 && (
        <View style={[styles.pendingPanel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.pendingTransfers}>
            {pendingTransfers.slice(0, 3).map((t, i) => (
              <View key={i} style={styles.pendingRow}>
                <View style={styles.pendingOut}>
                  <Ionicons name="arrow-up" size={12} color={PALETTE.danger} />
                  <Text style={styles.pendingOutName} numberOfLines={1}>{t.out.shortName}</Text>
                </View>
                <Ionicons name="swap-horizontal" size={14} color={PALETTE.muted} />
                <View style={styles.pendingIn}>
                  <Ionicons name="arrow-down" size={12} color={PALETTE.success} />
                  <Text style={styles.pendingInName} numberOfLines={1}>{t.in.shortName}</Text>
                </View>
                <TouchableOpacity onPress={() => removeTransfer(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={PALETTE.muted} />
                </TouchableOpacity>
              </View>
            ))}
            {pendingTransfers.length > 3 && (
              <Text style={styles.moreTransfers}>+{pendingTransfers.length - 3} more</Text>
            )}
          </View>
          <Text style={styles.transferCostText}>
            {pendingTransfers.length} transfer{pendingTransfers.length !== 1 ? 's' : ''} · Cost: {transferCost > 0 ? `-${transferCost} pts` : '0 pts'}
          </Text>
          <View style={styles.pendingActions}>
            <TouchableOpacity style={styles.cancelAllBtn} onPress={cancelAll}>
              <Text style={styles.cancelAllText}>Cancel All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, (committing || isOverBudget) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={committing || isOverBudget}
            >
              {committing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm {pendingTransfers.length} Transfer{pendingTransfers.length !== 1 ? 's' : ''}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PALETTE.border,
  },
  headerCenter: { alignItems: 'center' },
  budgetAmount: { fontSize: 24, fontWeight: '800', color: PALETTE.secondary },
  budgetLabel: { fontSize: 11, color: PALETTE.muted, fontWeight: '600' },
  headerRight: { alignItems: 'flex-end' },
  headerStat: { fontSize: 16, fontWeight: '800', color: PALETTE.text },
  headerStatLabel: { fontSize: 10, color: PALETTE.muted, fontWeight: '600' },
  transfersBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: PALETTE.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border,
  },
  transfersText: { fontSize: 13, color: PALETTE.muted, fontWeight: '600' },
  swapHint: { marginLeft: 'auto', backgroundColor: PALETTE.warning + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  swapHintText: { fontSize: 11, color: PALETTE.warning, fontWeight: '700' },
  filtersRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border,
  },
  posTab: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: PALETTE.border },
  posTabActive: { backgroundColor: PALETTE.primary, borderColor: PALETTE.primary },
  posTabText: { fontSize: 12, fontWeight: '700', color: PALETTE.muted },
  posTabTextActive: { color: '#fff' },
  sortBtn: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: PALETTE.surface, borderRadius: 8, borderWidth: 1, borderColor: PALETTE.border,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  sortBtnText: { fontSize: 11, color: PALETTE.text, fontWeight: '700' },
  sortMenu: {
    position: 'absolute', right: 12, top: 120, zIndex: 10, backgroundColor: PALETTE.surface,
    borderRadius: 10, borderWidth: 1, borderColor: PALETTE.border, overflow: 'hidden',
  },
  sortMenuItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border },
  sortMenuItemActive: { backgroundColor: PALETTE.primary + '22' },
  sortMenuText: { fontSize: 13, fontWeight: '700', color: PALETTE.text },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginVertical: 8,
    backgroundColor: PALETTE.surface, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.border,
    paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: PALETTE.text, fontWeight: '600' },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', height: 72, paddingHorizontal: 12, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent',
  },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { fontSize: 14, fontWeight: '700', color: PALETTE.text, flex: 1 },
  squadBadge: { backgroundColor: PALETTE.secondary + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  squadBadgeText: { fontSize: 9, fontWeight: '800', color: PALETTE.secondary },
  playerMeta: { fontSize: 11, color: PALETTE.muted, marginTop: 3 },
  playerStats: { alignItems: 'flex-end' },
  playerPrice: { fontSize: 13, fontWeight: '700', color: PALETTE.secondary },
  playerPoints: { fontSize: 11, color: PALETTE.muted, marginTop: 2 },
  addRemoveBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnAdd: { borderColor: PALETTE.primary, backgroundColor: PALETTE.primary + '22' },
  btnRemove: { borderColor: PALETTE.danger, backgroundColor: PALETTE.danger + '22' },
  btnDisabled: { borderColor: PALETTE.border, backgroundColor: PALETTE.surface },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: PALETTE.muted, fontWeight: '600' },
  pendingPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: PALETTE.surface,
    borderTopWidth: 1, borderTopColor: PALETTE.border, paddingHorizontal: 16, paddingTop: 12, gap: 8,
  },
  pendingTransfers: { gap: 6 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingOut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pendingOutName: { fontSize: 12, color: PALETTE.danger, fontWeight: '700', flex: 1 },
  pendingIn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pendingInName: { fontSize: 12, color: PALETTE.success, fontWeight: '700', flex: 1 },
  moreTransfers: { fontSize: 11, color: PALETTE.muted, fontWeight: '600' },
  transferCostText: { fontSize: 12, color: PALETTE.muted, fontWeight: '600' },
  pendingActions: { flexDirection: 'row', gap: 10 },
  cancelAllBtn: {
    flex: 0, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: PALETTE.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelAllText: { fontSize: 13, color: PALETTE.muted, fontWeight: '700' },
  confirmBtn: {
    flex: 1, backgroundColor: PALETTE.primary, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
