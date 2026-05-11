"use strict";
/**
 * functions/src/generateH2HSchedule.ts
 *
 * generateH2HSchedule — callable.
 *
 * Creates a round-robin schedule for an H2H league so every member
 * plays every other member at least once across the season gameweeks.
 *
 * Algorithm
 * ─────────
 *  Berger round-robin rotation:
 *    1. If N is odd, add a virtual BYE player.
 *    2. For each round r (0 .. N-2 when N is even):
 *       - Fix team[0] at the top.
 *       - Rotate remaining N-1 teams clockwise.
 *       - Pair: (team[0], team[N/2]), (team[1], team[N-1]), …
 *    3. Discard pairings involving BYE.
 *    4. Assign rounds to the provided gameweek list in order.
 *       If the league has more rounds than gameweeks, wrap around.
 *
 * Required: league must already exist in Firestore with members[].
 * Callable only by a league member (ownerId).
 * Regenerating overwrites the existing schedule.
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
exports.runGenerateH2HSchedule = runGenerateH2HSchedule;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
async function runGenerateH2HSchedule(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const uid = request.auth.uid;
    const { leagueId, gameweeks } = request.data;
    if (!leagueId)
        throw new https_1.HttpsError('invalid-argument', 'leagueId required.');
    if (!Array.isArray(gameweeks) || gameweeks.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'gameweeks array required.');
    }
    // ── Load league ────────────────────────────────────────────────────────────
    const leagueSnap = await db.collection('h2hLeagues').doc(leagueId).get();
    if (!leagueSnap.exists)
        throw new https_1.HttpsError('not-found', 'H2H league not found.');
    const league = leagueSnap.data();
    // Only league creator (first member = creator) or admin can generate schedule
    const isAdmin = request.auth.token.admin === true;
    const isCreator = league.members?.[0] === uid;
    if (!isAdmin && !isCreator) {
        throw new https_1.HttpsError('permission-denied', 'Only the league creator can generate the schedule.');
    }
    const members = league.members ?? [];
    if (members.length < 2) {
        throw new https_1.HttpsError('failed-precondition', 'Need at least 2 members to generate a schedule.');
    }
    // ── Berger round-robin ─────────────────────────────────────────────────────
    const schedule = bergerRoundRobin(members, gameweeks);
    // ── Initialise standings for any new members ───────────────────────────────
    const existingStandings = league.standings ?? {};
    const standings = { ...existingStandings };
    for (const uid of members) {
        if (!standings[uid]) {
            standings[uid] = { wins: 0, losses: 0, draws: 0, totalPoints: 0 };
        }
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('h2hLeagues').doc(leagueId).set({ schedule, standings, updatedAt: now }, { merge: true });
    console.log(`[generateH2HSchedule] ${leagueId}: ${members.length} members, ${schedule.length} matchups across ${gameweeks.length} gameweeks`);
    return {
        leagueId,
        rounds: new Set(schedule.map((m) => m.gw)).size,
        matchups: schedule.length,
    };
}
// ─── Berger round-robin algorithm ─────────────────────────────────────────────
function bergerRoundRobin(members, gameweeks) {
    const teams = [...members];
    // Pad to even number (BYE = null)
    const hasBye = teams.length % 2 !== 0;
    if (hasBye)
        teams.push('__BYE__');
    const n = teams.length; // always even
    const rounds = n - 1; // total rounds for complete round-robin
    // fixed[0] stays at index 0; rotate the rest
    const fixed = teams[0];
    const rotating = teams.slice(1); // length = n - 1
    const allMatchups = [];
    for (let r = 0; r < rounds; r++) {
        // Build this round's pair list
        const roundTeams = [fixed, ...rotating];
        const half = n / 2;
        for (let i = 0; i < half; i++) {
            const home = roundTeams[i];
            const away = roundTeams[n - 1 - i];
            // Skip BYE pairings
            if (home === '__BYE__' || away === '__BYE__')
                continue;
            // Assign to gameweek (wrap around if more rounds than gameweeks)
            const gw = gameweeks[r % gameweeks.length];
            allMatchups.push({ gw, home, away });
        }
        // Rotate: last element moves to index 1 (after fixed)
        rotating.unshift(rotating.pop());
    }
    return allMatchups;
}
//# sourceMappingURL=generateH2HSchedule.js.map