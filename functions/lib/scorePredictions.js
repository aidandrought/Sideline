"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PTS_CORRECT_BTTS = exports.PTS_CORRECT_OU = exports.PTS_CORRECT_RESULT = void 0;
exports.scorePick = scorePick;
exports.scorePicks = scorePicks;
// ─── Point constants ──────────────────────────────────────────────────────────
exports.PTS_CORRECT_RESULT = 10;
exports.PTS_CORRECT_OU = 8;
exports.PTS_CORRECT_BTTS = 5;
// ─── Pure scoring helpers ─────────────────────────────────────────────────────
function deriveResult(homeGoals, awayGoals) {
    if (homeGoals > awayGoals)
        return 'home';
    if (awayGoals > homeGoals)
        return 'away';
    return 'draw';
}
function isOverUnderCorrect(pick, totalGoals) {
    // .5 lines can never land exactly on the line
    return pick.pick === 'over' ? totalGoals > pick.line : totalGoals < pick.line;
}
/**
 * Score a single pick against a known match result.
 * Returns an annotated copy of the pick with points fields populated.
 */
function scorePick(pick, result) {
    const actualResult = deriveResult(result.homeGoals, result.awayGoals);
    const actualTotalGoals = result.homeGoals + result.awayGoals;
    const actualBtts = result.homeGoals > 0 && result.awayGoals > 0;
    const resultPoints = pick.resultPick === actualResult ? exports.PTS_CORRECT_RESULT : 0;
    const overUnderPoints = pick.overUnder != null
        ? (isOverUnderCorrect(pick.overUnder, actualTotalGoals) ? exports.PTS_CORRECT_OU : 0)
        : 0;
    const bttsPoints = pick.btts != null
        ? (pick.btts === actualBtts ? exports.PTS_CORRECT_BTTS : 0)
        : 0;
    return {
        ...pick,
        resultPoints,
        overUnderPoints,
        bttsPoints,
        totalPoints: resultPoints + overUnderPoints + bttsPoints,
        actualResult,
        actualTotalGoals,
        actualBtts,
    };
}
/**
 * Score an array of picks against a results lookup map.
 * Picks with no matching result are left unscored (totalPoints = 0).
 */
function scorePicks(picks, resultsByMatchId) {
    let totalPoints = 0;
    let anyCorrectResult = false;
    const scoredPicks = picks.map((pick) => {
        const result = resultsByMatchId.get(pick.matchId);
        if (!result)
            return pick; // match not finished yet — skip
        const scored = scorePick(pick, result);
        totalPoints += scored.totalPoints ?? 0;
        if ((scored.resultPoints ?? 0) > 0)
            anyCorrectResult = true;
        return scored;
    });
    return { scoredPicks, totalPoints, anyCorrectResult };
}
//# sourceMappingURL=scorePredictions.js.map