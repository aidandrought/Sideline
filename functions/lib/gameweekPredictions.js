"use strict";
/**
 * functions/src/gameweekPredictions.ts
 *
 * Two callable Firebase Functions:
 *
 *   submitGameweekPicks   — authenticated users submit picks before deadline
 *   scoreGameweekPredictions — admin scores a gameweek after matches finish
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
exports.runSubmitGameweekPicks = runSubmitGameweekPicks;
exports.runScoreGameweekPredictions = runScoreGameweekPredictions;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scorePredictions_1 = require("./scorePredictions");
async function runSubmitGameweekPicks(request, db) {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to submit picks.');
    }
    const uid = request.auth.uid;
    const { gameweek, picks: rawPicks } = request.data;
    // ── Basic validation ───────────────────────────────────────────────────────
    if (!gameweek || typeof gameweek !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'gameweek is required (e.g. "39_GW12_2024").');
    }
    if (!Array.isArray(rawPicks) || rawPicks.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'picks array must not be empty.');
    }
    if (rawPicks.length > 15) {
        throw new https_1.HttpsError('invalid-argument', 'Maximum 15 picks per gameweek.');
    }
    // Validate each pick
    const validResults = new Set(['home', 'draw', 'away']);
    for (const p of rawPicks) {
        if (!p.matchId || typeof p.matchId !== 'string') {
            throw new https_1.HttpsError('invalid-argument', 'Each pick must have a string matchId.');
        }
        if (!validResults.has(p.resultPick)) {
            throw new https_1.HttpsError('invalid-argument', `Invalid resultPick "${p.resultPick}" for match ${p.matchId}.`);
        }
        if (p.overUnder != null) {
            if (typeof p.overUnder.line !== 'number' || p.overUnder.line <= 0) {
                throw new https_1.HttpsError('invalid-argument', `Invalid over/under line for match ${p.matchId}.`);
            }
            if (p.overUnder.pick !== 'over' && p.overUnder.pick !== 'under') {
                throw new https_1.HttpsError('invalid-argument', `Invalid over/under pick for match ${p.matchId}.`);
            }
        }
    }
    // ── Deadline check: read from config/fantasy.gameweekDeadline ─────────────
    const configSnap = await db.collection('config').doc('fantasy').get();
    const deadlines = (configSnap.data()?.gameweekDeadlines ?? {});
    const deadline = deadlines[gameweek];
    if (deadline && new Date() > new Date(deadline)) {
        throw new https_1.HttpsError('failed-precondition', `The deadline for gameweek ${gameweek} has passed.`);
    }
    // ── Check that this gameweek hasn't already been scored ───────────────────
    const docId = `${uid}_${gameweek}`;
    const docRef = db.collection('gameweekPredictions').doc(docId);
    const existing = await docRef.get();
    if (existing.exists && existing.data()?.scored === true) {
        throw new https_1.HttpsError('failed-precondition', 'Picks for this gameweek have already been scored and can no longer be changed.');
    }
    // ── Normalize picks (strip undefined to null for Firestore) ───────────────
    const picks = rawPicks.map((p) => ({
        matchId: p.matchId,
        resultPick: p.resultPick,
        overUnder: p.overUnder ?? null,
        btts: p.btts ?? null,
    }));
    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = {
        uid,
        gameweek,
        picks,
        submittedAt: existing.exists ? existing.data().submittedAt : now,
        updatedAt: now,
        scored: false,
        totalPoints: 0,
    };
    await docRef.set(doc, { merge: false });
    return { success: true, docId, pickCount: picks.length };
}
async function runScoreGameweekPredictions(request, db) {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!request.auth.token.admin) {
        throw new https_1.HttpsError('permission-denied', 'Admin claim required.');
    }
    const { gameweek, results: rawResults } = request.data;
    if (!gameweek)
        throw new https_1.HttpsError('invalid-argument', 'gameweek is required.');
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'results array is required.');
    }
    // Build fast lookup: matchId → MatchResult
    const resultsByMatchId = new Map(rawResults.map((r) => [String(r.matchId), r]));
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
    const scoredUsers = [];
    for (const predDoc of predsSnap.docs) {
        const data = predDoc.data();
        const { scoredPicks, totalPoints, anyCorrectResult } = (0, scorePredictions_1.scorePicks)(data.picks ?? [], resultsByMatchId);
        let correctResults = 0;
        let correctOU = 0;
        let correctBTTS = 0;
        for (const p of scoredPicks) {
            if ((p.resultPoints ?? 0) >= scorePredictions_1.PTS_CORRECT_RESULT)
                correctResults++;
            if ((p.overUnderPoints ?? 0) >= scorePredictions_1.PTS_CORRECT_OU)
                correctOU++;
            if ((p.bttsPoints ?? 0) >= scorePredictions_1.PTS_CORRECT_BTTS)
                correctBTTS++;
        }
        scoredUsers.push({
            uid: data.uid,
            docId: predDoc.id,
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
    const uids = [...new Set(scoredUsers.map((u) => u.uid))];
    const usernames = new Map();
    const photoURLs = new Map();
    for (let i = 0; i < uids.length; i += 30) {
        const chunk = uids.slice(i, i + 30);
        const snaps = await db.getAll(...chunk.map((id) => db.collection('users').doc(id)));
        for (const snap of snaps) {
            if (!snap.exists)
                continue;
            const d = snap.data();
            usernames.set(snap.id, d.username ?? snap.id);
            if (d.photoURL)
                photoURLs.set(snap.id, d.photoURL);
        }
    }
    // ── Sort by points to assign ranks ────────────────────────────────────────
    scoredUsers.sort((a, b) => b.totalPoints - a.totalPoints);
    const leaderboardEntries = scoredUsers.map((u, idx) => ({
        uid: u.uid,
        username: usernames.get(u.uid) ?? u.uid,
        photoURL: photoURLs.get(u.uid),
        points: u.totalPoints,
        correctResults: u.correctResults,
        correctOU: u.correctOU,
        correctBTTS: u.correctBTTS,
        totalPicks: u.scoredPicks.length,
        rank: idx + 1,
    }));
    // ── Build batch writes ────────────────────────────────────────────────────
    const CHUNK = 499;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = [];
    // A. Update each gameweekPredictions doc with scored picks + points
    for (const u of scoredUsers) {
        writes.push({
            ref: db.collection('gameweekPredictions').doc(u.docId),
            data: {
                picks: u.scoredPicks,
                totalPoints: u.totalPoints,
                scored: true,
                scoredAt: now,
            },
            merge: true,
        });
    }
    // B. Update users/{uid} — increment XP, update streak
    for (const u of scoredUsers) {
        const prevStreakSnap = await db.collection('users').doc(u.uid).get();
        const prevStreak = prevStreakSnap.data()?.predictionStreak ?? 0;
        const lastScoredGW = prevStreakSnap.data()?.lastScoredGameweek;
        // Streak: only increment if different gameweek (idempotency guard)
        const newStreak = lastScoredGW === gameweek
            ? prevStreak // re-run: don't double-count streak
            : u.anyCorrectResult
                ? prevStreak + 1
                : 0;
        writes.push({
            ref: db.collection('users').doc(u.uid),
            data: {
                xp: admin.firestore.FieldValue.increment(lastScoredGW === gameweek ? 0 : u.totalPoints),
                predictionStreak: newStreak,
                lastScoredGameweek: gameweek,
                updatedAt: now,
            },
            merge: true,
        });
    }
    // C. Write predictionLeaderboard/{gameweek} snapshot
    writes.push({
        ref: db.collection('predictionLeaderboard').doc(gameweek),
        data: {
            gameweek,
            scoredAt: now,
            entries: leaderboardEntries,
            totalParticipants: leaderboardEntries.length,
            pointsKey: {
                correctResult: scorePredictions_1.PTS_CORRECT_RESULT,
                correctOU: scorePredictions_1.PTS_CORRECT_OU,
                correctBTTS: scorePredictions_1.PTS_CORRECT_BTTS,
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
            }
            else {
                batch.set(w.ref, w.data);
            }
        }
        await batch.commit();
        totalWritten += chunk.length;
        console.log(`  batch committed: ${chunk.length} ops (total: ${totalWritten}/${writes.length})`);
    }
    console.log(`[scoreGameweek] Done — ${scoredUsers.length} users scored, ` +
        `${leaderboardEntries.length} leaderboard entries, ${totalWritten} total writes`);
    return {
        gameweek,
        docsScored: scoredUsers.length,
        leaderboardEntries: leaderboardEntries.length,
        totalWrites: totalWritten,
    };
}
//# sourceMappingURL=gameweekPredictions.js.map