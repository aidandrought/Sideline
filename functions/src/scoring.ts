/**
 * functions/src/scoring.ts
 *
 * Pure fantasy-points calculation — no Firebase or API dependencies.
 * Every rule from the spec lives here so the logic is testable in isolation.
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PlayerMatchStats {
  playerId: number;
  playerName: string;
  position: Position;
  minutesPlayed: number;
  rating: number | null;      // null = did not play / no data
  goals: number;
  assists: number;
  /** Goals the player's team conceded while he was on the pitch (GK/DEF use this) */
  teamGoalsConceded: number;
  /** Minutes the player was on pitch (used for full-game clean sheet check) */
  cleanSheet: boolean;        // true = played full 90+ AND team conceded 0
  yellowCards: number;
  redCards: number;
  penaltySaved: number;
  penaltyMissed: number;
  ownGoals: number;
  saves: number;
}

export interface BonusItem {
  type: string;
  value: number;
  description: string;
}

export interface PlayerScore {
  playerId: number;
  playerName: string;
  position: Position;
  points: number;             // rounded to 1 dp
  rating: number | null;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  bonusBreakdown: BonusItem[];
}

// ─── Tournament competition IDs that award the 1.5× goal/assist multiplier ───

export const TOURNAMENT_COMPETITION_IDS = new Set([
  1,   // FIFA World Cup
  4,   // UEFA European Championship (Euros)
  9,   // Copa América
  10,  // AFC Asian Cup
  34,  // Africa Cup of Nations
]);

// ─── Main scoring function ───────────────────────────────────────────────────

