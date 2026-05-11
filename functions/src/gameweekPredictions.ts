/**
 * functions/src/gameweekPredictions.ts
 *
 * Two callable Firebase Functions:
 *
 *   submitGameweekPicks   — authenticated users submit picks before deadline
 *   scoreGameweekPredictions — admin scores a gameweek after matches finish
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  Pick,
  MatchResult,
  scorePicks,
  PTS_CORRECT_RESULT,
  PTS_CORRECT_OU,
  PTS_CORRECT_BTTS,
} from './scorePredictions';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The Firestore document stored at gameweekPredictions/{uid}_{gameweek} */
export interface GameweekPredictionDoc {
  uid:         string;
  gameweek:    string;
  picks:       Pick[];
  submittedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt:   admin.firestore.Timestamp | admin.firestore.FieldValue;
  scored:      boolean;
  totalPoints: number;
}

/** Entry written to predictionLeaderboard/{gameweek}.entries[] */
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

// ─────────────────────────────────────────────────────────────────────────────
// submitGameweekPicks
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitPicksRequest {
  gameweek: string;
  picks: Array<{
    matchId:    string;
    resultPick: 'home' | 'draw' | 'away';
    overUnder?: { line: number; pick: 'over' | 'under' } | null;
    btts?:      boolean | null;
  }>;
}

