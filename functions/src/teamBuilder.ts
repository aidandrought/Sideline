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

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  validateTeam,
  ValidateTeamInput,
  VerifiedPlayer,
  PlayerInput,
  ValidationError,
} from './teamBuilderValidator';

// ─── Request / Response shapes ────────────────────────────────────────────────

export interface SaveTeamRequest {
  players: PlayerInput[];
  formation: string;
  captainId: number;
  viceCaptainId: number;
  leagueId: string;
  teamName: string;
  /** True if this league restricts all players to one competition */
  leagueLocked: boolean;
  /** Required when leagueLocked is true */
  competitionId?: number;
}

export interface SaveTeamResponse {
  success: true;
  teamId: string;
  summary: {
    totalPrice: number;
    budgetRemaining: number;
  };
}

export interface SaveTeamError {
  success: false;
  errors: ValidationError[];
}

// ─── Firestore player doc shape (matches seedPlayers output) ─────────────────

interface PlayerDoc {
  id: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  clubId: number;
  clubName: string;
  competitionId: number;
  currentPrice: number;
}

// ─── Main handler (called from index.ts onCall wrapper) ───────────────────────

export async function runSaveTeam(
  request: CallableRequest<SaveTeamRequest>,
  db: admin.firestore.Firestore,
): Promise<SaveTeamResponse> {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in to save a team.');
  }

  const uid = request.auth.uid;
  const isPro = request.auth.token.pro === true;
  const {
    players: rawPlayers,
    formation,
    captainId,
    viceCaptainId,
    leagueId,
    teamName,
    leagueLocked,
    competitionId,
  } = request.data;

  // ── Input sanity ───────────────────────────────────────────────────────────
  if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
    throw new HttpsError('invalid-argument', 'players array is required.');
  }
  if (!leagueId || typeof leagueId !== 'string') {
    throw new HttpsError('invalid-argument', 'leagueId is required.');
  }
  if (!teamName || typeof teamName !== 'string' || teamName.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'teamName must be at least 2 characters.');
  }

  // ── Step 1: Batch-fetch player docs from Firestore ─────────────────────────
  // Doc IDs are "{competitionId}_{playerId}" (matches seedPlayers.js format)
  const playerRefs = rawPlayers.map((p) =>
    db.collection('players').doc(`${p.competitionId}_${p.id}`),
  );

  const playerSnaps = await db.getAll(...playerRefs);

  // Map back to VerifiedPlayer[], collecting any missing players
  const missingIds: number[] = [];
  const verifiedPlayers: VerifiedPlayer[] = [];

  for (let i = 0; i < rawPlayers.length; i++) {
    const snap = playerSnaps[i];
    const raw  = rawPlayers[i];

    if (!snap.exists) {
      missingIds.push(raw.id);
      continue;
    }

    const doc = snap.data() as PlayerDoc;

    verifiedPlayers.push({
      id:            raw.id,
      position:      doc.position,
      clubId:        doc.clubId,
      clubName:      doc.clubName,
      price:         raw.price,          // client price (unused in budget check)
      competitionId: doc.competitionId,
      verifiedPrice: doc.currentPrice,   // authoritative Firestore price
      name:          doc.name,
    });
  }

  if (missingIds.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `The following player id(s) were not found in the database: ${missingIds.join(', ')}.`,
    );
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

  const input: ValidateTeamInput = {
    players:           verifiedPlayers,
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

  const result = validateTeam(input);

  if (!result.valid) {
    // Return structured errors — caller translates to HttpsError if needed.
    // We use 'invalid-argument' so the client SDK doesn't treat it as a crash.
    throw new HttpsError(
      'invalid-argument',
      JSON.stringify({ success: false, errors: result.errors }),
    );
  }

  // ── Step 4: Persist the team ───────────────────────────────────────────────
  const now = admin.firestore.FieldValue.serverTimestamp();
  const teamRef = db.collection('fantasyTeams').doc(proposedTeamId);

  const batch = db.batch();

  // fantasyTeams/{uid}_{leagueId}
  batch.set(
    teamRef,
    {
      id:             proposedTeamId,
      userId:         uid,
      leagueId,
      teamName:       teamName.trim(),
      players:        verifiedPlayers.map((p) => ({
        id:            p.id,
        name:          p.name,
        position:      p.position,
        clubId:        p.clubId,
        clubName:      p.clubName,
        competitionId: p.competitionId,
        price:         p.verifiedPrice,
      })),
      formation,
      captain:        captainId,
      viceCaptain:    viceCaptainId,
      totalPoints:    0,
      gameweekPoints: 0,
      createdAt:      now,
      updatedAt:      now,
    },
    { merge: false }, // create or overwrite — idempotent for re-saves
  );

  // users/{uid} — append teamId to teams[] (arrayUnion is idempotent)
  batch.set(
    db.collection('users').doc(uid),
    { teams: admin.firestore.FieldValue.arrayUnion(proposedTeamId), updatedAt: now },
    { merge: true },
  );

  await batch.commit();

  return {
    success:  true,
    teamId:   proposedTeamId,
    summary: {
      totalPrice:      result.summary!.totalPrice,
      budgetRemaining: result.summary!.budgetRemaining,
    },
  };
}
