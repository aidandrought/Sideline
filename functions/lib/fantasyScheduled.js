"use strict";
/**
 * functions/src/fantasyScheduled.ts
 *
 * Scheduled Cloud Function runners for the Sideline fantasy system.
 * These are pure runner functions — the onSchedule wrappers live in index.ts.
 *
 * runRefreshPlayerPool        — fetches player data from API and upserts Firestore player docs
 * runRefreshFixtures          — fetches upcoming fixtures and upserts gameweek docs
 * runProcessGameweekDeadline  — locks gameweeks whose deadlines have passed
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
exports.runRefreshPlayerPool = runRefreshPlayerPool;
exports.runRefreshFixtures = runRefreshFixtures;
exports.runProcessGameweekDeadline = runProcessGameweekDeadline;
const admin = __importStar(require("firebase-admin"));
// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_URL = 'https://v3.football.api-sports.io';
const FANTASY_COMPETITION_IDS = [39, 140, 78, 135, 61, 2, 3, 253, 1];
const BATCH_SIZE = 499;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function currentSeason() {
    const now = new Date();
    return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}
async function apiFetch(path, apiKey) {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'x-apisports-key': apiKey },
    });
    if (!res.ok)
        throw new Error(`API ${path} → ${res.status}`);
    const data = await res.json();
    if (data?.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
        throw new Error(`API ${path} → body errors: ${JSON.stringify(data.errors)}`);
    }
    return data;
}
function positionWeight(position) {
    switch (position?.toUpperCase()) {
        case 'GOALKEEPER':
        case 'GK': return 0;
        case 'DEFENDER':
        case 'DEF': return 0.3;
        case 'MIDFIELDER':
        case 'MID': return 0.5;
        case 'ATTACKER':
        case 'FWD': return 0.7;
        default: return 0.3;
    }
}
function normalizePosition(position) {
    switch (position?.toUpperCase()) {
        case 'GOALKEEPER': return 'GK';
        case 'DEFENDER': return 'DEF';
        case 'MIDFIELDER': return 'MID';
        case 'ATTACKER': return 'FWD';
        default: return 'MID';
    }
}
function calculatePrice(goalsPerGame, assistsPerGame, minutesPerGame, position) {
    const raw = 4.0 +
        0.6 * goalsPerGame +
        0.4 * assistsPerGame +
        0.2 * (minutesPerGame / 30) +
        positionWeight(position);
    return Math.round(Math.min(Math.max(raw, 4.0), 14.0) * 10) / 10;
}
async function runRefreshPlayerPool(db, apiKey) {
    const season = currentSeason();
    let totalUpdated = 0;
    let totalSkipped = 0;
    for (const competitionId of FANTASY_COMPETITION_IDS) {
        try {
            // Check if this league has player coverage
            await sleep(1100);
            const leagueData = await apiFetch(`/leagues?id=${competitionId}`, apiKey);
            const leagueInfo = leagueData?.response?.[0];
            const hasCoverage = leagueInfo?.coverage?.players === true;
            if (!hasCoverage) {
                console.log(`[refreshPlayerPool] competition=${competitionId} — no player coverage, skipping`);
                totalSkipped++;
                continue;
            }
            // Paginate through all players
            let page = 1;
            let totalPages = 1;
            const allPlayers = [];
            do {
                await sleep(1100);
                const playersData = await apiFetch(`/players?league=${competitionId}&season=${season}&page=${page}`, apiKey);
                const responseArray = playersData?.response ?? [];
                allPlayers.push(...responseArray);
                totalPages = playersData?.paging?.total ?? 1;
                page++;
            } while (page <= totalPages);
            console.log(`[refreshPlayerPool] competition=${competitionId} — fetched ${allPlayers.length} players`);
            // Write in batches of 499
            let batch = db.batch();
            let batchCount = 0;
            for (const entry of allPlayers) {
                const player = entry.player;
                if (!player?.id)
                    continue;
                // Find stats for this competition/season
                const stats = entry.statistics?.find((s) => s.league?.id === competitionId) ?? entry.statistics?.[0];
                if (!stats)
                    continue;
                const appearances = stats.games?.appearences ?? 0;
                const minutes = stats.games?.minutes ?? 0;
                const goals = stats.goals?.total ?? 0;
                const assists = stats.goals?.assists ?? 0;
                const position = stats.games?.position ?? 'Midfielder';
                const safeAppearances = appearances > 0 ? appearances : 1;
                const goalsPerGame = goals / safeAppearances;
                const assistsPerGame = assists / safeAppearances;
                const minutesPerGame = minutes / safeAppearances;
                const price = calculatePrice(goalsPerGame, assistsPerGame, minutesPerGame, position);
                const normalPos = normalizePosition(position);
                const nameParts = player.name?.split(' ') ?? [];
                const shortName = nameParts.length > 1
                    ? `${nameParts[0][0]}. ${nameParts[nameParts.length - 1]}`
                    : player.name;
                const docId = `${competitionId}_${player.id}`;
                const docRef = db.collection('players').doc(docId);
                batch.set(docRef, {
                    id: player.id,
                    name: player.name,
                    shortName: shortName ?? player.name,
                    position: normalPos,
                    clubId: stats.team?.id ?? 0,
                    clubName: stats.team?.name ?? '',
                    price,
                    currentPrice: price,
                    form: 0,
                    injuryStatus: null,
                    photoUrl: player.photo ?? `https://media.api-sports.io/football/players/${player.id}.png`,
                    searchKey: (player.name ?? '').toLowerCase(),
                    competitionId,
                    teamId: stats.team?.id ?? 0,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                batchCount++;
                totalUpdated++;
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            if (batchCount > 0) {
                await batch.commit();
            }
        }
        catch (err) {
            console.error(`[refreshPlayerPool] competition=${competitionId} error:`, err instanceof Error ? err.message : err);
        }
    }
    console.log(`[refreshPlayerPool] done — updated=${totalUpdated} skipped=${totalSkipped}`);
    return { updated: totalUpdated, skipped: totalSkipped };
}
function statusFromFixtures(fixtures, deadlinePassed) {
    const statuses = fixtures.map((f) => String(f.fixture?.status?.short ?? '').toUpperCase());
    const TERMINAL = new Set(['FT', 'AET', 'PEN']);
    const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
    if (statuses.every((s) => TERMINAL.has(s)))
        return 'finalized';
    if (statuses.some((s) => LIVE_STATUSES.has(s)))
        return 'live';
    if (deadlinePassed)
        return 'locked';
    return 'upcoming';
}
function isTournamentCompetition(competitionId) {
    // Tournament IDs: UCL=2, UEL=3, World Cup=1
    const tournaments = new Set([1, 2, 3]);
    return tournaments.has(competitionId);
}
function extractRoundNumber(roundLabel) {
    // "Regular Season - 12" → 12, "League Stage - 4" → 4
    const match = roundLabel.match(/[-–]\s*(\d+)\s*$/);
    if (match)
        return parseInt(match[1], 10);
    // "Matchday 5" → 5
    const matchday = roundLabel.match(/matchday\s+(\d+)/i);
    if (matchday)
        return parseInt(matchday[1], 10);
    // "Round of 16", "Quarter-finals", etc. — return null for tournaments
    return null;
}
async function runRefreshFixtures(db, apiKey) {
    const season = currentSeason();
    const now = new Date();
    const fromDate = now.toISOString().split('T')[0];
    const toDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let totalUpserted = 0;
    for (const competitionId of FANTASY_COMPETITION_IDS) {
        try {
            await sleep(1100);
            const data = await apiFetch(`/fixtures?league=${competitionId}&season=${season}&from=${fromDate}&to=${toDate}`, apiKey);
            const fixtures = data?.response ?? [];
            if (fixtures.length === 0)
                continue;
            // Group by round string
            const byRound = new Map();
            for (const fixture of fixtures) {
                const round = fixture.league?.round ?? 'Unknown';
                const existing = byRound.get(round) ?? [];
                existing.push(fixture);
                byRound.set(round, existing);
            }
            let batch = db.batch();
            let batchCount = 0;
            const nowMs = now.getTime();
            for (const [roundLabel, roundFixtures] of byRound.entries()) {
                const isTournament = isTournamentCompetition(competitionId);
                const roundNumber = isTournament
                    ? null
                    : extractRoundNumber(roundLabel);
                // Determine key: for regular leagues use numeric N; for tournaments use encoded round string
                const docKey = isTournament || roundNumber === null
                    ? `${competitionId}_${roundLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}`
                    : `${competitionId}_${roundNumber}`;
                // Sort fixtures by date to find first/last kickoffs
                const sorted = [...roundFixtures].sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());
                const firstKickoff = sorted[0]?.fixture?.date ?? null;
                const lastKickoff = sorted[sorted.length - 1]?.fixture?.date ?? null;
                // Deadline = 1 hour before first fixture
                const deadlineMs = firstKickoff
                    ? new Date(firstKickoff).getTime() - 60 * 60 * 1000
                    : null;
                const deadline = deadlineMs ? new Date(deadlineMs).toISOString() : null;
                const deadlinePassed = deadlineMs != null && nowMs >= deadlineMs;
                const status = statusFromFixtures(roundFixtures, deadlinePassed);
                const fixtureIds = roundFixtures.map((f) => f.fixture.id);
                const docRef = db.collection('gameweeks').doc(docKey);
                batch.set(docRef, {
                    competitionId,
                    competitionGroup: isTournament ? 'tournament' : 'league',
                    number: roundNumber,
                    apiRoundLabel: roundLabel,
                    firstFixtureKickoff: firstKickoff,
                    lastFixtureKickoff: lastKickoff,
                    deadline,
                    status,
                    fixtureIds,
                    apiSeason: season,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                batchCount++;
                totalUpserted++;
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            if (batchCount > 0) {
                await batch.commit();
            }
        }
        catch (err) {
            console.error(`[refreshFixtures] competition=${competitionId} error:`, err instanceof Error ? err.message : err);
        }
    }
    console.log(`[refreshFixtures] done — upserted=${totalUpserted}`);
    return { upserted: totalUpserted };
}
async function runProcessGameweekDeadline(db) {
    const now = new Date();
    // Find upcoming gameweeks whose deadline has passed
    const gwSnap = await db
        .collection('gameweeks')
        .where('status', '==', 'upcoming')
        .get();
    const toProcess = gwSnap.docs.filter((doc) => {
        const deadline = doc.data()?.deadline ?? null;
        if (!deadline)
            return false;
        return new Date(deadline).getTime() <= now.getTime();
    });
    if (toProcess.length === 0)
        return { locked: 0 };
    let lockedCount = 0;
    for (const gwDoc of toProcess) {
        const gwId = gwDoc.id;
        const gwData = gwDoc.data();
        const competitionId = gwData?.competitionId ?? null;
        try {
            // Find all leagues in this competition
            const leaguesSnap = competitionId != null
                ? await db.collection('fantasyLeagues').where('competitionId', '==', competitionId).get()
                : await db.collection('fantasyLeagues').get();
            if (leaguesSnap.empty) {
                // Still lock the gameweek even with no leagues
                await db.collection('gameweeks').doc(gwId).update({
                    status: 'locked',
                    lockedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                lockedCount++;
                continue;
            }
            // Collect all team IDs across leagues
            const teamIds = [];
            for (const leagueDoc of leaguesSnap.docs) {
                const members = leagueDoc.data()?.members ?? [];
                for (const uid of members) {
                    teamIds.push(`${uid}_${leagueDoc.id}`);
                }
            }
            // Fetch team docs (chunked to avoid Firestore getAll limit)
            const CHUNK_SIZE = 100;
            const teamDocs = [];
            for (let i = 0; i < teamIds.length; i += CHUNK_SIZE) {
                const chunk = teamIds.slice(i, i + CHUNK_SIZE);
                const refs = chunk.map((id) => db.collection('fantasyTeams').doc(id));
                const snaps = await db.getAll(...refs);
                teamDocs.push(...snaps);
            }
            // Write all snapshots + lock in batches
            let batch = db.batch();
            let batchCount = 0;
            // Lock the gameweek doc
            batch.update(db.collection('gameweeks').doc(gwId), {
                status: 'locked',
                lockedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            batchCount++;
            // Snapshot each team's squad
            for (const teamSnap of teamDocs) {
                if (!teamSnap.exists)
                    continue;
                const teamData = teamSnap.data();
                const teamId = teamSnap.id;
                const squad = teamData?.squad ?? [];
                const starters = squad
                    .filter((p) => !p.isBench)
                    .map((p) => ({
                    playerId: p.playerId,
                    isCaptain: p.isCaptain ?? false,
                    isVice: p.isVice ?? false,
                    multiplier: p.isCaptain ? 2 : p.isVice ? 1 : 1,
                }));
                const bench = squad
                    .filter((p) => p.isBench)
                    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
                    .map((p, i) => ({
                    playerId: p.playerId,
                    order: p.order ?? i,
                }));
                const snapshotRef = db
                    .collection('gameweeks')
                    .doc(gwId)
                    .collection('squadSnapshots')
                    .doc(teamId);
                batch.set(snapshotRef, {
                    teamId,
                    userId: teamData?.userId ?? '',
                    starters,
                    bench,
                    formation: teamData?.formation ?? null,
                    chipActive: teamData?.activeChip ?? null,
                    snapshotAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                batchCount++;
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            if (batchCount > 0) {
                await batch.commit();
            }
            lockedCount++;
            console.log(`[processDeadline] Locked gameweek=${gwId}, snapshots=${teamDocs.filter((d) => d.exists).length}`);
        }
        catch (err) {
            console.error(`[processDeadline] gameweek=${gwId} error:`, err instanceof Error ? err.message : err);
        }
    }
    return { locked: lockedCount };
}
//# sourceMappingURL=fantasyScheduled.js.map