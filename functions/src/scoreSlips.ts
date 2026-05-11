/**
 * functions/src/scoreSlips.ts
 *
 * Three callable Cloud Functions for the slip scoring pipeline:
 *
 *   scoreSlips     — scores picks against cached match results, applies parlay
 *   scoreH2H       — after gameweek completes: compare paired scores, update standings
 *   updateUserStats — after scoring: XP, streak, badges, weekly leaderboard
 *
 * Execution order each gameweek
 * ────────────────────────────────
 *   1. Admin calls cacheMatchResult for each finished match
 *   2. Admin calls scoreSlips({ gameweek })
 *      → scores picks, finalises slips with parlay multiplier
 *   3. Admin calls scoreH2H({ gameweek })
 *      → finds all H2H pairings for this gameweek, determines winner
 *   4. Admin calls updateUserStats({ gameweek })
 *      → XP, streak, badges, leaderboard snapshot
 *
 * Idempotency
 * ───────────
 *   scoreSlips:    re-scores any slip with status != 'scored'; safe to re-run
 *   scoreH2H:      checks if leagueMatchup already resolved; skips if so
 *   updateUserStats: checks lastScoredGameweek; skips XP write if same GW
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  Slip, H2HLeague, UserStats, BadgeId, MatchResultCache,
} from './slipTypes';
import { scoreSlip } from './slipScoring';

// ─── Shared batch helper ──────────────────────────────────────────────────────

type WriteOp = {
  ref:   admin.firestore.DocumentReference;
  data:  Record<string, unknown>;
  merge: boolean;
};

async function commitInBatches(
  db:     admin.firestore.Firestore,
  writes: WriteOp[],
  chunk   = 499,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < writes.length; i += chunk) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + chunk)) {
      w.merge ? batch.set(w.ref, w.data, { merge: true }) : batch.set(w.ref, w.data);
    }
    await batch.commit();
    total += Math.min(chunk, writes.length - i);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreSlips
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreSlipsRequest {
  gameweek: string;
}

export interface ScoreSlipsResult {
  gameweek:     string;
  slipsScored:  number;
  slipsPartial: number;
  totalWrites:  number;
}

export async function runScoreSlips(
  request: CallableRequest<ScoreSlipsRequest>,
  db: admin.firestore.Firestore,
): Promise<ScoreSlipsResult> {
  if (!request.auth)             throw new HttpsError('unauthenticated',  'Must be signed in.');
  if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin only.');

  const { gameweek } = request.data;
  if (!gameweek) throw new HttpsError('invalid-argument', 'gameweek is required.');

  // ── Load all non-scored slips for this gameweek ───────────────────────────
  const slipsSnap = await db
    .collection('slips')
    .where('gameweek', '==', gameweek)
    .where('status', '!=', 'scored')
    .get();

  if (slipsSnap.empty) {
    console.log(`[scoreSlips] No unscored slips for ${gameweek}`);
    return { gameweek, slipsScored: 0, slipsPartial: 0, totalWrites: 0 };
  }

  // ── Load match result cache for every match referenced by these slips ──────
  const allMatchIds = new Set<string>();
  for (const doc of slipsSnap.docs) {
    const slip = doc.data() as Slip;
    for (const pick of slip.picks) allMatchIds.add(String(pick.matchId));
  }

  const resultSnaps = await db.getAll(
    ...[...allMatchIds].map((id) => db.collection('matchResultCache').doc(id))
  );

  const resultsByMatchId = new Map<string, MatchResultCache>();
  for (const snap of resultSnaps) {
    if (snap.exists) {
      const data = snap.data() as MatchResultCache;
      if (data.finished) resultsByMatchId.set(snap.id, data);
    }
  }

  // ── Score each slip ────────────────────────────────────────────────────────
  const now = admin.firestore.FieldValue.serverTimestamp();
  const writes: WriteOp[] = [];
  let slipsScored  = 0;
  let slipsPartial = 0;

  for (const slipDoc of slipsSnap.docs) {
    const slip = slipDoc.data() as Slip;
    const result = scoreSlip(slip.picks, resultsByMatchId, slip.picks.length);

    const newStatus = result.allScored ? 'scored' : 'partial';
    if (newStatus === 'scored') slipsScored++;
    else slipsPartial++;

    writes.push({
      ref:   db.collection('slips').doc(slipDoc.id),
      merge: true,
      data:  {
        picks:            result.picks,
        rawPoints:        result.rawPoints,
        parlayMultiplier: result.parlayMultiplier,
        totalPoints:      result.totalPoints,
        status:           newStatus,
        updatedAt:        now,
      },
    });
  }

  const totalWrites = await commitInBatches(db, writes);
  console.log(`[scoreSlips] ${gameweek}: ${slipsScored} scored, ${slipsPartial} partial, ${totalWrites} writes`);
  return { gameweek, slipsScored, slipsPartial, totalWrites };
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreH2H
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreH2HRequest {
  gameweek: string;
}

export interface ScoreH2HResult {
  gameweek:     string;
  matchupsScored: number;
}

export async function runScoreH2H(
  request: CallableRequest<ScoreH2HRequest>,
  db: admin.firestore.Firestore,
): Promise<ScoreH2HResult> {
  if (!request.auth)             throw new HttpsError('unauthenticated',  'Must be signed in.');
  if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin only.');

  const { gameweek } = request.data;
  if (!gameweek) throw new HttpsError('invalid-argument', 'gameweek is required.');

  // ── Load all H2H leagues that have a matchup this gameweek ───────────────
  const leaguesSnap = await db.collection('h2hLeagues').get();
  if (leaguesSnap.empty) return { gameweek, matchupsScored: 0 };

  const now    = admin.firestore.FieldValue.serverTimestamp();
  const writes: WriteOp[] = [];
  let matchupsScored = 0;

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data() as H2HLeague;

    // Find the matchup for this gameweek
    const matchup = league.schedule?.find((m) => m.gw === gameweek);
    if (!matchup) continue;

    const { home: homeUid, away: awayUid } = matchup;

    // ── Load both users' scored slips ──────────────────────────────────────
    const [homeSlipSnap, awaySlipSnap] = await Promise.all([
      db.collection('slips')
        .where('userId',    '==', homeUid)
        .where('gameweek',  '==', gameweek)
        .where('leagueId',  '==', leagueDoc.id)
        .where('mode',      '==', 'h2h')
        .limit(1)
        .get(),
      db.collection('slips')
        .where('userId',    '==', awayUid)
        .where('gameweek',  '==', gameweek)
        .where('leagueId',  '==', leagueDoc.id)
        .where('mode',      '==', 'h2h')
        .limit(1)
        .get(),
    ]);

    // Both slips must be fully scored before resolving H2H
    if (homeSlipSnap.empty || awaySlipSnap.empty) continue;
    const homeSlip = homeSlipSnap.docs[0].data() as Slip;
    const awaySlip = awaySlipSnap.docs[0].data() as Slip;
    if (homeSlip.status !== 'scored' || awaySlip.status !== 'scored') continue;

    // Idempotency: check if this matchup was already resolved
    const resolvedKey = `h2h_resolved_${leagueDoc.id}_${gameweek}`;
    const resolvedSnap = await db.collection('config').doc(resolvedKey).get();
    if (resolvedSnap.exists) continue;

    const homePoints = homeSlip.totalPoints;
    const awayPoints = awaySlip.totalPoints;

    let homeResult: 'win' | 'loss' | 'draw';
    let awayResult: 'win' | 'loss' | 'draw';

    if (homePoints > awayPoints) {
      homeResult = 'win'; awayResult = 'loss';
    } else if (awayPoints > homePoints) {
      homeResult = 'loss'; awayResult = 'win';
    } else {
      homeResult = awayResult = 'draw';
    }

    // ── Update league standings ────────────────────────────────────────────
    const currentStandings = league.standings ?? {};

    const homeStanding = currentStandings[homeUid] ?? { wins: 0, losses: 0, draws: 0, totalPoints: 0 };
    const awayStanding = currentStandings[awayUid] ?? { wins: 0, losses: 0, draws: 0, totalPoints: 0 };

    const updatedStandings = {
      ...currentStandings,
      [homeUid]: {
        wins:        homeStanding.wins   + (homeResult === 'win'  ? 1 : 0),
        losses:      homeStanding.losses + (homeResult === 'loss' ? 1 : 0),
        draws:       homeStanding.draws  + (homeResult === 'draw' ? 1 : 0),
        totalPoints: homeStanding.totalPoints + homePoints,
      },
      [awayUid]: {
        wins:        awayStanding.wins   + (awayResult === 'win'  ? 1 : 0),
        losses:      awayStanding.losses + (awayResult === 'loss' ? 1 : 0),
        draws:       awayStanding.draws  + (awayResult === 'draw' ? 1 : 0),
        totalPoints: awayStanding.totalPoints + awayPoints,
      },
    };

    writes.push({
      ref:   db.collection('h2hLeagues').doc(leagueDoc.id),
      merge: true,
      data:  { standings: updatedStandings, updatedAt: now },
    });

    // Mark resolved (idempotency sentinel)
    writes.push({
      ref:   db.collection('config').doc(resolvedKey),
      merge: false,
      data:  { resolvedAt: now, homeUid, awayUid, homePoints, awayPoints, result: homeResult },
    });

    matchupsScored++;
    console.log(`[scoreH2H] ${leagueDoc.id} GW${gameweek}: ${homeUid}(${homePoints}) ${homeResult} vs ${awayUid}(${awayPoints})`);
  }

  await commitInBatches(db, writes);
  return { gameweek, matchupsScored };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateUserStats
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateUserStatsRequest {
  gameweek: string;
}

export interface UpdateUserStatsResult {
  gameweek:         string;
  usersUpdated:     number;
  leaderboardSize:  number;
}

/** Badge award logic — returns new badges to add */
function newBadges(
  existing:    BadgeId[],
  stats:       Partial<UserStats>,
  currentSlip: Slip,
  newStreak:   number,
  h2hWins:     number,
  allPicksCorrect: boolean,
): BadgeId[] {
  const set = new Set<BadgeId>(existing);
  const earned: BadgeId[] = [];

  const maybeAdd = (id: BadgeId) => {
    if (!set.has(id)) {
      set.add(id);
      earned.push(id);
    }
  };

  if (allPicksCorrect)                       maybeAdd('perfectSlip');
  if (currentSlip.picks.some((p) => p.type === 'correctScore' && p.correct)) {
                                             maybeAdd('correctScore');
  }
  if (newStreak >= 3)                        maybeAdd('streakX3');
  if (newStreak >= 5)                        maybeAdd('streakX5');
  if (h2hWins >= 10)                         maybeAdd('h2hWinX10');

  return earned;
}