export async function runSubmitGameweekPicks(
  request: CallableRequest<SubmitPicksRequest>,
  db: admin.firestore.Firestore,
): Promise<{ success: true; docId: string; pickCount: number }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in to submit picks.');
  }

  const uid = request.auth.uid;
  const { gameweek, picks: rawPicks } = request.data;

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!gameweek || typeof gameweek !== 'string') {
    throw new HttpsError('invalid-argument', 'gameweek is required (e.g. "39_GW12_2024").');
  }
  if (!Array.isArray(rawPicks) || rawPicks.length === 0) {
    throw new HttpsError('invalid-argument', 'picks array must not be empty.');
  }
  if (rawPicks.length > 15) {
    throw new HttpsError('invalid-argument', 'Maximum 15 picks per gameweek.');
  }

  // Validate each pick
  const validResults = new Set(['home', 'draw', 'away']);
  for (const p of rawPicks) {
    if (!p.matchId || typeof p.matchId !== 'string') {
      throw new HttpsError('invalid-argument', 'Each pick must have a string matchId.');
    }
    if (!validResults.has(p.resultPick)) {
      throw new HttpsError('invalid-argument', `Invalid resultPick "${p.resultPick}" for match ${p.matchId}.`);
    }
    if (p.overUnder != null) {
      if (typeof p.overUnder.line !== 'number' || p.overUnder.line <= 0) {
        throw new HttpsError('invalid-argument', `Invalid over/under line for match ${p.matchId}.`);
      }
      if (p.overUnder.pick !== 'over' && p.overUnder.pick !== 'under') {
        throw new HttpsError('invalid-argument', `Invalid over/under pick for match ${p.matchId}.`);
      }
    }
  }

  // ── Deadline check: read from config/fantasy.gameweekDeadline ─────────────
  const configSnap = await db.collection('config').doc('fantasy').get();
  const deadlines  = (configSnap.data()?.gameweekDeadlines ?? {}) as Record<string, string>;
  const deadline   = deadlines[gameweek];

  if (deadline && new Date() > new Date(deadline)) {
    throw new HttpsError(
      'failed-precondition',
      `The deadline for gameweek ${gameweek} has passed.`,
    );
  }

  // ── Check that this gameweek hasn't already been scored ───────────────────
  const docId  = `${uid}_${gameweek}`;
  const docRef = db.collection('gameweekPredictions').doc(docId);
  const existing = await docRef.get();

  if (existing.exists && (existing.data() as GameweekPredictionDoc)?.scored === true) {
    throw new HttpsError(
      'failed-precondition',
      'Picks for this gameweek have already been scored and can no longer be changed.',
    );
  }

  // ── Normalize picks (strip undefined to null for Firestore) ───────────────
  const picks: Pick[] = rawPicks.map((p) => ({
    matchId:    p.matchId,
    resultPick: p.resultPick,
    overUnder:  p.overUnder ?? null,
    btts:       p.btts ?? null,
  }));

  const now = admin.firestore.FieldValue.serverTimestamp();

  const doc: Omit<GameweekPredictionDoc, 'submittedAt'> & {
    submittedAt: admin.firestore.FieldValue;
    updatedAt:   admin.firestore.FieldValue;
  } = {
    uid,
    gameweek,
    picks,
    submittedAt: existing.exists ? (existing.data() as any).submittedAt : now,
    updatedAt:   now,
    scored:      false,
    totalPoints: 0,
  };

  await docRef.set(doc, { merge: false });

  return { success: true, docId, pickCount: picks.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreGameweekPredictions
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreGameweekRequest {
  gameweek: string;
  results: MatchResult[];
}

export interface ScoreGameweekResult {
  gameweek:      string;
  docsScored:    number;
  leaderboardEntries: number;
  totalWrites:   number;
}

export async function runScoreGameweekPredictions(
  request: CallableRequest<ScoreGameweekRequest>,
  db: admin.firestore.Firestore,
): Promise<ScoreGameweekResult> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!request.auth.token.admin) {
    throw new HttpsError('permission-denied', 'Admin claim required.');
  }

  const { gameweek, results: rawResults } = request.data;

  if (!gameweek) throw new HttpsError('invalid-argument', 'gameweek is required.');
  if (!Array.isArray(rawResults) || rawResults.length === 0) {
    throw new HttpsError('invalid-argument', 'results array is required.');
  }

  // Build fast lookup: matchId → MatchResult
  const resultsByMatchId = new Map<string, MatchResult>(
    rawResults.map((r) => [String(r.matchId), r]),
  );

  // ── Load all unscored prediction docs for this gameweek ───────────────────
  const predsSnap = await db
    .collection('gameweekPredictions')
    .where('gameweek', '==', gameweek)
    .where('scored', '==', false)
    .get();

  if (predsSnap.empty) {
    console.log(`[scoreGameweek] No unscored docs for gameweek ${gameweek}`);
    return { gameweek, docsScored: 0, leaderboardEntries: 0, totalWrites: 0 };
  }

  console.log(`[scoreGameweek] Scoring ${predsSnap.size} prediction doc(s) for ${gameweek}`);

  // ── Score each user's picks ───────────────────────────────────────────────
  type ScoredUser = {
    uid:            string;
    docId:          string;
    scoredPicks:    Pick[];
    totalPoints:    number;
    anyCorrectResult: boolean;
    correctResults: number;
    correctOU:      number;
    correctBTTS:    number;
  };

  const scoredUsers: ScoredUser[] = [];

  for (const predDoc of predsSnap.docs) {
    const data  = predDoc.data() as GameweekPredictionDoc;
    const { scoredPicks, totalPoints, anyCorrectResult } = scorePicks(
      data.picks ?? [],
      resultsByMatchId,
    );

    let correctResults = 0;
    let correctOU      = 0;
    let correctBTTS    = 0;

    for (const p of scoredPicks) {
      if ((p.resultPoints    ?? 0) >= PTS_CORRECT_RESULT) correctResults++;
      if ((p.overUnderPoints ?? 0) >= PTS_CORRECT_OU)     correctOU++;
      if ((p.bttsPoints      ?? 0) >= PTS_CORRECT_BTTS)   correctBTTS++;
    }

    scoredUsers.push({
      uid:            data.uid,
      docId:          predDoc.id,
      scoredPicks,
      totalPoints,
      anyCorrectResult,
      correctResults,
      correctOU,
      correctBTTS,
    });
  }

  // ── Load usernames for leaderboard ────────────────────────────────────────
  // Chunk uid lookups at 30 (Firestore 'in' limit)
  const uids      = [...new Set(scoredUsers.map((u) => u.uid))];
  const usernames = new Map<string, string>();
  const photoURLs = new Map<string, string>();

  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const snaps = await db.getAll(...chunk.map((id) => db.collection('users').doc(id)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data() as { username?: string; photoURL?: string };
      usernames.set(snap.id, d.username ?? snap.id);
      if (d.photoURL) photoURLs.set(snap.id, d.photoURL);
    }
  }

  // ── Sort by points to assign ranks ────────────────────────────────────────
  scoredUsers.sort((a, b) => b.totalPoints - a.totalPoints);

  const leaderboardEntries: LeaderboardEntry[] = scoredUsers.map((u, idx) => ({
    uid:            u.uid,
    username:       usernames.get(u.uid) ?? u.uid,
    photoURL:       photoURLs.get(u.uid),
    points:         u.totalPoints,
    correctResults: u.correctResults,
    correctOU:      u.correctOU,
    correctBTTS:    u.correctBTTS,
    totalPicks:     u.scoredPicks.length,
    rank:           idx + 1,
  }));

  // ── Build batch writes ────────────────────────────────────────────────────
  const CHUNK = 499;
  const now   = admin.firestore.FieldValue.serverTimestamp();

  type WriteOp = {
    ref:   admin.firestore.DocumentReference;
    data:  Record<string, unknown>;
    merge: boolean;
  };

  const writes: WriteOp[] = [];

  // A. Update each gameweekPredictions doc with scored picks + points
  for (const u of scoredUsers) {
    writes.push({
      ref:  db.collection('gameweekPredictions').doc(u.docId),
      data: {
        picks:       u.scoredPicks,
        totalPoints: u.totalPoints,
        scored:      true,
        scoredAt:    now,
      },
      merge: true,
    });
  }

  // B. Update users/{uid} — increment XP, update streak
  for (const u of scoredUsers) {
    const prevStreakSnap = await db.collection('users').doc(u.uid).get();
    const prevStreak: number = (prevStreakSnap.data() as any)?.predictionStreak ?? 0;
    const lastScoredGW: string | undefined = (prevStreakSnap.data() as any)?.lastScoredGameweek;

    // Streak: only increment if different gameweek (idempotency guard)
    const newStreak = lastScoredGW === gameweek
      ? prevStreak   // re-run: don't double-count streak
      : u.anyCorrectResult
        ? prevStreak + 1
        : 0;

    writes.push({
      ref:  db.collection('users').doc(u.uid),
      data: {
        xp:                   admin.firestore.FieldValue.increment(
                                lastScoredGW === gameweek ? 0 : u.totalPoints,
                              ),
        predictionStreak:     newStreak,
        lastScoredGameweek:   gameweek,
        updatedAt:            now,
      },
      merge: true,
    });
  }

  // C. Write predictionLeaderboard/{gameweek} snapshot
  writes.push({
    ref:  db.collection('predictionLeaderboard').doc(gameweek),
    data: {
      gameweek,
      scoredAt:              now,
      entries:               leaderboardEntries,
      totalParticipants:     leaderboardEntries.length,
      pointsKey: {
        correctResult: PTS_CORRECT_RESULT,
        correctOU:     PTS_CORRECT_OU,
        correctBTTS:   PTS_CORRECT_BTTS,
      },
    },
    merge: false,
  });

  // ── Commit in chunks ──────────────────────────────────────────────────────
  let totalWritten = 0;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const w of chunk) {
      if (w.merge) {
        batch.set(w.ref, w.data, { merge: true });
      } else {
        batch.set(w.ref, w.data);
      }
    }
    await batch.commit();
    totalWritten += chunk.length;
    console.log(`  batch committed: ${chunk.length} ops (total: ${totalWritten}/${writes.length})`);
  }

  console.log(
    `[scoreGameweek] Done — ${scoredUsers.length} users scored, ` +
    `${leaderboardEntries.length} leaderboard entries, ${totalWritten} total writes`,
  );

  return {
    gameweek,
    docsScored:         scoredUsers.length,
    leaderboardEntries: leaderboardEntries.length,
    totalWrites:        totalWritten,
  };
}
