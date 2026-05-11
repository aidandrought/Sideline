import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { shadow } from '../components/styleUtils';
import { useAuth } from '../context/AuthContext';
import { Community, communityService } from '../services/communityService';
import { notificationService } from '../services/notificationService';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { ThemePreference } from '../services/themePreference';
import { useNotificationPreferences } from '../context/NotificationPreferencesContext';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { db } from '../config/firebase';
import {
  clampNotificationsToFeed,
  getFeedSelections,
} from '../services/feedPreferences';
import { VIRTUAL_FEED_LEAGUES } from '../constants/footballCompetitions';

type MatchNotifyPrefs = {
  goals: boolean;
  cards: boolean;
  halftime: boolean;
  matchStart: boolean;
  fulltime: boolean;
  transferNews: boolean;
};
type TeamNotifyOverrides = Record<string, MatchNotifyPrefs>;
type TeamCompetitionScope = Record<string, 'primary' | 'all'>;
type SelectionTarget = 'notification' | 'favorite' | 'feed';

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
const formatCompetitionLabel = (value?: string) =>
  (value || '')
    .replace(/^UEFA\s+/i, '')
    .replace(/^FIFA\s+/i, '')
    .trim();
const normalizeLeagueKey = (value?: string) => formatCompetitionLabel(value).toLowerCase().trim();
const normalizeClubKey = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fc|cf|sc|ac|afc|cfc|club|deportivo|athletic)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getFeedLeagueGroupName = (value?: string) => {
  return value || 'Other';
};

const isGroupedQualifierLeague = (value?: string) => {
  const groupName = getFeedLeagueGroupName(value);
  return groupName !== (value || 'Other');
};

const LOCATION_OPTIONS = [
  { label: 'Auto', countryCode: '', region: '', city: '' },
  { label: 'Australia', countryCode: 'AU', region: '', city: '' },
  { label: 'Argentina', countryCode: 'AR', region: '', city: '' },
  { label: 'Brazil', countryCode: 'BR', region: '', city: '' },
  { label: 'Canada', countryCode: 'CA', region: '', city: '' },
  { label: 'England', countryCode: 'GB', region: '', city: '' },
  { label: 'France', countryCode: 'FR', region: '', city: '' },
  { label: 'Germany', countryCode: 'DE', region: '', city: '' },
  { label: 'Italy', countryCode: 'IT', region: '', city: '' },
  { label: 'Japan', countryCode: 'JP', region: '', city: '' },
  { label: 'Mexico', countryCode: 'MX', region: '', city: '' },
  { label: 'Netherlands', countryCode: 'NL', region: '', city: '' },
  { label: 'Portugal', countryCode: 'PT', region: '', city: '' },
  { label: 'Saudi Arabia', countryCode: 'SA', region: '', city: '' },
  { label: 'South Korea', countryCode: 'KR', region: '', city: '' },
  { label: 'Spain', countryCode: 'ES', region: '', city: '' },
  { label: 'Turkey', countryCode: 'TR', region: '', city: '' },
  { label: 'United States', countryCode: 'US', region: '', city: '' },
];

