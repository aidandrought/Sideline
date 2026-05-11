/**
 * functions/src/leagueOperations.ts
 *
 * Callable Cloud Functions for league lifecycle management.
 * All three run server-side so enforcement cannot be bypassed by the client.
 *
 * createLeague  — validates input, generates invite code, enforces free-tier limit
 * joinLeague    — validates team competition match, initialises standings entry
 * leaveLeague   — cleans up member + team + owner transfer / league deletion
 *
 * Firestore writes
 * ──────────────────────────────────────────────────────────────────────────────
 *  fantasyLeagues/{leagueId}
 *    — created on createLeague
 *    — memberCount, members[], standings{} updated on join/leave
 *    — deleted when last member leaves (owner or sole member)
 *
 *  fantasyLeagueMembers/{leagueId}_{uid}
 *    — created on join, deleted on leave
 *
 *  users/{uid}.leagues[]
 *    — arrayUnion on join, arrayRemove on leave
 *
 *  fantasyTeams/{uid}_{leagueId}
 *    — deleted on leave (team is per-league, not portable)
 */

import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Free users may CREATE at most this many leagues */
const FREE_CREATE_LIMIT = 1;

/** Free users may JOIN at most this many leagues (including created ones) */
const FREE_JOIN_LIMIT = 2;

/** Max members per league (prevent abuse) */
const MAX_LEAGUE_MEMBERS = 50;

/** Invite code character set — no ambiguous characters */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DEFAULT_SCORING_RULES = {
  captainMultiplier:    2,
  viceCaptainMultiplier: 1.5,
  transferPenalty:      4,
  freeTransfersPerGW:   1,
};

function getCurrentSeason(): string {
  const now   = new Date();
  const month = now.getMonth() + 1;
  return month >= 7 ? String(now.getFullYear()) : String(now.getFullYear() - 1);
}

// ─── Invite code helpers ──────────────────────────────────────────────────────

function generateCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('');
}

/**
 * Generate a 6-char invite code that doesn't collide with any existing league.
 * Retries up to `maxAttempts` times before giving up (extremely unlikely to fail).
 */
async function uniqueInviteCode(
  db: admin.firestore.Firestore,
  maxAttempts = 8,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode();
    const snap = await db
      .collection('fantasyLeagues')
      .where('inviteCode', '==', code)
      .limit(1)
      .get();
    if (snap.empty) return code;
  }
  throw new HttpsError('internal', 'Could not generate a unique invite code. Try again.');
}

// ─────────────────────────────────────────────────────────────────────────────
// createLeague
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateLeagueRequest {
  name: string;
  type: 'global' | 'friends' | 'cl' | 'worldcup';
  /** Competition name, e.g. "Premier League" */
  competition?: string;
  competitionId?: number;
  scoringRules?: Partial<typeof DEFAULT_SCORING_RULES>;
  isPrivate: boolean;
  emoji?: string;
}

export interface CreateLeagueResponse {
  leagueId:   string;
  inviteCode: string | null;
}

