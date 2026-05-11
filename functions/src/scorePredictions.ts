/**
 * functions/src/scorePredictions.ts
 *
 * Gameweek prediction scoring engine — no Firebase dependency, fully unit-testable.
 *
 * Firestore structure
 * ───────────────────
 *  gameweekPredictions/{uid}_{gameweek}
 *    uid:          string
 *    gameweek:     string          e.g. "39_GW12_2024"
 *    picks:        Pick[]
 *    submittedAt:  Timestamp
 *    scored:       boolean
 *    totalPoints:  number          0 until scored
 *
 *  predictionLeaderboard/{gameweek}
 *    gameweek:   string
 *    scoredAt:   Timestamp
 *    entries:    LeaderboardEntry[]   sorted by points desc, rank assigned
 *
 *  users/{uid}                    (merge-written)
 *    xp:                number     += gameweek total points
 *    predictionStreak:  number     consecutive GWs with ≥1 correct result pick
 *    lastScoredGameweek: string
 *
 * Scoring
 * ───────
 *  Correct result pick        10 pts
 *  Correct over/under pick     8 pts
 *  Correct BTTS pick           5 pts
 *  Max per match              23 pts
 */

// ─── Public pick types (shared with client) ───────────────────────────────────

export interface OverUnderPick {
  /** The goal line, e.g. 2.5 */
  line: number;
  pick: 'over' | 'under';
}

export interface Pick {
  matchId: string;
  resultPick:  'home' | 'draw' | 'away';
  /** null = user did not pick this market */
  overUnder:   OverUnderPick | null;
  /** null = user did not pick this market */
  btts:        boolean | null;
  // ── Filled in when scored ──────────────────────────────────────────────────
  resultPoints?:   number;
  overUnderPoints?: number;
  bttsPoints?:     number;
  totalPoints?:    number;
  // ── Actual match results ───────────────────────────────────────────────────
  actualResult?:     'home' | 'draw' | 'away';
  actualTotalGoals?: number;
  actualBtts?:       boolean;
}

/** One match result supplied by the caller when scoring. */
export interface MatchResult {
  matchId:   string;
  homeGoals: number;
  awayGoals: number;
}

// ─── Point constants ──────────────────────────────────────────────────────────

export const PTS_CORRECT_RESULT    = 10;
export const PTS_CORRECT_OU        = 8;
export const PTS_CORRECT_BTTS      = 5;

// ─── Pure scoring helpers ─────────────────────────────────────────────────────

function deriveResult(homeGoals: number, awayGoals: number): 'home' | 'draw' | 'away' {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
}

function isOverUnderCorrect(pick: OverUnderPick, totalGoals: number): boolean {
  // .5 lines can never land exactly on the line
  return pick.pick === 'over' ? totalGoals > pick.line : totalGoals < pick.line;
}

/**
 * Score a single pick against a known match result.
 * Returns an annotated copy of the pick with points fields populated.
 */
export function scorePick(pick: Pick, result: MatchResult): Pick {
  const actualResult     = deriveResult(result.homeGoals, result.awayGoals);
  const actualTotalGoals = result.homeGoals + result.awayGoals;
  const actualBtts       = result.homeGoals > 0 && result.awayGoals > 0;

  const resultPoints    = pick.resultPick === actualResult ? PTS_CORRECT_RESULT : 0;

  const overUnderPoints = pick.overUnder != null
    ? (isOverUnderCorrect(pick.overUnder, actualTotalGoals) ? PTS_CORRECT_OU : 0)
    : 0;

  const bttsPoints = pick.btts != null
    ? (pick.btts === actualBtts ? PTS_CORRECT_BTTS : 0)
    : 0;

  return {
    ...pick,
    resultPoints,
    overUnderPoints,
    bttsPoints,
    totalPoints:    resultPoints + overUnderPoints + bttsPoints,
    actualResult,
    actualTotalGoals,
    actualBtts,
  };
}

/**
 * Score an array of picks against a results lookup map.
 * Picks with no matching result are left unscored (totalPoints = 0).
 */
export function scorePicks(
  picks: Pick[],
  resultsByMatchId: Map<string, MatchResult>,
): { scoredPicks: Pick[]; totalPoints: number; anyCorrectResult: boolean } {
  let totalPoints = 0;
  let anyCorrectResult = false;

  const scoredPicks = picks.map((pick) => {
    const result = resultsByMatchId.get(pick.matchId);
    if (!result) return pick; // match not finished yet — skip

    const scored = scorePick(pick, result);
    totalPoints += scored.totalPoints ?? 0;
    if ((scored.resultPoints ?? 0) > 0) anyCorrectResult = true;
    return scored;
  });

  return { scoredPicks, totalPoints, anyCorrectResult };
}
