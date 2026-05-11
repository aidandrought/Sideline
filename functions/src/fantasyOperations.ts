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

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SquadPlayer {
  playerId: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  clubId: string | number;
  price: number;
  isCaptain?: boolean;
  isVice?: boolean;
  isBench?: boolean;
  benchOrder?: number;
}

interface CommitTransfersRequest {
  leagueId: string;
  squad: SquadPlayer[];
  formation?: string;
}

interface ActivateChipRequest {
  leagueId: string;
  chip: 'wildcard' | 'benchBoost' | 'tripleCaptain' | 'freeHit';
}

interface RegisterFcmTokenRequest {
  token: string;
}

// ─── Position requirement check ───────────────────────────────────────────────

function validatePositionRequirements(
  squad: SquadPlayer[],
  positionRequirements: Record<string, [number, number]>,
): void {
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of squad) {
    counts[player.position] = (counts[player.position] ?? 0) + 1;
  }

  for (const [pos, [min, max]] of Object.entries(positionRequirements)) {
    const count = counts[pos] ?? 0;
    if (count < min || count > max) {
      throw new HttpsError(
        'invalid-argument',
        `Position ${pos} requires ${min}–${max} players, but squad has ${count}.`,
      );
    }
  }
}

// ─── runCommitTransfers ───────────────────────────────────────────────────────

export async function runCommitTransfers(
  request: CallableRequest<CommitTransfersRequest>,
  db: admin.firestore.Firestore,
): Promise<{ success: true; currentSquad: SquadPlayer[] }> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid = request.auth.uid;
  const { leagueId, squad, formation } = request.data;

  if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId is required.');
  if (!Array.isArray(squad) || squad.length === 0) {
    throw new HttpsError('invalid-argument', 'squad array is required.');
  }

  const teamDocId = `${uid}_${leagueId}`;

  const result = await db.runTransaction(async (tx) => {
    // ── Load league for rulesConfig ────────────────────────────────────────
    const leagueRef = db.collection('fantasyLeagues').doc(leagueId);
    const leagueSnap = await tx.get(leagueRef);
    if (!leagueSnap.exists) {
      throw new HttpsError('not-found', `League "${leagueId}" not found.`);
    }
    const leagueData = leagueSnap.data() as any;
    const rulesConfig = leagueData?.rulesConfig ?? {};
    const salaryCap: number = rulesConfig?.salaryCap ?? 100;
    const maxPerClub: number = rulesConfig?.maxPerClub ?? 3;
    const positionRequirements: Record<string, [number, number]> =
      rulesConfig?.positionRequirements ?? { GK: [1, 1], DEF: [3, 5], MID: [3, 5], FWD: [1, 3] };

    // ── Load current gameweek for this league's competition ────────────────
    const competitionId: number | null = leagueData?.competitionId ?? null;
    if (competitionId != null) {
      const gwSnap = await db
        .collection('gameweeks')
        .where('competitionId', '==', competitionId)
        .where('status', '==', 'locked')
        .limit(1)
        .get();
      if (!gwSnap.empty) {
        throw new HttpsError('failed-precondition', 'Transfers are locked for the current gameweek.');
      }
    }

    // ── Load existing team doc ─────────────────────────────────────────────
    const teamRef = db.collection('fantasyTeams').doc(teamDocId);
    const teamSnap = await tx.get(teamRef);
    const existingSquad: SquadPlayer[] = teamSnap.exists
      ? ((teamSnap.data() as any)?.squad ?? [])
      : [];

    // ── Load chip doc to check wildcard ────────────────────────────────────
    const chipRef = db.collection('chips').doc(teamDocId);
    const chipSnap = await tx.get(chipRef);
    const chipData = chipSnap.data() as any;
    const wildcardActive = chipData?.activeChip === 'wildcard';

    // ── Budget validation ──────────────────────────────────────────────────
    const totalPrice = squad.reduce((sum, p) => sum + (p.price ?? 0), 0);
    const roundedPrice = Math.round(totalPrice * 10) / 10;
    if (roundedPrice > salaryCap) {
      throw new HttpsError(
        'invalid-argument',
        `Squad total £${roundedPrice}m exceeds salary cap of £${salaryCap}m.`,
      );
    }

    // ── Max per club validation ────────────────────────────────────────────
    const clubCounts = new Map<string | number, number>();
    for (const player of squad) {
      const count = (clubCounts.get(player.clubId) ?? 0) + 1;
      clubCounts.set(player.clubId, count);
      if (count > maxPerClub) {
        throw new HttpsError(
          'invalid-argument',
          `Maximum ${maxPerClub} players from the same club allowed.`,
        );
      }
    }

    // ── Position requirements ──────────────────────────────────────────────
    validatePositionRequirements(squad, positionRequirements);

    // ── Count transfers (changes relative to existing squad) ──────────────
    const existingPlayerIds = new Set(existingSquad.map((p) => p.playerId));
    const newPlayerIds = new Set(squad.map((p) => p.playerId));
    let transferCount = 0;
    for (const id of newPlayerIds) {
      if (!existingPlayerIds.has(id)) transferCount++;
    }

    // ── Load transfersRemaining ────────────────────────────────────────────
    let transfersRemaining: number = teamSnap.exists
      ? ((teamSnap.data() as any)?.transfersRemaining ?? 1)
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
    tx.set(
      teamRef,
      {
        id: teamDocId,
        userId: uid,
        leagueId,
        squad,
        formation: formation ?? (teamSnap.exists ? (teamSnap.data() as any)?.formation : null),
        transfersRemaining: newTransfersRemaining,
        updatedAt: now,
        ...(teamSnap.exists ? {} : { createdAt: now, totalPoints: 0, gameweekPoints: 0 }),
      },
      { merge: true },
    );

    return { success: true as const, currentSquad: squad };
  });

  return result;
}

