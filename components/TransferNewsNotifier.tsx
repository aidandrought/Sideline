import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNotificationPreferences } from '../context/NotificationPreferencesContext';
import { db } from '../config/firebase';
import { communityService } from '../services/communityService';
import { NewsArticle, newsAPI } from '../services/newsApi';
import { notificationService } from '../services/notificationService';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ALERTS_PER_POLL = 3;
const STORAGE_KEY_PREFIX = '@transfer_news_notified_v1:';

const TRANSFER_KEYWORDS = [
  'transfer',
  'transfers',
  'signing',
  'signs',
  'signed',
  'bid',
  'bids',
  'loan',
  'loanee',
  'rumor',
  'rumour',
  'linked',
  'target',
  'swap deal',
  'contract talks',
  'medical',
];

const TEAM_ALIASES: Record<string, string[]> = {
  'manchester united': ['man united', 'man utd', 'manchester utd'],
  'manchester city': ['man city'],
  'tottenham hotspur': ['tottenham', 'spurs'],
  'wolverhampton wanderers': ['wolves'],
  'newcastle united': ['newcastle'],
  'brighton & hove albion': ['brighton'],
  'west ham united': ['west ham'],
  'nottingham forest': ['forest'],
  'paris saint-germain': ['psg'],
  'inter milan': ['inter'],
  'ac milan': ['milan'],
  'atletico madrid': ['atletico'],
  'bayern munich': ['bayern'],
  'borussia monchengladbach': ['gladbach'],
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactTeamName = (value: string) =>
  normalize(value)
    .replace(/\b(fc|cf|afc|sc|ac)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasTransferIntent = (article: NewsArticle) => {
  const text = normalize(`${article.title} ${article.description || ''} ${article.content || ''}`);
  return TRANSFER_KEYWORDS.some((keyword) => text.includes(keyword));
};

const buildTeamSearchTerms = (teamName: string): string[] => {
  const normalized = normalize(teamName);
  const compact = compactTeamName(teamName);
  const aliases = TEAM_ALIASES[normalized] || [];
  return Array.from(new Set([normalized, compact, ...aliases.map(normalize)].filter(Boolean)));
};

const articleMentionsTeam = (article: NewsArticle, teamTerms: string[]) => {
  const text = normalize(`${article.title} ${article.description || ''} ${article.content || ''}`);
  return teamTerms.some((term) => term.length >= 3 && text.includes(term));
};

const getArticleKey = (article: NewsArticle) => {
  if (article.url) return article.url.toLowerCase();
  return `${normalize(article.title)}:${article.publishedAt}`;
};

const truncateNotificationText = (value: string, max: number) => {
  const trimmed = (value || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const sendTransferHeadlineNotification = async (teamName: string, article: NewsArticle) => {
  const imageUrlRaw = (article.imageUrl || '').trim();
  const imageUrl = /^https?:\/\//i.test(imageUrlRaw) ? imageUrlRaw : '';
  const headline = truncateNotificationText(article.title || `${teamName} transfer update`, 110);
  const summary = truncateNotificationText(article.description || article.content || article.source || '', 140);
  const content: Notifications.NotificationContentInput = {
    title: truncateNotificationText(`${teamName} transfer update`, 60),
    body: summary || headline,
    subtitle: headline,
    data: { type: 'transfer_news', articleUrl: article.url, team: teamName, imageUrl: imageUrl || undefined },
    sound: true,
    color: '#4AAEFF',
    priority: 'high',
    interruptionLevel: 'active',
  };
  if (imageUrl) {
    content.attachments = [
      {
        identifier: 'transfer-news-image',
        url: imageUrl,
        type: null,
      },
    ];
  }
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
};

type MatchNotifyPrefs = {
  goals: boolean;
  cards: boolean;
  halftime: boolean;
  matchStart: boolean;
  fulltime: boolean;
  transferNews: boolean;
};

const DEFAULT_MATCH_NOTIFY_PREFS: MatchNotifyPrefs = {
  goals: true,
  cards: true,
  halftime: true,
  matchStart: true,
  fulltime: true,
  transferNews: true,
};

type TeamNotifyOverrides = Record<string, Partial<MatchNotifyPrefs>>;

const normalizeTeamKey = (value: string) => value.trim().toLowerCase();
const normalizeCompetitionKey = (value: string) =>
  value
    .replace(/^UEFA\s+/i, '')
    .replace(/^FIFA\s+/i, '')
    .trim()
    .toLowerCase();

export default function TransferNewsNotifier() {
  const { user, userProfile } = useAuth();
  const { preferences, ready } = useNotificationPreferences();
  const [expandedLeagueTeams, setExpandedLeagueTeams] = useState<string[]>([]);
  const dedupeRef = useRef<Record<string, number>>({});
  const loadedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadLeagueTeams = async () => {
      if (!user?.uid || user.uid !== userProfile?.uid) {
        setExpandedLeagueTeams([]);
        return;
      }
      const selectedLeagues = [
        ...(userProfile?.notificationLeagues || []),
        ...(userProfile?.followedLeagues || []),
      ]
        .map((league) => normalizeCompetitionKey(league || ''))
        .filter(Boolean);

      if (!selectedLeagues.length) {
        if (active) setExpandedLeagueTeams([]);
        return;
      }

      try {
        const communities = await communityService.getAllCommunities();
        if (!active) return;
        const teamNames = communities
          .filter((community) => community.type === 'team')
          .filter((community) => selectedLeagues.includes(normalizeCompetitionKey(community.league || '')))
          .map((community) => community.name)
          .filter(Boolean);
        setExpandedLeagueTeams(Array.from(new Set(teamNames)));
      } catch {
        if (active) setExpandedLeagueTeams([]);
      }
    };
    void loadLeagueTeams();
    return () => {
      active = false;
    };
  }, [user?.uid, userProfile?.uid, userProfile?.followedLeagues, userProfile?.notificationLeagues]);

  const followedTeamNames = useMemo(() => {
    const fromNotifications = userProfile?.notificationTeams || [];
    const fromFavorites = userProfile?.followedTeams || [];
    const combined = [...fromNotifications, ...fromFavorites, ...expandedLeagueTeams]
      .map((team) => team?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(combined));
  }, [expandedLeagueTeams, userProfile?.followedTeams, userProfile?.notificationTeams]);

  useEffect(() => {
    loadedRef.current = false;
    dedupeRef.current = {};
  }, [userProfile?.uid]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!ready || !user?.uid || user.uid !== userProfile?.uid) return;
    if (!preferences.notificationsEnabled) return;

    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const storageKey = `${STORAGE_KEY_PREFIX}${userProfile.uid}`;

    const loadDedupe = async () => {
      if (loadedRef.current) return;
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) dedupeRef.current = JSON.parse(raw) as Record<string, number>;
      } catch {
        dedupeRef.current = {};
      } finally {
        loadedRef.current = true;
      }
    };

    const persistDedupe = async () => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(dedupeRef.current));
      } catch {
        // Ignore write errors.
      }
    };

    const cleanupDedupe = () => {
      const now = Date.now();
      Object.keys(dedupeRef.current).forEach((key) => {
        if (now - dedupeRef.current[key] > DEDUPE_TTL_MS) {
          delete dedupeRef.current[key];
        }
      });
    };

    const loadTransferPreferences = async (): Promise<{
      defaults: MatchNotifyPrefs;
      teamOverrides: TeamNotifyOverrides;
    }> => {
      try {
        const defaultsRef = doc(db, 'users', userProfile.uid, 'notificationDefaults', 'match');
        const snapshot = await getDoc(defaultsRef);
        if (!snapshot.exists()) {
          return { defaults: DEFAULT_MATCH_NOTIFY_PREFS, teamOverrides: {} };
        }
        const data = snapshot.data() as {
          matchNotifyDefaults?: Partial<MatchNotifyPrefs>;
          teamNotifyOverrides?: TeamNotifyOverrides;
        };
        return {
          defaults: { ...DEFAULT_MATCH_NOTIFY_PREFS, ...(data.matchNotifyDefaults || {}) },
          teamOverrides: data.teamNotifyOverrides || {},
        };
      } catch {
        return { defaults: DEFAULT_MATCH_NOTIFY_PREFS, teamOverrides: {} };
      }
    };

    const poll = async () => {
      if (!active || runningRef.current) return;
      if (followedTeamNames.length === 0) return;

      runningRef.current = true;
      try {
        await loadDedupe();
        cleanupDedupe();

        const granted = await notificationService.initialize();
        if (!granted) return;
        const { defaults, teamOverrides } = await loadTransferPreferences();
        if (!defaults.transferNews) return;

        const teamTermsByTeam = new Map<string, string[]>();
        followedTeamNames.forEach((teamName) => {
          teamTermsByTeam.set(teamName, buildTeamSearchTerms(teamName));
        });

        const { articles } = await newsAPI.getTopNews({ page: 1, pageSize: 50 });
        const candidates: { teamName: string; article: NewsArticle }[] = [];

        articles.forEach((article) => {
          if (!hasTransferIntent(article)) return;

          for (const [teamName, terms] of teamTermsByTeam.entries()) {
            const override = teamOverrides[teamName] || teamOverrides[normalizeTeamKey(teamName)] || null;
            const teamTransferEnabled = override?.transferNews ?? defaults.transferNews;
            if (!teamTransferEnabled) continue;
            if (articleMentionsTeam(article, terms)) {
              candidates.push({ teamName, article });
              break;
            }
          }
        });

        candidates
          .sort((a, b) => new Date(b.article.publishedAt).getTime() - new Date(a.article.publishedAt).getTime())
          .slice(0, MAX_ALERTS_PER_POLL)
          .forEach(({ teamName, article }) => {
            const articleKey = `${normalizeTeamKey(teamName)}::${getArticleKey(article)}`;
            if (dedupeRef.current[articleKey]) return;
            dedupeRef.current[articleKey] = Date.now();
            void sendTransferHeadlineNotification(teamName, article);
          });

        await persistDedupe();
      } catch {
        // Ignore poll errors to keep future retries running.
      } finally {
        runningRef.current = false;
      }
    };

    void poll();
    interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [followedTeamNames, preferences.notificationsEnabled, ready, user?.uid, userProfile?.uid]);

  return null;
}
