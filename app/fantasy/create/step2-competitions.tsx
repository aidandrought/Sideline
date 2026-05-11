// app/fantasy/create/step2-competitions.tsx
// Create League wizard — Step 2: Choose competitions

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateLeagueStore } from '../../../hooks/useFantasy';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0B1220',
  surface: '#172033',
  accent: '#10B981',
  cyan: '#3DD9D6',
  text: '#F5F7FA',
  muted: '#94A3B8',
  danger: '#EF4444',
  warning: '#F59E0B',
  gold: '#FFD700',
  border: '#1E2D45',
  progressBg: '#1E2D45',
};

// ─── Competition data ─────────────────────────────────────────────────────────

interface Competition {
  id: number;
  name: string;
  emoji: string;
  featured?: boolean;
}

const COMPETITIONS: Competition[] = [
  { id: 1,   name: 'World Cup 2026',           emoji: '🌍', featured: true },
  { id: 100, name: 'Euro Championship',         emoji: '🏆' },
  { id: 101, name: 'Copa America',              emoji: '🏆' },
  { id: 2,   name: 'UEFA Champions League',     emoji: '⭐' },
  { id: 3,   name: 'UEFA Europa League',        emoji: '🟠' },
  { id: 39,  name: 'Premier League',            emoji: '🦁' },
  { id: 140, name: 'La Liga',                   emoji: '🇪🇸' },
  { id: 78,  name: 'Bundesliga',                emoji: '🦅' },
  { id: 135, name: 'Serie A',                   emoji: '🇮🇹' },
  { id: 61,  name: 'Ligue 1',                   emoji: '🇫🇷' },
  { id: 253, name: 'MLS',                       emoji: '🇺🇸' },
];

// ─── Preset configs ───────────────────────────────────────────────────────────

const PRESETS: { label: string; ids: number[] }[] = [
  { label: '🌍 World Cup Only', ids: [1] },
  { label: '🏆 Top 5 Leagues',  ids: [39, 140, 78, 135, 61] },
  { label: '🇺🇸 MLS Only',      ids: [253] },
  { label: '🌐 Everything',     ids: [39, 140, 78, 135, 61, 2, 3, 253, 1, 100, 101] },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Step2CompetitionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const competitionPool = useCreateLeagueStore((s) => s.competitionPool);
  const setCompetitionPool = useCreateLeagueStore((s) => s.setCompetitionPool);

  const toggle = (id: number) => {
    if (competitionPool.includes(id)) {
      setCompetitionPool(competitionPool.filter((x) => x !== id));
    } else {
      setCompetitionPool([...competitionPool, id]);
    }
  };

  const applyPreset = (ids: number[]) => {
    setCompetitionPool(ids);
  };

  const canAdvance = competitionPool.length > 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Step 2 of 3 — Choose Competitions</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: '66%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Presets */}
        <Text style={s.sectionLabel}>Quick Select</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.presetsScroll}>
          {PRESETS.map((preset) => {
            const active =
              preset.ids.length === competitionPool.length &&
              preset.ids.every((id) => competitionPool.includes(id));
            return (
              <TouchableOpacity
                key={preset.label}
                style={[s.presetChip, active && s.presetChipActive]}
                onPress={() => applyPreset(preset.ids)}
                activeOpacity={0.75}
              >
                <Text style={[s.presetChipText, active && s.presetChipTextActive]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Competition list */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>Competitions</Text>

        {COMPETITIONS.map((comp) => {
          const selected = competitionPool.includes(comp.id);
          const isWC = comp.featured;
          return (
            <TouchableOpacity
              key={comp.id}
              style={[
                s.compItem,
                selected && s.compItemSelected,
                isWC && selected && s.compItemWC,
              ]}
              onPress={() => toggle(comp.id)}
              activeOpacity={0.75}
            >
              <Text style={s.compEmoji}>{comp.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.compName, selected && { color: C.text }]}>
                  {comp.name}
                  {isWC && <Text style={s.featuredTag}> FEATURED</Text>}
                </Text>
              </View>
              <View style={[s.checkbox, selected && s.checkboxSelected]}>
                {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Warning */}
        {!canAdvance && (
          <View style={s.warningBox}>
            <Ionicons name="warning-outline" size={16} color={C.warning} />
            <Text style={s.warningText}>Select at least one competition to continue.</Text>
          </View>
        )}

        {/* Selected count */}
        {canAdvance && (
          <View style={s.selectedInfo}>
            <Text style={s.selectedInfoText}>
              {competitionPool.length} competition{competitionPool.length !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer nav */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
          onPress={() => router.push('/fantasy/create/step3-rules')}
          disabled={!canAdvance}
          activeOpacity={0.8}
        >
          <Text style={s.nextBtnText}>Next: Configure Rules</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
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
  headerTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  progressTrack: { height: 4, backgroundColor: C.progressBg },
  progressFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  scroll: { padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  presetsScroll: { marginBottom: 4 },
  presetChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  presetChipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  presetChipTextActive: { color: '#fff' },
  // Competition item
  compItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  compItemSelected: { borderColor: C.accent },
  compItemWC: { borderColor: C.gold, borderWidth: 2 },
  compEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  compName: { fontSize: 15, fontWeight: '600', color: C.muted },
  featuredTag: { fontSize: 11, fontWeight: '800', color: C.gold },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.accent, borderColor: C.accent },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A2010',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.warning,
  },
  warningText: { flex: 1, fontSize: 13, color: C.warning },
  selectedInfo: { marginTop: 8, alignItems: 'center' },
  selectedInfoText: { fontSize: 13, color: C.cyan, fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  nextBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
