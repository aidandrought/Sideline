// app/fantasy/league/[id].tsx
// Fantasy league detail — tabbed: Overview | H2H | Members | Rules

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { FantasyLeague, FantasyLeagueMember } from '../../../types/fantasy';
import { COMPETITION_CATALOG } from '../../../types/fantasy';
import { getLeagueStandings, leaveLeague } from '../../../services/fantasyService';

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
  gold: '#FFD700',
};

const MEDAL = ['🥇', '🥈', '🥉'];

type TabKey = 'overview' | 'h2h' | 'members' | 'rules';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();

  const [league, setLeague] = useState<FantasyLeague | null>(null);
  const [standings, setStandings] = useState<FantasyLeagueMember[]>([]);
  const [members, setMembers] = useState<FantasyLeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [leagueSnap, standingsData] = await Promise.all([
        getDoc(doc(db, 'fantasyLeagues', id)),
        getLeagueStandings(id),
      ]);
      if (leagueSnap.exists()) setLeague(leagueSnap.data() as FantasyLeague);
      setStandings(standingsData);
      setMembers(standingsData);
    } catch (error) {
      console.error('Error loading league:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { void loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); void loadData(); };

  const handleShare = async () => {
    if (!league?.inviteCode) return;
    await Share.share({
      message: `Join my Sideline Fantasy league "${league.name}"!\n\nUse code: ${league.inviteCode}\n\nDownload Sideline to play.`,
    });
  };

  const handleCopyCode = () => {
    if (!league?.inviteCode) return;
    Clipboard.setString(league.inviteCode);
    Alert.alert('Copied!', `Code ${league.inviteCode} copied to clipboard.`);
  };

  const handleLeave = () => {
    Alert.alert('Leave League', `Are you sure you want to leave "${league?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveLeague(id!, userProfile!.uid);
          router.back();
        },
      },
    ]);
  };

  const myEntry = standings.find((s) => s.userId === userProfile?.uid);
  const isH2H = league?.format === 'h2h';

  const tabs: { key: TabKey; label: string }[] = useMemo(() => [
    { key: 'overview', label: 'Overview' },
    ...(isH2H ? [{ key: 'h2h' as TabKey, label: 'H2H' }] : []),
    { key: 'members', label: 'Members' },
    { key: 'rules', label: 'Rules' },
  ], [isH2H]);

  const renderMember = ({ item, index }: { item: FantasyLeagueMember; index: number }) => {
    const isMe = item.userId === userProfile?.uid;
    const rankDiff = item.previousRank > 0 ? item.previousRank - item.rank : 0;
    const initials = item.username.slice(0, 2).toUpperCase();

    return (
      <TouchableOpacity
        style={[styles.memberRow, isMe && styles.memberRowMe]}
        onPress={() => router.push(`/fantasy/team/${id}?viewUserId=${item.userId}` as any)}
        activeOpacity={0.8}
      >
        <View style={styles.rankCol}>
          {index < 3
            ? <Text style={styles.medal}>{MEDAL[index]}</Text>
            : <Text style={styles.rankNum}>{index + 1}</Text>}
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberTeamName} numberOfLines={1}>
            {item.teamName}{isMe && <Text style={{ color: PALETTE.primary }}> ★</Text>}
          </Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        <View style={styles.gwCol}>
          <Text style={styles.gwPoints}>{item.lastGameweekPoints}</Text>
          <Text style={styles.gwLabel}>GW</Text>
        </View>
        <View style={styles.pointsCol}>
          {rankDiff !== 0 && (
            <Text style={{ fontSize: 10, color: rankDiff > 0 ? PALETTE.success : PALETTE.danger }}>
              {rankDiff > 0 ? '▲' : '▼'}{Math.abs(rankDiff)}
            </Text>
          )}
          <Text style={styles.memberPoints}>{item.totalPoints}</Text>
          <Text style={styles.memberPointsLabel}>pts</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMembersCard = ({ item, index }: { item: FantasyLeagueMember; index: number }) => {
    const isMe = item.userId === userProfile?.uid;
    const initials = item.username.slice(0, 2).toUpperCase();
    return (
      <View style={[styles.membersCard, isMe && styles.memberRowMe]}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberTeamName} numberOfLines={1}>{item.teamName}</Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.memberPoints}>{item.totalPoints}</Text>
          <Text style={styles.memberPointsLabel}>pts</Text>
        </View>
      </View>
    );
  };

  const OverviewTab = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.primary} />}
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 20 }]}
    >
      {/* GW Summary Card */}
      {myEntry && (
        <View style={styles.gwCard}>
          <Text style={styles.gwCardLabel}>Gameweek {league?.currentGameweek}</Text>
          <View style={styles.gwCardRow}>
            <View style={styles.gwStat}>
              <Text style={styles.gwStatValue}>{myEntry.lastGameweekPoints}</Text>
              <Text style={styles.gwStatLabel}>My GW Pts</Text>
            </View>
            <View style={[styles.gwStatDivider]} />
            <View style={styles.gwStat}>
              <Text style={styles.gwStatValue}>#{myEntry.rank}</Text>
              <Text style={styles.gwStatLabel}>Rank</Text>
            </View>
            <View style={[styles.gwStatDivider]} />
            <View style={styles.gwStat}>
              <Text style={styles.gwStatValue}>{myEntry.totalPoints}</Text>
              <Text style={styles.gwStatLabel}>Total Pts</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editTeamBtn}
            onPress={() => router.push(`/fantasy/team/${id}` as any)}
          >
            <Text style={styles.editTeamBtnText}>Manage My Team</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invite Code */}
      {league?.inviteCode && (
        <View style={styles.inviteBlock}>
          <Text style={styles.inviteLabel}>Invite Code</Text>
          <TouchableOpacity style={styles.inviteCodeRow} onPress={handleCopyCode}>
            <Text style={styles.inviteCodeText}>{league.inviteCode}</Text>
            <Ionicons name="copy-outline" size={15} color={PALETTE.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={15} color="#fff" />
            <Text style={styles.shareBtnText}>Invite Friends</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Standings */}
      <Text style={styles.sectionLabel}>STANDINGS · {standings.length} MANAGERS</Text>
      {standings.map((item, index) => (
        <View key={item.userId}>
          {renderMember({ item, index })}
          {index < standings.length - 1 && <View style={{ height: 6 }} />}
        </View>
      ))}
    </ScrollView>
  );

  const H2HTab = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.h2hMatchCard}>
        <Text style={styles.sectionLabel}>THIS WEEK'S MATCH</Text>
        <View style={styles.h2hMatchRow}>
          <View style={styles.h2hTeam}>
            <Text style={styles.h2hTeamName} numberOfLines={1}>{myEntry?.teamName ?? 'My Team'}</Text>
            <Text style={styles.h2hScore}>{myEntry?.lastGameweekPoints ?? 0}</Text>
          </View>
          <Text style={styles.h2hVs}>VS</Text>
          <View style={[styles.h2hTeam, { alignItems: 'flex-end' }]}>
            <Text style={styles.h2hTeamName} numberOfLines={1}>Opponent</Text>
            <Text style={styles.h2hScore}>—</Text>
          </View>
        </View>
      </View>

      <View style={styles.h2hRecord}>
        <Text style={styles.sectionLabel}>SEASON RECORD</Text>
        <View style={styles.h2hRecordRow}>
          {[['W', '0', PALETTE.success], ['D', '0', PALETTE.muted], ['L', '0', PALETTE.danger]].map(([label, val, color]) => (
            <View key={label} style={styles.h2hRecordStat}>
              <Text style={[styles.h2hRecordValue, { color }]}>{val}</Text>
              <Text style={styles.h2hRecordLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.placeholderText}>Full H2H schedule will appear here once the season begins.</Text>
    </ScrollView>
  );

  const MembersTab = () => (
    <FlatList
      data={members}
      keyExtractor={(item) => item.userId}
      renderItem={renderMembersCard}
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 20 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.primary} />}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListEmptyComponent={<Text style={styles.placeholderText}>No members found.</Text>}
    />
  );

  const RulesTab = () => {
    const rules = league?.rulesConfig;
    const competitionNames = (rules?.competitionPool ?? []).map((cId) => {
      const found = COMPETITION_CATALOG.find((c) => c.id === cId);
      return found ? `${found.emoji} ${found.name}` : `Competition ${cId}`;
    });
    const isOwner = league?.createdBy === userProfile?.uid || league?.ownerId === userProfile?.uid;
    const formattedCode = league?.inviteCode
      ? `${league.inviteCode.slice(0, 4)}-${league.inviteCode.slice(4)}`
      : null;

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.rulesCard}>
          <Text style={styles.rulesSectionTitle}>Competitions</Text>
          {competitionNames.length > 0
            ? competitionNames.map((name) => (
              <Text key={name} style={styles.rulesValue}>{name}</Text>
            ))
            : <Text style={styles.rulesValue}>Not configured</Text>
          }
        </View>

        <View style={styles.rulesCard}>
          {[
            ['Salary Cap', rules?.salaryCap != null ? `£${rules.salaryCap}m` : 'Unlimited'],
            ['Max per Club', String(rules?.maxPerClub ?? 3)],
            ['Squad Size', String(rules?.squadSize ?? 15)],
            ['Format', league?.format === 'h2h' ? 'Head-to-Head' : 'Overall'],
            ['Visibility', league?.visibility ? league.visibility.charAt(0).toUpperCase() + league.visibility.slice(1) : 'Public'],
          ].map(([label, value]) => (
            <View key={label} style={styles.rulesRow}>
              <Text style={styles.rulesLabel}>{label}</Text>
              <Text style={styles.rulesValue}>{value}</Text>
            </View>
          ))}
        </View>

        {rules?.chipsEnabled && (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesSectionTitle}>Chips</Text>
            {[
              ['Wildcard', rules.chipsEnabled.wildcard],
              ['Bench Boost', rules.chipsEnabled.benchBoost],
              ['Triple Captain', rules.chipsEnabled.tripleCaptain],
              ['Free Hit', rules.chipsEnabled.freeHit],
            ].map(([label, enabled]) => (
              <View key={String(label)} style={styles.rulesRow}>
                <Text style={styles.rulesLabel}>{label}</Text>
                <View style={[styles.chipStatusBadge, enabled ? styles.chipEnabled : styles.chipDisabled]}>
                  <Text style={[styles.chipStatusText, { color: enabled ? PALETTE.success : PALETTE.muted }]}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {isOwner && formattedCode && (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesSectionTitle}>Invite Code</Text>
            <TouchableOpacity style={styles.inviteCodeRow} onPress={handleCopyCode}>
              <Text style={[styles.inviteCodeText, { fontSize: 26 }]}>{formattedCode}</Text>
              <Ionicons name="copy-outline" size={18} color={PALETTE.primary} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Ionicons name="exit-outline" size={18} color="#fff" />
          <Text style={styles.leaveBtnText}>Leave League</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={PALETTE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {league?.emoji ? `${league.emoji} ` : ''}{league?.name ?? 'League'}
        </Text>
        <TouchableOpacity onPress={handleLeave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="exit-outline" size={22} color={PALETTE.danger} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PALETTE.primary} />
        </View>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'h2h' && isH2H && <H2HTab />}
          {activeTab === 'members' && <MembersTab />}
          {activeTab === 'rules' && <RulesTab />}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PALETTE.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8, color: PALETTE.text },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border,
    paddingHorizontal: 12,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: PALETTE.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: PALETTE.muted },
  tabTextActive: { color: PALETTE.primary, fontWeight: '800' },
  tabContent: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },

  // Overview
  gwCard: {
    backgroundColor: PALETTE.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 16, marginBottom: 6, gap: 12,
  },
  gwCardLabel: { fontSize: 12, fontWeight: '700', color: PALETTE.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  gwCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  gwStat: { alignItems: 'center', gap: 4 },
  gwStatValue: { fontSize: 24, fontWeight: '800', color: PALETTE.text },
  gwStatLabel: { fontSize: 11, color: PALETTE.muted, fontWeight: '600' },
  gwStatDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: PALETTE.border },
  editTeamBtn: { backgroundColor: PALETTE.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  editTeamBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  inviteBlock: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 14, alignItems: 'center', gap: 8, marginBottom: 6,
  },
  inviteLabel: { fontSize: 11, fontWeight: '600', color: PALETTE.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  inviteCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteCodeText: { fontSize: 22, fontWeight: '800', letterSpacing: 4, color: PALETTE.primary },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PALETTE.primary,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4,
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, color: PALETTE.muted, marginBottom: 8, marginTop: 4,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface, padding: 12, gap: 10,
  },
  memberRowMe: { borderColor: PALETTE.primary, borderWidth: 1.5, backgroundColor: PALETTE.primary + '0F' },
  rankCol: { width: 32, alignItems: 'center' },
  medal: { fontSize: 20 },
  rankNum: { fontSize: 14, fontWeight: '700', color: PALETTE.muted },
  memberInfo: { flex: 1 },
  memberTeamName: { fontSize: 14, fontWeight: '600', color: PALETTE.text },
  memberUsername: { fontSize: 12, marginTop: 1, color: PALETTE.muted },
  gwCol: { alignItems: 'center', marginRight: 8 },
  gwPoints: { fontSize: 15, fontWeight: '700', color: PALETTE.secondary },
  gwLabel: { fontSize: 9, color: PALETTE.muted, fontWeight: '700' },
  pointsCol: { alignItems: 'flex-end' },
  memberPoints: { fontSize: 18, fontWeight: '700', color: PALETTE.text },
  memberPointsLabel: { fontSize: 11, marginTop: -2, color: PALETTE.muted },

  // Members Tab
  membersCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: PALETTE.border,
    padding: 12, gap: 12,
  },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: PALETTE.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: PALETTE.primary },

  // H2H Tab
  h2hMatchCard: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 16, gap: 12, marginBottom: 8,
  },
  h2hMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h2hTeam: { flex: 1 },
  h2hTeamName: { fontSize: 13, fontWeight: '700', color: PALETTE.text },
  h2hScore: { fontSize: 28, fontWeight: '900', color: PALETTE.primary, marginTop: 4 },
  h2hVs: { fontSize: 14, fontWeight: '800', color: PALETTE.muted },
  h2hRecord: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 16, gap: 10,
  },
  h2hRecordRow: { flexDirection: 'row', justifyContent: 'space-around' },
  h2hRecordStat: { alignItems: 'center', gap: 4 },
  h2hRecordValue: { fontSize: 24, fontWeight: '800' },
  h2hRecordLabel: { fontSize: 12, color: PALETTE.muted, fontWeight: '700' },
  placeholderText: { fontSize: 13, color: PALETTE.muted, textAlign: 'center', paddingVertical: 24, fontWeight: '600' },

  // Rules Tab
  rulesCard: {
    backgroundColor: PALETTE.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.border, padding: 14, gap: 6, marginBottom: 8,
  },
  rulesSectionTitle: { fontSize: 13, fontWeight: '800', color: PALETTE.primary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  rulesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PALETTE.border },
  rulesLabel: { fontSize: 14, color: PALETTE.muted, fontWeight: '600' },
  rulesValue: { fontSize: 14, fontWeight: '700', color: PALETTE.text },
  chipStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chipEnabled: { backgroundColor: PALETTE.success + '22', borderColor: PALETTE.success },
  chipDisabled: { backgroundColor: PALETTE.muted + '22', borderColor: PALETTE.muted },
  chipStatusText: { fontSize: 11, fontWeight: '700' },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PALETTE.danger, borderRadius: 14, paddingVertical: 14, marginTop: 8,
  },
  leaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
