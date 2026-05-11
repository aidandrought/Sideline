// app/fantasy/browse.tsx
// League Discovery / Browse screen

import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import type { FantasyLeague } from '../../types/fantasy';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0B1220',
  surface: '#172033',
  accent: '#10B981',
  cyan: '#3DD9D6',
  text: '#F5F7FA',
  muted: '#94A3B8',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  gold: '#FFD700',
  pitchGreen: '#1F8A4C',
  border: '#1E2D45',
};

// ─── Competition data ─────────────────────────────────────────────────────────

const COMP_NAMES: Record<number, { name: string; emoji: string }> = {
  1:   { name: 'World Cup',             emoji: '🌍' },
  2:   { name: 'UEFA Champions League', emoji: '⭐' },
  3:   { name: 'UEFA Europa League',    emoji: '🟠' },
  39:  { name: 'Premier League',        emoji: '🦁' },
  61:  { name: 'Ligue 1',              emoji: '🇫🇷' },
  78:  { name: 'Bundesliga',            emoji: '🦅' },
  100: { name: 'Euro Championship',     emoji: '🏆' },
  101: { name: 'Copa America',          emoji: '🏆' },
  135: { name: 'Serie A',              emoji: '🇮🇹' },
  140: { name: 'La Liga',              emoji: '🇪🇸' },
  253: { name: 'MLS',                  emoji: '🇺🇸' },
};

const FORMAT_LABEL: Record<string, string> = {
  overall: 'Overall',
  h2h: 'H2H',
};

// ─── Tab IDs ──────────────────────────────────────────────────────────────────

type TabId = 'system' | 'community' | 'private';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Featured World Cup card ─────────────────────────────────────────────────