export async function runCreateLeague(
  request: CallableRequest<CreateLeagueRequest>,
  db: admin.firestore.Firestore,
): Promise<CreateLeagueResponse> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid    = request.auth.uid;
  const isPro  = request.auth.token.pro === true;
  const { name, type, competition, competitionId, isPrivate, emoji } = request.data;

  // ── Input validation ───────────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 40) {
    throw new HttpsError('invalid-argument', 'League name must be 3–40 characters.');
  }
  const validTypes = new Set(['global', 'friends', 'cl', 'worldcup']);
  if (!validTypes.has(type)) {
    throw new HttpsError('invalid-argument', `Invalid league type "${type}".`);
  }
  if (competitionId != null && (typeof competitionId !== 'number' || competitionId <= 0)) {
    throw new HttpsError('invalid-argument', 'competitionId must be a positive number.');
  }

  // ── Free-tier creation limit ───────────────────────────────────────────────
  if (!isPro) {
    const ownedSnap = await db
      .collection('fantasyLeagues')
      .where('ownerId', '==', uid)
      .limit(FREE_CREATE_LIMIT + 1)
      .get();

    if (ownedSnap.size >= FREE_CREATE_LIMIT) {
      throw new HttpsError(
        'permission-denied',
        `Free plan allows creating ${FREE_CREATE_LIMIT} league. Upgrade to Sideline Pro for unlimited leagues.`,
      );
    }
  }

  // ── Load creator username ──────────────────────────────────────────────────
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
  const ownerUsername: string = (userSnap.data() as any)?.username ?? uid;

  // ── Invite code (private leagues only) ────────────────────────────────────
  const inviteCode = isPrivate ? await uniqueInviteCode(db) : null;

  // ── Merge scoring rules with defaults ─────────────────────────────────────
  const rawRules = request.data.scoringRules ?? {};
  const scoringRules = {
    captainMultiplier:    clamp(rawRules.captainMultiplier    ?? DEFAULT_SCORING_RULES.captainMultiplier,    1, 3),
    viceCaptainMultiplier: clamp(rawRules.viceCaptainMultiplier ?? DEFAULT_SCORING_RULES.viceCaptainMultiplier, 1, 2),
    transferPenalty:      clamp(rawRules.transferPenalty      ?? DEFAULT_SCORING_RULES.transferPenalty,      0, 12),
    freeTransfersPerGW:   clamp(rawRules.freeTransfersPerGW   ?? DEFAULT_SCORING_RULES.freeTransfersPerGW,   1, 5),
  };

  // ── Build league doc ───────────────────────────────────────────────────────
  const leagueId = `${uid}_${Date.now()}`;
  const now      = admin.firestore.FieldValue.serverTimestamp();

  const leagueDoc = {
    id:               leagueId,
    name:             name.trim(),
    type,
    competition:      competition ?? null,
    competitionId:    competitionId ?? null,
    inviteCode,
    ownerId:          uid,
    ownerUsername,
    isPrivate,
    memberCount:      0,
    members:          [],
    standings:        {},
    currentGameweek:  1,
    season:           getCurrentSeason(),
    scoringRules,
    emoji:            sanitizeEmoji(emoji),
    createdAt:        now,
    updatedAt:        now,
  };

  // ── Write league + auto-join creator in one batch ─────────────────────────
  const batch = db.batch();

  batch.set(db.collection('fantasyLeagues').doc(leagueId), leagueDoc);

  // Creator's member doc (joins with 0 points — they set a team separately)
  batch.set(db.collection('fantasyLeagueMembers').doc(`${leagueId}_${uid}`), {
    leagueId,
    userId:             uid,
    username:           ownerUsername,
    teamName:           `${ownerUsername}'s Team`,
    totalPoints:        0,
    lastGameweekPoints: 0,
    rank:               1,
    previousRank:       1,
    joinedAt:           now,
  });

  // League doc: increment count + add to members[]
  batch.update(db.collection('fantasyLeagues').doc(leagueId), {
    memberCount: admin.firestore.FieldValue.increment(1),
    members:     admin.firestore.FieldValue.arrayUnion(uid),
  });

  // User doc: append leagueId to leagues[]
  batch.set(
    db.collection('users').doc(uid),
    { leagues: admin.firestore.FieldValue.arrayUnion(leagueId), updatedAt: now },
    { merge: true },
  );

  await batch.commit();

  return { leagueId, inviteCode };
}

// ─────────────────────────────────────────────────────────────────────────────
// joinLeague
// ─────────────────────────────────────────────────────────────────────────────

export interface JoinLeagueRequest {
  /** The league to join */
  leagueId: string;
  /**
   * The fantasy team the user wants to register for this league.
   * Required when the league has a competitionId.
   * Format: "{uid}_{originalLeagueId}" — the doc ID in fantasyTeams.
   */
  teamId?: string;
  /** For private leagues — must match league.inviteCode */
  inviteCode?: string;
}

export interface JoinLeagueResponse {
  leagueId:  string;
  memberId:  string;
  teamName:  string;
}

