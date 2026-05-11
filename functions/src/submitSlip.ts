/**
 * functions/src/submitSlip.ts
 *
 * submitSlip  — callable. Validates and stores a prediction slip.
 * cacheMatchResult — callable (admin). Stores a match result before scoring runs.
 *
 * Validation rules
 * ────────────────
 *  • Must be authenticated
 *  • Max 10 picks per slip
 *  • All picks must be for matches that haven't kicked off yet
 *    (checked against matchResultCache — if finished=true, reject)
 *  • No duplicate picks (same matchId + type in one slip)
 *  • Picks cannot be changed once the slip is locked
 *  • One slip per user per gameweek per competition per mode (replace if pending)
 *  • H2H mode requires a valid leagueId and challengedUserId
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  Slip, SlipPick, SlipMode, MatchResultCache,
} from './slipTypes';
import { PTS } from './slipScoring';

// ─── submitSlip ───────────────────────────────────────────────────────────────

export interface SubmitSlipRequest {
  gameweek:          string;
  competition:       string;
  mode:              SlipMode;
  challengedUserId?: string;
  leagueId?:         string;
  picks: Array<{
    matchId:         string;
    type:            SlipPick['type'];
    value:           string;
    /** Client supplies max pts for display — server re-derives from PTS table */
    pointsAvailable?: number;
    /** kickoffAt ISO string — used as gate; server validates against matchResultCache */
    kickoffAt?:      string;
  }>;
}

export interface SubmitSlipResponse {
  slipId:     string;
  pickCount:  number;
  locked:     boolean;
}

const VALID_TYPES = new Set<string>([
  'result', 'overUnder', 'btts', 'correctScore', 'firstScorer', 'anytimeScorer', 'htft',
]);

