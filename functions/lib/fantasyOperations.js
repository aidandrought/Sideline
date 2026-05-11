"use strict";
/**
 * functions/src/fantasyOperations.ts
 *
 * Callable Cloud Function handlers for fantasy team management.
 * These are pure runner functions — the onCall wrappers live in index.ts.
 *
 * runCommitTransfers  — validates and applies squad changes within a Firestore transaction
 * runActivateChip     — validates and activates a fantasy chip for the current gameweek
 * runRegisterFcmToken — deduplicates and stores a user's FCM push token
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
exports.runCommitTransfers = runCommitTransfers;
exports.runActivateChip = runActivateChip;
exports.runRegisterFcmToken = runRegisterFcmToken;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
// ─── Position requirement check ───────────────────────────────────────────────
function validatePositionRequirements(squad, positionRequirements) {
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of squad) {
        counts[player.position] = (counts[player.position] ?? 0) + 1;
    }
    for (const [pos, [min, max]] of Object.entries(positionRequirements)) {
        const count = counts[pos] ?? 0;
        if (count < min || count > max) {
            throw new https_1.HttpsError('invalid-argument', `Position ${pos} requires ${min}–${max} players, but squad has ${count}.`);
        }
    }
}
// ─── runCommitTransfers ───────────────────────────────────────────────────────
async function runCommitTransfers(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const uid = request.auth.uid;
    const { leagueId, squad, formation } = request.data;
    if (!leagueId)
        throw new https_1.HttpsError('invalid-argument', 'leagueId is required.');
    if (!Array.isArray(squad) || squad.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'squad array is required.');
    }
    const teamDocId = `${uid}_${leagueId}`;
    const result = await db.runTransaction(async (tx) => {
        // ── Load league for rulesConfig ────────────────────────────────────────
        const leagueRef = db.collection('fantasyLeagues').doc(leagueId);
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) {
            throw new https_1.HttpsError('not-found', `League "${leagueId}" not found.`);
        }
        const leagueData = leagueSnap.data();
        const rulesConfig = leagueData?.rulesConfig ?? {};
        const salaryCap = rulesConfig?.salaryCap ?? 100;
        const maxPerClub = rulesConfig?.maxPerClub ?? 3;
        const positionRequirements = rulesConfig?.positionRequirements ?? { GK: [1, 1], DEF: [3, 5], MID: [3, 5], FWD: [1, 3] };
        // ── Load current gameweek for this league's competition ────────────────
        const competitionId = leagueData?.competitionId ?? null;
        if (competitionId != null) {
            const gwSnap = await db
                .collection('gameweeks')
                .where('competitionId', '==', competitionId)
                .where('status', '==', 'locked')
                .limit(1)
                .get();
            if (!gwSnap.empty) {
                throw new https_1.HttpsError('failed-precondition', 'Transfers are locked for the current gameweek.');
            }
        }
        // ── Load existing team doc ─────────────────────────────────────────────
        const teamRef = db.collection('fantasyTeams').doc(teamDocId);
        const teamSnap = await tx.get(teamRef);
        const existingSquad = teamSnap.exists
            ? (teamSnap.data()?.squad ?? [])
            : [];
        // ── Load chip doc to check wildcard ────────────────────────────────────
        const chipRef = db.collection('chips').doc(teamDocId);
        const chipSnap = await tx.get(chipRef);
        const chipData = chipSnap.data();
        const wildcardActive = chipData?.activeChip === 'wildcard';
        // ── Budget validation ──────────────────────────────────────────────────
        const totalPrice = squad.reduce((sum, p) => sum + (p.price ?? 0), 0);
        const roundedPrice = Math.round(totalPrice * 10) / 10;
        if (roundedPrice > salaryCap) {
            throw new https_1.HttpsError('invalid-argument', `Squad total £${roundedPrice}m exceeds salary cap of £${salaryCap}m.`);
        }
        // ── Max per club validation ────────────────────────────────────────────
        const clubCounts = new Map();
        for (const player of squad) {
            const count = (clubCounts.get(player.clubId) ?? 0) + 1;
            clubCounts.set(player.clubId, count);
            if (count > maxPerClub) {
                throw new https_1.HttpsError('invalid-argument', `Maximum ${maxPerClub} players from the same club allowed.`);
            }
        }
        // ── Position requirements ──────────────────────────────────────────────
        validatePositionRequirements(squad, positionRequirements);
        // ── Count transfers (changes relative to existing squad) ──────────────
        const existingPlayerIds = new Set(existingSquad.map((p) => p.playerId));
        const newPlayerIds = new Set(squad.map((p) => p.playerId));
        let transferCount = 0;
        for (const id of newPlayerIds) {
            if (!existingPlayerIds.has(id))
                transferCount++;
        }
        // ── Load transfersRemaining ────────────────────────────────────────────
        let transfersRemaining = teamSnap.exists
            ? (teamSnap.data()?.transfersRemaining ?? 1)
            : 1;
        if (wildcardActive) {
            // Wildcard: unlimited transfers this gameweek
            transfersRemaining = 99;
        }
        const newTransfersRemaining = wildcardActive
            ? 99
            : Math.max(0, transfersRemaining - transferCount);
        // ── Write the team doc ─────────────────────────────────────────────────
        const now = admin.firestore.FieldValue.serverTimestamp();
        tx.set(teamRef, {
            id: teamDocId,
            userId: uid,
            leagueId,
            squad,
            formation: formation ?? (teamSnap.exists ? teamSnap.data()?.formation : null),
            transfersRemaining: newTransfersRemaining,
            updatedAt: now,
            ...(teamSnap.exists ? {} : { createdAt: now, totalPoints: 0, gameweekPoints: 0 }),
        }, { merge: true });
        return { success: true, currentSquad: squad };
    });
    return result;
}
// ─── runActivateChip ──────────────────────────────────────────────────────────
async function runActivateChip(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const uid = request.auth.uid;
    const { leagueId, chip } = request.data;
    const validChips = new Set(['wildcard', 'benchBoost', 'tripleCaptain', 'freeHit']);
    if (!leagueId)
        throw new https_1.HttpsError('invalid-argument', 'leagueId is required.');
    if (!chip || !validChips.has(chip)) {
        throw new https_1.HttpsError('invalid-argument', `chip must be one of: ${[...validChips].join(', ')}.`);
    }
    const docId = `${uid}_${leagueId}`;
    await db.runTransaction(async (tx) => {
        // ── Load league rulesConfig ────────────────────────────────────────────
        const leagueRef = db.collection('fantasyLeagues').doc(leagueId);
        const leagueSnap = await tx.get(leagueRef);
        if (!leagueSnap.exists) {
            throw new https_1.HttpsError('not-found', `League "${leagueId}" not found.`);
        }
        const rulesConfig = leagueSnap.data()?.rulesConfig ?? {};
        const chipsEnabled = rulesConfig?.chipsEnabled ?? {};
        if (chipsEnabled[chip] === false) {
            throw new https_1.HttpsError('failed-precondition', `Chip "${chip}" is not enabled in this league.`);
        }
        // ── Load chip usage doc ────────────────────────────────────────────────
        const chipRef = db.collection('chips').doc(docId);
        const chipSnap = await tx.get(chipRef);
        const chipData = chipSnap.data() ?? {};
        const usedKey = `${chip}UsedGw`;
        if (chipData[usedKey] != null) {
            throw new https_1.HttpsError('already-exists', `Chip "${chip}" has already been used this season.`);
        }
        // ── Determine current gameweek ─────────────────────────────────────────
        const competitionId = leagueSnap.data()?.competitionId ?? null;
        let currentGameweek = 1;
        if (competitionId != null) {
            const gwSnap = await db
                .collection('gameweeks')
                .where('competitionId', '==', competitionId)
                .where('status', '==', 'upcoming')
                .orderBy('number', 'asc')
                .limit(1)
                .get();
            if (!gwSnap.empty) {
                currentGameweek = gwSnap.docs[0].data()?.number ?? 1;
            }
        }
        else {
            const configSnap = await db.collection('config').doc('fantasy').get();
            currentGameweek = configSnap.data()?.currentGameweek ?? 1;
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        tx.set(chipRef, {
            userId: uid,
            leagueId,
            activeChip: chip,
            [usedKey]: currentGameweek,
            updatedAt: now,
            ...(chipSnap.exists ? {} : { createdAt: now }),
        }, { merge: true });
    });
    return { success: true, chipActivated: chip };
}
// ─── runRegisterFcmToken ──────────────────────────────────────────────────────
async function runRegisterFcmToken(request, db) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const uid = request.auth.uid;
    const { token } = request.data;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(uid).set({
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token.trim()),
        updatedAt: now,
    }, { merge: true });
    return { success: true };
}
//# sourceMappingURL=fantasyOperations.js.map