// app/fantasy/team/[id]/chips.tsx
// Chip activation modal — presented from bottom

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useEffect } from 'react';
import { db } from '../../../../config/firebase';
import { useAuth } from '../../../../context/AuthContext';
import type { Chip, FantasyLeague } from '../../../../types/fantasy';

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

type ChipKey = 'wildcard' | 'benchBoost' | 'tripleCaptain' | 'freeHit';

interface ChipDef {
  key: ChipKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}

const CHIP_DEFS: ChipDef[] = [
  {
    key: 'wildcard',
    label: 'Wildcard',
    icon: 'sparkles-outline',
    description: 'Make unlimited transfers this gameweek. Squad resets at deadline.',
  },
  {
    key: 'benchBoost',
    label: 'Bench Boost',
    icon: 'people-outline',
    description: 'All 15 players score points this gameweek (including bench).',
  },
  {
    key: 'tripleCaptain',
    label: 'Triple Captain',
    icon: 'ribbon-outline',
    description: 'Your captain earns 3× points instead of 2×.',
  },
  {
    key: 'freeHit',
    label: 'Free Hit',
    icon: 'flash-outline',
    description: 'Temporary unlimited transfers — squad resets to original after the gameweek.',
  },
];

const GW_KEY: Record<ChipKey, keyof Chip> = {
  wildcard: 'wildcardUsedGw',
  benchBoost: 'benchBoostUsedGw',
  tripleCaptain: 'tripleCaptainUsedGw',
  freeHit: 'freeHitUsedGw',
};

