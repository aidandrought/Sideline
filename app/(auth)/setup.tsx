import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageSourcePropType,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandedLoading } from '../../components/BrandedLoading';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import {
  clampNotificationsToFeed,
} from '../../services/feedPreferences';
import { Community, communityService } from '../../services/communityService';
import { notificationService } from '../../services/notificationService';

type MatchNotifyPrefs = {
  goals: boolean;
  cards: boolean;
  halftime: boolean;
  matchStart: boolean;
  fulltime: boolean;
  transferNews: boolean;
};

type StepKey = 'favoriteTeams' | 'notifications';

const STEP_ORDER: StepKey[] = ['favoriteTeams', 'notifications'];

const DEFAULT_MATCH_NOTIFY_PREFS: MatchNotifyPrefs = {
  goals: true,
  cards: true,
  halftime: true,
  matchStart: true,
  fulltime: true,
  transferNews: true,
};

const MATCH_NOTIFY_EVENT_OPTIONS: { key: keyof MatchNotifyPrefs; label: string }[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'cards', label: 'Cards' },
  { key: 'halftime', label: 'Half Time' },
  { key: 'matchStart', label: 'Kickoff' },
  { key: 'fulltime', label: 'Full Time' },
  { key: 'transferNews', label: 'Transfer News' },
];
const FAVORITE_TEAM_LIMIT = 2;

const formatCompetitionLabel = (value?: string) =>
  (value || '')
    .replace(/^UEFA\s+/i, '')
    .replace(/^FIFA\s+/i, '')
    .trim();

const isConcacafCompetition = (value?: string) =>
  /concacaf champions(?: cup| league)?|ccl/i.test((value || '').trim());

const DARK_LOGO_NAMES = new Set([
  'liverpool',
  'newcastle',
  'juventus',
  'inter milan',
  'ac milan',
  'bundesliga',
  'champions league',
  'europa league',
  'conference league',
]);

const needsContrastBadge = (item: Community) => {
  const normalized = (item.name || '').trim().toLowerCase();
  if (DARK_LOGO_NAMES.has(normalized)) return true;
  return (
    normalized.includes('liverpool') ||
    normalized.includes('newcastle') ||
    normalized.includes('juventus') ||
    normalized.includes('inter') ||
    normalized.includes('milan') ||
    normalized.includes('bundesliga') ||
    normalized.includes('champions league') ||
    normalized.includes('europa league') ||
    normalized.includes('conference league')
  );
};

