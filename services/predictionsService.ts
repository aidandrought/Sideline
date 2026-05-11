// services/predictionsService.ts
// Head-to-head predictions and prediction leagues — sports picks without money

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PickResult = 'home' | 'draw' | 'away';
export type OverUnderSide = 'over' | 'under';
export type BttsPick = 'yes' | 'no';
export type ChallengeStatus = 'pending' | 'accepted' | 'active' | 'completed' | 'declined' | 'expired';

export interface MatchPicks {
  result?: PickResult;
  overUnder?: { line: number; pick: OverUnderSide };
  btts?: BttsPick;
  correctScore?: { home: number; away: number };
}

export interface HeadToHeadChallenge {
  id: string;
  matchId: string;
  matchHome: string;
  matchAway: string;
  matchLeague: string;
  matchDate: string;
  createdBy: string;
  createdByUsername: string;
  challengedUser: string;
  challengedUsername: string;
  status: ChallengeStatus;
  creatorPicks: MatchPicks;
  challengedPicks?: MatchPicks;
  creatorScore?: number;
  challengedScore?: number;
  winner?: string | 'draw';
  createdAt: string;
  expiresAt: string;
}

export interface PredictionLeague {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdByUsername: string;
  inviteCode: string;
  memberCount: number;
  isPrivate: boolean;
  season: string;
  createdAt: string;
}

export interface PredictionLeagueMember {
  userId: string;
  username: string;
  avatarUrl?: string;
  points: number;
  correct: number;
  total: number;
  joinedAt: string;
  rank?: number;
}

export interface MatchPrediction {
  id: string;
  userId: string;
  username: string;
  matchId: string;
  matchHome: string;
  matchAway: string;
  matchLeague: string;
  matchDate: string;
  leagueId?: string;
  picks: MatchPicks;
  points?: number;
  isScored: boolean;
  createdAt: string;
}

export interface UserPredictionStats {
  userId: string;
  totalPoints: number;
  totalPredictions: number;
  correctResults: number;
  correctOverUnder: number;
  correctBtts: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  rank?: number;
}

// ─── Scoring constants ────────────────────────────────────────────────────────

export const POINTS = {
  RESULT_CORRECT: 3,
  CORRECT_SCORE: 5,           // Exact score (includes result)
  OVER_UNDER_CORRECT: 2,
  BTTS_CORRECT: 1,
  H2H_WIN_BONUS: 2,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const nowIso = () => new Date().toISOString();

const expiresIso = (hours = 48) => new Date(Date.now() + hours * 3_600_000).toISOString();

// ─── Head-to-Head Challenges ──────────────────────────────────────────────────

export const createChallenge = async (
  matchId: string,
  matchHome: string,
  matchAway: string,
  matchLeague: string,
  matchDate: string,
  creatorId: string,
  creatorUsername: string,
  challengedUserId: string,
  challengedUsername: string,
  creatorPicks: MatchPicks
): Promise<string> => {
  const ref = await addDoc(collection(db, 'predictionChallenges'), {
    matchId,
    matchHome,
    matchAway,
    matchLeague,
    matchDate,
    createdBy: creatorId,
    createdByUsername: creatorUsername,
    challengedUser: challengedUserId,
    challengedUsername,
    status: 'pending' as ChallengeStatus,
    creatorPicks,
    challengedPicks: null,
    creatorScore: null,
    challengedScore: null,
    winner: null,
    createdAt: nowIso(),
    expiresAt: expiresIso(48),
  });
  return ref.id;
};

export const acceptChallenge = async (
  challengeId: string,
  challengedPicks: MatchPicks
): Promise<void> => {
  await updateDoc(doc(db, 'predictionChallenges', challengeId), {
    status: 'accepted' as ChallengeStatus,
    challengedPicks,
  });
};

export const declineChallenge = async (challengeId: string): Promise<void> => {
  await updateDoc(doc(db, 'predictionChallenges', challengeId), {
    status: 'declined' as ChallengeStatus,
  });
};

export const getChallenge = async (challengeId: string): Promise<HeadToHeadChallenge | null> => {
  const snap = await getDoc(doc(db, 'predictionChallenges', challengeId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as HeadToHeadChallenge;
};

export const subscribeToChallenge = (
  challengeId: string,
  cb: (challenge: HeadToHeadChallenge | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, 'predictionChallenges', challengeId),
    (snap) => {
      cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as HeadToHeadChallenge) : null);
    },
    () => cb(null)
  );
};

