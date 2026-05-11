"use strict";
/**
 * functions/src/teamBuilder.ts
 *
 * Callable Firebase Function — saves a validated fantasy team to Firestore.
 *
 * Flow:
 *   1. Extract uid from request.auth (never trust client-supplied userId).
 *   2. Batch-fetch all 15 player docs from `players/{competitionId}_{playerId}`.
 *   3. Build VerifiedPlayer[] using Firestore prices (ignores client price).
 *   4. Count user's existing teams + gather their IDs from `fantasyTeams`.
 *   5. Read `pro` custom claim for tier status.
 *   6. Call validateTeam() — collects ALL errors before returning.
 *   7. If valid: batch-write team doc + append teamId to users/{uid}.teams[].
 *   8. Return { success, teamId } or { success: false, errors }.
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
exports.runSaveTeam = runSaveTeam;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const teamBuilderValidator_1 = require("./teamBuilderValidator");
// ─── Main handler (called from index.ts onCall wrapper) ───────────────────────
async function runSaveTeam(request, db) {
    // ── Auth guard ─────────────────────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to save a team.');
    }
    const uid = request.auth.uid;
    const isPro = request.auth.token.pro === true;
    const { players: rawPlayers, formation, captainId, viceCaptainId, leagueId, teamName, leagueLocked, competitionId, } = request.data;
    // ── Input sanity ───────────────────────────────────────────────────────────
    if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'players array is required.');
    }
    if (!leagueId || typeof leagueId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'leagueId is required.');
    }
    if (!teamName || typeof teamName !== 'string' || teamName.trim().length < 2) {
        throw new https_1.HttpsError('invalid-argument', 'teamName must be at least 2 characters.');
    }
    // ── Step 1: Batch-fetch player docs from Firestore ─────────────────────────
    // Doc IDs are "{competitionId}_{playerId}" (matches seedPlayers.js format)
    const playerRefs = rawPlayers.map((p) => db.collection('players').doc(`${p.competitionId}_${p.id}`));
    const playerSnaps = await db.getAll(...playerRefs);
    // Map back to VerifiedPlayer[], collecting any missing players
    const missingIds = [];
    const verifiedPlayers = [];
    for (let i = 0; i < rawPlayers.length; i++) {
        const snap = playerSnaps[i];
        const raw = rawPlayers[i];
        if (!snap.exists) {
            missingIds.push(raw.id);
            continue;
        }
        const doc = snap.data();
        verifiedPlayers.push({
            id: raw.id,
            position: doc.position,
            clubId: doc.clubId,
            clubName: doc.clubName,
            price: raw.price, // client price (unused in budget check)
            competitionId: doc.competitionId,
            verifiedPrice: doc.currentPrice, // authoritative Firestore price
            name: doc.name,
        });
    }
    if (missingIds.length > 0) {
        throw new https_1.HttpsError('invalid-argument', `The following player id(s) were not found in the database: ${missingIds.join(', ')}.`);
    }
    // ── Step 2: Load user's existing teams ────────────────────────────────────
    const existingTeamsSnap = await db
        .collection('fantasyTeams')
        .where('userId', '==', uid)
        .get();
    const existingTeamIds = existingTeamsSnap.docs.map((d) => d.id);
    const existingTeamCount = existingTeamIds.length;
    // ── Step 3: Assemble ValidateTeamInput and run validation ─────────────────
    const proposedTeamId = `${uid}_${leagueId}`;
    const input = {
        players: verifiedPlayers,
        formation,
        captainId,
        viceCaptainId,
        competitionId,
        leagueLocked,
        existingTeamCount,
        isPro,
        proposedTeamId,
        existingTeamIds,
    };
    const result = (0, teamBuilderValidator_1.validateTeam)(input);
    if (!result.valid) {
        // Return structured errors — caller translates to HttpsError if needed.
        // We use 'invalid-argument' so the client SDK doesn't treat it as a crash.
        throw new https_1.HttpsError('invalid-argument', JSON.stringify({ success: false, errors: result.errors }));
    }
    // ── Step 4: Persist the team ───────────────────────────────────────────────
    const now = admin.firestore.FieldValue.serverTimestamp();
    const teamRef = db.collection('fantasyTeams').doc(proposedTeamId);
    const batch = db.batch();
    // fantasyTeams/{uid}_{leagueId}
    batch.set(teamRef, {
        id: proposedTeamId,
        userId: uid,
        leagueId,
        teamName: teamName.trim(),
        players: verifiedPlayers.map((p) => ({
            id: p.id,
            name: p.name,
            position: p.position,
            clubId: p.clubId,
            clubName: p.clubName,
            competitionId: p.competitionId,
            price: p.verifiedPrice,
        })),
        formation,
        captain: captainId,
        viceCaptain: viceCaptainId,
        totalPoints: 0,
        gameweekPoints: 0,
        createdAt: now,
        updatedAt: now,
    }, { merge: false });
    // users/{uid} — append teamId to teams[] (arrayUnion is idempotent)
    batch.set(db.collection('users').doc(uid), { teams: admin.firestore.FieldValue.arrayUnion(proposedTeamId), updatedAt: now }, { merge: true });
    await batch.commit();
    return {
        success: true,
        teamId: proposedTeamId,
        summary: {
            totalPrice: result.summary.totalPrice,
            budgetRemaining: result.summary.budgetRemaining,
        },
    };
}
//# sourceMappingURL=teamBuilder.js.map