"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScoreSlips = runScoreSlips;
exports.runScoreH2H = runScoreH2H;
exports.runUpdateUserStats = runUpdateUserStats;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const slipScoring_1 = require("./slipScoring");
async function commitInBatches(db, writes, chunk = 499) {
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
async function runScoreSlips(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin only.');
    const { gameweek } = request.data;
    if (!gameweek)
        throw new https_1.HttpsError('invalid-argument', 'gameweek is required.');
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
    const allMatchIds = new Set();
    for (const doc of slipsSnap.docs) {
        const slip = doc.data();
        for (const pick of slip.picks)
            allMatchIds.add(String(pick.matchId));
    }
    const resultSnaps = await db.getAll(...[...allMatchIds].map((id) => db.collection('matchResultCache').doc(id)));
    const resultsByMatchId = new Map();
    for (const snap of resultSnaps) {
        if (snap.exists) {
            const data = snap.data();
            if (data.finished)
                resultsByMatchId.set(snap.id, data);
        }
    }
    // ── Score each slip ────────────────────────────────────────────────────────
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    let slipsScored = 0;
    let slipsPartial = 0;
    for (const slipDoc of slipsSnap.docs) {
        const slip = slipDoc.data();
        const result = (0, slipScoring_1.scoreSlip)(slip.picks, resultsByMatchId, slip.picks.length);
        const newStatus = result.allScored ? 'scored' : 'partial';
        if (newStatus === 'scored')
            slipsScored++;
        else
            slipsPartial++;
        writes.push({
            ref: db.collection('slips').doc(slipDoc.id),
            merge: true,
            data: {
                picks: result.picks,
                rawPoints: result.rawPoints,
                parlayMultiplier: result.parlayMultiplier,
                totalPoints: result.totalPoints,
                status: newStatus,
                updatedAt: now,
            },
        });
    }
    const totalWrites = await commitInBatches(db, writes);
    console.log(`[scoreSlips] ${gameweek}: ${slipsScored} scored, ${slipsPartial} partial, ${totalWrites} writes`);
    return { gameweek, slipsScored, slipsPartial, totalWrites };
}
async function runScoreH2H(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin only.');
    const { gameweek } = request.data;
    if (!gameweek)
        throw new https_1.HttpsError('invalid-argument', 'gameweek is required.');
    // ── Load all H2H leagues that have a matchup this gameweek ───────────────
    const leaguesSnap = await db.collection('h2hLeagues').get();
    if (leaguesSnap.empty)
        return { gameweek, matchupsScored: 0 };
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    let matchupsScored = 0;
    for (const leagueDoc of leaguesSnap.docs) {
        const league = leagueDoc.data();
        // Find the matchup for this gameweek
        const matchup = league.schedule?.find((m) => m.gw === gameweek);
        if (!matchup)
            continue;
        const { home: homeUid, away: awayUid } = matchup;
        // ── Load both users' scored slips ──────────────────────────────────────
        const [homeSlipSnap, awaySlipSnap] = await Promise.all([
            db.collection('slips')
                .where('userId', '==', homeUid)
                .where('gameweek', '==', gameweek)
                .where('leagueId', '==', leagueDoc.id)
                .where('mode', '==', 'h2h')
                .limit(1)
                .get(),
            db.collection('slips')
                .where('userId', '==', awayUid)
                .where('gameweek', '==', gameweek)
                .where('leagueId', '==', leagueDoc.id)
                .where('mode', '==', 'h2h')
                .limit(1)
                .get(),
        ]);
        // Both slips must be fully scored before resolving H2H
        if (homeSlipSnap.empty || awaySlipSnap.empty)
            continue;
        const homeSlip = homeSlipSnap.docs[0].data();
        const awaySlip = awaySlipSnap.docs[0].data();
        if (homeSlip.status !== 'scored' || awaySlip.status !== 'scored')
            continue;
        // Idempotency: check if this matchup was already resolved
        const resolvedKey = `h2h_resolved_${leagueDoc.id}_${gameweek}`;
        const resolvedSnap = await db.collection('config').doc(resolvedKey).get();
        if (resolvedSnap.exists)
            continue;
        const homePoints = homeSlip.totalPoints;
        const awayPoints = awaySlip.totalPoints;
        let homeResult;
        let awayResult;
        if (homePoints > awayPoints) {
            homeResult = 'win';
            awayResult = 'loss';
        }
        else if (awayPoints > homePoints) {
            homeResult = 'loss';
            awayResult = 'win';
        }
        else {
            homeResult = awayResult = 'draw';
        }
        // ── Update league standings ────────────────────────────────────────────
        const currentStandings = league.standings ?? {};
        const homeStanding = currentStandings[homeUid] ?? { wins: 0, losses: 0, draws: 0, totalPoints: 0 };
        const awayStanding = currentStandings[awayUid] ?? { wins: 0, losses: 0, draws: 0, totalPoints: 0 };
        const updatedStandings = {
            ...currentStandings,
            [homeUid]: {
                wins: homeStanding.wins + (homeResult === 'win' ? 1 : 0),
                losses: homeStanding.losses + (homeResult === 'loss' ? 1 : 0),
                draws: homeStanding.draws + (homeResult === 'draw' ? 1 : 0),
                totalPoints: homeStanding.totalPoints + homePoints,
            },
            [awayUid]: {
                wins: awayStanding.wins + (awayResult === 'win' ? 1 : 0),
                losses: awayStanding.losses + (awayResult === 'loss' ? 1 : 0),
                draws: awayStanding.draws + (awayResult === 'draw' ? 1 : 0),
                totalPoints: awayStanding.totalPoints + awayPoints,
            },
        };
        writes.push({
            ref: db.collection('h2hLeagues').doc(leagueDoc.id),
            merge: true,
            data: { standings: updatedStandings, updatedAt: now },
        });
        // Mark resolved (idempotency sentinel)
        writes.push({
            ref: db.collection('config').doc(resolvedKey),
            merge: false,
            data: { resolvedAt: now, homeUid, awayUid, homePoints, awayPoints, result: homeResult },
        });
        matchupsScored++;
        console.log(`[scoreH2H] ${leagueDoc.id} GW${gameweek}: ${homeUid}(${homePoints}) ${homeResult} vs ${awayUid}(${awayPoints})`);
    }
    await commitInBatches(db, writes);
    return { gameweek, matchupsScored };
}
/** Badge award logic — returns new badges to add */
function newBadges(existing, stats, currentSlip, newStreak, h2hWins, allPicksCorrect) {
    const set = new Set(existing);
    const earned = [];
    const maybeAdd = (id) => {
        if (!set.has(id)) {
            set.add(id);
            earned.push(id);
        }
    };
    if (allPicksCorrect)
        maybeAdd('perfectSlip');
    if (currentSlip.picks.some((p) => p.type === 'correctScore' && p.correct)) {
        maybeAdd('correctScore');
    }
    if (newStreak >= 3)
        maybeAdd('streakX3');
    if (newStreak >= 5)
        maybeAdd('streakX5');
    if (h2hWins >= 10)
        maybeAdd('h2hWinX10');
    return earned;
}
async function runUpdateUserStats(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin only.');
    const { gameweek } = request.data;
    if (!gameweek)
        throw new https_1.HttpsError('invalid-argument', 'gameweek is required.');
    // ── Load all scored slips for this gameweek ───────────────────────────────
    const slipsSnap = await db
        .collection('slips')
        .where('gameweek', '==', gameweek)
        .where('status', '==', 'scored')
        .get();
    if (slipsSnap.empty) {
        return { gameweek, usersUpdated: 0, leaderboardSize: 0 };
    }
    // ── Group slips by user (keep highest-scoring solo slip per user) ─────────
    const bestSlipByUid = new Map();
    for (const doc of slipsSnap.docs) {
        const slip = doc.data();
        if (slip.mode !== 'solo')
            continue; // leaderboard uses solo slips only
        const existing = bestSlipByUid.get(slip.userId);
        if (!existing || slip.totalPoints > existing.totalPoints) {
            bestSlipByUid.set(slip.userId, slip);
        }
    }
    const uids = [...bestSlipByUid.keys()];
    if (uids.length === 0)
        return { gameweek, usersUpdated: 0, leaderboardSize: 0 };
    // ── Load current userStats docs ───────────────────────────────────────────
    const statsSnaps = await db.getAll(...uids.map((id) => db.collection('userStats').doc(id)));
    const statsById = new Map();
    for (const snap of statsSnaps) {
        if (snap.exists)
            statsById.set(snap.id, snap.data());
    }
    // ── Load H2H win counts ────────────────────────────────────────────────────
    // Count wins from the h2h config sentinel docs (fast, no full scan)
    const h2hWinsByUid = new Map();
    for (const uid of uids) {
        const existing = statsById.get(uid);
        h2hWinsByUid.set(uid, existing?.h2hRecord?.wins ?? 0);
    }
    // ── Build writes ───────────────────────────────────────────────────────────
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    const leaderboardData = [];
    for (const uid of uids) {
        const slip = bestSlipByUid.get(uid);
        const current = statsById.get(uid);
        const isSameGW = current?.lastScoredGameweek === gameweek;
        const prevStreak = current?.streak ?? 0;
        const anyCorrect = slip.picks.some((p) => p.correct === true);
        const allCorrect = slip.picks.length > 0 && slip.picks.every((p) => p.correct === true);
        const newStreak = isSameGW
            ? prevStreak
            : anyCorrect ? prevStreak + 1 : 0;
        const h2hWins = h2hWinsByUid.get(uid) ?? 0;
        const existingBadges = current?.badges ?? [];
        const earnedBadges = isSameGW
            ? []
            : newBadges(existingBadges, current ?? {}, slip, newStreak, h2hWins, allCorrect);
        const correctCount = slip.picks.filter((p) => p.correct).length;
        writes.push({
            ref: db.collection('userStats').doc(uid),
            merge: true,
            data: {
                uid,
                totalXP: admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.totalPoints),
                weeklyXP: admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.totalPoints),
                streak: newStreak,
                lastScoredGameweek: gameweek,
                badges: admin.firestore.FieldValue.arrayUnion(...(earnedBadges.length ? earnedBadges : ['__noop__'])),
                'predictionRecord.total': admin.firestore.FieldValue.increment(isSameGW ? 0 : slip.picks.length),
                'predictionRecord.correct': admin.firestore.FieldValue.increment(isSameGW ? 0 : correctCount),
                updatedAt: now,
            },
        });
        leaderboardData.push({
            uid,
            totalPoints: slip.totalPoints,
            correctPicks: correctCount,
            streak: newStreak,
        });
    }
    // ── Load usernames for leaderboard ────────────────────────────────────────
    const userSnaps = await db.getAll(...uids.map((id) => db.collection('users').doc(id)));
    const usernameById = new Map();
    for (const snap of userSnaps) {
        if (snap.exists)
            usernameById.set(snap.id, snap.data()?.username ?? snap.id);
    }
    // ── Sort and rank for leaderboard ─────────────────────────────────────────
    leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);
    const entries = leaderboardData.map((e, i) => ({
        ...e,
        username: usernameById.get(e.uid),
        rank: i + 1,
    }));
    writes.push({
        ref: db.collection('predictionLeaderboard').doc(gameweek),
        merge: false,
        data: {
            gameweek,
            scoredAt: now,
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
//# sourceMappingURL=scoreSlips.js.map