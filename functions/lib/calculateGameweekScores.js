"use strict";
/**
 * functions/src/calculateGameweekScores.ts
 *
 * HTTP-callable Cloud Function.
 *
 * Request body:
 *   {
 *     leagueId : number,   // API-Football league ID  e.g. 39 (EPL)
 *     season   : number,   // e.g. 2024
 *     round    : string,   // API-Football round string e.g. "Regular Season - 12"
 *                          // OR pass roundNumber (integer) to auto-build the string
 *     roundNumber?: number // convenience — if provided, round is built automatically
 *   }
 *
 * Firestore writes:
 *   playerScores/{gameweekKey}/players/{playerId}
 *   where gameweekKey = "{leagueId}_GW{roundNumber}_{season}"  e.g. "39_GW12_2024"
 *
 * Also writes a summary document at:
 *   playerScores/{gameweekKey}   (metadata + flat map for quick reads)
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
exports.runCalculateGameweekScores = runCalculateGameweekScores;
const admin = __importStar(require("firebase-admin"));
const scoring_1 = require("./scoring");
// ─── API helpers ─────────────────────────────────────────────────────────────
const API_BASE = 'https://v3.football.api-sports.io';
const RATE_DELAY = 1100; // ms between requests — stays under 60 req/min
function apiKey() {
    const key = process.env.FOOTBALL_API_KEY;
    if (!key)
        throw new Error('FOOTBALL_API_KEY environment variable not set');
    return key;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function apiFetch(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'x-apisports-key': apiKey() },
    });
    if (!res.ok) {
        throw new Error(`API-Football ${path} → HTTP ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) {
        throw new Error(`API-Football errors: ${JSON.stringify(json.errors)}`);
    }
    return json.response;
}
// ─── Fetch fixtures for the given round ──────────────────────────────────────
async function fetchFinishedFixtures(leagueId, season, round) {
    const encoded = encodeURIComponent(round);
    const fixtures = await apiFetch(`/fixtures?league=${leagueId}&season=${season}&round=${encoded}`);
    // Only process fully-finished fixtures
    return fixtures.filter((f) => f.fixture.status.short === 'FT');
}
// ─── Fetch player stats for a single fixture ─────────────────────────────────
async function fetchFixturePlayers(fixtureId) {
    // Response is [{team, players: [{player, statistics}]}]
    const teamArrays = await apiFetch(`/fixtures/players?fixture=${fixtureId}`);
    return teamArrays.flatMap((t) => t.players);
}
// ─── Map API stat entry → PlayerMatchStats ────────────────────────────────────
function mapStatEntry(entry, teamGoalsConceded) {
    const stats = entry.statistics[0];
    if (!stats)
        return null;
    const minutes = stats.games.minutes ?? 0;
    const rating = stats.games.rating ? parseFloat(stats.games.rating) : null;
    const position = (0, scoring_1.normalizePosition)(stats.games.position);
    const playedEnoughForCleanSheet = minutes >= 60;
    const cleanSheet = playedEnoughForCleanSheet && teamGoalsConceded === 0;
    return {
        playerId: entry.player.id,
        playerName: entry.player.name,
        position,
        minutesPlayed: minutes,
        rating,
        goals: stats.goals.total ?? 0,
        assists: stats.goals.assists ?? 0,
        teamGoalsConceded,
        cleanSheet,
        yellowCards: stats.cards.yellow ?? 0,
        redCards: stats.cards.red ?? 0,
        penaltySaved: stats.penalty.saved ?? 0,
        penaltyMissed: stats.penalty.missed ?? 0,
        ownGoals: stats.goals.owngoals ?? 0,
        saves: stats.goals.saves ?? 0,
    };
}
// ─── Main handler (exported separately so it can be unit-tested) ──────────────
async function runCalculateGameweekScores(data, db) {
    const { leagueId, season } = data;
    // Build round string — accept either the full string or a round number
    let round;
    if (data.round) {
        round = data.round;
    }
    else if (data.roundNumber != null) {
        round = `Regular Season - ${data.roundNumber}`;
    }
    else {
        throw new Error('Provide either `round` (string) or `roundNumber` (integer)');
    }
    // Extract a numeric gameweek for keying (works for "Regular Season - 12" etc.)
    const gwMatch = round.match(/(\d+)\s*$/);
    const roundNumber = gwMatch ? parseInt(gwMatch[1], 10) : 1;
    const gameweekKey = `${leagueId}_GW${String(roundNumber).padStart(2, '0')}_${season}`;
    console.log(`[calculateGameweekScores] Starting — key=${gameweekKey} round="${round}"`);
    // ── 1. Get finished fixtures ─────────────────────────────────────────────
    const fixtures = await fetchFinishedFixtures(leagueId, season, round);
    if (fixtures.length === 0) {
        console.log('[calculateGameweekScores] No finished fixtures found — exiting');
        return { gameweekKey, playersScored: 0, fixturesProcessed: 0 };
    }
    console.log(`[calculateGameweekScores] ${fixtures.length} finished fixture(s)`);
    // ── 2. Score each fixture ─────────────────────────────────────────────────
    const allScores = new Map(); // playerId → best score (handles dups)
    for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        const fId = fixture.fixture.id;
        console.log(`  Fixture ${i + 1}/${fixtures.length}: id=${fId} ` +
            `${fixture.teams.home.name} ${fixture.teams.home.goals ?? '?'}-` +
            `${fixture.teams.away.goals ?? '?'} ${fixture.teams.away.name}`);
        const homeGoals = fixture.teams.home.goals ?? 0;
        const awayGoals = fixture.teams.away.goals ?? 0;
        let playerEntries;
        try {
            playerEntries = await fetchFixturePlayers(fId);
        }
        catch (err) {
            console.warn(`  ⚠️  Could not fetch players for fixture ${fId}: ${err.message}`);
            if (i < fixtures.length - 1)
                await sleep(RATE_DELAY);
            continue;
        }
        for (const entry of playerEntries) {
            // Determine which team this player is on by checking if his team is home/away.
            // API returns players grouped by team; we need goals conceded for that team.
            // We use the goals object — if the player appears in a fixture, we resolve
            // his team's conceded from fixture-level score.
            // NOTE: The fixture/players response groups by team, so we key off team id
            // if it's provided. Since we flattened, we'll compute conceded separately.
            // Workaround: compute from fixture score after we look up what team the player is on.
            // The simplest safe approach: both home & away conceded goals are known from
            // the fixture record; we determine via the `statistics[0].team.id` field.
            // (We access team id via the raw entry if present.)
            const rawEntry = entry;
            const teamId = rawEntry.statistics[0]?.team?.id;
            let conceded;
            if (teamId === fixture.teams.home.id) {
                conceded = awayGoals; // home team conceded = away goals scored
            }
            else if (teamId === fixture.teams.away.id) {
                conceded = homeGoals; // away team conceded = home goals scored
            }
            else {
                // Team id unavailable — use lower of the two as a safe fallback
                conceded = Math.min(homeGoals, awayGoals);
            }
            const mapped = mapStatEntry(entry, conceded);
            if (!mapped)
                continue;
            const score = (0, scoring_1.calculatePlayerPoints)(mapped, leagueId);
            allScores.set(score.playerId, score);
        }
        if (i < fixtures.length - 1)
            await sleep(RATE_DELAY);
    }
    // ── 3. Write to Firestore ─────────────────────────────────────────────────
    // Structure:
    //   playerScores/{gameweekKey}               ← summary metadata document
    //   playerScores/{gameweekKey}/players/{id}  ← per-player score document
    const gwRef = db.collection('playerScores').doc(gameweekKey);
    const playersCol = gwRef.collection('players');
    // Flat map for the summary doc (quick lookup: playerId → points)
    const pointsMap = {};
    for (const [id, score] of allScores) {
        pointsMap[String(id)] = score.points;
    }
    // Batch-write individual player docs (Firestore limit: 500 ops/batch)
    const scoreArray = Array.from(allScores.values());
    const BATCH_SIZE = 499;
    for (let i = 0; i < scoreArray.length; i += BATCH_SIZE) {
        const chunk = scoreArray.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const score of chunk) {
            batch.set(playersCol.doc(String(score.playerId)), {
                playerId: score.playerId,
                playerName: score.playerName,
                position: score.position,
                points: score.points,
                rating: score.rating,
                goals: score.goals,
                assists: score.assists,
                cleanSheet: score.cleanSheet,
                bonusBreakdown: score.bonusBreakdown,
                scoredAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
        console.log(`  Wrote batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} players)`);
    }
    // Write summary metadata document
    await gwRef.set({
        gameweekKey,
        leagueId,
        season,
        round,
        roundNumber,
        playersScored: allScores.size,
        fixturesProcessed: fixtures.length,
        pointsMap, // flat Record<playerId, points> for O(1) team-score lookups
        calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[calculateGameweekScores] Done — ${allScores.size} players scored ` +
        `across ${fixtures.length} fixture(s). Key: ${gameweekKey}`);
    return { gameweekKey, playersScored: allScores.size, fixturesProcessed: fixtures.length };
}
//# sourceMappingURL=calculateGameweekScores.js.map