export default function ChipsScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userProfile } = useAuth();

  const [chip, setChip] = useState<Chip | null>(null);
  const [league, setLeague] = useState<FantasyLeague | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<ChipKey | null>(null);

  useEffect(() => {
    if (!leagueId || !userProfile?.uid) { setLoading(false); return; }
    const chipId = `${userProfile.uid}_${leagueId}`;
    Promise.all([
      getDoc(doc(db, 'chips', chipId)),
      getDoc(doc(db, 'fantasyLeagues', leagueId)),
    ]).then(([chipSnap, leagueSnap]) => {
      if (chipSnap.exists()) setChip(chipSnap.data() as Chip);
      if (leagueSnap.exists()) setLeague(leagueSnap.data() as FantasyLeague);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [leagueId, userProfile?.uid]);

  const handleActivate = (chipDef: ChipDef) => {
    if (!userProfile?.uid || !leagueId) return;
    Alert.alert(
      `Activate ${chipDef.label}?`,
      chipDef.description,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setActivating(chipDef.key);
            try {
              const functions = getFunctions();
              const activateChip = httpsCallable(functions, 'activateChip');
              await activateChip({ leagueId, chipType: chipDef.key });
              setChip((prev) => prev ? { ...prev, activeChip: chipDef.key } : { userId: userProfile.uid, leagueId, activeChip: chipDef.key });
              Alert.alert('Chip Activated', `${chipDef.label} is now active this gameweek.`);
            } catch (err: any) {
              Alert.alert('Activation failed', err?.message ?? 'Please try again.');
            } finally {
              setActivating(null);
            }
          },
        },
      ]
    );
  };

  const getChipStatus = (chipDef: ChipDef): 'available' | 'active' | 'used' => {
    if (!chip) return 'available';
    if (chip.activeChip === chipDef.key) return 'active';
    const usedGw = chip[GW_KEY[chipDef.key]] as number | undefined;
    if (usedGw !== undefined && usedGw > 0) return 'used';
    return 'available';
  };

  const isEnabled = (chipDef: ChipDef): boolean => {
    if (!league?.rulesConfig?.chipsEnabled) return true;
    return !!league.rulesConfig.chipsEnabled[chipDef.key];
  };

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activate a Chip</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={PALETTE.text} />
        </TouchableOpacity>
      </View>
      <Text style={styles.headerSub}>Chips can only be activated once per season. You may only have one active chip at a time.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {CHIP_DEFS.map((chipDef) => {
          const status = getChipStatus(chipDef);
          const enabled = isEnabled(chipDef);
          const usedGw = chip ? (chip[GW_KEY[chipDef.key]] as number | undefined) : undefined;
          const isActivating = activating === chipDef.key;
          const isActive = status === 'active';
          const isUsed = status === 'used';
          const isAvailable = status === 'available' && enabled;

          return (
            <TouchableOpacity
              key={chipDef.key}
              style={[
                styles.chipCard,
                isActive && styles.chipCardActive,
                (isUsed || !enabled) && styles.chipCardUsed,
              ]}
              onPress={() => isAvailable && !isActivating ? handleActivate(chipDef) : undefined}
              activeOpacity={isAvailable ? 0.75 : 1}
            >
              <View style={styles.chipTop}>
                <View style={[styles.chipIconWrap, { backgroundColor: isActive ? PALETTE.primary + '33' : isUsed || !enabled ? PALETTE.muted + '22' : PALETTE.secondary + '22' }]}>
                  <Ionicons
                    name={chipDef.icon}
                    size={26}
                    color={isActive ? PALETTE.primary : isUsed || !enabled ? PALETTE.muted : PALETTE.secondary}
                  />
                </View>
                <View style={styles.chipInfo}>
                  <Text style={[styles.chipLabel, (isUsed || !enabled) && styles.textMuted]}>{chipDef.label}</Text>
                  <Text style={[styles.chipDesc, (isUsed || !enabled) && styles.textMuted]} numberOfLines={2}>
                    {chipDef.description}
                  </Text>
                </View>
                {isActivating ? (
                  <ActivityIndicator color={PALETTE.primary} size="small" />
                ) : (
                  <View style={[
                    styles.statusBadge,
                    isActive && styles.statusActive,
                    isUsed && styles.statusUsed,
                    isAvailable && styles.statusAvailable,
                    !enabled && styles.statusUsed,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      isActive && styles.statusTextActive,
                      isUsed && styles.statusTextUsed,
                      isAvailable && styles.statusTextAvailable,
                    ]}>
                      {isActive ? 'Active' : isUsed ? `Used GW ${usedGw}` : !enabled ? 'Disabled' : 'Available'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.usageText, (isUsed || !enabled) && styles.textMuted]}>
                {isUsed || !enabled ? (isUsed ? `Used in GW ${usedGw}` : 'Disabled in this league') : '1 use remaining'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: PALETTE.text },
  headerSub: { fontSize: 13, color: PALETTE.muted, paddingHorizontal: 16, paddingBottom: 12, lineHeight: 18 },
  scrollContent: { padding: 16, gap: 12 },
  chipCard: {
    backgroundColor: PALETTE.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 16, gap: 10,
  },
  chipCardActive: {
    borderColor: PALETTE.primary, borderWidth: 1.5,
  },
  chipCardUsed: {
    opacity: 0.55,
  },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chipIconWrap: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipInfo: { flex: 1 },
  chipLabel: { fontSize: 16, fontWeight: '800', color: PALETTE.text, marginBottom: 3 },
  chipDesc: { fontSize: 12, color: PALETTE.muted, lineHeight: 17 },
  textMuted: { color: PALETTE.muted },
  statusBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
    borderColor: PALETTE.border,
  },
  statusAvailable: { backgroundColor: PALETTE.success + '22', borderColor: PALETTE.success },
  statusActive: { backgroundColor: PALETTE.primary + '22', borderColor: PALETTE.primary },
  statusUsed: { backgroundColor: PALETTE.muted + '22', borderColor: PALETTE.muted },
  statusText: { fontSize: 11, fontWeight: '700', color: PALETTE.muted },
  statusTextAvailable: { color: PALETTE.success },
  statusTextActive: { color: PALETTE.primary },
  statusTextUsed: { color: PALETTE.muted },
  usageText: { fontSize: 12, fontWeight: '600', color: PALETTE.secondary },
});
