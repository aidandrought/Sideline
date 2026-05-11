/**
 * services/gameweekPredictionsService.ts
 *
 * Client-side service for the gameweek multi-market prediction system.
 *
 * Firestore layout (read-only from client — all writes go through callables):
 *
 *   gameweekPredictions/{uid}_{gameweek}
 *     uid, gameweek, picks[], submittedAt, updatedAt, scored, totalPoints
 *
 *   predictionLeaderboard/{gameweek}
 *     gameweek, scoredAt, entries[], totalParticipants, pointsKey
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';

// ─── Types (mirrored from functions/src/scorePredictions.ts) ─────────────────

export interface OverUnderPick {
  line: number;
  pick: 'over' | 'under';
}

export interface Pick {
  matchId:    string;
  resultPick: 'home' | 'draw' | 'away';
  overUnder:  OverUnderPick | null;
  btts:       boolean | null;
  // Scored fields (present after gameweek is scored)
  resultPoints?:    number;
  overUnderPoints?: number;
  bttsPoints?:      number;
  totalPoints?:     number;
  actualResult?:    'home' | 'draw' | 'away';
  actualTotalGoals?: number;
  actualBtts?:      boolean;
}

export interface GameweekPredictionDoc {
  uid:         string;
  gameweek:    string;
  picks:       Pick[];
  submittedAt: string;
  updatedAt:   string;
  scored:      boolean;
  totalPoints: number;
}

export interface LeaderboardEntry {
  uid:            string;
  username:       string;
  photoURL?:      string;
  points:         number;
  correctResults: number;
  correctOU:      number;
  correctBTTS:    number;
  totalPicks:     number;
  rank:           number;
}

export interface GameweekLeaderboardDoc {
  gameweek:          string;
  scoredAt:          string;
  entries:           LeaderboardEntry[];
  totalParticipants: number;
  pointsKey: {
    correctResult: number;
    correctOU:     number;
    correctBTTS:   number;
  };
}

// ─── Callable wrappers ────────────────────────────────────────────────────────

const functions = getFunctions();

/**
 * Submit (or update) picks for a gameweek.
 * Will throw if the deadline has passed or the gameweek is already scored.
 */
export async function submitGameweekPicks(
  gameweek: string,
  picks: Array<{
    matchId:    string;
    resultPick: 'home' | 'draw' | 'away';
    overUnder?: OverUnderPick | null;
    btts?:      boolean | null;
  }>,
): Promise<{ success: true; docId: string; pickCount: number }> {
  const fn = httpsCallable<
    { gameweek: string; picks: typeof picks },
    { success: true; docId: string; pickCount: number }
  >(functions, 'submitGameweekPicks');

  const result = await fn({ gameweek, picks });
  return result.data;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch a user's prediction doc for a specific gameweek.
 * Returns null if they haven't submitted picks yet.
 */
export async function getUserGameweekPrediction(
  uid: string,
  gameweek: string,
): Promise<GameweekPredictionDoc | null> {
  const snap = await getDoc(
    doc(db, 'gameweekPredictions', `${uid}_${gameweek}`),
  );
  return snap.exists() ? (snap.data() as GameweekPredictionDoc) : null;
}

/**
 * Real-time listener for a user's prediction doc.
 * Useful for showing live scoring updates as results come in.
 */
export function subscribeUserGameweekPrediction(
  uid: string,
  gameweek: string,
  onUpdate: (doc: GameweekPredictionDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'gameweekPredictions', `${uid}_${gameweek}`),
    (snap) => onUpdate(snap.exists() ? (snap.data() as GameweekPredictionDoc) : null),
    (err) => console.error('[subscribeUserGameweekPrediction]', err),
  );
}

/**
 * Fetch the scored leaderboard for a specific gameweek.
 * Returns null if the gameweek hasn't been scored yet.
 */
export async function getGameweekLeaderboard(
  gameweek: string,
): Promise<GameweekLeaderboardDoc | null> {
  const snap = await getDoc(doc(db, 'predictionLeaderboard', gameweek));
  return snap.exists() ? (snap.data() as GameweekLeaderboardDoc) : null;
}

/**
 * Real-time listener for the gameweek leaderboard.
 * Updates automatically when the admin scores the gameweek.
 */
export function subscribeGameweekLeaderboard(
  gameweek: string,
  onUpdate: (data: GameweekLeaderboardDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'predictionLeaderboard', gameweek),
    (snap) => onUpdate(snap.exists() ? (snap.data() as GameweekLeaderboardDoc) : null),
    (err) => console.error('[subscribeGameweekLeaderboard]', err),
  );
}

/**
 * Get a user's prediction history across all gameweeks (most recent first).
 */
export async function getUserPredictionHistory(
  uid: string,
  limitCount: number = 10,
): Promise<GameweekPredictionDoc[]> {
  const snap = await getDocs(
    query(
      collection(db, 'gameweekPredictions'),
      where('uid', '==', uid),
      where('scored', '==', true),
      orderBy('submittedAt', 'desc'),
      limit(limitCount),
    ),
  );
  return snap.docs.map((d) => d.data() as GameweekPredictionDoc);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Points breakdown label for a scored pick */
export function pickPointsLabel(pick: Pick): string {
  if (pick.totalPoints == null) return '';
  const parts: string[] = [];
  if ((pick.resultPoints ?? 0) > 0) parts.push(`+${pick.resultPoints} result`);
  if ((pick.overUnderPoints ?? 0) > 0) parts.push(`+${pick.overUnderPoints} O/U`);
  if ((pick.bttsPoints ?? 0) > 0) parts.push(`+${pick.bttsPoints} BTTS`);
  return parts.length > 0 ? parts.join(', ') : '0 pts';
}
