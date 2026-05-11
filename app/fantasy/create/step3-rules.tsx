// app/fantasy/create/step3-rules.tsx
// Create League wizard — Step 3: Rules & create

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
  success: '#22C55E',
  warning: '#F59E0B',
  border: '#1E2D45',
  progressBg: '#1E2D45',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Step3RulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const name = useCreateLeagueStore((s) => s.name);
  const description = useCreateLeagueStore((s) => s.description);
  const icon = useCreateLeagueStore((s) => s.icon);
  const competitionPool = useCreateLeagueStore((s) => s.competitionPool);
  const visibility = useCreateLeagueStore((s) => s.visibility);
  const format = useCreateLeagueStore((s) => s.format);
  const salaryCap = useCreateLeagueStore((s) => s.salaryCap);
  const maxPerClub = useCreateLeagueStore((s) => s.maxPerClub);
  const chipsEnabled = useCreateLeagueStore((s) => s.chipsEnabled);
  const setVisibility = useCreateLeagueStore((s) => s.setVisibility);
  const setFormat = useCreateLeagueStore((s) => s.setFormat);
  const setSalaryCap = useCreateLeagueStore((s) => s.setSalaryCap);
  const setMaxPerClub = useCreateLeagueStore((s) => s.setMaxPerClub);
  const setChipsEnabled = useCreateLeagueStore((s) => s.setChipsEnabled);
  const reset = useCreateLeagueStore((s) => s.reset);

  const [salaryCapEnabled, setSalaryCapEnabled] = useState(salaryCap !== null);
  const [salaryCapInput, setSalaryCapInput] = useState(salaryCap ? String(salaryCap) : '100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const createFn = httpsCallable<
        Record<string, unknown>,
        { success: boolean; leagueId?: string; inviteCode?: string; error?: string }
      >(functions, 'createLeague');

      const salaryCapValue = salaryCapEnabled ? parseFloat(salaryCapInput) || 100 : null;
      const gameweekStructure = competitionPool.every((id) => [1, 100, 101].includes(id))
        ? 'matchday'
        : 'weekly';

      const payload = {
        name: name.trim(),
        description: description.trim(),
        emoji: icon,
        tier: 'community',
        visibility,
        format,
        competitionPool,
        rulesConfig: {
          competitionPool,
          salaryCap: salaryCapValue,
          maxPerClub,
          squadSize: 15,
          positionRequirements: { GK: [1, 1], DEF: [3, 5], MID: [3, 5], FWD: [1, 3] },
          tournamentBonus: competitionPool.includes(1),
          chipsEnabled,
          gameweekStructure,
          format,
        },
      };

      const result = await createFn(payload);

      if (result.data.success && result.data.leagueId) {
        reset();
        router.replace(
          `/fantasy/create/success?leagueId=${result.data.leagueId}&inviteCode=${result.data.inviteCode ?? ''}`
        );
      } else {
        setError(result.data.error ?? 'Failed to create league. Please try again.');
      }
    } catch (e: any) {
      console.error('[CreateLeague] error:', e);
      setError(e?.message ?? 'Failed to create league. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Step 3 of 3 — Rules</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar — full */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: '100%' }]} />
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
          {/* Visibility */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Visibility</Text>
            <View style={s.radioGroup}>
              {(['public', 'secret'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.radioBtn, visibility === opt && s.radioBtnActive]}
                  onPress={() => setVisibility(opt === 'public' ? 'public' : 'secret')}
                  activeOpacity={0.75}
                >
                  <View style={[s.radioCircle, visibility === opt && s.radioCircleActive]}>
                    {visibility === opt && <View style={s.radioDot} />}
                  </View>
                  <Text style={[s.radioLabel, visibility === opt && { color: C.text }]}>
                    {opt === 'public' ? 'Public' : 'Secret'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldHint}>
              {visibility === 'public'
                ? 'Anyone can discover and join this league.'
                : 'Only people with the invite code can join.'}
            </Text>
          </View>

          {/* Format */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Format</Text>
            <View style={s.radioGroup}>
              {([['overall', 'Overall Standings'], ['h2h', 'Head-to-Head']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[s.radioBtn, format === val && s.radioBtnActive]}
                  onPress={() => setFormat(val)}
                  activeOpacity={0.75}
                >
                  <View style={[s.radioCircle, format === val && s.radioCircleActive]}>
                    {format === val && <View style={s.radioDot} />}
                  </View>
                  <Text style={[s.radioLabel, format === val && { color: C.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Salary cap */}
          <View style={s.section}>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>Salary Cap</Text>
                <Text style={s.fieldHint}>Limit how much players can cost per squad.</Text>
              </View>
              <Switch
                value={salaryCapEnabled}
                onValueChange={(v) => {
                  setSalaryCapEnabled(v);
                  setSalaryCap(v ? parseFloat(salaryCapInput) || 100 : null);
                }}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor="#fff"
              />
            </View>
            {salaryCapEnabled && (
              <View style={s.salaryRow}>
                <Text style={s.salaryPrefix}>$</Text>
                <TextInput
                  style={s.salaryInput}
                  value={salaryCapInput}
                  onChangeText={(v) => {
                    setSalaryCapInput(v);
                    const num = parseFloat(v);
                    if (!isNaN(num)) setSalaryCap(num);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor={C.muted}
                />
                <Text style={s.salarySuffix}>million</Text>
              </View>
            )}
          </View>

          {/* Max players per club */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Max Players per Club</Text>
            <Text style={s.fieldHint}>Limits how many players from the same club you can pick.</Text>
            <View style={s.numRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[s.numBtn, maxPerClub === n && s.numBtnActive]}
                  onPress={() => setMaxPerClub(n)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.numBtnText, maxPerClub === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Chips */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Chips</Text>
            {([
              ['wildcard', 'Wildcard', 'Unlimited transfers for one gameweek'],
              ['benchBoost', 'Bench Boost', 'All 15 players score points'],
              ['tripleCaptain', 'Triple Captain', 'Captain scores 3× points'],
              ['freeHit', 'Free Hit', 'Temporary unlimited transfers (squad reverts next GW)'],
            ] as const).map(([key, label, desc]) => (
              <View key={key} style={s.chipToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.chipLabel}>{label}</Text>
                  <Text style={s.chipDesc}>{desc}</Text>
                </View>
                <Switch
                  value={chipsEnabled[key]}
                  onValueChange={(v) => setChipsEnabled({ [key]: v })}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>

          {/* Error */}
          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={C.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Create button */}
          <TouchableOpacity
            style={[s.createBtn, loading && s.createBtnDisabled]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={s.createBtnText}>Create League</Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
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
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  progressTrack: { height: 4, backgroundColor: C.progressBg },
  progressFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  scroll: { padding: 16 },
  section: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
  fieldHint: { fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 16 },
  // Radio
  radioGroup: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  radioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    flex: 1,
  },
  radioBtnActive: { borderColor: C.accent },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: C.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  radioLabel: { fontSize: 14, color: C.muted, fontWeight: '600' },
  // Toggle row
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Salary
  salaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  salaryPrefix: { fontSize: 18, fontWeight: '700', color: C.success },
  salaryInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
    fontWeight: '700',
  },
  salarySuffix: { fontSize: 13, color: C.muted },
  // Max per club num row
  numRow: { flexDirection: 'row', gap: 10 },
  numBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  numBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  numBtnText: { fontSize: 16, fontWeight: '700', color: C.muted },
  // Chip toggles
  chipToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  chipLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  chipDesc: { fontSize: 12, color: C.muted, lineHeight: 16 },
  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1520',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.danger,
  },
  errorText: { flex: 1, fontSize: 13, color: C.danger },
  // Create button
  createBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