export async function runSubmitSlip(
  request: CallableRequest<SubmitSlipRequest>,
  db: admin.firestore.Firestore,
): Promise<SubmitSlipResponse> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid  = request.auth.uid;
  const { gameweek, competition, mode, challengedUserId, leagueId, picks: rawPicks } = request.data;

  // ── Basic validation ───────────────────────────────────────────────────────
  if (!gameweek)    throw new HttpsError('invalid-argument', 'gameweek is required.');
  if (!competition) throw new HttpsError('invalid-argument', 'competition is required.');
  if (mode !== 'solo' && mode !== 'h2h') {
    throw new HttpsError('invalid-argument', 'mode must be "solo" or "h2h".');
  }
  if (mode === 'h2h' && (!challengedUserId || !leagueId)) {
    throw new HttpsError('invalid-argument', 'H2H slips require challengedUserId and leagueId.');
  }
  if (!Array.isArray(rawPicks) || rawPicks.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one pick is required.');
  }
  if (rawPicks.length > 10) {
    throw new HttpsError('invalid-argument', 'Maximum 10 picks per slip.');
  }

  // ── Validate each pick ────────────────────────────────────────────────────
  const seenPickKeys = new Set<string>();
  for (const p of rawPicks) {
    if (!p.matchId) throw new HttpsError('invalid-argument', 'Each pick must have a matchId.');
    if (!VALID_TYPES.has(p.type)) {
      throw new HttpsError('invalid-argument', `Unknown pick type "${p.type}".`);
    }
    if (!p.value || typeof p.value !== 'string') {
      throw new HttpsError('invalid-argument', `Pick for match ${p.matchId} is missing a value.`);
    }
    const dupKey = `${p.matchId}::${p.type}`;
    if (seenPickKeys.has(dupKey)) {
      throw new HttpsError('invalid-argument', `Duplicate ${p.type} pick for match ${p.matchId}.`);
    }
    seenPickKeys.add(dupKey);
  }

  // ── Check kickoff status for each pick's match ────────────────────────────
  const matchIds = [...new Set(rawPicks.map((p) => String(p.matchId)))];
  const matchResultSnaps = await db.getAll(
    ...matchIds.map((id) => db.collection('matchResultCache').doc(id))
  );

  const kickedOffIds = new Set<string>();
  for (const snap of matchResultSnaps) {
    if (!snap.exists) continue;
    const data = snap.data() as MatchResultCache;
    // Reject if match has already started (finished OR result cached = kickoff passed)
    if (data.finished) kickedOffIds.add(snap.id);
  }

  // Also check client-supplied kickoffAt as a secondary gate
  const now = Date.now();
  for (const p of rawPicks) {
    if (kickedOffIds.has(String(p.matchId))) {
      throw new HttpsError(
        'failed-precondition',
        `Match ${p.matchId} has already kicked off — picks cannot be changed.`,
      );
    }
    if (p.kickoffAt && new Date(p.kickoffAt).getTime() <= now) {
      throw new HttpsError(
        'failed-precondition',
        `Match ${p.matchId} kickoff time has passed.`,
      );
    }
  }

  // ── H2H: verify the challenged user is in the league ─────────────────────
  if (mode === 'h2h' && leagueId && challengedUserId) {
    const leagueSnap = await db.collection('h2hLeagues').doc(leagueId).get();
    if (!leagueSnap.exists) {
      throw new HttpsError('not-found', `H2H league "${leagueId}" not found.`);
    }
    const leagueData = leagueSnap.data() as any;
    const members: string[] = leagueData.members ?? [];
    if (!members.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this H2H league.');
    }
    if (!members.includes(challengedUserId)) {
      throw new HttpsError('invalid-argument', 'The challenged user is not in this league.');
    }
  }

  // ── Resolve existing slip (one per user/gameweek/competition/mode) ─────────
  const slipId = mode === 'h2h'
    ? `${uid}_${gameweek}_${competition}_h2h_${leagueId}`
    : `${uid}_${gameweek}_${competition}_solo`;

  const existingSnap = await db.collection('slips').doc(slipId).get();
  if (existingSnap.exists) {
    const existing = existingSnap.data() as Slip;
    if (existing.locked) {
      throw new HttpsError(
        'failed-precondition',
        'Your slip is locked — it cannot be changed after the first match kicks off.',
      );
    }
    if (existing.status === 'scored') {
      throw new HttpsError('failed-precondition', 'This slip has already been scored.');
    }
  }

  // ── Build normalized picks ─────────────────────────────────────────────────
  const picks: SlipPick[] = rawPicks.map((p) => ({
    matchId:         String(p.matchId),
    type:            p.type,
    value:           p.value.trim(),
    pointsAvailable: PTS[p.type],   // always use server-side PTS, ignore client value
  }));

  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  const slip: Omit<Slip, 'submittedAt' | 'updatedAt'> & {
    submittedAt: admin.firestore.FieldValue;
    updatedAt:   admin.firestore.FieldValue;
  } = {
    id:               slipId,
    userId:           uid,
    gameweek,
    competition,
    mode,
    ...(challengedUserId ? { challengedUserId } : {}),
    ...(leagueId         ? { leagueId         } : {}),
    locked:           false,
    picks,
    rawPoints:        0,
    parlayMultiplier: 1,
    totalPoints:      0,
    status:           'pending',
    submittedAt:      existingSnap.exists
                        ? (existingSnap.data() as any).submittedAt
                        : nowTs,
    updatedAt:        nowTs,
  };

  await db.collection('slips').doc(slipId).set(slip, { merge: false });

  return { slipId, pickCount: picks.length, locked: false };
}

// ─── cacheMatchResult ─────────────────────────────────────────────────────────

export interface CacheMatchResultRequest {
  matchId:      string;
  homeGoals:    number;
  awayGoals:    number;
  halftimeHome: number;
  halftimeAway: number;
  goals: Array<{
    minute:     number;
    scorerId:   string;
    scorerName: string;
    team:       'home' | 'away';
    type:       'normal' | 'penalty' | 'own';
  }>;
  finished:     boolean;
}

export async function runCacheMatchResult(
  request: CallableRequest<CacheMatchResultRequest>,
  db: admin.firestore.Firestore,
): Promise<{ matchId: string }> {
  if (!request.auth)             throw new HttpsError('unauthenticated',  'Must be signed in.');
  if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin only.');

  const { matchId, homeGoals, awayGoals, halftimeHome, halftimeAway, goals, finished } = request.data;
  if (!matchId) throw new HttpsError('invalid-argument', 'matchId required.');

  const btts = homeGoals > 0 && awayGoals > 0;

  await db.collection('matchResultCache').doc(String(matchId)).set(
    {
      matchId:      String(matchId),
      homeGoals:    homeGoals    ?? 0,
      awayGoals:    awayGoals    ?? 0,
      halftimeHome: halftimeHome ?? 0,
      halftimeAway: halftimeAway ?? 0,
      btts,
      goals:        goals ?? [],
      finished,
      cachedAt:     admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false },
  );

  return { matchId: String(matchId) };
}