// ─── runActivateChip ──────────────────────────────────────────────────────────

export async function runActivateChip(
  request: CallableRequest<ActivateChipRequest>,
  db: admin.firestore.Firestore,
): Promise<{ success: true; chipActivated: string }> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid = request.auth.uid;
  const { leagueId, chip } = request.data;

  const validChips = new Set(['wildcard', 'benchBoost', 'tripleCaptain', 'freeHit']);
  if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId is required.');
  if (!chip || !validChips.has(chip)) {
    throw new HttpsError('invalid-argument', `chip must be one of: ${[...validChips].join(', ')}.`);
  }

  const docId = `${uid}_${leagueId}`;

  await db.runTransaction(async (tx) => {
    // ── Load league rulesConfig ────────────────────────────────────────────
    const leagueRef = db.collection('fantasyLeagues').doc(leagueId);
    const leagueSnap = await tx.get(leagueRef);
    if (!leagueSnap.exists) {
      throw new HttpsError('not-found', `League "${leagueId}" not found.`);
    }
    const rulesConfig = (leagueSnap.data() as any)?.rulesConfig ?? {};
    const chipsEnabled: Record<string, boolean> = rulesConfig?.chipsEnabled ?? {};

    if (chipsEnabled[chip] === false) {
      throw new HttpsError('failed-precondition', `Chip "${chip}" is not enabled in this league.`);
    }

    // ── Load chip usage doc ────────────────────────────────────────────────
    const chipRef = db.collection('chips').doc(docId);
    const chipSnap = await tx.get(chipRef);
    const chipData = (chipSnap.data() as any) ?? {};

    const usedKey = `${chip}UsedGw`;
    if (chipData[usedKey] != null) {
      throw new HttpsError('already-exists', `Chip "${chip}" has already been used this season.`);
    }

    // ── Determine current gameweek ─────────────────────────────────────────
    const competitionId: number | null = (leagueSnap.data() as any)?.competitionId ?? null;
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
        currentGameweek = (gwSnap.docs[0].data() as any)?.number ?? 1;
      }
    } else {
      const configSnap = await db.collection('config').doc('fantasy').get();
      currentGameweek = (configSnap.data() as any)?.currentGameweek ?? 1;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      chipRef,
      {
        userId: uid,
        leagueId,
        activeChip: chip,
        [usedKey]: currentGameweek,
        updatedAt: now,
        ...(chipSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  });

  return { success: true, chipActivated: chip };
}

// ─── runRegisterFcmToken ──────────────────────────────────────────────────────

export async function runRegisterFcmToken(
  request: CallableRequest<RegisterFcmTokenRequest>,
  db: admin.firestore.Firestore,
): Promise<{ success: true }> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid = request.auth.uid;
  const { token } = request.data;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'token is required.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('users').doc(uid).set(
    {
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token.trim()),
      updatedAt: now,
    },
    { merge: true },
  );

  return { success: true };
}