export async function runJoinLeague(
  request: CallableRequest<JoinLeagueRequest>,
  db: admin.firestore.Firestore,
): Promise<JoinLeagueResponse> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid   = request.auth.uid;
  const isPro = request.auth.token.pro === true;
  const { leagueId, teamId, inviteCode } = request.data;

  if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId is required.');

  // ── Load league ────────────────────────────────────────────────────────────
  const leagueSnap = await db.collection('fantasyLeagues').doc(leagueId).get();
  if (!leagueSnap.exists) {
    throw new HttpsError('not-found', `League "${leagueId}" not found.`);
  }
  const league = leagueSnap.data() as any;

  // ── Invite code check (private leagues) ───────────────────────────────────
  if (league.isPrivate) {
    if (!inviteCode) {
      throw new HttpsError('permission-denied', 'This league is private. An invite code is required.');
    }
    if (inviteCode.toUpperCase() !== league.inviteCode) {
      throw new HttpsError('permission-denied', 'Incorrect invite code.');
    }
  }

  // ── Already a member? ──────────────────────────────────────────────────────
  const memberId   = `${leagueId}_${uid}`;
  const memberSnap = await db.collection('fantasyLeagueMembers').doc(memberId).get();
  if (memberSnap.exists) {
    throw new HttpsError('already-exists', 'You are already a member of this league.');
  }

  // ── Member cap ─────────────────────────────────────────────────────────────
  if ((league.memberCount ?? 0) >= MAX_LEAGUE_MEMBERS) {
    throw new HttpsError('resource-exhausted', `This league is full (max ${MAX_LEAGUE_MEMBERS} members).`);
  }

  // ── Free-tier join limit ───────────────────────────────────────────────────
  if (!isPro) {
    const joinedSnap = await db
      .collection('fantasyLeagueMembers')
      .where('userId', '==', uid)
      .limit(FREE_JOIN_LIMIT + 1)
      .get();

    if (joinedSnap.size >= FREE_JOIN_LIMIT) {
      throw new HttpsError(
        'permission-denied',
        `Free plan allows joining ${FREE_JOIN_LIMIT} leagues. Upgrade to Sideline Pro for unlimited leagues.`,
      );
    }
  }

  // ── Competition validation ─────────────────────────────────────────────────
  let teamName = 'My Team';

  if (league.competitionId != null) {
    // League is competition-locked — user must supply a team
    if (!teamId) {
      throw new HttpsError(
        'invalid-argument',
        `This league requires a team built for competition ${league.competitionId}. Pass your teamId.`,
      );
    }

    const teamSnap = await db.collection('fantasyTeams').doc(teamId).get();
    if (!teamSnap.exists) {
      throw new HttpsError('not-found', `Fantasy team "${teamId}" not found.`);
    }

    const team = teamSnap.data() as any;

    // Ownership check
    if (team.userId !== uid) {
      throw new HttpsError('permission-denied', 'That team does not belong to you.');
    }

    // Competition match — players must be from the right competition
    const teamCompetitionId: number | undefined = team.competitionId ?? team.players?.[0]?.competitionId;
    if (teamCompetitionId != null && teamCompetitionId !== league.competitionId) {
      throw new HttpsError(
        'failed-precondition',
        `Your team is built for competition ${teamCompetitionId} but this league requires competition ${league.competitionId}.`,
      );
    }

    teamName = team.teamName ?? 'My Team';
  }

  // ── Load username ──────────────────────────────────────────────────────────
  const userSnap = await db.collection('users').doc(uid).get();
  const username: string = (userSnap.data() as any)?.username ?? uid;
  if (teamName === 'My Team') teamName = `${username}'s Team`;

  // ── Batch write ────────────────────────────────────────────────────────────
  const now   = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Member doc
  batch.set(db.collection('fantasyLeagueMembers').doc(memberId), {
    leagueId,
    userId:             uid,
    username,
    teamName,
    totalPoints:        0,
    lastGameweekPoints: 0,
    rank:               0,       // 0 = unranked until first gameweek scores
    previousRank:       0,
    joinedAt:           now,
  });

  // League doc — increment count, add to members[], seed standings entry
  batch.update(db.collection('fantasyLeagues').doc(leagueId), {
    memberCount: admin.firestore.FieldValue.increment(1),
    members:     admin.firestore.FieldValue.arrayUnion(uid),
    [`standings.${uid}`]: {
      userId:         uid,
      username,
      teamName,
      totalPoints:    0,
      gameweekPoints: 0,
      rank:           0,
      previousRank:   0,
    },
    updatedAt: now,
  });

  // User doc — append leagueId
  batch.set(
    db.collection('users').doc(uid),
    { leagues: admin.firestore.FieldValue.arrayUnion(leagueId), updatedAt: now },
    { merge: true },
  );

  await batch.commit();

  return { leagueId, memberId, teamName };
}

// ─────────────────────────────────────────────────────────────────────────────
// leaveLeague
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveLeagueRequest {
  leagueId: string;
  /**
   * When leaving as owner with other members still present,
   * the caller must nominate a successor uid.
   */
  transferOwnershipTo?: string;
}

export interface LeaveLeagueResponse {
  leagueId: string;
  leagueDeleted: boolean;
}

