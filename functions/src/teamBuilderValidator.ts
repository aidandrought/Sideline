/**
 * functions/src/teamBuilderValidator.ts
 *
 * Pure validation logic for the team-builder callable.
 * No Firebase, no network — fully unit-testable in isolation.
 *
 * Every rule returns a typed ValidationError so the client can display
 * field-level feedback rather than a single opaque message.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Shape a player must have when passed in from the client. */
export interface PlayerInput {
  id: number;
  position: Position;
  clubId: number;
  clubName: string;
  /** Client-submitted price — overridden by Firestore price before budget check */
  price: number;
  competitionId: number;
}

/** The Firestore-verified player record returned by the caller before validation. */
export interface VerifiedPlayer extends PlayerInput {
  /** Canonical price from Firestore `players` collection (authoritative) */
  verifiedPrice: number;
  name: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

/** Parsed formation: DEF/MID/FWD starter counts (GK is always 1). */
export interface FormationShape {
  DEF: number;
  MID: number;
  FWD: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SQUAD_SIZE      = 15;
export const BUDGET_MILLIONS = 100;
export const MAX_PER_CLUB    = 3;
export const FREE_TEAM_LIMIT = 2;

/** Min/max of each position for a full 15-player squad. */
export const POSITION_RULES: Record<Position, { min: number; max: number }> = {
  GK:  { min: 2, max: 2 }, // exactly 2 — 1 starter + 1 bench GK
  DEF: { min: 3, max: 5 },
  MID: { min: 3, max: 5 },
  FWD: { min: 1, max: 3 },
};

/** Formation strings we accept. Validated structurally too — this is just a safelist. */
export const VALID_FORMATIONS = new Set([
  '4-3-3', '4-4-2', '4-5-1', '4-2-3-1',
  '3-5-2', '3-4-3',
  '5-3-2', '5-4-1', '5-2-3',
  '3-6-1',
]);

// ─── Formation parsing ────────────────────────────────────────────────────────

/**
 * Parse "4-3-3" → { DEF: 4, MID: 3, FWD: 3 }
 * Parse "4-2-3-1" → { DEF: 4, MID: 5, FWD: 1 }  (middle segments summed into MID)
 *
 * Rules:
 *   • All segments must be positive integers
 *   • Segments must sum to 10 (GK is the implicit 11th starter)
 *   • DEF (first segment) must be 3–5
 *   • FWD (last segment) must be 1–3
 *   • MID (everything in-between, summed) must be 2–6
 *
 * Returns null if the string is structurally invalid.
 */
export function parseFormation(formation: string): FormationShape | null {
  const parts = formation.split('-').map(Number);
  if (parts.length < 2)              return null;
  if (parts.some((n) => !Number.isInteger(n) || n < 1)) return null;

  const total = parts.reduce((s, n) => s + n, 0);
  if (total !== 10) return null;

  const DEF = parts[0];
  const FWD = parts[parts.length - 1];
  const MID = parts.slice(1, -1).reduce((s, n) => s + n, 0);

  if (DEF < 3 || DEF > 5) return null;
  if (FWD < 1 || FWD > 3) return null;
  if (MID < 2 || MID > 6) return null;

  return { DEF, MID, FWD };
}

// ─── Individual rule checkers ─────────────────────────────────────────────────
// Each checker pushes errors into the array and returns nothing.

function checkSquadSize(players: PlayerInput[], errors: ValidationError[]) {
  if (players.length !== SQUAD_SIZE) {
    errors.push({
      field: 'players',
      code:  'WRONG_SQUAD_SIZE',
      message: `Squad must contain exactly ${SQUAD_SIZE} players (received ${players.length}).`,
    });
  }
}

function checkDuplicatePlayers(players: PlayerInput[], errors: ValidationError[]) {
  const seen = new Set<number>();
  const dupes: number[] = [];
  for (const p of players) {
    if (seen.has(p.id)) dupes.push(p.id);
    seen.add(p.id);
  }
  if (dupes.length > 0) {
    errors.push({
      field: 'players',
      code:  'DUPLICATE_PLAYERS',
      message: `Duplicate player id(s): ${dupes.join(', ')}.`,
    });
  }
}

function checkPositionCounts(
  players: PlayerInput[],
  errors: ValidationError[],
): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) counts[p.position]++;

  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    const { min, max } = POSITION_RULES[pos];
    const count = counts[pos];
    if (count < min || count > max) {
      errors.push({
        field: `positions.${pos}`,
        code:  'INVALID_POSITION_COUNT',
        message: pos === 'GK'
          ? `Squad must contain exactly ${min} goalkeepers (received ${count}).`
          : `Squad must contain ${min}–${max} ${pos}s (received ${count}).`,
      });
    }
  }
  return counts;
}