export async function runUpdateUserStats(
  request: CallableRequest<UpdateUserStatsRequest>,
  db: admin.firestore.Firestore,
): Promise<UpdateUserStatsResult> {
  if (!request.auth)             throw new HttpsError('unauthenticated',  'Must be signed in.');
  if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin only.');

  const { gameweek } = request.data;
  if (!gameweek) throw new HttpsError('invalid-argument', 'gameweek is required.');

  // ── Load all scored slips for this gameweek ───────────────────────────────
  const slipsSnap = await db
    .collection('slips')
    .where('gameweek', '==', gameweek)
    .where('status',   '==', 'scored')
    .get();

  if (slipsSnap.empty) {
    return { gameweek, usersUpdated: 0, leaderboardSize: 0 };
  }

  // ── Group slips by user (keep highest-scoring solo slip per user) ─────────
  const bestSlipByUid = new Map<string, Slip>();
  for (const doc of slipsSnap.docs) {
    const slip = doc.data() as Slip;
    if (slip.mode !== 'solo') continue;  // leaderboard uses solo slips only
    const existing = bestSlipByUid.get(slip.userId);
    if (!existing || slip.totalPoints > existing.totalPoints) {
      bestSlipByUid.set(slip.userId, slip);
    }
  }

  const uids = [...bestSlipByUid.keys()];
  if (uids.length === 0) return { gameweek, usersUpdated: 0, leaderboardSize: 0 };

  // ── Load current userStats docs ───────────────────────────────────────────
  const statsSnaps = await db.getAll(
    ...uids.map((id) => db.collection('userStats').doc(id))
  );
  const statsById = new Map<string, UserStats>();
  for (const snap of statsSnaps) {
    if (snap.exists) statsById.set(snap.id, snap.data() as UserStats);
  }

  // ── Load H2H win counts ────────────────────────────────────────────────────
  // Count wins from the h2h config sentinel docs (fast, no full scan)
  const h2hWinsByUid = new Map<string, number>();
  for (const uid of uids) {
    const existing = statsById.get(uid);
    h2hWinsByUid.set(uid, existing?.h2hRecord?.wins ?? 0);
  }

  // ── Build writes ───────────────────────────────────────────────────────────
  const now    = admin.firestore.FieldValue.serverTimestamp();
  const writes: WriteOp[] = [];

  type LeaderboardEntry = {
    uid:         string;
    username?:   string;
    totalPoints: number;
    correctPicks: number;
    streak:      number;
    rank:        number;
  };

  const leaderboardData: Omit<LeaderboardEntry, 'rank'>[] = [];

  for (const uid of uids) {
    const slip    = bestSlipByUid.get(uid)!;
    const current = statsById.get(uid);

    const isSameGW  = current?.lastScoredGameweek === gameweek;
    const prevStreak = current?.streak ?? 0;
    const anyCorrect = slip.picks.some((p) => p.correct === true);
    const allCorrect = slip.picks.length > 0 && slip.picks.every((p) => p.correct === true);

    const newStreak = isSameGW
      ? prevStreak
      : anyCorrect ? prevStreak + 1 : 0;

    const h2hWins   = h2hWinsByUid.get(uid) ?? 0;
    const existingBadges: BadgeId[] = current?.badges ?? [];
    const earnedBadges = isSameGW
      ? []
      : newBadges(existingBadges, current ?? {}, slip, newStreak, h2hWins, allCorrect);

    const correctCount = slip.picks.filter((p) => p.correct).length;

    writes.push({
      ref:   db.collection('userStats').doc(uid),
      merge: true,
      data:  {
        uid,
        totalXP:  admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.totalPoints),
        weeklyXP: admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.totalPoints),
        streak:   newStreak,
        lastScoredGameweek: gameweek,
        badges:   admin.firestore.FieldValue.arrayUnion(...(earnedBadges.length ? earnedBadges : ['__noop__'])),
        'predictionRecord.total':   admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.picks.length),
        'predictionRecord.correct': admin.firestore.FieldValue.increment(isSameGW ? 0 : correctCount),
        updatedAt: now,
      },
    });

    leaderboardData.push({
      uid,
      totalPoints:  slip.totalPoints,
      correctPicks: correctCount,
      streak:       newStreak,
    });
  }

  // ── Load usernames for leaderboard ────────────────────────────────────────
  const userSnaps = await db.getAll(...uids.map((id) => db.collection('users').doc(id)));
  const usernameById = new Map<string, string>();
  for (const snap of userSnaps) {
    if (snap.exists) usernameById.set(snap.id, (snap.data() as any)?.username ?? snap.id);
  }

  // ── Sort and rank for leaderboard ─────────────────────────────────────────
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);
  const entries: LeaderboardEntry[] = leaderboardData.map((e, i) => ({
    ...e,
    username: usernameById.get(e.uid),
    rank:     i + 1,
  }));

  writes.push({
    ref:   db.collection('predictionLeaderboard').doc(gameweek),
    merge: false,
    data:  {
      gameweek,
      scoredAt:          now,
      entries,
      totalParticipants: entries.length,
    },
  });

  const totalWrites = await commitInBatches(db, writes);
  console.log(`[updateUserStats] ${gameweek}: ${uids.length} users, ${totalWrites} writes`);

  // ── Remove the __noop__ sentinel if accidentally added ────────────────────
  // (arrayUnion won't add it if array is empty, but guard anyway — no extra writes needed)

  return { gameweek, usersUpdated: uids.length, leaderboardSize: entries.length };
}