export async function runLeaveLeague(
  request: CallableRequest<LeaveLeagueRequest>,
  db: admin.firestore.Firestore,
): Promise<LeaveLeagueResponse> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const uid      = request.auth.uid;
  const { leagueId, transferOwnershipTo } = request.data;

  if (!leagueId) throw new HttpsError('invalid-argument', 'leagueId is required.');

  // ── Load league ────────────────────────────────────────────────────────────
  const leagueRef  = db.collection('fantasyLeagues').doc(leagueId);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw new HttpsError('not-found', 'League not found.');
  const league = leagueSnap.data() as any;

  // ── Membership check ───────────────────────────────────────────────────────
  const memberId   = `${leagueId}_${uid}`;
  const memberSnap = await db.collection('fantasyLeagueMembers').doc(memberId).get();
  if (!memberSnap.exists) {
    throw new HttpsError('failed-precondition', 'You are not a member of this league.');
  }

  const isOwner      = league.ownerId === uid;
  const memberCount  = league.memberCount ?? 1;
  const isLastMember = memberCount <= 1;

  // ── Owner leaving with other members → require transfer ───────────────────
  if (isOwner && !isLastMember) {
    if (!transferOwnershipTo) {
      throw new HttpsError(
        'failed-precondition',
        'You are the league owner. Pass transferOwnershipTo with another member\'s uid, or delete the league.',
      );
    }

    // Validate the successor is actually a member
    const successorMemberSnap = await db
      .collection('fantasyLeagueMembers')
      .doc(`${leagueId}_${transferOwnershipTo}`)
      .get();

    if (!successorMemberSnap.exists) {
      throw new HttpsError(
        'invalid-argument',
        `User "${transferOwnershipTo}" is not a member of this league.`,
      );
    }

    // Load successor's username
    const successorUserSnap = await db.collection('users').doc(transferOwnershipTo).get();
    const successorUsername: string = (successorUserSnap.data() as any)?.username ?? transferOwnershipTo;

    // Perform the leave + ownership transfer in one batch
    const now   = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    // Remove member doc
    batch.delete(db.collection('fantasyLeagueMembers').doc(memberId));

    // Delete the user's team for this league
    batch.delete(db.collection('fantasyTeams').doc(`${uid}_${leagueId}`));

    // Update league: transfer ownership, decrement count, remove from members[], drop standings entry
    batch.update(leagueRef, {
      ownerId:          transferOwnershipTo,
      ownerUsername:    successorUsername,
      memberCount:      admin.firestore.FieldValue.increment(-1),
      members:          admin.firestore.FieldValue.arrayRemove(uid),
      [`standings.${uid}`]: admin.firestore.FieldValue.delete(),
      updatedAt:        now,
    });

    // Remove from user's leagues[]
    batch.set(
      db.collection('users').doc(uid),
      { leagues: admin.firestore.FieldValue.arrayRemove(leagueId), updatedAt: now },
      { merge: true },
    );

    await batch.commit();

    return { leagueId, leagueDeleted: false };
  }

  // ── Normal leave (non-owner, or last member) ───────────────────────────────
  const now   = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Remove member doc
  batch.delete(db.collection('fantasyLeagueMembers').doc(memberId));

  // Delete the user's team for this league
  batch.delete(db.collection('fantasyTeams').doc(`${uid}_${leagueId}`));

  // Remove from user's leagues[]
  batch.set(
    db.collection('users').doc(uid),
    { leagues: admin.firestore.FieldValue.arrayRemove(leagueId), updatedAt: now },
    { merge: true },
  );

  if (isLastMember) {
    // Last member out — delete the league doc entirely
    batch.delete(leagueRef);
  } else {
    // Update league counters and standings
    batch.update(leagueRef, {
      memberCount:              admin.firestore.FieldValue.increment(-1),
      members:                  admin.firestore.FieldValue.arrayRemove(uid),
      [`standings.${uid}`]:     admin.firestore.FieldValue.delete(),
      updatedAt:                now,
    });
  }

  await batch.commit();

  return { leagueId, leagueDeleted: isLastMember };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Accepts a single emoji character; falls back to ⚽ if the string looks wrong.
 * Simple guard — we're not doing full unicode grapheme cluster parsing.
 */
function sanitizeEmoji(input?: string): string {
  if (!input) return '⚽';
  const trimmed = input.trim();
  // Accept up to 2 chars to handle emoji sequences (e.g. flags = 2 regional indicators)
  return trimmed.length <= 4 ? trimmed : '⚽';
}