export const getUserChallenges = async (userId: string): Promise<HeadToHeadChallenge[]> => {
  const [sent, received] = await Promise.all([
    getDocs(query(
      collection(db, 'predictionChallenges'),
      where('createdBy', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(30)
    )),
    getDocs(query(
      collection(db, 'predictionChallenges'),
      where('challengedUser', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(30)
    )),
  ]);
  const all = [
    ...sent.docs.map(d => ({ id: d.id, ...d.data() } as HeadToHeadChallenge)),
    ...received.docs.map(d => ({ id: d.id, ...d.data() } as HeadToHeadChallenge)),
  ];
  // dedupe + sort
  const byId = new Map(all.map(c => [c.id, c]));
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const subscribeToChallenges = (
  userId: string,
  cb: (challenges: HeadToHeadChallenge[]) => void
): (() => void) => {
  const unsub1 = onSnapshot(
    query(collection(db, 'predictionChallenges'), where('createdBy', '==', userId), orderBy('createdAt', 'desc'), limit(20)),
    () => { void getUserChallenges(userId).then(cb).catch(() => cb([])); },
    () => cb([])
  );
  const unsub2 = onSnapshot(
    query(collection(db, 'predictionChallenges'), where('challengedUser', '==', userId), orderBy('createdAt', 'desc'), limit(20)),
    () => { void getUserChallenges(userId).then(cb).catch(() => cb([])); },
    () => cb([])
  );
  return () => { unsub1(); unsub2(); };
};

// ─── Prediction Leagues ───────────────────────────────────────────────────────

export const createPredictionLeague = async (
  name: string,
  description: string,
  creatorId: string,
  creatorUsername: string,
  isPrivate: boolean,
  season: string
): Promise<string> => {
  const inviteCode = generateInviteCode();
  const ref = await addDoc(collection(db, 'predictionLeagues'), {
    name,
    description,
    createdBy: creatorId,
    createdByUsername: creatorUsername,
    inviteCode,
    memberCount: 1,
    isPrivate,
    season,
    createdAt: nowIso(),
  });
  // Add creator as first member
  await setDoc(doc(db, 'predictionLeagueMembers', `${ref.id}_${creatorId}`), {
    leagueId: ref.id,
    userId: creatorId,
    username: creatorUsername,
    points: 0,
    correct: 0,
    total: 0,
    joinedAt: nowIso(),
  });
  return ref.id;
};

export const joinLeagueByCode = async (
  inviteCode: string,
  userId: string,
  username: string
): Promise<{ success: boolean; leagueId?: string; error?: string }> => {
  const snap = await getDocs(query(
    collection(db, 'predictionLeagues'),
    where('inviteCode', '==', inviteCode.toUpperCase()),
    limit(1)
  ));
  if (snap.empty) return { success: false, error: 'Invalid invite code' };

  const leagueDoc = snap.docs[0];
  const leagueId = leagueDoc.id;
  const memberKey = `${leagueId}_${userId}`;
  const existing = await getDoc(doc(db, 'predictionLeagueMembers', memberKey));
  if (existing.exists()) return { success: false, error: 'Already a member' };

  await setDoc(doc(db, 'predictionLeagueMembers', memberKey), {
    leagueId,
    userId,
    username,
    points: 0,
    correct: 0,
    total: 0,
    joinedAt: nowIso(),
  });
  await updateDoc(leagueDoc.ref, { memberCount: (leagueDoc.data().memberCount || 0) + 1 });
  return { success: true, leagueId };
};

export const getLeague = async (leagueId: string): Promise<PredictionLeague | null> => {
  const snap = await getDoc(doc(db, 'predictionLeagues', leagueId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PredictionLeague;
};

export const getLeagueMembers = async (leagueId: string): Promise<PredictionLeagueMember[]> => {
  const snap = await getDocs(query(
    collection(db, 'predictionLeagueMembers'),
    where('leagueId', '==', leagueId),
    orderBy('points', 'desc'),
    limit(100)
  ));
  return snap.docs.map((d, i) => ({ ...d.data(), rank: i + 1 } as PredictionLeagueMember));
};

export const getUserLeagues = async (userId: string): Promise<PredictionLeague[]> => {
  const memberSnap = await getDocs(query(
    collection(db, 'predictionLeagueMembers'),
    where('userId', '==', userId),
    limit(20)
  ));
  if (memberSnap.empty) return [];
  const leagueIds = memberSnap.docs.map(d => d.data().leagueId as string);
  const leagues = await Promise.all(leagueIds.map(id => getLeague(id)));
  return leagues.filter((l): l is PredictionLeague => l !== null);
};

export const getPublicLeagues = async (): Promise<PredictionLeague[]> => {
  const snap = await getDocs(query(
    collection(db, 'predictionLeagues'),
    where('isPrivate', '==', false),
    orderBy('memberCount', 'desc'),
    limit(20)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PredictionLeague));
};

// ─── Match Predictions (solo picks for any match) ────────────────────────────

export const submitMatchPrediction = async (
  userId: string,
  username: string,
  matchId: string,
  matchHome: string,
  matchAway: string,
  matchLeague: string,
  matchDate: string,
  picks: MatchPicks,
  leagueId?: string
): Promise<string> => {
  const key = leagueId ? `${matchId}_${userId}_${leagueId}` : `${matchId}_${userId}`;
  await setDoc(doc(db, 'matchPredictions', key), {
    userId,
    username,
    matchId,
    matchHome,
    matchAway,
    matchLeague,
    matchDate,
    leagueId: leagueId || null,
    picks,
    points: null,
    isScored: false,
    createdAt: nowIso(),
  });
  return key;
};

export const getUserMatchPrediction = async (
  userId: string,
  matchId: string,
  leagueId?: string
): Promise<MatchPrediction | null> => {
  const key = leagueId ? `${matchId}_${userId}_${leagueId}` : `${matchId}_${userId}`;
  const snap = await getDoc(doc(db, 'matchPredictions', key));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as MatchPrediction;
};

export const getUserPredictionHistory = async (
  userId: string,
  maxItems = 30
): Promise<MatchPrediction[]> => {
  const snap = await getDocs(query(
    collection(db, 'matchPredictions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as MatchPrediction));
};

// ─── User Stats ───────────────────────────────────────────────────────────────

export const getUserPredictionStats = async (userId: string): Promise<UserPredictionStats | null> => {
  const snap = await getDoc(doc(db, 'predictionStats', userId));
  if (!snap.exists()) return null;
  return snap.data() as UserPredictionStats;
};

export const getGlobalLeaderboard = async (maxEntries = 50): Promise<UserPredictionStats[]> => {
  const snap = await getDocs(query(
    collection(db, 'predictionStats'),
    orderBy('totalPoints', 'desc'),
    limit(maxEntries)
  ));
  return snap.docs.map((d, i) => ({ ...d.data(), rank: i + 1 } as UserPredictionStats));
};

export const subscribeUserStats = (
  userId: string,
  cb: (stats: UserPredictionStats | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, 'predictionStats', userId),
    (snap) => {
      cb(snap.exists() ? (snap.data() as UserPredictionStats) : null);
    },
    () => cb(null)
  );
};

// ─── Score a prediction locally (optimistic UI) ───────────────────────────────

export const scorePicks = (
  picks: MatchPicks,
  actualResult: PickResult,
  actualHomeGoals: number,
  actualAwayGoals: number
): number => {
  let pts = 0;
  const totalGoals = actualHomeGoals + actualAwayGoals;

  // Exact score (worth more, includes result)
  if (picks.correctScore &&
      picks.correctScore.home === actualHomeGoals &&
      picks.correctScore.away === actualAwayGoals) {
    pts += POINTS.CORRECT_SCORE;
  } else if (picks.result && picks.result === actualResult) {
    pts += POINTS.RESULT_CORRECT;
  }

  if (picks.overUnder) {
    const { line, pick } = picks.overUnder;
    const correct =
      (pick === 'over' && totalGoals > line) ||
      (pick === 'under' && totalGoals < line);
    if (correct) pts += POINTS.OVER_UNDER_CORRECT;
  }

  if (picks.btts) {
    const actualBtts = actualHomeGoals > 0 && actualAwayGoals > 0;
    if ((picks.btts === 'yes') === actualBtts) pts += POINTS.BTTS_CORRECT;
  }

  return pts;
};