function checkFormation(
  formation: string,
  posCounts: Record<Position, number>,
  errors: ValidationError[],
): FormationShape | null {
  // 1. Must be a known formation
  if (!VALID_FORMATIONS.has(formation)) {
    errors.push({
      field: 'formation',
      code:  'UNKNOWN_FORMATION',
      message: `"${formation}" is not a recognised formation. Valid: ${[...VALID_FORMATIONS].join(', ')}.`,
    });
    return null;
  }

  // 2. Must parse structurally
  const shape = parseFormation(formation);
  if (!shape) {
    errors.push({
      field: 'formation',
      code:  'INVALID_FORMATION_SHAPE',
      message: `Formation "${formation}" has an invalid structure.`,
    });
    return null;
  }

  // 3. Squad must contain enough players of each position to field the formation
  //    (Bench players are the remainder — we don't validate who sits on the bench here.)
  if (posCounts.DEF < shape.DEF) {
    errors.push({
      field: 'formation',
      code:  'FORMATION_INCOMPATIBLE_DEF',
      message: `Formation ${formation} requires ${shape.DEF} defenders but squad only has ${posCounts.DEF}.`,
    });
  }
  if (posCounts.MID < shape.MID) {
    errors.push({
      field: 'formation',
      code:  'FORMATION_INCOMPATIBLE_MID',
      message: `Formation ${formation} requires ${shape.MID} midfielders but squad only has ${posCounts.MID}.`,
    });
  }
  if (posCounts.FWD < shape.FWD) {
    errors.push({
      field: 'formation',
      code:  'FORMATION_INCOMPATIBLE_FWD',
      message: `Formation ${formation} requires ${shape.FWD} forwards but squad only has ${posCounts.FWD}.`,
    });
  }

  return shape;
}

function checkClubLimit(players: PlayerInput[], errors: ValidationError[]) {
  const clubCounts = new Map<number, { count: number; name: string }>();
  for (const p of players) {
    const entry = clubCounts.get(p.clubId) ?? { count: 0, name: p.clubName };
    entry.count++;
    clubCounts.set(p.clubId, entry);
  }
  for (const [, { count, name }] of clubCounts) {
    if (count > MAX_PER_CLUB) {
      errors.push({
        field: 'players',
        code:  'CLUB_LIMIT_EXCEEDED',
        message: `Maximum ${MAX_PER_CLUB} players from the same club (${name} has ${count}).`,
      });
    }
  }
}

/**
 * Uses VERIFIED prices (from Firestore) — not the client-submitted prices.
 * This prevents price manipulation by the client.
 */
function checkBudget(players: VerifiedPlayer[], errors: ValidationError[]) {
  const total = players.reduce((sum, p) => sum + p.verifiedPrice, 0);
  const rounded = Math.round(total * 10) / 10;
  if (rounded > BUDGET_MILLIONS) {
    errors.push({
      field: 'budget',
      code:  'OVER_BUDGET',
      message: `Total cost £${rounded}m exceeds £${BUDGET_MILLIONS}m budget by £${Math.round((rounded - BUDGET_MILLIONS) * 10) / 10}m.`,
    });
  }
}

