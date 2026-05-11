// app/fantasy/join.tsx
// Join a league by invite code

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../config/firebase';
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
  border: '#1E2D45',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCode(raw: string): string {
  // Strip non-alphanumeric, uppercase, limit to 8 chars, insert dash after 4
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  if (clean.length > 4) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean;
}

function rawCode(formatted: string): string {
  return formatted.replace('-', '');
}

const TIER_LABELS: Record<string, string> = {
  system: 'System',
  community: 'Community',
  private: 'Private',
};

const TIER_COLORS: Record<string, string> = {
  system: C.gold,
  community: C.cyan,
  private: C.accent,
};

const FORMAT_LABELS: Record<string, string> = {
  overall: 'Overall Standings',
  h2h: 'Head-to-Head',
};

const COMPETITION_NAMES: Record<number, string> = {
  1: 'World Cup',
  2: 'UEFA Champions League',
  3: 'UEFA Europa League',
  39: 'Premier League',
  61: 'Ligue 1',
  78: 'Bundesliga',
  135: 'Serie A',
  140: 'La Liga',
  253: 'MLS',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinLeagueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [foundLeague, setFoundLeague] = useState<FantasyLeague | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = (text: string) => {
    setCode(formatCode(text));
    setFoundLeague(null);
    setError(null);
    setLeagueId(null);
  };

  const handleFind = async () => {
    const raw = rawCode(code);
    if (raw.length < 6) {
      setError('Please enter a valid invite code (e.g. ABCD-1234).');
      return;
    }
    setSearching(true);
    setError(null);
    setFoundLeague(null);
    setLeagueId(null);
    try {
      // Try inviteCodes/{code} index first
      const codeDocSnap = await getDoc(doc(db, 'inviteCodes', raw));
      let resolvedLeagueId: string | null = null;

      if (codeDocSnap.exists()) {
        resolvedLeagueId = (codeDocSnap.data() as { leagueId: string }).leagueId;
      } else {
        // Fallback: search fantasyLeagues directly
        const snap = await getDocs(
          query(collection(db, 'fantasyLeagues'), where('inviteCode', '==', raw))
        );
        if (!snap.empty) {
          resolvedLeagueId = snap.docs[0].id;
        }
      }

      if (!resolvedLeagueId) {
        setError('League not found. Check the code and try again.');
        return;
      }

      const leagueSnap = await getDoc(doc(db, 'fantasyLeagues', resolvedLeagueId));
      if (!leagueSnap.exists()) {
        setError('League not found. It may have been deleted.');
        return;
      }

      const league = leagueSnap.data() as FantasyLeague;
      setFoundLeague(league);
      setLeagueId(resolvedLeagueId);
    } catch (e) {
      console.error('[JoinLeague] find error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleJoin = async () => {
    if (!leagueId) return;
    setJoining(true);
    setError(null);
    try {
      const functions = getFunctions();
      const joinFn = httpsCallable<{ leagueId: string }, { success: boolean; error?: string }>(
        functions,
        'joinLeague'
      );
      const result = await joinFn({ leagueId });
      if (result.data.success) {
        router.replace(`/fantasy/league/${leagueId}`);
      } else {
        const msg = result.data.error ?? 'Unable to join league.';
        if (msg.includes('already')) {
          setError('Already a member of this league.');
        } else if (msg.includes('full')) {
          setError('This league is full.');
        } else {
          setError(msg);
        }
      }
    } catch (e: any) {
      const msg: string = e?.message ?? 'Unable to join league.';
      if (msg.includes('already')) {
        setError('Already a member of this league.');
      } else if (msg.includes('full')) {
        setError('This league is full.');
      } else {
        setError('Unable to join league. Please try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  const competitionNames = foundLeague?.competitionPool
    ?.map((id) => COMPETITION_NAMES[id] ?? `Competition ${id}`)
    .join(', ') ?? '';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Join a League</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Code input */}
          <View style={s.inputSection}>
            <Text style={s.label}>Invite Code</Text>
            <TextInput
              style={s.codeInput}
              value={code}
              onChangeText={handleCodeChange}
              placeholder="XXXX-XXXX"
              placeholderTextColor={C.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleFind}
              maxLength={9}
            />
            <Text style={s.codeHint}>Enter the 8-character code shared by the league admin.</Text>
          </View>

          {/* Find button */}
          <TouchableOpacity
            style={[s.btn, s.btnPrimary, (searching || code.replace('-', '').length < 6) && s.btnDisabled]}
            onPress={handleFind}
            disabled={searching || code.replace('-', '').length < 6}
            activeOpacity={0.8}
          >
            {searching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.btnText}>Find League</Text>
            )}
          </TouchableOpacity>

          {/* Error */}
          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={C.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* League preview card */}
          {foundLeague && (
            <View style={s.previewCard}>
              <View style={s.previewTop}>
                <Text style={s.previewEmoji}>{foundLeague.emoji ?? '⚽'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewName}>{foundLeague.name}</Text>
                  <View style={s.badgeRow}>
                    <View style={[s.badge, { borderColor: TIER_COLORS[foundLeague.tier] ?? C.muted }]}>
                      <Text style={[s.badgeText, { color: TIER_COLORS[foundLeague.tier] ?? C.muted }]}>
                        {TIER_LABELS[foundLeague.tier] ?? foundLeague.tier}
                      </Text>
                    </View>
                    {foundLeague.format && (
                      <View style={[s.badge, { borderColor: C.cyan }]}>
                        <Text style={[s.badgeText, { color: C.cyan }]}>
                          {FORMAT_LABELS[foundLeague.format] ?? foundLeague.format}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={s.divider} />

              <View style={s.previewMeta}>
                <View style={s.metaItem}>
                  <Ionicons name="people-outline" size={14} color={C.muted} />
                  <Text style={s.metaText}>{foundLeague.memberCount ?? 0} members</Text>
                </View>
                {foundLeague.maxMembers && (
                  <View style={s.metaItem}>
                    <Ionicons name="people-circle-outline" size={14} color={C.muted} />
                    <Text style={s.metaText}>Max {foundLeague.maxMembers}</Text>
                  </View>
                )}
                <View style={s.metaItem}>
                  <Ionicons name="eye-outline" size={14} color={C.muted} />
                  <Text style={s.metaText}>{foundLeague.visibility ?? 'public'}</Text>
                </View>
              </View>

              {competitionNames.length > 0 && (
                <View style={s.competitionsRow}>
                  <Ionicons name="football-outline" size={14} color={C.muted} />
                  <Text style={s.metaText} numberOfLines={2}>{competitionNames}</Text>
                </View>
              )}

              {foundLeague.description ? (
                <Text style={s.previewDesc}>{foundLeague.description}</Text>
              ) : null}

              {/* Join button */}
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, s.btnJoin, joining && s.btnDisabled]}
                onPress={handleJoin}
                disabled={joining}
                activeOpacity={0.8}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="enter-outline" size={18} color="#fff" />
                    <Text style={s.btnText}>Join League</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { padding: 16 },
  inputSection: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  codeHint: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 8 },
  btn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimary: { backgroundColor: C.accent },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnJoin: { marginTop: 16 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1520',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.danger,
  },
  errorText: { flex: 1, fontSize: 13, color: C.danger },
  // Preview card
  previewCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  previewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  previewEmoji: { fontSize: 36 },
  previewName: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 12 },
  previewMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.muted },
  competitionsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  previewDesc: { fontSize: 13, color: C.muted, marginTop: 10, lineHeight: 18 },
});
