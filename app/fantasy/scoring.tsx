// app/fantasy/scoring.tsx
// Scoring guide — animated expand/collapse sections

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

// ─── Styles — defined BEFORE sub-components that reference them ───────────────

const st = StyleSheet.create({
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
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  intro: { fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 18 },
  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  cardIcon: { fontSize: 20, width: 28 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 14,
  },
  // Points row
  ptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  ptsLabel: { flex: 1, fontSize: 14, color: C.text },
  ptsValue: { fontSize: 14, fontWeight: '700', color: C.success },
  // Table
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableHead: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tableCell: { fontSize: 14, color: C.text },
  // Notes
  sectionNote: {
    fontSize: 12,
    color: C.muted,
    marginTop: 10,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  // Chips
  chipRow: { marginBottom: 12 },
  chipName: { fontSize: 14, fontWeight: '700', color: C.accent, marginBottom: 3 },
  chipDesc: { fontSize: 13, color: C.text, lineHeight: 18 },
  // Example
  exampleBox: {
    backgroundColor: '#0B1220',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
  },
  exampleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.gold,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  exampleText: { fontSize: 13, color: C.text, lineHeight: 18 },
  // Disclaimer
  disclaimer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  disclaimerText: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function PtsRow({ label, pts, color }: { label: string; pts: string; color?: string }) {
  return (
    <View style={st.ptsRow}>
      <Text style={st.ptsLabel}>{label}</Text>
      <Text style={[st.ptsValue, { color: color ?? C.success }]}>{pts}</Text>
    </View>
  );
}

function GoalsTable() {
  return (
    <View>
      <View style={st.tableHeader}>
        <Text style={[st.tableHead, { flex: 2 }]}>Position</Text>
        <Text style={[st.tableHead, { flex: 1, textAlign: 'right' }]}>Points</Text>
      </View>
      {[
        { pos: 'Goalkeeper (GK)', pts: '+10', color: C.cyan },
        { pos: 'Defender (DEF)', pts: '+6', color: C.success },
        { pos: 'Midfielder (MID)', pts: '+6', color: C.success },
        { pos: 'Forward (FWD)', pts: '+6', color: C.success },
      ].map((r) => (
        <View key={r.pos} style={st.tableRow}>
          <Text style={[st.tableCell, { flex: 2 }]}>{r.pos}</Text>
          <Text style={[st.tableCell, { flex: 1, textAlign: 'right', color: r.color, fontWeight: '700' }]}>
            {r.pts}
          </Text>
        </View>
      ))}
      <Text style={st.sectionNote}>
        GK goals score 10pts. All outfield positions (DEF, MID, FWD) score 6pts per goal.
      </Text>
    </View>
  );
}

// ─── Section data ─────────────────────────────────────────────────────────────

type SectionDef = {
  id: string;
  icon: string;
  title: string;
  content: React.ReactNode;
};

const SECTIONS: SectionDef[] = [
  {
    id: 'appearance',
    icon: '⏱',
    title: 'Appearance',
    content: (
      <View>
        <PtsRow label="1–59 minutes played" pts="+1 pt" />
        <PtsRow label="60+ minutes played" pts="+2 pts" />
        <Text style={st.sectionNote}>Points awarded once per match. Must appear on the pitch.</Text>
      </View>
    ),
  },
  {
    id: 'goals',
    icon: '⚽',
    title: 'Goals Scored',
    content: <GoalsTable />,
  },
  {
    id: 'assists',
    icon: '🎯',
    title: 'Assists',
    content: (
      <View>
        <PtsRow label="Per assist" pts="+3 pts" />
        <Text style={st.sectionNote}>
          Awarded for the pass directly leading to a goal. Applies to all positions.
        </Text>
      </View>
    ),
  },
  {
    id: 'clean',
    icon: '🧤',
    title: 'Clean Sheets',
    content: (
      <View>
        <PtsRow label="GK / DEF clean sheet" pts="+4 pts" color={C.cyan} />
        <PtsRow label="MID clean sheet" pts="+1 pt" />
        <Text style={st.sectionNote}>
          Player must be on the pitch for 60+ minutes and the team must concede 0 goals.
        </Text>
      </View>
    ),
  },
  {
    id: 'conceded',
    icon: '🛡️',
    title: 'Goals Conceded',
    content: (
      <View>
        <PtsRow
          label="GK / DEF: per 2 goals conceded while on pitch"
          pts="−1 pt"
          color={C.danger}
        />
        <Text style={st.sectionNote}>
          Only applies to GK and DEF. Deducted while the player is on the pitch.
        </Text>
      </View>
    ),
  },
  {
    id: 'saves',
    icon: '💾',
    title: 'Saves',
    content: (
      <View>
        <PtsRow label="GK: every 3 saves" pts="+1 pt" color={C.cyan} />
        <Text style={st.sectionNote}>
          Saves are rounded down — 5 saves = +1 pt, 6 saves = +2 pts.
        </Text>
      </View>
    ),
  },
  {
    id: 'penalties',
    icon: '🏆',
    title: 'Penalties',
    content: (
      <View>
        <PtsRow label="Penalty saved (GK)" pts="+5 pts" color={C.cyan} />
        <PtsRow label="Penalty missed (any position)" pts="−2 pts" color={C.danger} />
      </View>
    ),
  },
  {
    id: 'cards',
    icon: '🟨',
    title: 'Cards',
    content: (
      <View>
        <PtsRow label="Yellow card" pts="−1 pt" color={C.danger} />
        <PtsRow label="Red card" pts="−3 pts" color={C.danger} />
        <Text style={st.sectionNote}>
          If a player receives a red card in the same match, the yellow card deduction is replaced
          (not added) by the red card deduction.
        </Text>
      </View>
    ),
  },
  {
    id: 'owngoal',
    icon: '🥅',
    title: 'Own Goal',
    content: (
      <View>
        <PtsRow label="Own goal scored" pts="−2 pts" color={C.danger} />
      </View>
    ),
  },
  {
    id: 'bonus',
    icon: '⭐',
    title: 'Bonus Points',
    content: (
      <View>
        <View style={st.tableHeader}>
          <Text style={[st.tableHead, { flex: 2 }]}>BPS Rank</Text>
          <Text style={[st.tableHead, { flex: 1, textAlign: 'right' }]}>Bonus</Text>
        </View>
        {[
          { rank: '1st (top performer)', pts: '+3 pts' },
          { rank: '2nd', pts: '+2 pts' },
          { rank: '3rd', pts: '+1 pt' },
        ].map((r) => (
          <View key={r.rank} style={st.tableRow}>
            <Text style={[st.tableCell, { flex: 2 }]}>{r.rank}</Text>
            <Text
              style={[
                st.tableCell,
                { flex: 1, textAlign: 'right', color: C.warning, fontWeight: '700' },
              ]}
            >
              {r.pts}
            </Text>
          </View>
        ))}
        <Text style={st.sectionNote}>
          Top 3 performers per fixture based on BPS (Bonus Points System) weighted actions —
          goals, assists, key passes, tackles, interceptions and more.
        </Text>
      </View>
    ),
  },
  {
    id: 'captain',
    icon: '👑',
    title: 'Captain / Vice Captain',
    content: (
      <View>
        <PtsRow label="Captain" pts="2× points" color={C.gold} />
        <PtsRow label="Vice Captain" pts="1.5× points" color={C.warning} />
        <Text style={st.sectionNote}>
          Vice Captain multiplier (1.5×) only activates if the Captain played 0 minutes in that
          gameweek.
        </Text>
      </View>
    ),
  },
  {
    id: 'wcbonus',
    icon: '🌍',
    title: 'World Cup / Euros Bonus',
    content: (
      <View>
        <PtsRow
          label="Goals & assists in WC / Euros fixtures"
          pts="1.5× multiplier"
          color={C.gold}
        />
        <View style={st.exampleBox}>
          <Text style={st.exampleTitle}>Example</Text>
          <Text style={st.exampleText}>Goal in a World Cup fixture: 6 pts × 1.5 = 9 pts</Text>
          <Text style={st.exampleText}>Assist in a Euros fixture: 3 pts × 1.5 = 4.5 pts</Text>
        </View>
        <Text style={st.sectionNote}>
          Applies to leagues with a competition pool that includes World Cup (ID 1) or Euro
          Championship fixtures.
        </Text>
      </View>
    ),
  },
  {
    id: 'chips',
    icon: '🎮',
    title: 'Chips',
    content: (
      <View>
        {[
          {
            name: 'Wildcard',
            desc: 'Unlimited transfers for one gameweek. Can be used once per season (league rules may allow more).',
          },
          {
            name: 'Bench Boost',
            desc: 'All 15 squad players score points for one gameweek, including your 4 bench players.',
          },
          {
            name: 'Triple Captain',
            desc: 'Your captain scores 3× points instead of 2× for one gameweek.',
          },
          {
            name: 'Free Hit',
            desc: 'Make unlimited transfers for one gameweek. Your squad reverts to its previous state the following week.',
          },
        ].map((c) => (
          <View key={c.name} style={st.chipRow}>
            <Text style={st.chipName}>{c.name}</Text>
            <Text style={st.chipDesc}>{c.desc}</Text>
          </View>
        ))}
        <Text style={st.sectionNote}>
          Chip availability depends on league rules configured by the league creator.
        </Text>
      </View>
    ),
  },
];

// ─── Expandable section card ───────────────────────────────────────────────────

function SectionCard({ section }: { section: SectionDef }) {
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
    Animated.timing(rotateAnim, {
      toValue: open ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={st.card}>
      <TouchableOpacity style={st.cardHeader} onPress={toggle} activeOpacity={0.75}>
        <Text style={st.cardIcon}>{section.icon}</Text>
        <Text style={st.cardTitle}>{section.title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={st.cardBody}>{section.content}</View>}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScoringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Scoring Guide</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={st.intro}>
          Tap each section to expand scoring details. All points shown are for standard leagues.
        </Text>

        {SECTIONS.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}

        {/* Disclaimer */}
        <View style={st.disclaimer}>
          <Text style={st.disclaimerText}>
            Sideline is independent and not affiliated with FIFA, UEFA, or any club.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
