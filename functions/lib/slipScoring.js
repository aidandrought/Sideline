"use strict";
/**
 * functions/src/slipScoring.ts
 *
 * Pure scoring engine for the slip prediction system.
 * No Firebase dependency — fully unit-testable.
 *
 * Markets and points
 * ──────────────────
 *  result          10 pts
 *  overUnder        8 pts
 *  btts             8 pts
 *  correctScore    25 pts
 *  firstScorer     20 pts
 *  anytimeScorer   12 pts
 *  htft            15 pts
 *
 * Parlay multiplier (applied to slip totalPoints)
 * ──────────────────
 *  All picks correct  → 2.0×
 *  5+ picks correct   → 1.5×  (only if not all correct)
 *  Otherwise          → 1.0×
 *
 * A pick counts as "correct" when pointsEarned > 0.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PTS = void 0;
exports.scoreOnePick = scoreOnePick;
exports.parlayMultiplier = parlayMultiplier;
exports.scoreSlip = scoreSlip;
// ─── Points constants ─────────────────────────────────────────────────────────
exports.PTS = {
    result: 10,
    overUnder: 8,
    btts: 8,
    correctScore: 25,
    firstScorer: 20,
    anytimeScorer: 12,
    htft: 15,
};
// ─── Market-specific scorers ──────────────────────────────────────────────────
function scoreResult(value, result) {
    if (result.homeGoals > result.awayGoals)
        return value === 'home';
    if (result.awayGoals > result.homeGoals)
        return value === 'away';
    return value === 'draw';
}
/** value format: 'over_2.5' | 'under_3.5' */
function scoreOverUnder(value, result) {
    const [side, lineStr] = value.split('_');
    const line = parseFloat(lineStr);
    if (isNaN(line))
        return false;
    const total = result.homeGoals + result.awayGoals;
    return side === 'over' ? total > line : total < line;
}
/** value: 'yes' | 'no' */
function scoreBtts(value, result) {
    const actual = result.btts ? 'yes' : 'no';
    return value === actual;
}
/** value: '2-1' | '0-0' — goals only, no AET */
function scoreCorrectScore(value, result) {
    const [h, a] = value.split('-').map(Number);
    return h === result.homeGoals && a === result.awayGoals;
}
/** value: playerId string */
function scoreFirstScorer(value, result) {
    const homeGoals = result.goals.filter((g) => g.team === 'home' && g.type !== 'own');
    const awayGoals = result.goals.filter((g) => g.team === 'away' && g.type !== 'own');
    const all = [...homeGoals, ...awayGoals].sort((a, b) => a.minute - b.minute);
    return all.length > 0 && all[0].scorerId === value;
}
/** value: playerId string */
function scoreAnytimeScorer(value, result) {
    return result.goals.some((g) => g.scorerId === value && g.type !== 'own');
}
/**
 * value: '{htResult}_{ftResult}' where each is 'home' | 'draw' | 'away'
 * e.g. 'home_home', 'draw_away'
 */
function scoreHtft(value, result) {
    const [htPart, ftPart] = value.split('_');
    const htResult = result.halftimeHome > result.halftimeAway
        ? 'home'
        : result.halftimeAway > result.halftimeHome
            ? 'away'
            : 'draw';
    const ftResult = result.homeGoals > result.awayGoals
        ? 'home'
        : result.awayGoals > result.homeGoals
            ? 'away'
            : 'draw';
    return htResult === htPart && ftResult === ftPart;
}
/** Resolve the 'actual' string for a market (mirrors the value encoding) */
function actualValue(type, result) {
    switch (type) {
        case 'result': {
            if (result.homeGoals > result.awayGoals)
                return 'home';
            if (result.awayGoals > result.homeGoals)
                return 'away';
            return 'draw';
        }
        case 'overUnder': return `${result.homeGoals + result.awayGoals}goals`;
        case 'btts': return result.btts ? 'yes' : 'no';
        case 'correctScore': return `${result.homeGoals}-${result.awayGoals}`;
        case 'htft': {
            const ht = result.halftimeHome > result.halftimeAway ? 'home'
                : result.halftimeAway > result.halftimeHome ? 'away' : 'draw';
            const ft = result.homeGoals > result.awayGoals ? 'home'
                : result.awayGoals > result.homeGoals ? 'away' : 'draw';
            return `${ht}_${ft}`;
        }
        case 'firstScorer': {
            const homeGoals = result.goals.filter((g) => g.team === 'home' && g.type !== 'own');
            const awayGoals = result.goals.filter((g) => g.team === 'away' && g.type !== 'own');
            const all = [...homeGoals, ...awayGoals].sort((a, b) => a.minute - b.minute);
            return all.length > 0 ? all[0].scorerId : 'none';
        }
        case 'anytimeScorer': return result.goals.map((g) => g.scorerId).join(',');
        default: return '';
    }
}
// ─── Pick scorer ──────────────────────────────────────────────────────────────
/**
 * Score one pick against a known match result.
 * Returns an annotated copy with pointsEarned, correct, and actualValue set.
 */
function scoreOnePick(pick, result) {
    let correct = false;
    switch (pick.type) {
        case 'result':
            correct = scoreResult(pick.value, result);
            break;
        case 'overUnder':
            correct = scoreOverUnder(pick.value, result);
            break;
        case 'btts':
            correct = scoreBtts(pick.value, result);
            break;
        case 'correctScore':
            correct = scoreCorrectScore(pick.value, result);
            break;
        case 'firstScorer':
            correct = scoreFirstScorer(pick.value, result);
            break;
        case 'anytimeScorer':
            correct = scoreAnytimeScorer(pick.value, result);
            break;
        case 'htft':
            correct = scoreHtft(pick.value, result);
            break;
    }
    return {
        ...pick,
        correct,
        pointsEarned: correct ? exports.PTS[pick.type] : 0,
        actualValue: actualValue(pick.type, result),
    };
}
// ─── Parlay multiplier ────────────────────────────────────────────────────────
/**
 * Parlay applies only once all picks are scored (slip fully resolved).
 *  - All correct → 2.0×
 *  - 5+ correct  → 1.5×
 *  - Otherwise   → 1.0×
 */
function parlayMultiplier(picks) {
    const scored = picks.filter((p) => p.pointsEarned !== undefined);
    if (scored.length === 0)
        return 1;
    const correct = scored.filter((p) => p.correct === true).length;
    if (correct === scored.length)
        return 2;
    if (correct >= 5)
        return 1.5;
    return 1;
}
/**
 * Apply available results to a slip's picks.
 * Picks for matches not in `resultsByMatchId` are left unscored.
 * Parlay multiplier is only computed when ALL picks are scored.
 */
function scoreSlip(picks, resultsByMatchId, totalPickCount) {
    const scored = picks.map((pick) => {
        const result = resultsByMatchId.get(String(pick.matchId));
        if (!result || !result.finished)
            return pick; // not finished yet
        return scoreOnePick(pick, result);
    });
    const scoredCount = scored.filter((p) => p.pointsEarned !== undefined).length;
    const allScored = scoredCount === totalPickCount;
    const rawPoints = scored.reduce((sum, p) => sum + (p.pointsEarned ?? 0), 0);
    const multiplier = allScored ? parlayMultiplier(scored) : 1;
    const totalPoints = parseFloat((rawPoints * multiplier).toFixed(1));
    return { picks: scored, rawPoints, parlayMultiplier: multiplier, totalPoints, scoredCount, allScored };
}
//# sourceMappingURL=slipScoring.js.map