export default function SetupScreen() {
  const router = useRouter();
  const { userProfile, updateUserProfile, logout } = useAuth();
  const { bootstrapApp } = useAppBootstrap();

  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [query, setQuery] = useState('');
  const [expandedFeedLeagues, setExpandedFeedLeagues] = useState<string[]>([]);

  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [feedTeams, setFeedTeams] = useState<string[]>([]);
  const [feedLeagues, setFeedLeagues] = useState<string[]>([]);
  const [notificationTeams, setNotificationTeams] = useState<string[]>([]);
  const [notificationLeagues, setNotificationLeagues] = useState<string[]>([]);
  const [matchNotifyDefaults, setMatchNotifyDefaults] = useState<MatchNotifyPrefs>(DEFAULT_MATCH_NOTIFY_PREFS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermissionAttempted, setNotificationPermissionAttempted] = useState(false);

  const step = STEP_ORDER[stepIndex];

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await communityService.getAllCommunities();
        if (!mounted) return;
        setCommunities(data);
      } finally {
        if (mounted) setLoadingCommunities(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setQuery('');
  }, [step]);

  useEffect(() => {
    // feed step removed — nothing to do here
  }, [step, favoriteTeams]);

  useEffect(() => {
    if (step !== 'notifications') return;
    const clamped = clampNotificationsToFeed(
      { teams: feedTeams, leagues: feedLeagues },
      {
        teams: notificationTeams.length > 0 ? notificationTeams : feedTeams,
        leagues: notificationLeagues.length > 0 ? notificationLeagues : feedLeagues,
      }
    );
    if (clamped.teams.join('|') !== notificationTeams.join('|')) {
      setNotificationTeams(clamped.teams);
    }
    if (clamped.leagues.join('|') !== notificationLeagues.join('|')) {
      setNotificationLeagues(clamped.leagues);
    }
  }, [step, feedTeams, feedLeagues, notificationTeams, notificationLeagues]);

  const teamOptions = useMemo(() => communities.filter((item) => item.type === 'team'), [communities]);
  const leagueOptions = useMemo(() => communities.filter((item) => item.type === 'league'), [communities]);

  const teamMap = useMemo(
    () => Object.fromEntries(teamOptions.map((item) => [item.name, item])) as Record<string, Community>,
    [teamOptions]
  );
  const leagueMap = useMemo(
    () => Object.fromEntries(leagueOptions.map((item) => [item.name, item])) as Record<string, Community>,
    [leagueOptions]
  );

  const filteredFavoriteTeams = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return teamOptions;
    return teamOptions.filter((team) => {
      return (
        team.name.toLowerCase().includes(normalized) ||
        (team.league || '').toLowerCase().includes(normalized) ||
        (team.country || '').toLowerCase().includes(normalized)
      );
    });
  }, [query, teamOptions]);

  const groupedFeedLeagues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const teamsByLeague = new Map<string, Community[]>();
    teamOptions.forEach((team) => {
      const leagueKey = team.league || 'Other';
      const bucket = teamsByLeague.get(leagueKey) || [];
      bucket.push(team);
      teamsByLeague.set(leagueKey, bucket);
    });

    return leagueOptions
      .map((league) => {
        const teams = (teamsByLeague.get(league.name) || [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!normalized) {
          return { league, teams };
        }
        const leagueMatches =
          league.name.toLowerCase().includes(normalized) ||
          (league.country || '').toLowerCase().includes(normalized);
        const matchingTeams = teams.filter((team) => {
          return (
            team.name.toLowerCase().includes(normalized) ||
            (team.league || '').toLowerCase().includes(normalized) ||
            (team.country || '').toLowerCase().includes(normalized)
          );
        });
        if (!leagueMatches && matchingTeams.length === 0) return null;
        return {
          league,
          teams: leagueMatches ? teams : matchingTeams,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.league.name.localeCompare(b!.league.name)) as Array<{ league: Community; teams: Community[] }>;
  }, [leagueOptions, query, teamOptions]);

  const availableNotificationTeams = useMemo(() => favoriteTeams.map((name) => teamMap[name]).filter(Boolean), [favoriteTeams, teamMap]);
  const availableNotificationLeagues = useMemo(() => ([] as Community[]), []);

  const title =
    step === 'favoriteTeams'
      ? 'Choose Your Club'
      : 'Match Notifications';

  const subtitle =
    step === 'favoriteTeams'
      ? "Pick the club you support. We'll use this to personalise your experience — you can change it anytime in Settings."
      : 'Choose which events send you match alerts. You can fine-tune this later in Settings.';

  const toggleListPick = (name: string, items: string[], setter: (next: string[]) => void) => {
    if (items.includes(name)) {
      setter(items.filter((item) => item !== name));
      return;
    }
    setter([...items, name]);
  };

  const toggleFavoriteTeam = (name: string) => {
    if (!favoriteTeams.includes(name) && favoriteTeams.length >= FAVORITE_TEAM_LIMIT) {
      Alert.alert('Two teams max', 'Choose up to two favorite teams.');
      return;
    }
    toggleListPick(name, favoriteTeams, setFavoriteTeams);
  };
  const toggleFeedTeam = (name: string) => toggleListPick(name, feedTeams, setFeedTeams);
  const toggleFeedLeague = (name: string) => {
    const leagueTeamNames = teamOptions
      .filter((team) => (team.league || '') === name)
      .map((team) => team.name);

    if (feedLeagues.includes(name)) {
      setFeedLeagues((current) => current.filter((item) => item !== name));
      setFeedTeams((current) => current.filter((item) => !leagueTeamNames.includes(item)));
      return;
    }

    setFeedLeagues((current) => [...current, name]);
    setFeedTeams((current) => Array.from(new Set([...current, ...leagueTeamNames])));
  };
  const toggleNotificationTeam = (name: string) => toggleListPick(name, notificationTeams, setNotificationTeams);
  const toggleNotificationLeague = (name: string) => toggleListPick(name, notificationLeagues, setNotificationLeagues);

  const toggleExpandedFeedLeague = (leagueName: string) => {
    setExpandedFeedLeagues((current) =>
      current.includes(leagueName) ? current.filter((item) => item !== leagueName) : [...current, leagueName]
    );
  };

  const handleRequestNotifications = async () => {
    setNotificationPermissionAttempted(true);
    const granted = await notificationService.initialize();
    setNotificationsEnabled(granted);
    if (!granted) {
      Alert.alert('Notifications Disabled', 'You can enable them later in Settings.');
    }
  };

  const finishSetup = async () => {
    if (!userProfile?.uid) {
      router.replace('/(tabs)');
      return;
    }

    setLoading(true);
    try {
      // Feed is not filtered — users see all matches. Only notification scope uses favorite teams.
      const followedTeamCommunities = favoriteTeams
        .map((name) => teamMap[name])
        .filter(Boolean);
      const followedTeamIds = followedTeamCommunities.map((community) => community.id);

      await updateUserProfile({
        followedTeams: favoriteTeams,
        followedLeagues: [],
        feedTeams: [],
        feedLeagues: [],
        notificationTeams: favoriteTeams,
        notificationLeagues: [],
        onboardingCompleted: true,
      });

      await setDoc(
        doc(db, 'userCommunities', userProfile.uid),
        {
          followedTeams: followedTeamIds,
          followedLeagues: [],
          followedWorldcups: [],
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      await communityService.ensureMemberships(userProfile.uid, [
        ...followedTeamCommunities,
      ]);

      await setDoc(
        doc(db, 'users', userProfile.uid, 'notificationDefaults', 'match'),
        {
          matchNotifyDefaults,
          teamNotifyOverrides: {},
          teamCompetitionScope: {},
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await bootstrapApp({ reason: 'setup', userId: userProfile.uid });
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error finishing setup:', error);
      Alert.alert('Setup Failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async () => {
    if (step === 'favoriteTeams') {
      // Pre-fill notification teams from favorite team picks
      setNotificationTeams(favoriteTeams.length > 0 ? favoriteTeams : []);
      setStepIndex(1);
      return;
    }
    await finishSetup();
  };

  const prevStep = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const switchAccount = async () => {
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error switching account:', error);
      Alert.alert('Unable to switch account', 'Please try again.');
    }
  };

  const renderSelectableRow = (
    item: Community,
    selected: boolean,
    onPress: () => void,
    metaOverride?: string
  ) => {
    const meta = metaOverride ?? (item.type === 'team' ? formatCompetitionLabel(item.league || '') : item.country || '');
    const iconName = item.type === 'team' ? 'shield' : 'trophy';
    const logoSource: ImageSourcePropType | null = item.logo
      ? ({ uri: item.logo, cache: 'force-cache' } as any)
      : item.type === 'league' && isConcacafCompetition(item.name)
        ? require('../../assets/images/Official logo.png')
        : null;
    const useContrastBadge = !!logoSource && needsContrastBadge(item);
    return (
      <TouchableOpacity key={`${item.type}-${item.id}`} style={styles.row} onPress={onPress} activeOpacity={0.82}>
        <View style={styles.rowLeft}>
          {logoSource ? (
            <View style={[styles.logoBadge, useContrastBadge && styles.logoBadgeContrast]}>
              <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
            </View>
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name={iconName} size={16} color="#8CBFFF" />
            </View>
          )}
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{item.type === 'league' ? formatCompetitionLabel(item.name) : item.name}</Text>
            {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
          </View>
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={selected ? '#4DA3FF' : '#4E5E75'}
        />
      </TouchableOpacity>
    );
  };

  const renderFavoritePicker = () => {
    const data = filteredFavoriteTeams;
    const selectedItems = favoriteTeams;
    const onPress = toggleFavoriteTeam;

    return (
      <>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teams..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={styles.summaryBar}>
          <Text style={styles.summaryTitle}>{selectedItems.length} selected</Text>
        </View>

        {loadingCommunities ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color="#4DA3FF" />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => renderSelectableRow(item, selectedItems.includes(item.name), () => onPress(item.name))}
          />
        )}
      </>
    );
  };

  const renderFeedBuilder = () => {
    return (
      <View style={styles.flexFill}>
        <View style={styles.feedTopRow}>
        <Text style={styles.feedTopText}>Choose full leagues or expand them to pick specific teams.</Text>
        <TouchableOpacity
          style={styles.selectAllButton}
          onPress={() => {
            setFeedLeagues(groupedFeedLeagues.map((item) => item.league.name));
            setFeedTeams(Array.from(new Set(groupedFeedLeagues.flatMap((item) => item.teams.map((team) => team.name)))));
          }}
        >
          <Text style={styles.selectAllText}>Select All</Text>
        </TouchableOpacity>
      </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search leagues, tournaments, or teams..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.feedListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {groupedFeedLeagues.map(({ league, teams }) => {
            const expanded = expandedFeedLeagues.includes(league.name) || query.trim().length > 0;
            const leagueSelected = feedLeagues.includes(league.name);
            const leagueLogoSource: ImageSourcePropType | null = league.logo
              ? ({ uri: league.logo, cache: 'force-cache' } as any)
              : isConcacafCompetition(league.name)
                ? require('../../assets/images/Official logo.png')
                : null;
            const useLeagueContrastBadge = !!leagueLogoSource && needsContrastBadge(league);
            return (
              <View key={`feed-league-${league.id}`} style={styles.feedLeagueCard}>
                <View style={styles.feedLeagueRow}>
                  <TouchableOpacity
                    style={styles.feedLeagueTitlePress}
                    activeOpacity={0.82}
                    onPress={() => toggleExpandedFeedLeague(league.name)}
                  >
                    {leagueLogoSource ? (
                      <View style={[styles.logoBadge, useLeagueContrastBadge && styles.logoBadgeContrast]}>
                        <Image source={leagueLogoSource} style={styles.logoImage} resizeMode="contain" />
                      </View>
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <Ionicons name="trophy" size={16} color="#8CBFFF" />
                      </View>
                    )}
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle}>{formatCompetitionLabel(league.name)}</Text>
                      <Text style={styles.rowMeta}>
                        {league.country || 'Tournament'}{teams.length > 0 ? ` • ${teams.length} teams` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.feedLeagueActions}>
                    <TouchableOpacity style={styles.feedLeagueExpandButton} onPress={() => toggleExpandedFeedLeague(league.name)}>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#89A5C6" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleFeedLeague(league.name)}>
                      <Ionicons
                        name={leagueSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={leagueSelected ? '#4DA3FF' : '#4E5E75'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {expanded ? (
                  <View style={styles.feedLeagueTeams}>
                    {teams.length > 0 ? (
                      teams.map((team) =>
                        renderSelectableRow(
                          team,
                          feedTeams.includes(team.name),
                          () => toggleFeedTeam(team.name),
                          formatCompetitionLabel(team.league || '')
                        )
                      )
                    ) : (
                      <Text style={styles.inlineEmptyText}>No teams available for this competition.</Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderNotificationStep = () => (
    <ScrollView
      style={styles.flexFill}
      contentContainerStyle={styles.notificationScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.notificationCard}>
        <View style={styles.notificationRow}>
          <View style={styles.notificationTextWrap}>
            <Text style={styles.notificationTitle}>Push Notifications</Text>
            <Text style={styles.notificationMeta}>Enable alerts on this device before finishing setup.</Text>
          </View>
          <TouchableOpacity style={styles.permissionButton} onPress={handleRequestNotifications}>
            <Text style={styles.permissionButtonText}>Enable</Text>
          </TouchableOpacity>
        </View>

        {MATCH_NOTIFY_EVENT_OPTIONS.map((item) => (
          <View key={item.key} style={styles.prefRow}>
            <Text style={styles.prefLabel}>{item.label}</Text>
            <Switch
              value={matchNotifyDefaults[item.key]}
              onValueChange={(value) =>
                setMatchNotifyDefaults((prev) => ({
                  ...prev,
                  [item.key]: value,
                }))
              }
              trackColor={{ false: '#2B3A52', true: '#2C7BE5' }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}

        <View style={styles.scopeBlock}>
          <Text style={styles.notificationTitle}>Feed Teams</Text>
          <Text style={styles.notificationMeta}>Only teams approved for your feed can be toggled here.</Text>
          {availableNotificationTeams.length > 0 ? (
            <View style={styles.chipWrap}>
              {availableNotificationTeams.map((team) => {
                const active = notificationTeams.includes(team.name);
                return (
                  <TouchableOpacity
                    key={`notify-team-${team.id}`}
                    style={[styles.selectionChip, active && styles.selectionChipActive]}
                    onPress={() => toggleNotificationTeam(team.name)}
                  >
                    <Text style={[styles.selectionChipText, active && styles.selectionChipTextActive]}>{team.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.inlineEmptyText}>No teams are approved for your feed yet.</Text>
          )}
        </View>

        <View style={styles.scopeBlock}>
          <Text style={styles.notificationTitle}>Feed Leagues</Text>
          <Text style={styles.notificationMeta}>League alerts stay scoped to the competitions you allowed on Home.</Text>
          {availableNotificationLeagues.length > 0 ? (
            <View style={styles.chipWrap}>
              {availableNotificationLeagues.map((league) => {
                const active = notificationLeagues.includes(league.name);
                return (
                  <TouchableOpacity
                    key={`notify-league-${league.id}`}
                    style={[styles.selectionChip, active && styles.selectionChipActive]}
                    onPress={() => toggleNotificationLeague(league.name)}
                  >
                    <Text style={[styles.selectionChipText, active && styles.selectionChipTextActive]}>
                      {formatCompetitionLabel(league.name)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.inlineEmptyText}>No leagues are approved for your feed yet.</Text>
          )}
        </View>

        {!notificationsEnabled && notificationPermissionAttempted && (
          <Text style={styles.warningText}>
            Notifications are off on this device. You can still finish setup and change them later in Settings.
          </Text>
        )}
      </View>
    </ScrollView>
  );

  if (loading || (loadingCommunities && communities.length === 0)) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.flexFill}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={prevStep}>
              <Ionicons name="chevron-back" size={22} color="#EAF3FF" />
            </TouchableOpacity>
            <Text style={styles.headerProgress}>{stepIndex + 1}/{STEP_ORDER.length}</Text>
          </View>

          <View style={styles.titleWrap}>
            <Text style={styles.kicker}>Sideline Setup</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <TouchableOpacity style={styles.switchAccountButton} onPress={switchAccount}>
              <Text style={styles.switchAccountText}>Sign in with different account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.contentArea}>
            {step === 'favoriteTeams' ? renderFavoritePicker() : null}
            {step === 'notifications' ? renderNotificationStep() : null}
          </View>

          <View style={styles.footerBar}>
            <TouchableOpacity style={[styles.ctaButton, loading && styles.ctaDisabled]} onPress={nextStep} disabled={loading}>
              <Text style={styles.ctaText}>
                {loading ? 'Saving...' : step === 'notifications' ? 'Finish Setup' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08111B',
    paddingHorizontal: 18,
  },
  flexFill: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#19324D',
    backgroundColor: '#0E1B2B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerProgress: {
    color: '#9CB4D1',
    fontSize: 13,
    fontWeight: '800',
  },
  titleWrap: {
    marginTop: 18,
    marginBottom: 16,
  },
  kicker: {
    color: '#5DAFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    color: '#F6FAFF',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9BB0C9',
    fontSize: 14,
    lineHeight: 21,
  },
  switchAccountButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#23405F',
    borderRadius: 999,
    backgroundColor: '#0D1928',
  },
  switchAccountText: {
    color: '#87BEFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchWrap: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#19324D',
    backgroundColor: '#0D1724',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F6FAFF',
    fontSize: 15,
  },
  summaryBar: {
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C3652',
    backgroundColor: '#0B1521',
  },
  summaryTitle: {
    color: '#F4F8FD',
    fontSize: 14,
    fontWeight: '800',
  },
  loaderWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 140,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C1725',
    borderWidth: 1,
    borderColor: '#19324D',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
  },
  rowTextWrap: {
    flex: 1,
  },
  logoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#13273D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeContrast: {
    backgroundColor: '#F4F8FD',
    borderWidth: 1,
    borderColor: '#D7E4F2',
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  rowTitle: {
    color: '#F4F8FD',
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    color: '#86A0BF',
    fontSize: 12,
    marginTop: 2,
  },
  feedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  feedTopText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#9CB4D1',
    marginRight: 8,
  },
  selectAllButton: {
    backgroundColor: '#1E78E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selectAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  feedSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  feedSummaryCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1C3652',
    backgroundColor: '#0B1521',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  feedSummaryCount: {
    color: '#F6FAFF',
    fontSize: 28,
    fontWeight: '900',
  },
  feedSummaryLabel: {
    color: '#8FA8C6',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  feedListContent: {
    paddingTop: 12,
    paddingBottom: 28,
  },
  feedLeagueCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#19324D',
    backgroundColor: '#0C1725',
    marginBottom: 12,
    overflow: 'hidden',
  },
  feedLeagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  feedLeagueTitlePress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  feedLeagueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 10,
  },
  feedLeagueExpandButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedLeagueTeams: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  emptyStateCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1A2D44',
    backgroundColor: '#0B1521',
    padding: 18,
  },
  emptyStateTitle: {
    color: '#F4F8FD',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyStateMeta: {
    color: '#8FA5C1',
    fontSize: 13,
    lineHeight: 19,
  },
  notificationScrollContent: {
    paddingBottom: 28,
  },
  notificationCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1C3652',
    backgroundColor: '#0B1521',
    padding: 14,
    gap: 12,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  notificationTextWrap: {
    flex: 1,
  },
  notificationTitle: {
    color: '#F5F8FD',
    fontSize: 15,
    fontWeight: '800',
  },
  notificationMeta: {
    color: '#91A7C2',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  permissionButton: {
    borderRadius: 12,
    backgroundColor: '#1E78E8',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  prefLabel: {
    color: '#F5F8FD',
    fontSize: 14,
    fontWeight: '700',
  },
  scopeBlock: {
    borderTopWidth: 1,
    borderTopColor: '#1A2C42',
    paddingTop: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#26486C',
    backgroundColor: '#0F1C2B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionChipActive: {
    borderColor: '#4DA3FF',
    backgroundColor: '#173A5C',
  },
  selectionChipText: {
    color: '#AFC4DD',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionChipTextActive: {
    color: '#F6FAFF',
  },
  inlineEmptyText: {
    color: '#7F97B3',
    fontSize: 12,
    marginTop: 10,
  },
  warningText: {
    color: '#FFB07A',
    fontSize: 12,
    lineHeight: 18,
  },
  footerBar: {
    paddingTop: 10,
    paddingBottom: 18,
  },
  ctaButton: {
    borderRadius: 16,
    backgroundColor: '#1E78E8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