function FeaturedCard({
  league,
  onJoin,
  joining,
}: {
  league: FantasyLeague;
  onJoin: (id: string) => void;
  joining: boolean;
}) {
  return (
    <View style={fs.card}>
      <View style={fs.gradient}>
        <Text style={fs.badge}>⭐ FEATURED</Text>
        <Text style={fs.title}>🏆 FIFA World Cup 2026</Text>
        <Text style={fs.subtitle}>June 2026 · 48 Teams · USA / Canada / Mexico</Text>
        <View style={fs.row}>
          <View style={fs.memberBadge}>
            <Ionicons name="people" size={13} color={C.gold} />
            <Text style={fs.memberText}>{(league.memberCount ?? 0).toLocaleString()} members</Text>
          </View>
          <TouchableOpacity
            style={[fs.joinBtn, joining && { opacity: 0.5 }]}
            onPress={() => onJoin(league.id)}
            disabled={joining}
            activeOpacity={0.8}
          >
            {joining ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={fs.joinBtnText}>JOIN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const fs = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: C.gold,
  },
  gradient: {
    backgroundColor: '#1A1200',
    padding: 20,
  },
  badge: { fontSize: 11, fontWeight: '800', color: C.gold, letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: C.muted, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2A2000',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  memberText: { fontSize: 12, color: C.gold, fontWeight: '600' },
  joinBtn: {
    backgroundColor: C.gold,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  joinBtnText: { color: '#000', fontSize: 14, fontWeight: '900' },
});

// ─── Regular league row ───────────────────────────────────────────────────────

function LeagueRow({
  league,
  onPress,
  onJoin,
  joining,
}: {
  league: FantasyLeague;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
}) {
  const emoji = league.emoji ?? (league.competitionPool?.[0] ? COMP_NAMES[league.competitionPool[0]]?.emoji : '⚽') ?? '⚽';
  const compLabel = league.competitionPool
    ?.slice(0, 2)
    .map((id) => COMP_NAMES[id]?.emoji ?? '🏆')
    .join('') ?? '';

  return (
    <TouchableOpacity style={lr.row} onPress={onPress} activeOpacity={0.8}>
      <View style={lr.iconWrap}>
        <Text style={lr.emoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={lr.name} numberOfLines={1}>{league.name}</Text>
        <View style={lr.meta}>
          {compLabel ? <Text style={lr.metaText}>{compLabel}</Text> : null}
          <Text style={lr.metaText}>
            <Ionicons name="people-outline" size={11} color={C.muted} /> {league.memberCount ?? 0}
          </Text>
          {league.format && (
            <View style={lr.formatBadge}>
              <Text style={lr.formatText}>{FORMAT_LABEL[league.format] ?? league.format}</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[lr.joinBtn, joining && { opacity: 0.5 }]}
        onPress={onJoin}
        disabled={joining}
        activeOpacity={0.8}
      >
        {joining ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={lr.joinBtnText}>Join</Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const lr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: C.muted },
  formatBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: '#1A2A40',
    borderWidth: 1,
    borderColor: C.cyan,
  },
  formatText: { fontSize: 10, fontWeight: '700', color: C.cyan },
  joinBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 54,
    alignItems: 'center',
  },
  joinBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('system');
  const [systemLeagues, setSystemLeagues] = useState<FantasyLeague[]>([]);
  const [communityLeagues, setCommunityLeagues] = useState<FantasyLeague[]>([]);
  const [myPrivateLeagues, setMyPrivateLeagues] = useState<FantasyLeague[]>([]);

  const [systemLoading, setSystemLoading] = useState(true);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [privateLoading, setPrivateLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 350);

  const [joiningId, setJoiningId] = useState<string | null>(null);

  // ── Load system leagues ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setSystemLoading(true);
    getDocs(
      query(collection(db, 'fantasyLeagues'), where('tier', '==', 'system'), limit(20))
    )
      .then((snap) => {
        if (cancelled) return;
        setSystemLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FantasyLeague)));
      })
      .catch((e) => console.error('[Browse] system leagues:', e))
      .finally(() => { if (!cancelled) setSystemLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Load community leagues ───────────────────────────────────────────────

  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'fantasyLeagues'),
          where('tier', '==', 'community'),
          where('visibility', '==', 'public'),
          orderBy('memberCount', 'desc'),
          limit(50)
        )
      );
      setCommunityLeagues(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FantasyLeague)));
    } catch (e) {
      console.error('[Browse] community leagues:', e);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  // ── Load user's private leagues ───────────────────────────────────────────

  const loadPrivate = useCallback(async () => {
    if (!userProfile?.uid) return;
    setPrivateLoading(true);
    try {
      // Get user's league memberships then fetch matching private leagues
      const memberSnap = await getDocs(
        query(collection(db, 'fantasyLeagueMembers'), where('userId', '==', userProfile.uid))
      );
      if (memberSnap.empty) { setMyPrivateLeagues([]); return; }
      const leagueIds = memberSnap.docs.map((d) => d.data().leagueId as string);
      const leagues: FantasyLeague[] = [];
      for (let i = 0; i < leagueIds.length; i += 10) {
        const chunk = leagueIds.slice(i, i + 10);
        const snap = await getDocs(
          query(collection(db, 'fantasyLeagues'), where('__name__', 'in', chunk))
        );
        snap.docs.forEach((d) => {
          const l = { id: d.id, ...d.data() } as FantasyLeague;
          if (l.visibility === 'secret' || l.visibility === 'friends') leagues.push(l);
        });
      }
      setMyPrivateLeagues(leagues);
    } catch (e) {
      console.error('[Browse] private leagues:', e);
    } finally {
      setPrivateLoading(false);
    }
  }, [userProfile?.uid]);

  // Trigger loads when tabs are activated
  useEffect(() => {
    if (activeTab === 'community' && communityLeagues.length === 0) loadCommunity();
    if (activeTab === 'private' && myPrivateLeagues.length === 0) loadPrivate();
  }, [activeTab]);

  // ── Join league ───────────────────────────────────────────────────────────

  const handleJoin = useCallback(async (leagueId: string) => {
    if (joiningId) return;
    setJoiningId(leagueId);
    try {
      const functions = getFunctions();
      const joinFn = httpsCallable<{ leagueId: string }, { success: boolean; error?: string }>(
        functions,
        'joinLeague'
      );
      const result = await joinFn({ leagueId });
      if (result.data.success) {
        router.push(`/fantasy/league/${leagueId}`);
      } else {
        const msg = result.data.error ?? 'Unable to join.';
        if (msg.includes('already')) {
          router.push(`/fantasy/league/${leagueId}`);
        } else {
          Alert.alert('Error', msg);
        }
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('already')) {
        router.push(`/fantasy/league/${leagueId}`);
      } else {
        Alert.alert('Error', 'Unable to join league. Please try again.');
      }
    } finally {
      setJoiningId(null);
    }
  }, [joiningId, router]);

  // ── Filtered community leagues ────────────────────────────────────────────

  const filteredCommunity = communityLeagues.filter((l) => {
    if (!debouncedSearch) return true;
    return l.name.toLowerCase().includes(debouncedSearch.toLowerCase());
  });

  // Separate WC from rest in system leagues
  const wcLeague = systemLeagues.find((l) => l.competitionPool?.includes(1));
  const otherSystem = systemLeagues.filter((l) => l.id !== wcLeague?.id);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Find a League</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tab strip */}
      <View style={s.tabStrip}>
        {(['system', 'community', 'private'] as TabId[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>
              {tab === 'system' ? 'System' : tab === 'community' ? 'Community' : 'Private'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── SYSTEM TAB ── */}
      {activeTab === 'system' && (
        systemLoading ? (
          <View style={s.centered}>
            <ActivityIndicator color={C.accent} size="large" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[s.tabContent, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
          >
            {wcLeague && (
              <FeaturedCard
                league={wcLeague}
                onJoin={handleJoin}
                joining={joiningId === wcLeague.id}
              />
            )}
            {!wcLeague && (
              <View style={s.wcPlaceholder}>
                <View style={[fs.card, { marginHorizontal: 0 }]}>
                  <View style={fs.gradient}>
                    <Text style={fs.badge}>⭐ FEATURED</Text>
                    <Text style={fs.title}>🏆 FIFA World Cup 2026</Text>
                    <Text style={fs.subtitle}>June 2026 · 48 Teams · USA / Canada / Mexico</Text>
                    <Text style={[s.soonText]}>Coming Soon</Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={s.sectionLabel}>All System Leagues</Text>
            {otherSystem.length === 0 && (
              <Text style={s.emptyText}>No other system leagues available right now.</Text>
            )}
            {otherSystem.map((league) => (
              <View key={league.id} style={{ paddingHorizontal: 16 }}>
                <LeagueRow
                  league={league}
                  onPress={() => router.push(`/fantasy/league/${league.id}`)}
                  onJoin={() => handleJoin(league.id)}
                  joining={joiningId === league.id}
                />
              </View>
            ))}

            <View style={s.disclaimer}>
              <Text style={s.disclaimerText}>
                Sideline is independent and not affiliated with the Premier League, FIFA, UEFA, or any club.
              </Text>
            </View>
          </ScrollView>
        )
      )}

      {/* ── COMMUNITY TAB ── */}
      {activeTab === 'community' && (
        <View style={{ flex: 1 }}>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={C.muted} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search leagues…"
              placeholderTextColor={C.muted}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {communityLoading ? (
            <View style={s.centered}>
              <ActivityIndicator color={C.accent} size="large" />
            </View>
          ) : (
            <FlatList
              data={filteredCommunity}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[s.tabContent, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={s.emptyText}>
                  {debouncedSearch ? 'No leagues match your search.' : 'No community leagues found.'}
                </Text>
              }
              ListFooterComponent={
                <View style={s.disclaimer}>
                  <Text style={s.disclaimerText}>
                    Sideline is independent and not affiliated with the Premier League, FIFA, UEFA, or any club.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <LeagueRow
                  league={item}
                  onPress={() => router.push(`/fantasy/league/${item.id}`)}
                  onJoin={() => handleJoin(item.id)}
                  joining={joiningId === item.id}
                />
              )}
            />
          )}
        </View>
      )}

      {/* ── PRIVATE TAB ── */}
      {activeTab === 'private' && (
        <ScrollView
          contentContainerStyle={[s.tabContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* My private leagues */}
          <Text style={s.sectionLabel}>My Private Leagues</Text>
          {privateLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
          ) : myPrivateLeagues.length === 0 ? (
            <Text style={s.emptyText}>You haven't joined any private leagues yet.</Text>
          ) : (
            myPrivateLeagues.map((league) => (
              <LeagueRow
                key={league.id}
                league={league}
                onPress={() => router.push(`/fantasy/league/${league.id}`)}
                onJoin={() => router.push(`/fantasy/league/${league.id}`)}
                joining={false}
              />
            ))
          )}

          <View style={s.divider} />

          {/* Join with code */}
          <TouchableOpacity
            style={s.bigBtn}
            onPress={() => router.push('/fantasy/join')}
            activeOpacity={0.8}
          >
            <Ionicons name="key-outline" size={22} color="#fff" />
            <View>
              <Text style={s.bigBtnTitle}>Join with Code</Text>
              <Text style={s.bigBtnSub}>Enter an 8-character invite code</Text>
            </View>
          </TouchableOpacity>

          {/* Create private league */}
          <TouchableOpacity
            style={[s.bigBtn, s.bigBtnOutline]}
            onPress={() => router.push('/fantasy/create/step1-name')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={22} color={C.accent} />
            <View>
              <Text style={[s.bigBtnTitle, { color: C.accent }]}>Create Private League</Text>
              <Text style={s.bigBtnSub}>Set up your own invite-only competition</Text>
            </View>
          </TouchableOpacity>

          <View style={s.disclaimer}>
            <Text style={s.disclaimerText}>
              Sideline is independent and not affiliated with the Premier League, FIFA, UEFA, or any club.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  // Tabs
  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: C.muted },
  tabBtnTextActive: { color: '#fff' },
  // Content
  tabContent: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', paddingVertical: 24 },
  soonText: { fontSize: 16, fontWeight: '700', color: C.gold, textAlign: 'center', marginTop: 8 },
  wcPlaceholder: { marginHorizontal: 16, marginBottom: 12 },
  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: C.text },
  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: 16,
  },
  // Big buttons (private tab)
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.accent,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  bigBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.accent },
  bigBtnTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  bigBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  // Disclaimer
  disclaimer: {
    marginTop: 16,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  disclaimerText: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
