// app/fantasy/create/step1-name.tsx
// Create League wizard — Step 1: Name, description, icon

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
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
  border: '#1E2D45',
  progressBg: '#1E2D45',
};

const EMOJI_OPTIONS = ['⚽', '🏆', '⭐', '🌍', '🔥', '💪', '👑', '🎯'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Step1NameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const name = useCreateLeagueStore((s) => s.name);
  const description = useCreateLeagueStore((s) => s.description);
  const icon = useCreateLeagueStore((s) => s.icon);
  const setName = useCreateLeagueStore((s) => s.setName);
  const setDescription = useCreateLeagueStore((s) => s.setDescription);
  const setIcon = useCreateLeagueStore((s) => s.setIcon);

  const canAdvance = name.trim().length >= 3;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create League — Step 1 of 3</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: '33%' }]} />
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
          {/* League name */}
          <View style={s.fieldGroup}>
            <View style={s.labelRow}>
              <Text style={s.label}>League Name</Text>
              <Text style={[s.charCount, name.length > 25 && { color: C.danger }]}>
                {name.length}/30
              </Text>
            </View>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="My Fantasy League"
              placeholderTextColor={C.muted}
              maxLength={30}
              returnKeyType="next"
            />
            {name.length > 0 && name.trim().length < 3 && (
              <Text style={s.fieldError}>Name must be at least 3 characters.</Text>
            )}
          </View>

          {/* Description */}
          <View style={s.fieldGroup}>
            <View style={s.labelRow}>
              <Text style={s.label}>Description <Text style={s.optional}>(optional)</Text></Text>
              <Text style={[s.charCount, description.length > 100 && { color: C.danger }]}>
                {description.length}/120
              </Text>
            </View>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your league…"
              placeholderTextColor={C.muted}
              maxLength={120}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Icon picker */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Choose Icon</Text>
            <View style={s.emojiRow}>
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[s.emojiBtn, icon === emoji && s.emojiBtnActive]}
                  onPress={() => setIcon(emoji)}
                  activeOpacity={0.75}
                >
                  <Text style={s.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer nav */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
          onPress={() => router.push('/fantasy/create/step2-competitions')}
          disabled={!canAdvance}
          activeOpacity={0.8}
        >
          <Text style={s.nextBtnText}>Next: Choose Competitions</Text>
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
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  progressTrack: { height: 4, backgroundColor: C.progressBg },
  progressFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  scroll: { padding: 20 },
  fieldGroup: { marginBottom: 24 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  optional: { fontWeight: '400', textTransform: 'none' },
  charCount: { fontSize: 12, color: C.muted },
  input: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
  },
  inputMultiline: { minHeight: 90, paddingTop: 14 },
  fieldError: { fontSize: 12, color: C.danger, marginTop: 6 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiBtn: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: C.accent, backgroundColor: '#2A1510' },
  emojiText: { fontSize: 26 },
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
