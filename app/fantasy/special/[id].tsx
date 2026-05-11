// app/fantasy/special/[id].tsx
// Special competition fantasy entry — Champions League or World Cup

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import {
  SPECIAL_LEAGUES,
  createLeague,
  getUserLeagues,
  joinLeague,
  LEAGUE_TYPES,
  FantasyLeague,
} from '../../../services/fantasyService';

export default function SpecialCompetitionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();

  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', text: '#E6E6E9', subtext: '#A1A1A6', accent: '#4DA3FF', border: '#2C2C2E', surface: '#2C2C2E', gold: '#FBBF24', green: '#34D399' }
        : { background: '#F5F5F7', card: '#FFFFFF', text: '#000000', subtext: '#666666', accent: '#0066CC', border: '#E5E5E5', surface: '#F0F0F5', gold: '#D97706', green: '#059669' },
    [isDark]
  );

  const special = SPECIAL_LEAGUES.find((s) => s.id === id);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [myLeague, setMyLeague] = useState<FantasyLeague | null>(null);

  const loadData = useCallback(async () => {
    if (!userProfile?.uid || !special) return;
    try {
      const leagues = await getUserLeagues(userProfile.uid);
      const existing = leagues.find((l) => l.type === special.id || l.competitionId === special.competitionId);
      setMyLeague(existing ?? null);
    } catch (err) {
      console.error('Error loading special competition:', err);
    } finally {
      setLoading(false);
    }
  }, [userProfile?.uid, special]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleEnter = async () => {
    if (!userProfile?.uid || !special) return;
    setJoining(true);
    try {
      // Create or join the global league for this special competition
      const globalLeagueId = `special_${special.id}_${new Date().getFullYear()}`;
      await createLeague({
        name: special.name,
        type: LEAGUE_TYPES.GLOBAL,
        competitionId: special.competitionId,
        competitionName: special.name,
        isPrivate: false,
        emoji: special.emoji,
        ownerId: userProfile.uid,
        ownerUsername: userProfile.username ?? 'Manager',
      }).catch(async () => {
        // League already exists — just join it
        await joinLeague(globalLeagueId, userProfile.uid, userProfile.username ?? 'Manager', `${userProfile.username ?? 'Manager'}'s Team`);
      });

      await loadData();
      router.push(`/fantasy/team/${globalLeagueId}` as any);
    } catch (err) {
      Alert.alert('Error', 'Could not enter competition. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  if (!special) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: palette.subtext }}>Competition not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isActive = special.active;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>{special.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>{special.emoji}</Text>
            <Text style={[styles.heroTitle, { color: palette.text }]}>{special.name}</Text>
            {!isActive && (
              <View style={[styles.comingSoonBadge, { backgroundColor: palette.gold + '22', borderColor: palette.gold }]}>
                <Text style={[styles.comingSoonText, { color: palette.gold }]}>Coming When Competition Starts</Text>
              </View>
            )}
          </View>

          {/* Info cards */}
          <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {[
              { icon: 'people-outline', label: 'Format', value: 'Global open competition — everyone can enter' },
              { icon: 'football-outline', label: 'Players', value: `Pick from ${special.name.includes('Champions') ? 'all CL clubs' : 'all 32 national teams'}` },
              { icon: 'trophy-outline', label: 'Scoring', value: 'Standard fantasy scoring system — goals, assists, clean sheets' },
              { icon: 'wallet-outline', label: 'Budget', value: '£100m starting budget, 15 players' },
              { icon: 'refresh-outline', label: 'Transfers', value: '1 free transfer per gameweek' },
            ].map((row, idx, arr) => (
              <View
                key={row.label}
                style={[
                  styles.infoRow,
                  idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
                ]}
              >
                <Ionicons name={row.icon as any} size={18} color={palette.accent} style={{ width: 24 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: palette.subtext }]}>{row.label}</Text>
                  <Text style={[styles.infoValue, { color: palette.text }]}>{row.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          {myLeague ? (
            <View style={styles.ctaArea}>
              <View style={[styles.alreadyEnteredCard, { backgroundColor: palette.green + '15', borderColor: palette.green }]}>
                <Ionicons name="checkmark-circle" size={20} color={palette.green} />
                <Text style={[styles.alreadyEnteredText, { color: palette.green }]}>You&apos;re entered!</Text>
              </View>
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: palette.accent }]}
                onPress={() => router.push(`/fantasy/league/${myLeague.id}` as any)}
              >
                <Text style={styles.ctaBtnText}>View League</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctaBtnSecondary, { borderColor: palette.accent }]}
                onPress={() => router.push(`/fantasy/team/${myLeague.id}` as any)}
              >
                <Text style={[styles.ctaBtnSecondaryText, { color: palette.accent }]}>Edit My Squad</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.ctaArea}>
              <TouchableOpacity
                style={[
                  styles.ctaBtn,
                  { backgroundColor: isActive ? palette.accent : palette.surface },
                ]}
                onPress={isActive ? handleEnter : undefined}
                disabled={!isActive || joining}
                activeOpacity={isActive ? 0.8 : 1}
              >
                {joining
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.ctaBtnText, { color: isActive ? '#fff' : palette.subtext }]}>
                      {isActive ? `Enter ${special.name}` : 'Not Available Yet'}
                    </Text>}
              </TouchableOpacity>
              {!isActive && (
                <Text style={[styles.ctaHint, { color: palette.subtext }]}>
                  This competition will unlock when the tournament begins.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  hero: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  heroEmoji: { fontSize: 64 },
  heroTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  comingSoonBadge: {
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6,
  },
  comingSoonText: { fontSize: 13, fontWeight: '600' },
  infoCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  infoValue: { fontSize: 13 },
  ctaArea: { gap: 10 },
  ctaBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ctaBtnSecondary: {
    borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center',
  },
  ctaBtnSecondaryText: { fontSize: 15, fontWeight: '600' },
  ctaHint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16 },
  alreadyEnteredCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, borderWidth: 1.5, paddingVertical: 12,
  },
  alreadyEnteredText: { fontSize: 15, fontWeight: '700' },
});
