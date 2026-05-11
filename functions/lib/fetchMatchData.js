"use strict";
/**
 * functions/src/fetchMatchData.ts
 *
 * Scheduled Cloud Functions that fetch live/upcoming/results from the
 * Football API and store them in Firestore so ALL app clients read from
 * a single, server-managed source instead of each device hitting the API.
 *
 * Firestore documents written:
 *   appData/live      → { matches: AppMatch[], updatedAt }   — every 2 min
 *   appData/upcoming  → { matches: AppMatch[], updatedAt }   — every 30 min
 *   appData/results   → { matches: AppMatch[], updatedAt }   — every 30 min
 *
 * Client reads these docs and falls back to the legacy direct-API path only
 * when the Firestore doc is missing or stale (> 2× its intended refresh period).
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
exports.runFetchLive = runFetchLive;
exports.runFetchMatchDetail = runFetchMatchDetail;
exports.runFetchUpcoming = runFetchUpcoming;
exports.runFetchResults = runFetchResults;
const admin = __importStar(require("firebase-admin"));
// ─── Competition IDs mirrored from constants/footballCompetitions.ts ──────────
// Update here whenever footballCompetitions.ts changes.
const CORE_LEAGUE_IDS = [
    39, // Premier League
    140, // La Liga
    135, // Serie A
    78, // Bundesliga
    61, // Ligue 1
    88, // Eredivisie
    94, // Primeira Liga
    253, // MLS
    262, // Liga MX
    203, // Süper Lig
    144, // Jupiler Pro League
    307, // Saudi Pro League
    128, // Liga Profesional Argentina
    71, // Brasileirao
    239, // SPL (Scottish Premiership)
];
const TOURNAMENT_IDS = [
    2, // UCL
    3, // Europa League
    848, // Conference League
    45, // FA Cup
    48, // League Cup
    143, // Copa del Rey
    137, // Coppa Italia
    81, // DFB Pokal
    66, // Coupe de France
    16, // CONCACAF Champions
    531, // UEFA Super Cup
    528, // Community Shield
    556, // Supercopa de Espana
    547, // Supercoppa Italiana
    1, // FIFA World Cup
    15, // Club World Cup
];
const ALL_COMPETITION_IDS = [...new Set([...CORE_LEAGUE_IDS, ...TOURNAMENT_IDS])];
// Blocked keywords — mirrors FootballAPI.blockedKeywords
const BLOCKED_KEYWORDS = [
    'u21', 'u20', 'u19', 'u18', 'u17', 'u16', 'u15', 'u23',
    'youth', 'reserve', 'reserves', 'women', 'ladies', 'female',
    'friendly', 'pre-season', 'preseason', 'exhibition',
    'ii ', ' ii', ' b ', 'b team', 'segunda', 'third division', 'fourth division',
    'amateur', 'regional', 'academy',
    'africa cup', 'afcon', // AFCON removed from app per product decision
    'qualifier', 'qualification', // remove qualifier competitions for now
    'national league', // blocks lower-tier English National League
];
function isBlocked(name) {
    const lower = name.toLowerCase();
    return BLOCKED_KEYWORDS.some((kw) => lower.includes(kw));
}
// ─── Shared API fetch helper ───────────────────────────────────────────────────
const BASE_URL = 'https://v3.football.api-sports.io';
async function apiFetch(endpoint, apiKey) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'x-apisports-key': apiKey },
    });
    if (!res.ok)
        throw new Error(`API ${endpoint} → ${res.status}`);
    const data = await res.json();
    // api-sports.io returns HTTP 200 even for key/quota errors — surface them
    if (data?.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
        throw new Error(`API ${endpoint} → body errors: ${JSON.stringify(data.errors)}`);
    }
    return data;
}
function formatFixture(f, status) {
    const home = f?.teams?.home;
    const away = f?.teams?.away;
    const fix = f?.fixture;
    const lg = f?.league;
    if (!home?.name || !away?.name || !fix?.id)
        return null;
    const leagueId = Number(lg?.id);
    const homeNational = Boolean(home?.national);
    const awayNational = Boolean(away?.national);
    const isNationalTeamFixture = homeNational || awayNational;
    const isWorldCupFixture = leagueId === 1;
    if (isBlocked(home.name) || isBlocked(away.name) || isBlocked(lg?.name ?? ''))
        return null;
    if (isNationalTeamFixture && !isWorldCupFixture)
        return null;
    const homeGoals = f?.goals?.home;
    const awayGoals = f?.goals?.away;
    return {
        id: fix.id,
        home: home.name,
        away: away.name,
        homeShortName: home.shortName || undefined,
        awayShortName: away.shortName || undefined,
        homeLogo: home.logo || `https://media.api-sports.io/football/teams/${home.id}.png`,
        awayLogo: away.logo || `https://media.api-sports.io/football/teams/${away.id}.png`,
        homeId: home.id,
        awayId: away.id,
        leagueId: lg?.id,
        league: lg?.name ?? '',
        leagueLogo: lg?.logo || undefined,
        score: homeGoals != null && awayGoals != null ? `${homeGoals}-${awayGoals}` : undefined,
        status,
        minute: fix?.status?.elapsed ? `${fix.status.elapsed}'` : undefined,
        date: fix.date,
        venueName: fix?.venue?.name || undefined,
    };
}
const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const mapFixtureStatus = (fixture) => {
    const short = String(fixture?.fixture?.status?.short || '').toUpperCase();
    if (TERMINAL_STATUSES.has(short))
        return 'finished';
    if (short === 'NS' || short === 'TBD' || short === 'PST')
        return 'upcoming';
    return 'live';
};
async function upsertMatchDetailCache(db, fixture, detail, options = {}) {
    const fixtureId = Number(fixture?.fixture?.id);
    if (!Number.isFinite(fixtureId))
        return;
    const payload = {
        fixtureId,
        status: mapFixtureStatus(fixture),
        fixture,
        events: detail.events || [],
        statistics: detail.statistics || [],
        lineups: detail.lineups || [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(options.finalized ? { finalizedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    };
    await db.collection('matchDetailCache').doc(String(fixtureId)).set(payload, { merge: true });
}
async function readExistingDetail(db, fixtureId) {
    try {
        const snap = await db.collection('matchDetailCache').doc(String(fixtureId)).get();
        if (!snap.exists)
            return null;
        return snap.data();
    }
    catch {
        return null;
    }
}
async function fetchLiveFixtureDetail(db, apiKey, fixture) {
    const fixtureId = Number(fixture?.fixture?.id);
    if (!Number.isFinite(fixtureId)) {
        return { events: [], statistics: [], lineups: [] };
    }
    const existing = await readExistingDetail(db, fixtureId);
    const [eventsData, statisticsData, lineupsData] = await Promise.all([
        apiFetch(`/fixtures/events?fixture=${fixtureId}`, apiKey).catch(() => null),
        apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, apiKey).catch(() => null),
        existing?.lineups && existing.lineups.length >= 2
            ? Promise.resolve({ response: existing.lineups })
            : apiFetch(`/fixtures/lineups?fixture=${fixtureId}`, apiKey).catch(() => null),
    ]);
    return {
        events: eventsData?.response ?? existing?.events ?? [],
        statistics: statisticsData?.response ?? existing?.statistics ?? [],
        lineups: lineupsData?.response ?? existing?.lineups ?? [],
    };
}
async function mergeFinishedMatchesIntoResults(db, matches) {
    if (matches.length === 0)
        return;
    const resultsRef = db.collection('appData').doc('results');
    const snap = await resultsRef.get();
    const existing = (snap.data()?.matches || []);
    const byId = new Map();
    matches.forEach((match) => byId.set(match.id, match));
    existing.forEach((match) => {
        if (!match?.id || byId.has(match.id))
            return;
        byId.set(match.id, match);
    });
    const merged = Array.from(byId.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 300);
    await resultsRef.set({
        matches: merged,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        count: merged.length,
    }, { merge: true });
}
// ─── fetchLiveMatches ─────────────────────────────────────────────────────────
// Returns true when there are likely live games right now, based on the
// Firestore upcoming schedule. Avoids burning API quota during dead hours.
async function hasLikelyLiveGames(db, prevLiveCount) {
    // If games were live last run, keep polling until they clear
    if (prevLiveCount > 0)
        return true;
    // Check if any upcoming game kicked off in the last 3 hours, or starts in the next 30 min
    const now = Date.now();
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    const THIRTY_MIN_MS = 30 * 60 * 1000;
    try {
        const snap = await db.collection('appData').doc('upcoming').get();
        const upcoming = (snap.data()?.matches ?? []);
        return upcoming.some((m) => {
            const kickoff = new Date(m.date).getTime();
            return kickoff <= now + THIRTY_MIN_MS && kickoff >= now - THREE_HOURS_MS;
        });
    }
    catch {
        return true; // if we can't check, be safe and poll
    }
}
async function runFetchLive(db, apiKey) {
    const previousLiveSnap = await db.collection('appData').doc('live').get();
    const previousLive = (previousLiveSnap.data()?.matches || [])
        .filter((match) => match?.id);
    // Skip the expensive API call when no games are expected to be live.
    // This is the primary API quota saver — most hours of the day have no live games.
    const shouldPoll = await hasLikelyLiveGames(db, previousLive.length);
    if (!shouldPoll) {
        console.log('[fetchLive] no games expected live — skipping API call');
        return 0;
    }
    const data = await apiFetch('/fixtures?live=all', apiKey);
    const fixtures = data?.response ?? [];
    const matches = [];
    const currentLiveIds = new Set();
    for (const f of fixtures) {
        if (!ALL_COMPETITION_IDS.includes(f?.league?.id))
            continue;
        const m = formatFixture(f, 'live');
        if (m) {
            matches.push(m);
            currentLiveIds.add(m.id);
        }
    }
    const candidatesToFinalize = previousLive.filter((match) => !currentLiveIds.has(match.id));
    const finalizedMatches = [];
    await Promise.allSettled(candidatesToFinalize.map(async (match) => {
        try {
            const fixtureData = await apiFetch(`/fixtures?id=${match.id}`, apiKey);
            const fixture = fixtureData?.response?.[0];
            if (!fixture)
                return;
            const short = String(fixture?.fixture?.status?.short || '').toUpperCase();
            if (!TERMINAL_STATUSES.has(short))
                return;
            const detail = await fetchLiveFixtureDetail(db, apiKey, fixture);
            await upsertMatchDetailCache(db, fixture, detail, { finalized: true });
            const finishedMatch = formatFixture(fixture, 'finished');
            if (finishedMatch) {
                finalizedMatches.push(finishedMatch);
            }
        }
        catch {
            // Let the low-frequency results repair job backfill if this misses.
        }
    }));
    await db.collection('appData').doc('live').set({
        matches,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        count: matches.length,
    });
    await mergeFinishedMatchesIntoResults(db, finalizedMatches);
    console.log(`[fetchLive] stored ${matches.length} live matches`);
    return matches.length;
}
const LIVE_DETAIL_STALE_MS = 45 * 1000;
const FINAL_DETAIL_STALE_MS = 24 * 60 * 60 * 1000;
const isMatchDetailFresh = (data) => {
    if (!data)
        return false;
    const updatedAt = data?.updatedAt?.toMillis?.() ?? 0;
    const finalizedAt = data?.finalizedAt?.toMillis?.() ?? 0;
    if (!updatedAt)
        return false;
    if (finalizedAt) {
        return Date.now() - updatedAt <= FINAL_DETAIL_STALE_MS;
    }
    return Date.now() - updatedAt <= LIVE_DETAIL_STALE_MS;
};
async function runFetchMatchDetail(db, apiKey, fixtureId, options = {}) {
    const existingSnap = await db.collection('matchDetailCache').doc(String(fixtureId)).get();
    const existingData = existingSnap.exists ? existingSnap.data() : null;
    if (!options.force && isMatchDetailFresh(existingData)) {
        return {
            fixtureId,
            cacheHit: true,
            refreshed: false,
            status: existingData?.status ?? null,
        };
    }
    const fixtureData = await apiFetch(`/fixtures?id=${fixtureId}`, apiKey);
    const fixture = fixtureData?.response?.[0];
    if (!fixture) {
        throw new Error(`Fixture ${fixtureId} not found`);
    }
    const status = mapFixtureStatus(fixture);
    const shouldFetchHeavy = status === 'live' || options.force || !existingData;
    let detail = {
        events: existingData?.events || [],
        statistics: existingData?.statistics || [],
        lineups: existingData?.lineups || [],
    };
    if (shouldFetchHeavy) {
        detail = await fetchLiveFixtureDetail(db, apiKey, fixture);
    }
    await upsertMatchDetailCache(db, fixture, detail, {
        finalized: status === 'finished',
    });
    if (status === 'finished') {
        const finished = formatFixture(fixture, 'finished');
        if (finished) {
            await mergeFinishedMatchesIntoResults(db, [finished]);
        }
    }
    return {
        fixtureId,
        cacheHit: false,
        refreshed: true,
        status,
    };
}
// ─── fetchUpcomingMatches ─────────────────────────────────────────────────────
// Fetches the next 14 days for every competition in parallel (batched to avoid
// exhausting the API rate limit — API-Sports free tier = 100 req/day).
// Strategy: use /fixtures?date=YYYY-MM-DD for today + next 13 days, which is
// 14 calls total (vs. 1 call per competition × 40+ competitions).
async function runFetchUpcoming(db, apiKey) {
    const dates = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }
    const allFixtures = [];
    // Fetch dates in groups of 5 (parallel) to stay within timeouts
    for (let i = 0; i < dates.length; i += 5) {
        const batch = dates.slice(i, i + 5);
        const results = await Promise.allSettled(batch.map((date) => apiFetch(`/fixtures?date=${date}&status=NS`, apiKey)));
        for (const r of results) {
            if (r.status === 'fulfilled')
                allFixtures.push(...(r.value?.response ?? []));
        }
    }
    // Deduplicate by fixture id
    const seen = new Set();
    const matches = [];
    for (const f of allFixtures) {
        if (!ALL_COMPETITION_IDS.includes(f?.league?.id))
            continue;
        if (seen.has(f?.fixture?.id))
            continue;
        seen.add(f.fixture.id);
        const m = formatFixture(f, 'upcoming');
        if (m)
            matches.push(m);
    }
    // Sort chronologically
    matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // Firestore doc size limit is ~1 MB; 300 matches ≈ 150 KB — safe
    const limited = matches.slice(0, 300);
    // Never overwrite with empty data — quota failures return zero fixtures, which
    // would wipe out good data that's already in Firestore.
    if (limited.length === 0) {
        console.log('[fetchUpcoming] no fixtures returned — skipping Firestore write to preserve existing data');
        return 0;
    }
    await db.collection('appData').doc('upcoming').set({
        matches: limited,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        count: limited.length,
    });
    console.log(`[fetchUpcoming] stored ${limited.length} upcoming matches`);
    return limited.length;
}
// ─── fetchResultsMatches ──────────────────────────────────────────────────────
// Fetches finished matches for the past 7 days (7 API calls by date).
async function runFetchResults(db, apiKey) {
    const dates = [];
    for (let i = 0; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    const allFixtures = [];
    // Fetch all dates in parallel — include AET and PEN so extra-time/penalty
    // results aren't silently dropped alongside standard FT matches
    const results = await Promise.allSettled(dates.map((date) => apiFetch(`/fixtures?date=${date}&status=FT-AET-PEN`, apiKey)));
    for (const r of results) {
        if (r.status === 'fulfilled')
            allFixtures.push(...(r.value?.response ?? []));
    }
    const seen = new Set();
    const matches = [];
    for (const f of allFixtures) {
        if (!ALL_COMPETITION_IDS.includes(f?.league?.id))
            continue;
        if (seen.has(f?.fixture?.id))
            continue;
        seen.add(f.fixture.id);
        const m = formatFixture(f, 'finished');
        if (m)
            matches.push(m);
    }
    // Sort most recent first
    matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const limited = matches.slice(0, 300);
    // Never overwrite Firestore with empty data — merge so existing results are preserved
    // even when API quota is temporarily exhausted.
    await mergeFinishedMatchesIntoResults(db, limited);
    console.log(`[fetchResults] stored ${limited.length} result matches`);
    return limited.length;
}
//# sourceMappingURL=fetchMatchData.js.map