const detectLocationFromTimezone = (): typeof LOCATION_OPTIONS[number] | null => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const prefix = tz.split('/')[0];
    if (prefix === 'Australia') return LOCATION_OPTIONS.find(o => o.countryCode === 'AU') ?? null;
    if (prefix === 'Asia') {
      if (tz.includes('Tokyo') || tz.includes('Japan')) return LOCATION_OPTIONS.find(o => o.countryCode === 'JP') ?? null;
      if (tz.includes('Seoul') || tz.includes('Korea')) return LOCATION_OPTIONS.find(o => o.countryCode === 'KR') ?? null;
      if (tz.includes('Riyadh') || tz.includes('Saudi')) return LOCATION_OPTIONS.find(o => o.countryCode === 'SA') ?? null;
      if (tz.includes('Istanbul') || tz.includes('Turkey')) return LOCATION_OPTIONS.find(o => o.countryCode === 'TR') ?? null;
    }
    if (prefix === 'America') {
      if (['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','America/Honolulu','America/Indiana','America/Kentucky','America/North_Dakota','America/Detroit','America/Boise'].some(z => tz.startsWith(z))) return LOCATION_OPTIONS.find(o => o.countryCode === 'US') ?? null;
      if (['America/Toronto','America/Vancouver','America/Edmonton','America/Winnipeg','America/Halifax','America/Regina','America/St_Johns'].some(z => tz.startsWith(z))) return LOCATION_OPTIONS.find(o => o.countryCode === 'CA') ?? null;
      if (['America/Sao_Paulo','America/Manaus','America/Belem','America/Fortaleza','America/Recife','America/Bahia'].some(z => tz.startsWith(z))) return LOCATION_OPTIONS.find(o => o.countryCode === 'BR') ?? null;
      if (tz.startsWith('America/Argentina')) return LOCATION_OPTIONS.find(o => o.countryCode === 'AR') ?? null;
      if (['America/Mexico_City','America/Cancun','America/Monterrey','America/Merida','America/Chihuahua','America/Mazatlan','America/Hermosillo','America/Tijuana'].some(z => tz.startsWith(z))) return LOCATION_OPTIONS.find(o => o.countryCode === 'MX') ?? null;
    }
    if (prefix === 'Europe') {
      if (['Europe/London','Europe/Belfast','Europe/Dublin'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'GB') ?? null;
      if (['Europe/Madrid','Africa/Ceuta'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'ES') ?? null;
      if (tz === 'Europe/Paris') return LOCATION_OPTIONS.find(o => o.countryCode === 'FR') ?? null;
      if (['Europe/Berlin','Europe/Hamburg','Europe/Munich'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'DE') ?? null;
      if (['Europe/Rome','Europe/Milan'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'IT') ?? null;
      if (['Europe/Amsterdam'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'NL') ?? null;
      if (['Europe/Lisbon','Atlantic/Azores','Atlantic/Madeira'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'PT') ?? null;
      if (['Europe/Istanbul'].includes(tz)) return LOCATION_OPTIONS.find(o => o.countryCode === 'TR') ?? null;
    }
  } catch { /* ignore */ }
  return null;
};

const SETTINGS_EXIT_NAV_DELAY_MS = 40;
const FAVORITE_TEAM_LIMIT = 2;
const FAVORITE_LEAGUE_LIMIT = 1;

export default function SettingsScreen() {
  const router = useRouter();
  const { userProfile, logout, updateUserProfile, deleteAccount } = useAuth();
  const { bootstrapApp } = useAppBootstrap();
  const { themeMode, setThemeMode, isDark } = useTheme();
  const { t } = useLanguage();
  const { preferences, updatePreferences } = useNotificationPreferences();
  const { notificationsEnabled, chatNotifications } = preferences;
  const [notificationsPermissionDenied, setNotificationsPermissionDenied] = useState(false);
  const [darkModeAuto, setDarkModeAuto] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationLabel, setLocationLabel] = useState(t('settings.locationValue'));
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState(userProfile?.username ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [matchNotifyDefaults, setMatchNotifyDefaults] = useState<MatchNotifyPrefs>(DEFAULT_MATCH_NOTIFY_PREFS);
  const [teamNotifyOverrides, setTeamNotifyOverrides] = useState<TeamNotifyOverrides>({});
  const [teamCompetitionScope, setTeamCompetitionScope] = useState<TeamCompetitionScope>({});
  const [savingMatchNotifyDefaults, setSavingMatchNotifyDefaults] = useState(false);
  const [teamRuleModalVisible, setTeamRuleModalVisible] = useState(false);
  const [activeTeamRule, setActiveTeamRule] = useState<string | null>(null);
  const [activeTeamRuleLeagueKey, setActiveTeamRuleLeagueKey] = useState<string | null>(null);
  const [pendingTeamRulePrefs, setPendingTeamRulePrefs] = useState<MatchNotifyPrefs>(DEFAULT_MATCH_NOTIFY_PREFS);
  const [pendingTeamRuleAllCompetitions, setPendingTeamRuleAllCompetitions] = useState(false);
  const [applyAllSelectedTeamsEnabled, setApplyAllSelectedTeamsEnabled] = useState(false);

  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(userProfile?.followedTeams ?? []);
  const [favoriteLeagues, setFavoriteLeagues] = useState<string[]>(userProfile?.followedLeagues ?? []);
  const [feedTeams, setFeedTeams] = useState<string[]>(getFeedSelections(userProfile).teams);
  const [feedLeagues, setFeedLeagues] = useState<string[]>(getFeedSelections(userProfile).leagues);
  const [notificationTeams, setNotificationTeams] = useState<string[]>(userProfile?.notificationTeams ?? []);
  const [notificationLeagues, setNotificationLeagues] = useState<string[]>(userProfile?.notificationLeagues ?? []);
  const [pendingTeams, setPendingTeams] = useState<string[]>([]);
  const [pendingLeagues, setPendingLeagues] = useState<string[]>([]);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [leagueModalVisible, setLeagueModalVisible] = useState(false);
  const [resumeNotificationsModalAfterPicker, setResumeNotificationsModalAfterPicker] = useState(false);
  const [teamSelectionTarget, setTeamSelectionTarget] = useState<SelectionTarget>('notification');
  const [leagueSelectionTarget, setLeagueSelectionTarget] = useState<SelectionTarget>('notification');
  const [teamSearch, setTeamSearch] = useState('');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [expandedTeamLeagues, setExpandedTeamLeagues] = useState<string[]>([]);
  const [feedModalVisible, setFeedModalVisible] = useState(false);
  const [feedSearch, setFeedSearch] = useState('');
  const [pendingFeedTeams, setPendingFeedTeams] = useState<string[]>([]);
  const [pendingFeedLeagues, setPendingFeedLeagues] = useState<string[]>([]);
  const [expandedFeedLeagues, setExpandedFeedLeagues] = useState<string[]>([]);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);

  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            border: '#2C2C2E',
            text: '#FFFFFF',
            subtext: '#A1A1A6',
            muted: '#8E8E93',
            accent: '#4DA3FF',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            border: '#E5E7EB',
            text: '#000000',
            subtext: '#666666',
            muted: '#999999',
            accent: '#007AFF',
          },
    [isDark]
  );
  const chevronColor = palette.subtext;
  const modalPlaceholderColor = isDark ? '#1F2A3A' : '#E8F1FF';

  const exitSettingsTo = (pathname: '/live' | '/upcoming' | '/news') => {
    const modalRouter = router as typeof router & {
      dismiss?: () => void;
      dismissAll?: () => void;
    };
    modalRouter.dismiss?.();
    setTimeout(() => {
      router.replace(pathname);
    }, SETTINGS_EXIT_NAV_DELAY_MS);
  };

  const refreshAfterFeedChange = (userId: string) => {
    void bootstrapApp({ reason: 'refresh', userId });
  };

  const handleLogout = () => {
    Alert.alert(
      t('alerts.logoutTitle'),
      t('alerts.logoutMessage'),
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        {
          text: t('alerts.confirmLogout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent. Your profile and all saved preferences will be removed. Are you sure?',
      [
        { text: t('alerts.cancel'), style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Delete account failed', error);
              const code = (error as { code?: string } | null)?.code;
              Alert.alert(
                'Delete Failed',
                code === 'auth/requires-recent-login'
                  ? 'For security, sign in again and then retry deleting your account.'
                  : 'Unable to delete your account right now. Please try again later.'
              );
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    setFavoriteTeams(userProfile?.followedTeams ?? []);
    setFavoriteLeagues(userProfile?.followedLeagues ?? []);
    setFeedTeams(getFeedSelections(userProfile).teams);
    setFeedLeagues(getFeedSelections(userProfile).leagues);
    setNotificationTeams(userProfile?.notificationTeams ?? []);
    setNotificationLeagues(userProfile?.notificationLeagues ?? []);
  }, [userProfile]);

  useEffect(() => {
    setProfileNameDraft(userProfile?.username ?? '');
  }, [userProfile?.username]);

  useEffect(() => {
    if (themeMode === 'system') {
      setDarkModeAuto(true);
    } else {
      setDarkModeAuto(false);
      setDarkModeEnabled(themeMode === 'dark');
    }
  }, [themeMode]);

  useEffect(() => {
    if (userProfile?.location?.label && userProfile.location.label !== 'Auto') {
      setLocationLabel(userProfile.location.label);
      return;
    }
    // Auto: detect from device timezone
    const detected = detectLocationFromTimezone();
    if (detected && detected.countryCode) {
      setLocationLabel(`Auto (${detected.label})`);
    } else {
      setLocationLabel(t('settings.locationValue'));
    }
  }, [userProfile?.location?.label, t]);

  useEffect(() => {
    const loadMatchNotifyDefaults = async () => {
      if (!userProfile?.uid) return;
      try {
        const defaultsRef = doc(db, 'users', userProfile.uid, 'notificationDefaults', 'match');
        const snapshot = await getDoc(defaultsRef);
        if (!snapshot.exists()) {
          setMatchNotifyDefaults(DEFAULT_MATCH_NOTIFY_PREFS);
          setTeamNotifyOverrides({});
          setTeamCompetitionScope({});
          return;
        }
        const data = snapshot.data() as {
          matchNotifyDefaults?: Partial<MatchNotifyPrefs>;
          teamNotifyOverrides?: Record<string, Partial<MatchNotifyPrefs>>;
          teamCompetitionScope?: Record<string, 'primary' | 'all'>;
        };
        setMatchNotifyDefaults({
          ...DEFAULT_MATCH_NOTIFY_PREFS,
          ...(data.matchNotifyDefaults || {}),
        });
        const rawTeamOverrides = data.teamNotifyOverrides || {};
        const normalizedOverrides: TeamNotifyOverrides = {};
        Object.entries(rawTeamOverrides).forEach(([teamName, prefs]) => {
          normalizedOverrides[teamName] = {
            ...DEFAULT_MATCH_NOTIFY_PREFS,
            ...(prefs || {}),
          };
        });
        setTeamNotifyOverrides(normalizedOverrides);
        setTeamCompetitionScope(data.teamCompetitionScope || {});
      } catch (error) {
        console.error('Error loading match notification defaults:', error);
      }
    };
    void loadMatchNotifyDefaults();
  }, [userProfile?.uid]);

  useEffect(() => {
    const cached = communityService.getCachedAllCommunities();
    if (cached?.data.length) {
      setAllCommunities(cached.data);
    }

    let isMounted = true;
    setLoadingCommunities(true);
    communityService.getAllCommunities()
      .then(communities => {
        if (isMounted) {
          setAllCommunities(communities);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingCommunities(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const teamOptions = useMemo(
    () => allCommunities.filter(c => c.type === 'team'),
    [allCommunities]
  );

  const notificationsSubtext = notificationsPermissionDenied
    ? t('settings.notificationsSettings')
    : t('settings.notificationsSubtext');

  const leagueOptions = useMemo(
    () => [
      ...VIRTUAL_FEED_LEAGUES,
      ...allCommunities.filter((c) => {
        if (c.type !== 'league' && c.type !== 'worldcup') return false;
        if (c.type === 'league' && isGroupedQualifierLeague(c.name)) return false;
        return true;
      }),
    ],
    [allCommunities]
  );

  const feedTeamKeySet = useMemo(() => new Set(feedTeams), [feedTeams]);
  const feedLeagueKeySet = useMemo(() => new Set(feedLeagues), [feedLeagues]);

  const selectableTeams = useMemo(() => {
    if (teamSelectionTarget === 'notification') {
      return teamOptions.filter((team) => feedTeamKeySet.has(team.name));
    }
    return teamOptions;
  }, [feedTeamKeySet, teamOptions, teamSelectionTarget]);

  const selectableLeagues = useMemo(() => {
    if (leagueSelectionTarget === 'notification') {
      return leagueOptions.filter((league) => feedLeagueKeySet.has(league.name));
    }
    return leagueOptions;
  }, [feedLeagueKeySet, leagueOptions, leagueSelectionTarget]);

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!query) return selectableTeams;
    return selectableTeams.filter(team =>
      team.name.toLowerCase().includes(query) ||
      (team.league && team.league.toLowerCase().includes(query))
    );
  }, [selectableTeams, teamSearch]);

  const filteredLeagues = useMemo(() => {
    const query = leagueSearch.trim().toLowerCase();
    if (!query) return selectableLeagues;
    return selectableLeagues.filter(league =>
      league.name.toLowerCase().includes(query) ||
      (league.country && league.country.toLowerCase().includes(query))
    );
  }, [selectableLeagues, leagueSearch]);

  const groupedFilteredTeamsByLeague = useMemo(() => {
    const grouped: Record<string, Community[]> = {};
    filteredTeams.forEach((team) => {
      const key = normalizeLeagueKey(team.league || 'Other');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(team);
    });
    Object.values(grouped).forEach((teams) => teams.sort((a, b) => a.name.localeCompare(b.name)));
    return grouped;
  }, [filteredTeams]);
  const groupedAllTeamsByLeague = useMemo(() => {
    const grouped: Record<string, Community[]> = {};
    selectableTeams.forEach((team) => {
      const key = normalizeLeagueKey(team.league || 'Other');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(team);
    });
    Object.values(grouped).forEach((teams) => teams.sort((a, b) => a.name.localeCompare(b.name)));
    return grouped;
  }, [selectableTeams]);
  const groupedLeagueKeys = useMemo(
    () =>
      Object.keys(groupedFilteredTeamsByLeague).sort((a, b) => {
        const aLabel = formatCompetitionLabel(groupedFilteredTeamsByLeague[a][0]?.league || a);
        const bLabel = formatCompetitionLabel(groupedFilteredTeamsByLeague[b][0]?.league || b);
        return aLabel.localeCompare(bLabel);
      }),
    [groupedFilteredTeamsByLeague]
  );
  const allTeamNames = useMemo(() => selectableTeams.map((team) => team.name), [selectableTeams]);
  const teamNameAliasMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allTeamNames.forEach((name) => {
      const key = normalizeClubKey(name);
      if (!key) return;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(name)) map[key].push(name);
    });
    return map;
  }, [allTeamNames]);
  const getTeamAliases = (teamName: string) => {
    const key = normalizeClubKey(teamName);
    return teamNameAliasMap[key] && teamNameAliasMap[key].length > 0 ? teamNameAliasMap[key] : [teamName];
  };
  const allLeagueNames = useMemo(() => selectableLeagues.map((league) => league.name), [selectableLeagues]);
  const allPendingTeamsSelected = useMemo(
    () => allTeamNames.length > 0 && allTeamNames.every((name) => pendingTeams.includes(name)),
    [allTeamNames, pendingTeams]
  );
  const allPendingLeaguesSelected = useMemo(
    () => allLeagueNames.length > 0 && allLeagueNames.every((name) => pendingLeagues.includes(name)),
    [allLeagueNames, pendingLeagues]
  );
  const groupedFeedLeagues = useMemo(() => {
    const normalized = feedSearch.trim().toLowerCase();
    const teamsByLeague = new Map<string, Community[]>();

    teamOptions.forEach((team) => {
      const leagueKey = getFeedLeagueGroupName(team.league || 'Other');
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

        if (!leagueMatches && matchingTeams.length === 0) {
          return null;
        }

        return {
          league,
          teams: leagueMatches ? teams : matchingTeams,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.league.name.localeCompare(b!.league.name)) as Array<{ league: Community; teams: Community[] }>;
  }, [feedSearch, leagueOptions, teamOptions]);
  const allPendingFeedLeagueNames = useMemo(
    () => groupedFeedLeagues.map((item) => item.league.name),
    [groupedFeedLeagues]
  );
  const allPendingFeedTeamNames = useMemo(
    () => Array.from(new Set(groupedFeedLeagues.flatMap((item) => item.teams.map((team) => team.name)))),
    [groupedFeedLeagues]
  );
  const allPendingFeedSelected = useMemo(
    () =>
      allPendingFeedLeagueNames.length > 0 &&
      allPendingFeedTeamNames.length > 0 &&
      allPendingFeedLeagueNames.every((name) => pendingFeedLeagues.includes(name)) &&
      allPendingFeedTeamNames.every((name) => pendingFeedTeams.includes(name)),
    [allPendingFeedLeagueNames, allPendingFeedTeamNames, pendingFeedLeagues, pendingFeedTeams]
  );

  const openTeamsModal = (target: SelectionTarget = 'notification') => {
    setTeamSelectionTarget(target);
    setPendingTeams(target === 'notification' ? notificationTeams : target === 'feed' ? feedTeams : favoriteTeams);
    setTeamSearch('');
    setExpandedTeamLeagues([]);
    const shouldResumeNotifications = target === 'notification' && notificationsModalVisible;
    setResumeNotificationsModalAfterPicker(shouldResumeNotifications);
    if (shouldResumeNotifications) {
      setNotificationsModalVisible(false);
      setTimeout(() => setTeamModalVisible(true), 0);
      return;
    }
    setTeamModalVisible(true);
  };

  const openLeaguesModal = (target: SelectionTarget = 'notification') => {
    setLeagueSelectionTarget(target);
    setPendingLeagues(target === 'notification' ? notificationLeagues : target === 'feed' ? feedLeagues : favoriteLeagues);
    setLeagueSearch('');
    const shouldResumeNotifications = target === 'notification' && notificationsModalVisible;
    setResumeNotificationsModalAfterPicker(shouldResumeNotifications);
    if (shouldResumeNotifications) {
      setNotificationsModalVisible(false);
      setTimeout(() => setLeagueModalVisible(true), 0);
      return;
    }
    setLeagueModalVisible(true);
  };

  const openFeedModal = () => {
    setPendingFeedTeams(feedTeams);
    setPendingFeedLeagues(feedLeagues);
    setFeedSearch('');
    setExpandedFeedLeagues([]);
    setFeedModalVisible(true);
  };

  const closeFeedModal = () => {
    setFeedModalVisible(false);
  };

  const closeTeamPicker = () => {
    setTeamModalVisible(false);
    if (resumeNotificationsModalAfterPicker) {
      setTimeout(() => setNotificationsModalVisible(true), 0);
      setResumeNotificationsModalAfterPicker(false);
    }
  };

  const closeLeaguePicker = () => {
    setLeagueModalVisible(false);
    if (resumeNotificationsModalAfterPicker) {
      setTimeout(() => setNotificationsModalVisible(true), 0);
      setResumeNotificationsModalAfterPicker(false);
    }
  };

  const persistPreferences = async (overrides: Partial<{
    notificationsEnabled: boolean;
    chatNotifications: boolean;
  }> = {}) => {
    await updatePreferences(overrides);
  };

  const togglePendingTeam = (teamName: string) => {
    setPendingTeams(prev => {
      if (prev.includes(teamName)) {
        return prev.filter(name => name !== teamName);
      }
      if (teamSelectionTarget === 'favorite' && prev.length >= FAVORITE_TEAM_LIMIT) {
        Alert.alert('Two teams max', 'Choose up to two favorite teams.');
        return prev;
      }
      return [...prev, teamName];
    });
  };

  const togglePendingLeague = (leagueName: string) => {
    setPendingLeagues(prev => {
      if (prev.includes(leagueName)) {
        return prev.filter(name => name !== leagueName);
      }
      if (leagueSelectionTarget === 'favorite' && prev.length >= FAVORITE_LEAGUE_LIMIT) {
        Alert.alert('One league max', 'Choose one favorite league.');
        return prev;
      }
      return [...prev, leagueName];
    });
  };
  const toggleExpandedTeamLeague = (leagueKey: string) => {
    setExpandedTeamLeagues((prev) =>
      prev.includes(leagueKey) ? [] : [leagueKey]
    );
  };
  const togglePendingLeagueTeams = (leagueKey: string) => {
    const allLeagueTeams = (groupedAllTeamsByLeague[leagueKey] || []).map((team) => team.name);
    const currentInFiltered = (groupedFilteredTeamsByLeague[leagueKey] || []).map((team) => team.name);
    if (!allLeagueTeams.length) return;
    setPendingTeams((prev) => {
      const allSelected = allLeagueTeams.every((name) => prev.includes(name));
      if (allSelected) {
        return prev.filter((name) => !allLeagueTeams.includes(name));
      }
      return Array.from(new Set([...prev, ...currentInFiltered]));
    });
  };
  const toggleSelectAllTeams = () => {
    if (teamSelectionTarget === 'favorite') return;
    if (allPendingTeamsSelected) {
      setPendingTeams([]);
      return;
    }
    setPendingTeams(allTeamNames);
    if (teamSelectionTarget === 'notification') {
      const allScopes = allTeamNames.reduce((acc, name) => {
        acc[name] = 'all';
        return acc;
      }, {} as TeamCompetitionScope);
      setTeamCompetitionScope(allScopes);
    }
  };
  const toggleLeagueSelectedTeamsAllComps = (leagueKey: string) => {
    const leagueTeamNames = (groupedAllTeamsByLeague[leagueKey] || []).map((team) => team.name);
    const selectedInLeague = leagueTeamNames.filter((teamName) => pendingTeams.includes(teamName));
    if (!selectedInLeague.length) return;
    const allCompsOn = selectedInLeague.every((teamName) => teamCompetitionScope[teamName] === 'all');
    setTeamCompetitionScope((prev) => {
      const next = { ...prev };
      selectedInLeague.forEach((teamName) => {
        next[teamName] = allCompsOn ? 'primary' : 'all';
      });
      return next;
    });
  };
  const toggleTeamAllCompetitions = (teamName: string) => {
    const aliases = getTeamAliases(teamName);
    const allCurrentlyOn = aliases.every((name) => teamCompetitionScope[name] === 'all');
    if (teamSelectionTarget === 'notification') {
      setPendingTeams((prev) => Array.from(new Set([...prev, ...aliases])));
    }
    setTeamCompetitionScope((prev) => {
      const next = { ...prev };
      aliases.forEach((name) => {
        next[name] = allCurrentlyOn ? 'primary' : 'all';
      });
      return next;
    });
  };
  const toggleSelectAllLeagues = () => {
    if (leagueSelectionTarget === 'favorite') return;
    if (allPendingLeaguesSelected) {
      setPendingLeagues([]);
      return;
    }
    setPendingLeagues(allLeagueNames);
  };

  const togglePendingFeedTeam = (teamName: string) => {
    setPendingFeedTeams((prev) =>
      prev.includes(teamName) ? prev.filter((name) => name !== teamName) : [...prev, teamName]
    );
  };

  const togglePendingFeedLeague = (leagueName: string) => {
    const leagueTeamNames = teamOptions
      .filter((team) => (team.league || '') === leagueName)
      .map((team) => team.name);

    if (pendingFeedLeagues.includes(leagueName)) {
      setPendingFeedLeagues((prev) => prev.filter((name) => name !== leagueName));
      setPendingFeedTeams((prev) => prev.filter((name) => !leagueTeamNames.includes(name)));
      return;
    }

    setPendingFeedLeagues((prev) => [...prev, leagueName]);
    setPendingFeedTeams((prev) => Array.from(new Set([...prev, ...leagueTeamNames])));
  };

  const toggleExpandedFeedLeague = (leagueName: string) => {
    setExpandedFeedLeagues((prev) =>
      prev.includes(leagueName) ? prev.filter((name) => name !== leagueName) : [...prev, leagueName]
    );
  };

  const saveFeedSelections = async () => {
    if (!userProfile) {
      Alert.alert(t('alerts.signInRequired'), 'Please sign in to save your home feed.');
      return;
    }

    try {
      const nextFeed = {
        teams: pendingFeedTeams,
        leagues: pendingFeedLeagues,
      };
      const nextNotifications = clampNotificationsToFeed(
        { teams: nextFeed.teams, leagues: nextFeed.leagues },
        { teams: notificationTeams, leagues: notificationLeagues }
      );

      await updateUserProfile({
        feedTeams: nextFeed.teams,
        feedLeagues: nextFeed.leagues,
        notificationTeams: nextNotifications.teams,
        notificationLeagues: nextNotifications.leagues,
      });

      setFeedTeams(nextFeed.teams);
      setFeedLeagues(nextFeed.leagues);
      setNotificationTeams(nextNotifications.teams);
      setNotificationLeagues(nextNotifications.leagues);

      const validTeams = new Set(nextNotifications.teams);
      setTeamNotifyOverrides((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamNotifyOverrides
      );
      setTeamCompetitionScope((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamCompetitionScope
      );

      closeFeedModal();
      refreshAfterFeedChange(userProfile.uid);
    } catch (error) {
      console.error('Error saving home feed:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    }
  };

  const saveTeams = async () => {
    if (!userProfile) {
      Alert.alert(t('alerts.signInRequired'), 'Please sign in to save notification teams.');
      return;
    }

    try {
      if (teamSelectionTarget === 'notification') {
        const nextNotifications = clampNotificationsToFeed(
          { teams: feedTeams, leagues: feedLeagues },
          { teams: pendingTeams, leagues: notificationLeagues }
        );
        await updateUserProfile({ notificationTeams: nextNotifications.teams });
        setNotificationTeams(nextNotifications.teams);
        setApplyAllSelectedTeamsEnabled(false);
        const validTeams = new Set(nextNotifications.teams);
        setTeamNotifyOverrides((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamNotifyOverrides
        );
        setTeamCompetitionScope((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamCompetitionScope
        );
      } else if (teamSelectionTarget === 'feed') {
        const nextFeed = { teams: pendingTeams, leagues: feedLeagues };
        const nextNotifications = clampNotificationsToFeed(
          { teams: nextFeed.teams, leagues: nextFeed.leagues },
          { teams: notificationTeams, leagues: notificationLeagues }
        );
        await updateUserProfile({
          feedTeams: nextFeed.teams,
          notificationTeams: nextNotifications.teams,
          notificationLeagues: nextNotifications.leagues,
        });
        setFeedTeams(nextFeed.teams);
        setNotificationTeams(nextNotifications.teams);
        setNotificationLeagues(nextNotifications.leagues);
        const validTeams = new Set(nextNotifications.teams);
        setTeamNotifyOverrides((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamNotifyOverrides
        );
        setTeamCompetitionScope((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([teamName]) => validTeams.has(teamName))) as TeamCompetitionScope
        );
        refreshAfterFeedChange(userProfile.uid);
      } else {
        if (pendingTeams.length > FAVORITE_TEAM_LIMIT) {
          Alert.alert('Two teams max', 'Choose up to two favorite teams.');
          return;
        }
        const nextFeed = {
          teams: feedTeams,
          leagues: feedLeagues,
        };
        const nextNotifications = clampNotificationsToFeed(
          { teams: nextFeed.teams, leagues: nextFeed.leagues },
          { teams: notificationTeams, leagues: notificationLeagues }
        );
        await updateUserProfile({
          followedTeams: pendingTeams,
          feedTeams: nextFeed.teams,
          notificationTeams: nextNotifications.teams,
          notificationLeagues: nextNotifications.leagues,
        });
        setFavoriteTeams(pendingTeams);
        setFeedTeams(nextFeed.teams);
        setNotificationTeams(nextNotifications.teams);
        setNotificationLeagues(nextNotifications.leagues);
      }
      closeTeamPicker();
    } catch (error) {
      console.error('Error saving notification teams:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    }
  };

  const saveLeagues = async () => {
    if (!userProfile) {
      Alert.alert(t('alerts.signInRequired'), 'Please sign in to save notification leagues.');
      return;
    }

    try {
      if (leagueSelectionTarget === 'notification') {
        const nextNotifications = clampNotificationsToFeed(
          { teams: feedTeams, leagues: feedLeagues },
          { teams: notificationTeams, leagues: pendingLeagues }
        );
        await updateUserProfile({ notificationLeagues: nextNotifications.leagues });
        setNotificationLeagues(nextNotifications.leagues);
        setApplyAllSelectedTeamsEnabled(false);
      } else if (leagueSelectionTarget === 'feed') {
        const nextFeed = { teams: feedTeams, leagues: pendingLeagues };
        const nextNotifications = clampNotificationsToFeed(
          { teams: nextFeed.teams, leagues: nextFeed.leagues },
          { teams: notificationTeams, leagues: notificationLeagues }
        );
        await updateUserProfile({
          feedLeagues: nextFeed.leagues,
          notificationTeams: nextNotifications.teams,
          notificationLeagues: nextNotifications.leagues,
        });
        setFeedLeagues(nextFeed.leagues);
        setNotificationTeams(nextNotifications.teams);
        setNotificationLeagues(nextNotifications.leagues);
        refreshAfterFeedChange(userProfile.uid);
      } else {
        if (pendingLeagues.length > FAVORITE_LEAGUE_LIMIT) {
          Alert.alert('One league max', 'Choose one favorite league.');
          return;
        }
        const nextFeed = {
          teams: feedTeams,
          leagues: feedLeagues,
        };
        const nextNotifications = clampNotificationsToFeed(
          { teams: nextFeed.teams, leagues: nextFeed.leagues },
          { teams: notificationTeams, leagues: notificationLeagues }
        );
        await updateUserProfile({
          followedLeagues: pendingLeagues,
          feedLeagues: nextFeed.leagues,
          notificationTeams: nextNotifications.teams,
          notificationLeagues: nextNotifications.leagues,
        });
        setFavoriteLeagues(pendingLeagues);
        setFeedLeagues(nextFeed.leagues);
        setNotificationTeams(nextNotifications.teams);
        setNotificationLeagues(nextNotifications.leagues);
      }
      closeLeaguePicker();
    } catch (error) {
      console.error('Error saving notification leagues:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await notificationService.initialize();
      if (!granted) {
        setNotificationsPermissionDenied(true);
      await updatePreferences({ notificationsEnabled: false });
      Alert.alert(t('alerts.notificationsDisabled'), t('alerts.enableNotificationsSettings'));
      return;
    }
    setNotificationsPermissionDenied(false);
  } else {
    await notificationService.clearAllNotifications();
  }
    await persistPreferences({ notificationsEnabled: value });
  };

  const handleToggleChatNotifications = async (value: boolean) => {
    await persistPreferences({ chatNotifications: value });
  };

  const handleToggleAutoDarkMode = async (value: boolean) => {
    setDarkModeAuto(value);
    if (value) {
      await setThemeMode('system');
      if (userProfile) {
        await updateUserProfile({ themePreference: 'system' });
      }
    } else {
      const pref: ThemePreference = darkModeEnabled ? 'dark' : 'light';
      await setThemeMode(pref);
      if (userProfile) {
        await updateUserProfile({ themePreference: pref });
      }
    }
  };

  const handleToggleDarkMode = async (value: boolean) => {
    setDarkModeEnabled(value);
    if (!darkModeAuto) {
      const pref: ThemePreference = value ? 'dark' : 'light';
      await setThemeMode(pref);
      if (userProfile) {
        await updateUserProfile({ themePreference: pref });
      }
    }
  };

  const handleLocationSelect = async (nextLocation: { label: string; countryCode?: string; region?: string; city?: string }) => {
    if (!nextLocation.countryCode) {
      const detected = detectLocationFromTimezone();
      setLocationLabel(detected?.countryCode ? `Auto (${detected.label})` : 'Auto');
    } else {
      setLocationLabel(nextLocation.label);
    }
    if (!userProfile) {
      Alert.alert(t('alerts.signInRequired'), t('alerts.signInToEditProfile'));
      return;
    }
    try {
      await updateUserProfile({
        location: {
          label: nextLocation.label,
          countryCode: nextLocation.countryCode || undefined,
          region: nextLocation.region || undefined,
          city: nextLocation.city || undefined,
        },
      });
      setLocationModalVisible(false);
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    }
  };

  const openProfileEditor = () => {
    if (!userProfile) {
      Alert.alert(t('alerts.signInRequired'), t('alerts.signInToEditProfile'));
      return;
    }
    router.push('/editProfile' as any);
  };

  const saveProfile = async () => {
    if (!userProfile) return;
    const nextName = profileNameDraft.trim();
    if (!nextName) {
      Alert.alert(t('alerts.invalidName'), t('alerts.enterName'));
      return;
    }
    setProfileSaving(true);
    try {
      await updateUserProfile({ username: nextName });
      setProfileModalVisible(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    } finally {
      setProfileSaving(false);
    }
  };

  const toggleMatchNotifyPref = (key: keyof MatchNotifyPrefs, value: boolean) => {
    setMatchNotifyDefaults((prev) => ({ ...prev, [key]: value }));
    setApplyAllSelectedTeamsEnabled(false);
  };

  useEffect(() => {
    if (notificationTeams.length === 0 && applyAllSelectedTeamsEnabled) {
      setApplyAllSelectedTeamsEnabled(false);
    }
  }, [notificationTeams.length, applyAllSelectedTeamsEnabled]);

  const openTeamRuleEditor = (teamName: string, leagueKey?: string) => {
    setActiveTeamRule(teamName);
    setActiveTeamRuleLeagueKey(leagueKey || null);
    setPendingTeamRulePrefs(teamNotifyOverrides[teamName] || matchNotifyDefaults);
    setPendingTeamRuleAllCompetitions(teamCompetitionScope[teamName] === 'all');
    setTeamRuleModalVisible(true);
  };

  const togglePendingTeamRulePref = (key: keyof MatchNotifyPrefs, value: boolean) => {
    setPendingTeamRulePrefs((prev) => ({ ...prev, [key]: value }));
  };

  const resetTeamRuleToDefault = () => {
    setPendingTeamRulePrefs(matchNotifyDefaults);
    setPendingTeamRuleAllCompetitions(false);
  };

  const saveTeamRule = () => {
    if (!activeTeamRule) return;
    const aliases = getTeamAliases(activeTeamRule);
    setTeamNotifyOverrides((prev) => {
      const next = { ...prev };
      aliases.forEach((name) => {
        next[name] = pendingTeamRulePrefs;
      });
      return next;
    });
    setTeamCompetitionScope((prev) => {
      const next = { ...prev };
      aliases.forEach((name) => {
        next[name] = pendingTeamRuleAllCompetitions ? 'all' : 'primary';
      });
      return next;
    });
    setPendingTeams((prev) => Array.from(new Set([...prev, ...aliases])));
    setApplyAllSelectedTeamsEnabled(false);
    setTeamRuleModalVisible(false);
    setActiveTeamRule(null);
    setActiveTeamRuleLeagueKey(null);
  };

  const applyTeamRuleToSelectedLeagueTeams = () => {
    if (!activeTeamRuleLeagueKey) return;
    const leagueTeams = (groupedAllTeamsByLeague[activeTeamRuleLeagueKey] || []).map((team) => team.name);
    if (!leagueTeams.length) return;
    const selectedSet = new Set(pendingTeams);
    const targetTeams = leagueTeams.filter((teamName) => selectedSet.has(teamName));
    if (!targetTeams.length) {
      Alert.alert('No selected teams', 'Select at least one team in this league first.');
      return;
    }
    setTeamNotifyOverrides((prev) => {
      const next = { ...prev };
      targetTeams.forEach((teamName) => {
        next[teamName] = { ...pendingTeamRulePrefs };
      });
      return next;
    });
    setTeamCompetitionScope((prev) => {
      const next = { ...prev };
      targetTeams.forEach((teamName) => {
        next[teamName] = pendingTeamRuleAllCompetitions ? 'all' : 'primary';
      });
      return next;
    });
    setApplyAllSelectedTeamsEnabled(false);
    Alert.alert(
      'Applied',
      `Applied preferences to ${targetTeams.length} selected team${targetTeams.length === 1 ? '' : 's'} in ${formatCompetitionLabel(activeTeamRuleLeagueKey)}.`
    );
  };

  const saveMatchNotifyDefaults = async (
    overrides: TeamNotifyOverrides = teamNotifyOverrides,
    scopes: TeamCompetitionScope = teamCompetitionScope
  ) => {
    if (!userProfile?.uid) {
      Alert.alert(t('alerts.signInRequired'), 'Sign in to save default match notifications.');
      return;
    }
    setSavingMatchNotifyDefaults(true);
    try {
      const defaultsRef = doc(db, 'users', userProfile.uid, 'notificationDefaults', 'match');
      await setDoc(
        defaultsRef,
        {
          matchNotifyDefaults,
          teamNotifyOverrides: overrides,
          teamCompetitionScope: scopes,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert('Saved', 'Default match notifications updated.');
    } catch (error) {
      console.error('Error saving match notification defaults:', error);
      Alert.alert(t('alerts.unableToSave'), t('alerts.tryAgain'));
    } finally {
      setSavingMatchNotifyDefaults(false);
    }
  };

  const saveNotificationCustomization = async () => {
    const validTeams = new Set(notificationTeams);
    const prunedOverrides = Object.fromEntries(
      Object.entries(teamNotifyOverrides).filter(([teamName]) => validTeams.has(teamName))
    ) as TeamNotifyOverrides;
    const prunedScopes = Object.fromEntries(
      Object.entries(teamCompetitionScope).filter(([teamName]) => validTeams.has(teamName))
    ) as TeamCompetitionScope;
    setTeamNotifyOverrides(prunedOverrides);
    setTeamCompetitionScope(prunedScopes);
    await saveMatchNotifyDefaults(prunedOverrides, prunedScopes);
    setNotificationsModalVisible(false);
  };

  const applyDefaultsToAllSelectedTeams = () => {
    if (notificationTeams.length === 0) {
      Alert.alert('Select teams first', 'Add notification teams first, then apply defaults to all.');
      return;
    }
    const nextOverrides = notificationTeams.reduce((acc, teamName) => {
      acc[teamName] = { ...matchNotifyDefaults };
      return acc;
    }, {} as TeamNotifyOverrides);
    setTeamNotifyOverrides(nextOverrides);
    Alert.alert('Applied', `Applied current notification toggles to ${notificationTeams.length} selected team${notificationTeams.length === 1 ? '' : 's'}.`);
  };

  const toggleApplyAllSelectedTeams = () => {
    if (applyAllSelectedTeamsEnabled) {
      setApplyAllSelectedTeamsEnabled(false);
      return;
    }
    applyDefaultsToAllSelectedTeams();
    setApplyAllSelectedTeamsEnabled(true);
  };

  const showUnavailable = (label: string) => {
    Alert.alert(t('alerts.unavailable'), t('alerts.comingSoon', { label }));
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>{t('settings.title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Guest auth card — shown when not signed in */}
        {!userProfile ? (
          <View style={[styles.profileCard, { backgroundColor: palette.card }]}>
            <View style={[styles.profileAvatar, { backgroundColor: palette.border }]}>
              <Ionicons name="person-outline" size={22} color={palette.subtext} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: palette.text }]}>Not signed in</Text>
              <Text style={[styles.profileEmail, { color: palette.subtext }]}>Sign in for personalised features</Text>
            </View>
          </View>
        ) : (
          /* Signed-in User Profile Card */
          <TouchableOpacity
            style={[styles.profileCard, { backgroundColor: palette.card }]}
            onPress={openProfileEditor}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={t('settings.editProfile')}
          >
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {userProfile?.username?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: palette.text }]}>
                {userProfile?.username || t('settings.profileNameFallback')}
              </Text>
              <Text style={[styles.profileEmail, { color: palette.subtext }]}>
                {userProfile?.email || t('settings.profileEmailFallback')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>
        )}

        {/* Sign In / Create Account buttons for guests */}
        {!userProfile && (
          <View style={[styles.section, { backgroundColor: palette.card, marginTop: 12 }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: palette.border }]}
              onPress={() => router.push('/(auth)/login')}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons name="log-in-outline" size={20} color={palette.accent} />
                <Text style={[styles.menuText, { color: palette.accent, fontWeight: '700' }]}>Sign In</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => router.push('/(auth)/signup')}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons name="person-add-outline" size={20} color={palette.text} />
                <Text style={[styles.menuText, { color: palette.text }]}>Create Account</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Navigation Menu */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.quickAccess')}</Text>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: palette.border }]}
            onPress={() => exitSettingsTo('/live')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#FF3B30' }]}>
                <Ionicons name="radio" size={20} color="#FFF" />
              </View>
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.liveMatches')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: palette.border }]}
            onPress={() => exitSettingsTo('/upcoming')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#0066CC' }]}>
                <Ionicons name="calendar" size={20} color="#FFF" />
              </View>
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.upcomingMatches')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: palette.border }]}
            onPress={() => exitSettingsTo('/news')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#34C759' }]}>
                <Ionicons name="newspaper" size={20} color="#FFF" />
              </View>
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.latestNews')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.notifications')}</Text>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: palette.border }]}
            onPress={() => setNotificationsModalVisible(true)}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#0066CC' }]}>
                <Ionicons name="options" size={20} color="#FFF" />
              </View>
              <View style={styles.menuTextBlock}>
                <Text style={[styles.menuText, { color: palette.text }]}>Customize notifications</Text>
                <Text style={[styles.settingSubtext, { color: palette.subtext }]}>
                  Alerts and match events scoped to your Home feed
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.appearance')}</Text>

          <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon" size={24} color="#0066CC" />
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: palette.text }]}>Auto</Text>
                <Text style={[styles.settingSubtext, { color: palette.subtext }]}>Follow system appearance</Text>
              </View>
            </View>
            <Switch
              value={darkModeAuto}
              onValueChange={handleToggleAutoDarkMode}
              trackColor={{ false: palette.border, true: '#0066CC' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {!darkModeAuto && (
            <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
              <View style={styles.settingLeft}>
                <Ionicons name="moon" size={24} color="#0066CC" />
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingText, { color: palette.text }]}>{t('settings.darkMode')}</Text>
                  <Text style={[styles.settingSubtext, { color: palette.subtext }]}>{t('settings.darkModeSubtext')}</Text>
                </View>
              </View>
              <Switch
                value={darkModeEnabled}
                onValueChange={handleToggleDarkMode}
                trackColor={{ false: palette.border, true: '#0066CC' }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

        </View>

        {/* Preferences */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.preferences')}</Text>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => setLocationModalVisible(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="navigate" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.location')}</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={[styles.menuValue, { color: palette.subtext }]}>{locationLabel || t('settings.locationValue')}</Text>
              <Ionicons name="chevron-forward" size={20} color={chevronColor} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Favorite Teams & Leagues</Text>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => openTeamsModal('favorite')}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="heart" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>Favorite Teams</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={[styles.menuValue, { color: palette.subtext }]}>{favoriteTeams.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={chevronColor} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => openLeaguesModal('favorite')}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="trophy" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>Favorite Leagues</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={[styles.menuValue, { color: palette.subtext }]}>{favoriteLeagues.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={chevronColor} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Feed</Text>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={openFeedModal}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="albums" size={24} color="#0066CC" />
              <View style={styles.feedMenuTextBlock}>
                <Text style={[styles.menuText, { color: palette.text }]}>Home Feed</Text>
                <Text style={[styles.settingSubtext, { color: palette.subtext }]}>
                  Pick leagues and teams.
                </Text>
              </View>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={[styles.feedMenuValue, { color: palette.subtext }]}>
                {feedLeagues.length}L · {feedTeams.length}T
              </Text>
              <Ionicons name="chevron-forward" size={20} color={chevronColor} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account & Security */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.accountSecurity')}</Text>

          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: palette.border }]}
            onPress={openProfileEditor}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="person" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.editProfile')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push('/changePassword' as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="lock-closed" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.changePassword')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push('/privacySecurity' as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield-checkmark" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.privacySecurity')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Support & About */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.supportAbout')}</Text>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push({ pathname: '/support/help' } as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.helpCenter')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push('/support' as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.contactSupport')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Legal</Text>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push({ pathname: '/legal/terms' } as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="document-text" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.termsOfService')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push({ pathname: '/legal/privacy' } as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>{t('settings.privacyPolicy')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={() => router.push({ pathname: '/legal/affiliation' } as any)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="ribbon" size={24} color="#0066CC" />
              <Text style={[styles.menuText, { color: palette.text }]}>Trademarks & Affiliation</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={chevronColor} />
          </TouchableOpacity>

          <View style={styles.versionItem}>
            <Text style={[styles.versionText, { color: palette.subtext }]}>{t('settings.version')}</Text>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>{t('settings.accountActions')}</Text>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out" size={24} color="#FF3B30" />
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>{t('settings.logOut')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: palette.border }]} onPress={handleDeleteAccount}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="trash" size={24} color="#FF3B30" />
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>{t('settings.deleteAccount')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={notificationsModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Customize Notifications</Text>
            <TouchableOpacity onPress={() => setNotificationsModalVisible(false)}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.section, { backgroundColor: palette.card }]}>
              <Text style={[styles.sectionTitle, { color: palette.muted }]}>General Alerts</Text>

              <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
                <View style={styles.settingLeft}>
                  <Ionicons name="notifications" size={24} color="#0066CC" />
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: palette.text }]}>{t('settings.pushNotifications')}</Text>
                    <Text style={[styles.settingSubtext, { color: palette.subtext }]}>{notificationsSubtext}</Text>
                  </View>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: palette.border, true: '#0066CC' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
                <View style={styles.settingLeft}>
                  <Ionicons name="chatbubbles" size={24} color="#0066CC" />
                  <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingText, { color: palette.text }]}>{t('settings.chatNotifications')}</Text>
                    <Text style={[styles.settingSubtext, { color: palette.subtext }]}>{t('settings.chatSubtext')}</Text>
                  </View>
                </View>
                <Switch
                  value={chatNotifications}
                  onValueChange={handleToggleChatNotifications}
                  trackColor={{ false: palette.border, true: '#0066CC' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: palette.card }]}>
              <Text style={[styles.sectionTitle, { color: palette.muted }]}>Match Notification Types</Text>
              {MATCH_NOTIFY_EVENT_OPTIONS.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.settingItem,
                    { borderBottomColor: palette.border },
                    index === MATCH_NOTIFY_EVENT_OPTIONS.length - 1 && styles.settingItemLast,
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="notifications-circle" size={24} color="#0066CC" />
                    <View style={styles.settingTextContainer}>
                      <Text style={[styles.settingText, { color: palette.text }]}>{item.label}</Text>
                    </View>
                  </View>
                  <Switch
                    value={matchNotifyDefaults[item.key]}
                    onValueChange={(value) => toggleMatchNotifyPref(item.key, value)}
                    trackColor={{ false: palette.border, true: '#0066CC' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[
                  styles.applyAllButton,
                  applyAllSelectedTeamsEnabled && styles.applyAllButtonOn,
                  {
                    borderColor: palette.border,
                    backgroundColor: applyAllSelectedTeamsEnabled
                      ? '#0066CC'
                      : (isDark ? '#142033' : '#E8F1FF'),
                  },
                ]}
                onPress={toggleApplyAllSelectedTeams}
                activeOpacity={0.8}
              >
                <Ionicons name="duplicate-outline" size={16} color={applyAllSelectedTeamsEnabled ? '#FFFFFF' : '#0066CC'} />
                <Text style={[styles.applyAllButtonText, applyAllSelectedTeamsEnabled && styles.applyAllButtonTextOn]}>
                  Apply to all selected teams
                </Text>
                <Text style={[styles.applyAllStatusText, applyAllSelectedTeamsEnabled && styles.applyAllStatusTextOn]}>
                  {applyAllSelectedTeamsEnabled ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.section, { backgroundColor: palette.card }]}>
              <Text style={[styles.sectionTitle, { color: palette.muted }]}>Teams & Leagues</Text>
              <Text style={[styles.settingSubtext, { color: palette.subtext, marginBottom: 10 }]}>
                Choose where alerts come from. Favorites can be preselected but are fully customizable here.
              </Text>

              <TouchableOpacity style={[styles.menuItem, styles.menuItemLast, { borderBottomColor: palette.border }]} onPress={() => openTeamsModal('notification')}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="notifications" size={24} color="#0066CC" />
                  <Text style={[styles.menuText, { color: palette.text }]}>Notification Teams</Text>
                </View>
                <View style={styles.menuItemRight}>
                  {notificationTeams.length > 0 && (
                    <TouchableOpacity style={[styles.customizeBadgeButton, { borderColor: palette.border }]} onPress={() => openTeamsModal('notification')}>
                      <Text style={styles.customizeBadgeButtonText}>Customize</Text>
                    </TouchableOpacity>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={chevronColor} />
                </View>
              </TouchableOpacity>

            </View>

            <View style={styles.notificationSaveSection}>
              <View style={[styles.notificationSaveDivider, { backgroundColor: isDark ? '#101114' : '#E9EEF5' }]} />
            </View>

            <TouchableOpacity
              style={[styles.modalSaveButton, savingMatchNotifyDefaults && styles.modalSaveButtonDisabled, { marginHorizontal: 20, marginBottom: 28 }]}
              onPress={saveNotificationCustomization}
              disabled={savingMatchNotifyDefaults}
            >
              {savingMatchNotifyDefaults ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>Save Notification Preferences</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={feedModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Home Feed</Text>
            <TouchableOpacity onPress={closeFeedModal}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.feedBuilderTopRow, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.feedBuilderTopText, { color: palette.subtext }]}>
              Choose full leagues or expand them to pick specific teams.
            </Text>
            <TouchableOpacity
              style={styles.feedBuilderSelectAllButton}
              onPress={() => {
                if (allPendingFeedSelected) {
                  setPendingFeedLeagues([]);
                  setPendingFeedTeams([]);
                  return;
                }
                setPendingFeedLeagues(allPendingFeedLeagueNames);
                setPendingFeedTeams(allPendingFeedTeamNames);
              }}
            >
              <Text style={styles.feedBuilderSelectAllText}>{allPendingFeedSelected ? 'Clear All' : 'Select All'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.modalSearch, { backgroundColor: palette.card }]}>
            <Ionicons name="search" size={18} color={palette.subtext} />
            <TextInput
              style={[styles.modalSearchInput, { color: palette.text }]}
              placeholder="Search leagues, tournaments, or teams..."
              placeholderTextColor={palette.subtext}
              value={feedSearch}
              onChangeText={setFeedSearch}
            />
          </View>

          {loadingCommunities ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={[styles.modalLoadingText, { color: palette.subtext }]}>{t('settings.loadingLeagues')}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.feedBuilderListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {groupedFeedLeagues.map(({ league, teams }) => {
                const expanded = expandedFeedLeagues.includes(league.name) || feedSearch.trim().length > 0;
                const leagueSelected = pendingFeedLeagues.includes(league.name);

                return (
                  <View key={`feed-league-${league.id}`} style={[styles.feedLeagueCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                    <View style={styles.feedLeagueRow}>
                      <TouchableOpacity
                        style={styles.feedLeagueTitlePress}
                        activeOpacity={0.82}
                        onPress={() => toggleExpandedFeedLeague(league.name)}
                      >
                        {league.logo ? (
                          <Image source={{ uri: league.logo, cache: 'force-cache' }} style={[styles.modalListLogo, isDark && styles.modalLeagueLogoOnDark]} resizeMode="contain" />
                        ) : (
                          <View style={[styles.modalListLogoPlaceholder, { backgroundColor: modalPlaceholderColor }]}>
                            <Ionicons name="trophy" size={18} color="#0066CC" />
                          </View>
                        )}
                        <View style={styles.rowTextWrap}>
                          <Text style={[styles.modalListTitle, { color: palette.text }]}>{formatCompetitionLabel(league.name)}</Text>
                          <Text style={[styles.modalListSubtitle, { color: palette.subtext }]}>
                            {league.country || 'Tournament'}{teams.length > 0 ? ` • ${teams.length} teams` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.feedLeagueActions}>
                        <TouchableOpacity style={styles.feedLeagueExpandButton} onPress={() => toggleExpandedFeedLeague(league.name)}>
                          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.subtext} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => togglePendingFeedLeague(league.name)}>
                          <Ionicons
                            name={leagueSelected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={leagueSelected ? '#0066CC' : '#C7C7CC'}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {expanded ? (
                      <View style={[styles.feedLeagueTeams, { borderTopColor: palette.border }]}>
                        {teams.length > 0 ? (
                          teams.map((team) => {
                            const selected = pendingFeedTeams.includes(team.name);
                            return (
                              <TouchableOpacity
                                key={`feed-team-${team.id}`}
                                style={[styles.feedTeamRow, { borderTopColor: palette.border }]}
                                onPress={() => togglePendingFeedTeam(team.name)}
                              >
                                <View style={styles.modalListLeft}>
                                  {team.logo ? (
                                    <Image source={{ uri: team.logo, cache: 'force-cache' }} style={styles.modalListLogo} resizeMode="contain" />
                                  ) : (
                                    <View style={[styles.modalListLogoPlaceholder, { backgroundColor: modalPlaceholderColor }]}>
                                      <Ionicons name="shield" size={18} color="#0066CC" />
                                    </View>
                                  )}
                                  <Text style={[styles.modalListTitle, { color: palette.text }]}>{team.name}</Text>
                                </View>
                                <Ionicons
                                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={22}
                                  color={selected ? '#0066CC' : '#C7C7CC'}
                                />
                              </TouchableOpacity>
                            );
                          })
                        ) : (
                          <Text style={[styles.feedLeagueEmptyText, { color: palette.subtext }]}>
                            {league.id === -100
                              ? 'Covers all qualifier zones: UEFA, CAF, AFC, CONCACAF, CONMEBOL, OFC'
                              : league.id === -101
                              ? 'National team friendly matches from all confederations'
                              : 'No teams available for this competition.'}
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <View style={{ height: 12 }} />
            </ScrollView>
          )}

          <TouchableOpacity style={styles.modalSaveButton} onPress={saveFeedSelections}>
            <Text style={styles.modalSaveText}>{t('settings.save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Notification Teams Modal */}
      <Modal visible={teamModalVisible} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>
              {teamSelectionTarget === 'notification' ? 'Notification Teams' : teamSelectionTarget === 'feed' ? 'Home Feed Teams' : 'Favorite Teams'}
            </Text>
            <TouchableOpacity onPress={closeTeamPicker}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.modalSearch, { backgroundColor: palette.card }]}>
            <Ionicons name="search" size={18} color={palette.subtext} />
            <TextInput
              style={[styles.modalSearchInput, { color: palette.text }]}
              placeholder={t('settings.searchTeams')}
              placeholderTextColor={palette.subtext}
              value={teamSearch}
              onChangeText={setTeamSearch}
            />
          </View>
          {teamSelectionTarget !== 'favorite' ? (
            <View style={[styles.selectAllRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.selectAllRowLeft}>
                <Text style={[styles.selectAllTitle, { color: palette.text }]}>
                  {teamSelectionTarget === 'notification' ? 'Select all feed teams + all comps' : 'Select all teams'}
                </Text>
                <Text style={[styles.selectAllMeta, { color: palette.subtext }]}>
                  {pendingTeams.length}/{allTeamNames.length} selected
                </Text>
              </View>
              <Switch
                value={allPendingTeamsSelected}
                onValueChange={toggleSelectAllTeams}
                trackColor={{ false: palette.border, true: '#0066CC' }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {loadingCommunities ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={[styles.modalLoadingText, { color: palette.subtext }]}>{t('settings.loadingTeams')}</Text>
            </View>
          ) : (
            teamSelectionTarget === 'notification' ? (
              <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent} showsVerticalScrollIndicator={false}>
                {groupedLeagueKeys.map((leagueKey) => {
                  const leagueTeams = groupedFilteredTeamsByLeague[leagueKey] || [];
                  const selectedCount = leagueTeams.filter((team) => pendingTeams.includes(team.name)).length;
                  const allCount = (groupedAllTeamsByLeague[leagueKey] || []).length;
                  const allSelected = allCount > 0 && (groupedAllTeamsByLeague[leagueKey] || []).every((team) => pendingTeams.includes(team.name));
                  const selectedLeagueTeamNames = (groupedAllTeamsByLeague[leagueKey] || [])
                    .map((team) => team.name)
                    .filter((name) => pendingTeams.includes(name));
                  const leagueAllCompsOn =
                    selectedLeagueTeamNames.length > 0 &&
                    selectedLeagueTeamNames.every((name) => teamCompetitionScope[name] === 'all');
                  const leagueLabel = formatCompetitionLabel(leagueTeams[0]?.league || leagueKey);
                  const open = expandedTeamLeagues.includes(leagueKey);
                  return (
                    <View key={leagueKey} style={[styles.groupedLeagueCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                      <View style={styles.groupedLeagueHeader}>
                        <TouchableOpacity onPress={() => togglePendingLeagueTeams(leagueKey)} style={styles.groupedLeagueBubble}>
                          <Ionicons
                            name={allSelected ? 'checkmark-circle' : selectedCount > 0 ? 'remove-circle' : 'ellipse-outline'}
                            size={22}
                            color={allSelected ? '#0066CC' : selectedCount > 0 ? '#64748B' : '#C7C7CC'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.groupedLeagueTitlePress} onPress={() => toggleExpandedTeamLeague(leagueKey)}>
                          <View>
                            <Text style={[styles.modalListTitle, { color: palette.text }]}>{leagueLabel}</Text>
                            <Text style={[styles.modalListSubtitle, { color: palette.subtext }]}>
                              {selectedCount}/{allCount} teams selected
                            </Text>
                          </View>
                          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.subtext} />
                        </TouchableOpacity>
                      </View>
                      {selectedLeagueTeamNames.length > 0 && (
                        <View style={[styles.leagueCompScopeRow, { borderTopColor: palette.border }]}>
                          <Text style={[styles.leagueCompScopeText, { color: palette.subtext }]}>
                            All Comps: {leagueAllCompsOn ? 'ON' : 'OFF'}
                          </Text>
                          <Switch
                            value={leagueAllCompsOn}
                            onValueChange={() => toggleLeagueSelectedTeamsAllComps(leagueKey)}
                            trackColor={{ false: palette.border, true: '#0066CC' }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                      )}
                      {open &&
                        leagueTeams.map((item) => {
                          const selected = pendingTeams.includes(item.name);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[styles.groupedTeamRow, { borderTopColor: palette.border }]}
                              onPress={() => togglePendingTeam(item.name)}
                            >
                              <View style={styles.modalListLeft}>
                                {item.logo ? (
                                  <Image source={{ uri: item.logo, cache: 'force-cache' }} style={styles.modalListLogo} resizeMode="contain" />
                                ) : (
                                  <View style={[styles.modalListLogoPlaceholder, { backgroundColor: modalPlaceholderColor }]}>
                                    <Ionicons name="shield" size={18} color="#0066CC" />
                                  </View>
                                )}
                                <Text style={[styles.modalListTitle, { color: palette.text }]}>{item.name}</Text>
                              </View>
                              <View style={styles.modalListRight}>
                                {selected && (
                                  <>
                                    <TouchableOpacity
                                      style={[
                                        styles.teamScopeChip,
                                        { borderColor: palette.border },
                                        teamCompetitionScope[item.name] === 'all' && styles.teamScopeChipOn,
                                      ]}
                                      onPress={() => toggleTeamAllCompetitions(item.name)}
                                    >
                                      <Text
                                        style={[
                                          styles.teamScopeChipText,
                                          teamCompetitionScope[item.name] === 'all' && styles.teamScopeChipTextOn,
                                        ]}
                                      >
                                        All Comps: {teamCompetitionScope[item.name] === 'all' ? 'ON' : 'OFF'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[styles.customizeTeamButton, { borderColor: palette.border }]}
                                      onPress={() => {
                                        openTeamRuleEditor(item.name, leagueKey);
                                      }}
                                    >
                                      <Text style={styles.customizeTeamButtonText}>Customize</Text>
                                    </TouchableOpacity>
                                  </>
                                )}
                                <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? '#0066CC' : '#C7C7CC'} />
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  );
                })}
                <View style={{ height: 12 }} />
              </ScrollView>
            ) : (
              <FlatList
                style={styles.modalList}
                data={filteredTeams}
                keyExtractor={(item) => `${item.id}`}
                renderItem={({ item }) => {
                  const selected = pendingTeams.includes(item.name);
                  return (
                    <TouchableOpacity
                      style={[styles.modalListItem, { backgroundColor: palette.card }]}
                      onPress={() => togglePendingTeam(item.name)}
                    >
                      <View style={styles.modalListLeft}>
                        {item.logo ? (
                          <Image source={{ uri: item.logo, cache: 'force-cache' }} style={styles.modalListLogo} resizeMode="contain" />
                        ) : (
                          <View style={[styles.modalListLogoPlaceholder, { backgroundColor: modalPlaceholderColor }]}>
                            <Ionicons name="shield" size={18} color="#0066CC" />
                          </View>
                        )}
                        <View>
                          <Text style={[styles.modalListTitle, { color: palette.text }]}>{item.name}</Text>
                          {item.league && (
                            <Text style={[styles.modalListSubtitle, { color: palette.subtext }]}>
                              {formatCompetitionLabel(item.league)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? '#0066CC' : '#C7C7CC'} />
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={styles.modalListContent}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                windowSize={7}
                maxToRenderPerBatch={12}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews
                ListFooterComponent={<View style={{ height: 12 }} />}
              />
            )
          )}

          <TouchableOpacity style={styles.modalSaveButton} onPress={saveTeams}>
            <Text style={styles.modalSaveText}>{t('settings.save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Notification Leagues Modal */}
      <Modal visible={leagueModalVisible} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>
              {leagueSelectionTarget === 'notification' ? 'Notification Leagues' : leagueSelectionTarget === 'feed' ? 'Home Feed Leagues' : 'Favorite Leagues'}
            </Text>
            <TouchableOpacity onPress={closeLeaguePicker}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.modalSearch, { backgroundColor: palette.card }]}>
            <Ionicons name="search" size={18} color={palette.subtext} />
            <TextInput
              style={[styles.modalSearchInput, { color: palette.text }]}
              placeholder={t('settings.searchLeagues')}
              placeholderTextColor={palette.subtext}
              value={leagueSearch}
              onChangeText={setLeagueSearch}
            />
          </View>
          {leagueSelectionTarget !== 'favorite' ? (
            <View style={[styles.selectAllRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.selectAllRowLeft}>
                <Text style={[styles.selectAllTitle, { color: palette.text }]}>Select all leagues</Text>
                <Text style={[styles.selectAllMeta, { color: palette.subtext }]}>
                  {pendingLeagues.length}/{allLeagueNames.length} selected
                </Text>
              </View>
              <Switch
                value={allPendingLeaguesSelected}
                onValueChange={toggleSelectAllLeagues}
                trackColor={{ false: palette.border, true: '#0066CC' }}
                thumbColor="#FFFFFF"
              />
            </View>
          ) : null}

          {loadingCommunities ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="small" color="#0066CC" />
              <Text style={[styles.modalLoadingText, { color: palette.subtext }]}>{t('settings.loadingLeagues')}</Text>
            </View>
          ) : (
            <FlatList
              style={styles.modalList}
              data={filteredLeagues}
              keyExtractor={(item) => `${item.id}`}
              renderItem={({ item }) => {
                const selected = pendingLeagues.includes(item.name);
                return (
                  <TouchableOpacity
                    style={[styles.modalListItem, { backgroundColor: palette.card }]}
                    onPress={() => togglePendingLeague(item.name)}
                  >
                    <View style={styles.modalListLeft}>
                      {item.logo ? (
                        <Image
                          source={{ uri: item.logo, cache: 'force-cache' }}
                          style={[styles.modalListLogo, isDark && styles.modalLeagueLogoOnDark]}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.modalListLogoPlaceholder, { backgroundColor: modalPlaceholderColor }]}>
                          <Ionicons name="trophy" size={18} color="#0066CC" />
                        </View>
                      )}
                      <View>
                        <Text style={[styles.modalListTitle, { color: palette.text }]}>{formatCompetitionLabel(item.name)}</Text>
                        {item.country && <Text style={[styles.modalListSubtitle, { color: palette.subtext }]}>{item.country}</Text>}
                      </View>
                    </View>
                    <View style={styles.modalListRight}>
                      {leagueSelectionTarget === 'notification' && selected && (
                        <Text style={[styles.customTagText, { color: palette.subtext }]}>Customize</Text>
                      )}
                      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? '#0066CC' : '#C7C7CC'} />
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              windowSize={7}
              maxToRenderPerBatch={12}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews
              ListFooterComponent={<View style={{ height: 12 }} />}
            />
          )}

          <TouchableOpacity style={styles.modalSaveButton} onPress={saveLeagues}>
            <Text style={styles.modalSaveText}>{t('settings.save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={teamRuleModalVisible} animationType="fade" transparent presentationStyle="overFullScreen">
        <View style={styles.inlineModalBackdrop}>
          <View style={[styles.inlineModalCard, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={[styles.inlineModalHeader, { borderBottomColor: palette.border }]}>
              <Text style={[styles.inlineModalTitle, { color: palette.text }]}>
                {activeTeamRule ? `${activeTeamRule} Alerts` : 'Team Alerts'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setTeamRuleModalVisible(false);
                  setActiveTeamRule(null);
                  setActiveTeamRuleLeagueKey(null);
                }}
              >
                <Ionicons name="close" size={24} color={palette.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.inlineModalBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.section, { backgroundColor: palette.card, marginBottom: 0 }]}>
                <Text style={[styles.sectionTitle, { color: palette.muted }]}>Event Types</Text>
                <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="layers" size={22} color="#0066CC" />
                    <View style={styles.settingTextContainer}>
                      <Text style={[styles.settingText, { color: palette.text }]}>All Competitions</Text>
                      <Text style={[styles.settingSubtext, { color: palette.subtext }]}>
                        {pendingTeamRuleAllCompetitions ? 'ON for all comps.' : 'OFF for primary league only.'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={pendingTeamRuleAllCompetitions}
                    onValueChange={setPendingTeamRuleAllCompetitions}
                    trackColor={{ false: palette.border, true: '#0066CC' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {MATCH_NOTIFY_EVENT_OPTIONS.map((item) => (
                  <View key={item.key} style={[styles.settingItem, { borderBottomColor: palette.border }]}>
                    <View style={styles.settingLeft}>
                      <Ionicons name="notifications-circle" size={24} color="#0066CC" />
                      <Text style={[styles.settingText, { color: palette.text }]}>{item.label}</Text>
                    </View>
                    <Switch
                      value={pendingTeamRulePrefs[item.key]}
                      onValueChange={(value) => togglePendingTeamRulePref(item.key, value)}
                      trackColor={{ false: palette.border, true: '#0066CC' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ))}
              </View>
              <View style={styles.teamRuleActionsWrap}>
                {!!activeTeamRuleLeagueKey && (
                  <TouchableOpacity
                    style={[styles.teamRuleResetButton, { borderColor: palette.border, backgroundColor: palette.card }]}
                    onPress={applyTeamRuleToSelectedLeagueTeams}
                  >
                    <Ionicons name="layers-outline" size={18} color="#0066CC" />
                    <Text style={[styles.teamRuleResetText, { color: palette.text }]}>
                      Apply to selected {formatCompetitionLabel(activeTeamRuleLeagueKey)} teams
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.teamRuleResetButton, { borderColor: palette.border, backgroundColor: palette.card }]}
                  onPress={resetTeamRuleToDefault}
                >
                  <Ionicons name="refresh" size={18} color="#0066CC" />
                  <Text style={[styles.teamRuleResetText, { color: palette.text }]}>Reset to Default</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveButton} onPress={saveTeamRule}>
                  <Text style={styles.modalSaveText}>Save Team Preferences</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Location Modal */}
      <Modal visible={locationModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{t('settings.locationModalTitle')}</Text>
            <TouchableOpacity onPress={() => setLocationModalVisible(false)}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalListContent}>
            {LOCATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={[styles.modalListItem, { backgroundColor: palette.card }]}
                onPress={() => handleLocationSelect(option)}
              >
                <Text style={[styles.modalListTitle, { color: palette.text }]}>{option.label}</Text>
                <Ionicons
                  name={locationLabel === option.label ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={locationLabel === option.label ? '#0066CC' : '#C7C7CC'}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={profileModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: palette.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{t('settings.editProfileModal')}</Text>
            <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
              <Ionicons name="close" size={26} color={palette.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.profileEditCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.profileEditLabel, { color: palette.subtext }]}>{t('settings.username')}</Text>
            <TextInput
              style={[styles.profileEditInput, { color: palette.text, borderColor: palette.border }]}
              value={profileNameDraft}
              onChangeText={setProfileNameDraft}
              placeholder={t('settings.username')}
              placeholderTextColor={palette.subtext}
              autoCapitalize="words"
            />
          </View>

          <TouchableOpacity
            style={[styles.modalSaveButton, profileSaving && styles.modalSaveButtonDisabled]}
            onPress={saveProfile}
            disabled={profileSaving}
          >
            {profileSaving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.modalSaveText}>{t('settings.save')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 20,
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginLeft: 0,
  },
  menuTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  feedMenuTextBlock: {
    flex: 1,
    minWidth: 0,
    maxWidth: '72%',
    paddingRight: 10,
  },
  menuValue: {
    fontSize: 17,
    color: '#999',
    marginRight: 8,
  },
  feedMenuValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginRight: 8,
  },
  customTagText: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  scopeQuickButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  scopeQuickButtonOn: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  scopeQuickButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  scopeQuickButtonTextOn: {
    color: '#FFFFFF',
  },
  customizeBadgeButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  customizeBadgeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066CC',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  settingTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  settingText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  settingSubtext: {
    fontSize: 12,
    color: '#999',
    lineHeight: 16,
    flexShrink: 1,
  },
  versionItem: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 15,
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  modalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  modalLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  selectAllRow: {
    marginHorizontal: 20,
    marginTop: 2,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAllRowLeft: {
    flex: 1,
    paddingRight: 10,
  },
  selectAllTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectAllMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  modalListContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalList: {
    flex: 1,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  modalListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalListRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedBuilderTopRow: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedBuilderTopText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  feedBuilderSelectAllButton: {
    backgroundColor: '#0066CC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  feedBuilderSelectAllText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  feedBuilderListContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 2,
  },
  feedLeagueCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  feedLeagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  feedLeagueTitlePress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  feedLeagueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedLeagueExpandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedLeagueTeams: {
    borderTopWidth: 1,
  },
  feedTeamRow: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedLeagueEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
  },
  groupedLeagueCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'column',
    padding: 0,
    overflow: 'hidden',
  },
  groupedLeagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  groupedLeagueBubble: {
    paddingRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupedLeagueTitlePress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  groupedTeamRow: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueCompScopeRow: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leagueCompScopeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  customizeTeamButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  customizeTeamButtonText: {
    color: '#0066CC',
    fontSize: 12,
    fontWeight: '700',
  },
  teamScopeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'transparent',
  },
  teamScopeChipOn: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  teamScopeChipText: {
    color: '#0066CC',
    fontSize: 12,
    fontWeight: '700',
  },
  teamScopeChipTextOn: {
    color: '#FFFFFF',
  },
  modalListLogo: {
    width: 32,
    height: 32,
  },
  modalLeagueLogoOnDark: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 2,
  },
  modalListLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalListTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  modalListSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  modalSaveButton: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#0066CC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveButtonDisabled: {
    opacity: 0.7,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notificationSaveSection: {
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  notificationSaveDivider: {
    width: '100%',
    height: 1,
    opacity: 0.8,
  },
  teamRuleActionsWrap: {
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  inlineModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  inlineModalCard: {
    flex: 1,
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  inlineModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  inlineModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  inlineModalBody: {
    flex: 1,
  },
  teamRuleResetButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamRuleResetText: {
    fontSize: 16,
    fontWeight: '700',
  },
  saveDefaultsButton: {
    marginTop: 12,
    marginBottom: 6,
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveDefaultsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileEditCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
  },
  applyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 10,
  },
  applyAllButtonOn: {
    borderColor: '#0066CC',
  },
  applyAllButtonText: {
    color: '#0066CC',
    fontSize: 14,
    fontWeight: '700',
  },
  applyAllButtonTextOn: {
    color: '#FFFFFF',
  },
  applyAllStatusText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#0066CC',
  },
  applyAllStatusTextOn: {
    color: '#FFFFFF',
  },
  profileEditLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  profileEditInput: {
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