function checkCaptain(
  players: PlayerInput[],
  captainId: number,
  viceCaptainId: number,
  errors: ValidationError[],
) {
  const ids = new Set(players.map((p) => p.id));

  if (!ids.has(captainId)) {
    errors.push({
      field: 'captainId',
      code:  'CAPTAIN_NOT_IN_SQUAD',
      message: `Captain (id ${captainId}) is not in your squad.`,
    });
  }
  if (!ids.has(viceCaptainId)) {
    errors.push({
      field: 'viceCaptainId',
      code:  'VICE_CAPTAIN_NOT_IN_SQUAD',
      message: `Vice-captain (id ${viceCaptainId}) is not in your squad.`,
    });
  }
  if (captainId === viceCaptainId) {
    errors.push({
      field: 'captainId',
      code:  'CAPTAIN_EQUALS_VICE',
      message: 'Captain and vice-captain must be different players.',
    });
  }
}

function checkCompetitionLock(
  players: PlayerInput[],
  competitionId: number,
  errors: ValidationError[],
) {
  const offending = players.filter((p) => p.competitionId !== competitionId);
  if (offending.length > 0) {
    const names = offending.map((p) => `id ${p.id} (competition ${p.competitionId})`).join(', ');
    errors.push({
      field: 'players',
      code:  'COMPETITION_MISMATCH',
      message: `This league is locked to competition ${competitionId}. Remove: ${names}.`,
    });
  }
}

function checkFreeTierLimit(existingTeamCount: number, isPro: boolean, errors: ValidationError[]) {
  if (!isPro && existingTeamCount >= FREE_TEAM_LIMIT) {
    errors.push({
      field: 'tier',
      code:  'FREE_TIER_TEAM_LIMIT',
      message: `Free plan allows ${FREE_TEAM_LIMIT} teams. Upgrade to Sideline Pro for unlimited teams.`,
    });
  }
}

function checkDuplicateTeamForLeague(
  existingTeamIds: string[],
  teamId: string,
  errors: ValidationError[],
) {
  if (existingTeamIds.includes(teamId)) {
    errors.push({
      field: 'leagueId',
      code:  'TEAM_ALREADY_EXISTS',
      message: 'You already have a team in this league. Edit it instead of creating a new one.',
    });
  }
}

// ─── Main exported validator ──────────────────────────────────────────────────

export interface ValidateTeamInput {
  players: VerifiedPlayer[];         // prices already cross-checked with Firestore
  formation: string;
  captainId: number;
  viceCaptainId: number;
  /** Required if leagueLocked is true */
  competitionId?: number;
  leagueLocked: boolean;
  /** How many teams the user already owns */
  existingTeamCount: number;
  isPro: boolean;
  /** The ID that would be assigned to this team (userId_leagueId) */
  proposedTeamId: string;
  /** All existing fantasyTeam IDs for this user */
  existingTeamIds: string[];
}

export interface ValidateTeamResult {
  valid: boolean;
  errors: ValidationError[];
  /** Only present when valid — safe summary of the validated squad */
  summary?: {
    totalPrice: number;
    budgetRemaining: number;
    positionCounts: Record<Position, number>;
    formation: FormationShape;
  };
}

export function validateTeam(input: ValidateTeamInput): ValidateTeamResult {
  const errors: ValidationError[] = [];
  const { players, formation, captainId, viceCaptainId } = input;

  // Run every check — collect ALL errors before returning
  checkSquadSize(players, errors);
  checkDuplicatePlayers(players, errors);

  const posCounts = checkPositionCounts(players, errors);
  const shape     = checkFormation(formation, posCounts, errors);

  checkClubLimit(players, errors);
  checkBudget(players, errors);
  checkCaptain(players, captainId, viceCaptainId, errors);

  if (input.leagueLocked && input.competitionId != null) {
    checkCompetitionLock(players, input.competitionId, errors);
  }

  checkFreeTierLimit(input.existingTeamCount, input.isPro, errors);
  checkDuplicateTeamForLeague(input.existingTeamIds, input.proposedTeamId, errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const totalPrice = Math.round(
    players.reduce((s, p) => s + p.verifiedPrice, 0) * 10,
  ) / 10;

  return {
    valid:  true,
    errors: [],
    summary: {
      totalPrice,
      budgetRemaining: Math.round((BUDGET_MILLIONS - totalPrice) * 10) / 10,
      positionCounts:  posCounts,
      formation:       shape!,
    },
  };
}
