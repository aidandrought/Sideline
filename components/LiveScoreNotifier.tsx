import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNotificationPreferences } from '../context/NotificationPreferencesContext';
import { communityService } from '../services/communityService';
import { footballAPI, Match } from '../services/footballApi';
import { notificationService } from '../services/notificationService';

const POLL_INTERVAL_MS = 10000;

const parseScore = (score?: string) => {
  if (!score) return null;
  const parts = score.split('-').map(part => parseInt(part.trim(), 10));
  if (parts.length !== 2) return null;
  if (Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return { home: parts[0], away: parts[1] };
};

const ensureLiveScoreChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('live-scores', {
    name: 'Live Scores',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 200, 200],
    lightColor: '#0066CC',
  });
};

const sendGoalNotification = async ({
  team,
  opponent,
  score,
  league,
  matchId,
}: {
  team: string;
  opponent: string;
  score: string;
  league: string;
  matchId: number;
}) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Goal! ${team}`,
      body: `${team} scored vs ${opponent}. ${score} (${league})`,
      subtitle: league,
      data: { matchId, type: 'live_score_goal' },
      sound: true,
      color: '#4AAEFF',
      priority: 'high',
      interruptionLevel: 'active',
    },
    trigger: null,
  });
};

const isFollowedTeam = (teamId: number | undefined, followed: Set<number>) => {
  if (!teamId) return false;
  return followed.has(teamId);
};

const isValidLiveMatch = (match: Match) => match.status === 'live';

export default function LiveScoreNotifier() {
  const { user, userProfile } = useAuth();
  const { preferences, ready } = useNotificationPreferences();
  const followedTeamsRef = useRef<Set<number>>(new Set());
  const lastScoresRef = useRef(new Map<number, { home: number; away: number }>());

  useEffect(() => {
    if (!user?.uid || user.uid !== userProfile?.uid) return;
    const unsubscribe = communityService.subscribeToUserCommunities(userProfile.uid, (data) => {
      followedTeamsRef.current = new Set(data.followedTeams || []);
    });
    return unsubscribe;
  }, [user?.uid, userProfile?.uid]);

  useEffect(() => {
    if (!ready) return;
    if (!user?.uid || user.uid !== userProfile?.uid) return;
    if (!preferences.notificationsEnabled || !preferences.liveScoresEnabled) return;

    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (!active) return;
      if (!followedTeamsRef.current.size) return;

      const granted = await notificationService.initialize();
      if (!granted) return;
      await ensureLiveScoreChannel();

      let liveMatches: Match[] = [];
      try {
        liveMatches = await footballAPI.getLiveMatches({ preferCache: false });
      } catch {
        return;
      }

      if (!active) return;

      liveMatches
        .filter(isValidLiveMatch)
        .forEach(match => {
          const homeId = match.homeId;
          const awayId = match.awayId;
          const followedTeams = followedTeamsRef.current;
          if (!isFollowedTeam(homeId, followedTeams) && !isFollowedTeam(awayId, followedTeams)) {
            return;
          }

          const parsed = parseScore(match.score);
          if (!parsed) return;

          const previous = lastScoresRef.current.get(match.id);
          if (!previous) {
            lastScoresRef.current.set(match.id, parsed);
            return;
          }

          const homeScored = parsed.home > previous.home;
          const awayScored = parsed.away > previous.away;

          if (homeScored && isFollowedTeam(homeId, followedTeams)) {
            void sendGoalNotification({
              team: match.home,
              opponent: match.away,
              score: `${parsed.home}-${parsed.away}`,
              league: match.league,
              matchId: match.id,
            });
          }

          if (awayScored && isFollowedTeam(awayId, followedTeams)) {
            void sendGoalNotification({
              team: match.away,
              opponent: match.home,
              score: `${parsed.home}-${parsed.away}`,
              league: match.league,
              matchId: match.id,
            });
          }

          lastScoresRef.current.set(match.id, parsed);
        });
    };

    void poll();
    interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [preferences.notificationsEnabled, preferences.liveScoresEnabled, ready, user?.uid, userProfile?.uid]);

  return null;
}
