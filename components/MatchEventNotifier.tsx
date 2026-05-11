import { collection, getDocs, query, where } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useNotificationPreferences } from '../context/NotificationPreferencesContext';
import { getMatchEndedAt, setMatchEndedAt } from '../services/cacheService';
import { footballAPI } from '../services/footballApi';
import { notificationService } from '../services/notificationService';
import { scoreMatchPredictions } from '../services/predictionLeaderboardService';

type MatchNotifyPrefs = {
  goals: boolean;
  cards: boolean;
  halftime: boolean;
  matchStart: boolean;
  fulltime: boolean;
};

type MatchSubscription = {
  matchId: string;
  userId: string;
  prefs?: Partial<MatchNotifyPrefs>;
  home?: string;
  away?: string;
  league?: string;
};

const POLL_MS = 10000;
const SUBSCRIPTIONS_REFRESH_MS = 5 * 60 * 1000;
const SENT_STATUS = new Set(['HT', 'FT', 'AET', 'PEN', '1H', '2H', 'LIVE']);
const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const DEFAULT_MATCH_NOTIFY_PREFS: MatchNotifyPrefs = {
  goals: true,
  cards: true,
  halftime: true,
  matchStart: true,
  fulltime: true,
};

const normalizeText = (value: unknown) => String(value || '').trim();
const eventKey = (matchId: string, kind: string, token: string) => `${matchId}:${kind}:${token}`;

export default function MatchEventNotifier() {
  const { user, userProfile } = useAuth();
  const { preferences, ready } = useNotificationPreferences();
  const sentKeysRef = useRef<Set<string>>(new Set());
  const subscriptionsRef = useRef<MatchSubscription[]>([]);
  const lastSubscriptionsLoadAtRef = useRef(0);

  useEffect(() => {
    if (!ready || !user?.uid || user.uid !== userProfile?.uid || !preferences.notificationsEnabled) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadSubscriptions = async () => {
      const q = query(collection(db, 'matchNotifications'), where('userId', '==', userProfile.uid));
      const snap = await getDocs(q);
      subscriptionsRef.current = snap.docs.map((docSnap) => {
        const data = docSnap.data() as MatchSubscription;
        return {
          matchId: String(data.matchId),
          userId: data.userId,
          prefs: data.prefs,
          home: data.home,
          away: data.away,
          league: data.league,
        };
      });
      lastSubscriptionsLoadAtRef.current = Date.now();
    };

    const notify = async (title: string, body: string, data: Record<string, string>, subtitle?: string) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          subtitle: subtitle || null,
          body,
          data,
          sound: true,
          color: '#4AAEFF',
          priority: 'high',
          interruptionLevel: 'active',
        },
        trigger: null,
      });
    };

    const processSubscription = async (sub: MatchSubscription) => {
      const fixtureId = Number(sub.matchId);
      if (!Number.isFinite(fixtureId)) return;

      const endedAt = await getMatchEndedAt(sub.matchId);
      if (endedAt) return;

      const liveData = await footballAPI.getFixtureForNotifications(fixtureId);
      const fixture = liveData.fixture;
      if (!fixture) return;
      const prefs: MatchNotifyPrefs = {
        ...DEFAULT_MATCH_NOTIFY_PREFS,
        ...(sub.prefs || {}),
      };

      const statusShort = normalizeText(fixture?.fixture?.status?.short).toUpperCase();
      const home = normalizeText(fixture?.teams?.home?.name || sub.home || 'Home');
      const away = normalizeText(fixture?.teams?.away?.name || sub.away || 'Away');
      const league = normalizeText(fixture?.league?.name || sub.league || 'Match');
      const score = `${fixture?.goals?.home ?? '-'}-${fixture?.goals?.away ?? '-'}`;

      if (prefs.matchStart && SENT_STATUS.has(statusShort) && ['1H', '2H', 'LIVE'].includes(statusShort)) {
        const key = eventKey(sub.matchId, 'kickoff', 'started');
        if (!sentKeysRef.current.has(key)) {
          sentKeysRef.current.add(key);
          await notify('Kickoff', `${home} vs ${away} is live now`, {
            matchId: sub.matchId,
            type: 'kickoff',
          }, league);
        }
      }

      if (prefs.halftime && statusShort === 'HT') {
        const key = eventKey(sub.matchId, 'halftime', 'ht');
        if (!sentKeysRef.current.has(key)) {
          sentKeysRef.current.add(key);
          await notify('Half Time', `${home} ${score} ${away}`, {
            matchId: sub.matchId,
            type: 'halftime',
          }, league);
        }
      }

      if (TERMINAL_STATUSES.has(statusShort)) {
        await setMatchEndedAt(sub.matchId, new Date());
        const ftKey = eventKey(sub.matchId, 'scored_predictions', statusShort);
        if (!sentKeysRef.current.has(ftKey)) {
          sentKeysRef.current.add(ftKey);
          const homeGoals = fixture?.goals?.home ?? 0;
          const awayGoals = fixture?.goals?.away ?? 0;
          const matchDate = fixture?.fixture?.date ?? new Date().toISOString();
          // Score predictions in background — don't block notifications
          scoreMatchPredictions(sub.matchId, homeGoals, awayGoals, home, away, matchDate).catch(() => null);
        }

        if (prefs.fulltime) {
          const key = eventKey(sub.matchId, 'fulltime', statusShort);
          if (!sentKeysRef.current.has(key)) {
            sentKeysRef.current.add(key);
            await notify('Full Time', `${home} ${score} ${away}`, {
              matchId: sub.matchId,
              type: 'fulltime',
            }, league);
          }
        }
      }

      for (const event of liveData.events || []) {
        const type = normalizeText(event?.type).toLowerCase();
        const detail = normalizeText(event?.detail).toLowerCase();
        const elapsed = normalizeText(event?.time?.elapsed || event?.time?.elapsedTime || event?.time || '?');
        const player = normalizeText(event?.player?.name || event?.assist?.name || 'Player');
        const team = normalizeText(event?.team?.name || '');
        const token = `${elapsed}:${player}:${team}:${type}:${detail}`;

        if (prefs.goals && type === 'goal') {
          const key = eventKey(sub.matchId, 'goal', token);
          if (!sentKeysRef.current.has(key)) {
            sentKeysRef.current.add(key);
            await notify('Goal', `${team || home} scored (${elapsed}') in ${league}`, {
              matchId: sub.matchId,
              type: 'goal',
            }, league);
          }
        }

        if (prefs.cards && type === 'card') {
          const cardLabel = detail.includes('red') ? 'Red Card' : 'Yellow Card';
          const key = eventKey(sub.matchId, 'card', token);
          if (!sentKeysRef.current.has(key)) {
            sentKeysRef.current.add(key);
            await notify(cardLabel, `${player} (${team}) - ${elapsed}'`, {
              matchId: sub.matchId,
              type: 'card',
            }, league);
          }
        }
      }
    };

    const tick = async () => {
      if (!active) return;
      if (!preferences.notificationsEnabled) return;
      const granted = await notificationService.initialize();
      if (!granted) return;
      if (
        subscriptionsRef.current.length === 0 ||
        Date.now() - lastSubscriptionsLoadAtRef.current > SUBSCRIPTIONS_REFRESH_MS
      ) {
        await loadSubscriptions();
      }
      const subs = subscriptionsRef.current;
      if (subs.length === 0) return;
      for (const sub of subs) {
        await processSubscription(sub).catch(() => null);
      }
    };

    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [preferences.notificationsEnabled, ready, user?.uid, userProfile?.uid]);

  return null;
}