export function calculatePlayerPoints(
  stats: PlayerMatchStats,
  competitionId?: number,
): PlayerScore {
  if (stats.minutesPlayed === 0) {
    return {
      playerId:      stats.playerId,
      playerName:    stats.playerName,
      position:      stats.position,
      points:        0,
      rating:        stats.rating,
      goals:         stats.goals,
      assists:       stats.assists,
      cleanSheet:    stats.cleanSheet,
      bonusBreakdown: [],
    };
  }

  const r   = stats.rating;
  const pos = stats.position;
  const bonuses: BonusItem[] = [];

  const appearance = stats.minutesPlayed >= 60 ? 2 : 1;
  bonuses.push({
    type: 'appearance',
    value: appearance,
    description: stats.minutesPlayed >= 60 ? 'Played 60+ minutes' : 'Played 1-59 minutes',
  });

  const isTournament = competitionId !== undefined && TOURNAMENT_COMPETITION_IDS.has(competitionId);

  // ── Goals ─────────────────────────────────────────────────────────────────
  if (stats.goals > 0) {
    // Per spec: GK=10, DEF=6, MID=6, FWD=6
    const baseGoalBonus =
      pos === 'GK'  ? 10 :
      6; // DEF, MID, FWD all score 6pts per goal
    const goalBonus = isTournament ? baseGoalBonus * 1.5 : baseGoalBonus;
    const total = stats.goals * goalBonus;
    bonuses.push({
      type: 'goal',
      value: total,
      description: isTournament
        ? `${stats.goals} goal${stats.goals > 1 ? 's' : ''} (${pos} ×${baseGoalBonus} ×1.5 tournament)`
        : `${stats.goals} goal${stats.goals > 1 ? 's' : ''} (${pos} ×${baseGoalBonus})`,
    });
  }

  // ── Assists ───────────────────────────────────────────────────────────────
  if (stats.assists > 0) {
    const baseAssistBonus = 3;
    const assistBonus = isTournament ? baseAssistBonus * 1.5 : baseAssistBonus;
    const total = stats.assists * assistBonus;
    bonuses.push({
      type: 'assist',
      value: total,
      description: isTournament
        ? `${stats.assists} assist${stats.assists > 1 ? 's' : ''} (×3 ×1.5 tournament)`
        : `${stats.assists} assist${stats.assists > 1 ? 's' : ''} (×3)`,
    });
  }

  // ── Clean sheet (full game) ───────────────────────────────────────────────
  if (stats.cleanSheet) {
    const csBonus =
      pos === 'GK' || pos === 'DEF' ? 4 :
      pos === 'MID'                  ? 1 :
      0; // FWD — no CS bonus
    if (csBonus > 0) {
      bonuses.push({
        type: 'cleanSheet',
        value: csBonus,
        description: `Clean sheet (${pos})`,
      });
    }
  }

  if ((pos === 'GK' || pos === 'DEF') && stats.teamGoalsConceded > 0) {
    const concededPenalty = -Math.floor(stats.teamGoalsConceded / 2);
    if (concededPenalty < 0) {
      bonuses.push({
        type: 'goalsConceded',
        value: concededPenalty,
        description: `${stats.teamGoalsConceded} goals conceded`,
      });
    }
  }

  if (pos === 'GK' && stats.saves > 0) {
    const savePoints = Math.floor(stats.saves / 3);
    if (savePoints > 0) {
      bonuses.push({
        type: 'saves',
        value: savePoints,
        description: `${stats.saves} saves`,
      });
    }
  }

  // ── Penalty save ──────────────────────────────────────────────────────────
  if (stats.penaltySaved > 0) {
    const total = stats.penaltySaved * 5;
    bonuses.push({
      type: 'penaltySaved',
      value: total,
      description: `${stats.penaltySaved} penalty save${stats.penaltySaved > 1 ? 's' : ''} (×5)`,
    });
  }

  // ── Penalty miss ─────────────────────────────────────────────────────────
  if (stats.penaltyMissed > 0) {
    const total = stats.penaltyMissed * -2;
    bonuses.push({
      type: 'penaltyMissed',
      value: total,
      description: `${stats.penaltyMissed} penalty miss${stats.penaltyMissed > 1 ? 'es' : ''} (×−3)`,
    });
  }

  // ── Yellow card ───────────────────────────────────────────────────────────
  if (stats.yellowCards > 0) {
    if (stats.redCards > 0) {
      // Red replaces yellow-card deduction in Sideline's FPL-style rules.
    } else {
    const total = stats.yellowCards * -1;
    bonuses.push({
      type: 'yellowCard',
      value: total,
      description: `${stats.yellowCards} yellow card${stats.yellowCards > 1 ? 's' : ''} (×−1)`,
    });
    }
  }

  // ── Red card ──────────────────────────────────────────────────────────────
  if (stats.redCards > 0) {
    const total = stats.redCards * -3;
    bonuses.push({
      type: 'redCard',
      value: total,
      description: `${stats.redCards} red card${stats.redCards > 1 ? 's' : ''} (×−4)`,
    });
  }

  // ── Own goal ─────────────────────────────────────────────────────────────
  if (stats.ownGoals > 0) {
    const total = stats.ownGoals * -2;
    bonuses.push({
      type: 'ownGoal',
      value: total,
      description: `${stats.ownGoals} own goal${stats.ownGoals > 1 ? 's' : ''} (×−3)`,
    });
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  const bonusTotal = bonuses.reduce((sum, b) => sum + b.value, 0);
  const raw        = bonusTotal;
  const points     = Math.round(raw * 10) / 10; // 1 decimal place

  return {
    playerId:      stats.playerId,
    playerName:    stats.playerName,
    position:      stats.position,
    points:        Math.max(0, points), // floor at 0 — no negative totals
    rating:        r,
    goals:         stats.goals,
    assists:       stats.assists,
    cleanSheet:    stats.cleanSheet,
    bonusBreakdown: bonuses,
  };
}

// ─── Position normalisation (mirrors seedPlayers.js) ─────────────────────────

export function normalizePosition(apiPosition: string | null | undefined): Position {
  if (!apiPosition) return 'MID';
  const p = apiPosition.toLowerCase().trim();
  if (p.includes('goal'))    return 'GK';
  if (p.includes('defend'))  return 'DEF';
  if (p.includes('midfield') || p === 'mid') return 'MID';
  if (p.includes('attack') || p.includes('forward') || p.includes('striker') || p.includes('winger')) return 'FWD';
  return 'MID';
}
