"use strict";
/**
 * functions/src/index.ts
 *
 * All Cloud Function entry-points.
 *
 * SETUP
 * ─────
 * 1.  cd functions && npm install && npm run build
 * 2.  Set the API key secret:
 *       firebase functions:secrets:set FOOTBALL_API_KEY
 * 3.  Deploy everything:
 *       firebase deploy --only functions
 *     Deploy one function:
 *       firebase deploy --only functions:calculateGameweekScores
 *
 * CALL from the app (admin users only):
 *   import { getFunctions, httpsCallable } from 'firebase/functions';
 *   const fn = httpsCallable(getFunctions(), 'calculateGameweekScores');
 *   await fn({ leagueId: 39, season: 2024, roundNumber: 12 });
 *
 * EXECUTION ORDER each gameweek
 * ──────────────────────────────
 *   calculateGameweekScoresScheduled  (Tuesday 04:00 UTC, auto)
 *     → writes playerScores/{key} for each competition
 *       → triggers updateTeamPointsTrigger (Firestore onCreate, auto)
 *         → scores every team, writes standings
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
exports.onMessageCreatedTrigger = exports.processGameweekDeadlineScheduled = exports.refreshFixturesScheduled = exports.refreshPlayerPoolScheduled = exports.registerFcmToken = exports.activateChip = exports.commitTransfers = exports.fetchResultsScheduled = exports.fetchUpcomingScheduled = exports.fetchLiveScheduled = exports.calculateGameweekScoresScheduled = exports.lockSlipsScheduled = exports.seedSystemLeaguesScheduled = exports.seedSystemLeagues = exports.generateH2HSchedule = exports.updateUserStats = exports.scoreH2H = exports.scoreSlips = exports.cacheMatchResult = exports.submitSlip = exports.scoreGameweekPredictions = exports.submitGameweekPicks = exports.leaveLeague = exports.joinLeague = exports.createLeague = exports.saveTeam = exports.updateTeamPointsTrigger = exports.getMatchDetail = exports.getAppMatches = exports.updateTeamPoints = exports.calculateGameweekScores = exports.api = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const database_1 = require("firebase-functions/v2/database");
const calculateGameweekScores_1 = require("./calculateGameweekScores");
const updateTeamPoints_1 = require("./updateTeamPoints");
const teamBuilder_1 = require("./teamBuilder");
const gameweekPredictions_1 = require("./gameweekPredictions");
const leagueOperations_1 = require("./leagueOperations");
const submitSlip_1 = require("./submitSlip");
const scoreSlips_1 = require("./scoreSlips");
const generateH2HSchedule_1 = require("./generateH2HSchedule");
const fetchMatchData_1 = require("./fetchMatchData");
const systemLeagues_1 = require("./systemLeagues");
const fantasyOperations_1 = require("./fantasyOperations");
const fantasyScheduled_1 = require("./fantasyScheduled");
const fantasyMessaging_1 = require("./fantasyMessaging");
// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();
const footballApiKey = { value: () => process.env.FOOTBALL_API_KEY ?? '' };
const SHARED_CONFIG = {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
};
function currentSeason() {
    const now = new Date();
    return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}
async function readAppDataMatches(kind) {
    const snap = await db.collection('appData').doc(kind).get();
    if (!snap.exists)
        return [];
    const data = snap.data();
    return Array.isArray(data?.matches) ? data.matches : [];
}
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const pickFirstMatch = (html, pattern) => {
    const match = html.match(pattern);
    return match?.[1]?.trim() || '';
};
const stripHtml = (html) => html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const extractArticlePayload = (html, sourceUrl) => {
    const title = pickFirstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        pickFirstMatch(html, /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        pickFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const leadImageUrl = pickFirstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        pickFirstMatch(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const publishedAt = pickFirstMatch(html, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        pickFirstMatch(html, /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const articleHtml = pickFirstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i) ||
        pickFirstMatch(html, /<main[^>]*>([\s\S]*?)<\/main>/i) ||
        html;
    const text = stripHtml(articleHtml).slice(0, 12000);
    const paragraphs = text
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((part) => part.trim())
        .filter((part) => part.length > 80)
        .slice(0, 18);
    const contentHtml = paragraphs.length > 0
        ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
        : `<p>${escapeHtml(text.slice(0, 4000))}</p>`;
    return {
        title: stripHtml(title),
        source: new URL(sourceUrl).hostname.replace(/^www\./, ''),
        publishedAt,
        leadImageUrl,
        contentHtml,
    };
};
exports.api = (0, https_1.onRequest)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST' || req.path !== '/article/extract') {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const url = String(req.body?.url || '').trim();
    let parsed;
    try {
        parsed = new URL(url);
        if (!/^https?:$/i.test(parsed.protocol)) {
            throw new Error('Unsupported protocol');
        }
    }
    catch {
        res.status(400).json({ error: 'A valid http(s) url is required' });
        return;
    }
    try {
        const response = await fetch(parsed.toString(), {
            headers: {
                'User-Agent': 'SidelineArticleExtractor/1.0',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
        if (!response.ok) {
            res.status(response.status).json({ error: 'Article fetch failed' });
            return;
        }
        const html = await response.text();
        res.json(extractArticlePayload(html, parsed.toString()));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Extractor failed' });
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// calculateGameweekScores  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.calculateGameweekScores = (0, https_1.onCall)({ ...SHARED_CONFIG }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin claim required');
    process.env.FOOTBALL_API_KEY = footballApiKey.value();
    try {
        return await (0, calculateGameweekScores_1.runCalculateGameweekScores)(request.data, db);
    }
    catch (err) {
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// updateTeamPoints  (callable — admin only, for manual re-runs / backfill)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTeamPoints = (0, https_1.onCall)({ ...SHARED_CONFIG }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin claim required');
    const { roundNumber, season } = request.data;
    if (!roundNumber || !season)
        throw new https_1.HttpsError('invalid-argument', 'roundNumber and season are required');
    const gameweekKey = request.data.gameweekKey
        ?? `manual_GW${String(roundNumber).padStart(2, '0')}_${season}`;
    try {
        return await (0, updateTeamPoints_1.runUpdateTeamPoints)(roundNumber, season, gameweekKey, db);
    }
    catch (err) {
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// getAppMatches  (callable — signed-in users)
// Reads appData/* and, if empty/stale on the client, can force a server fetch
// using the Football API key that now lives only in Functions env.
// ─────────────────────────────────────────────────────────────────────────────
exports.getAppMatches = (0, https_1.onCall)({ ...SHARED_CONFIG }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    }
    const kind = request.data?.kind;
    if (!kind || !['live', 'upcoming', 'results'].includes(kind)) {
        throw new https_1.HttpsError('invalid-argument', 'kind must be live, upcoming, or results');
    }
    const existing = await readAppDataMatches(kind);
    if (!request.data?.refresh && existing.length > 0) {
        return { matches: existing };
    }
    const apiKey = footballApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'FOOTBALL_API_KEY is not configured in Functions');
    }
    if (kind === 'live') {
        await (0, fetchMatchData_1.runFetchLive)(db, apiKey);
    }
    else if (kind === 'upcoming') {
        await (0, fetchMatchData_1.runFetchUpcoming)(db, apiKey);
    }
    else {
        await (0, fetchMatchData_1.runFetchResults)(db, apiKey);
    }
    return { matches: await readAppDataMatches(kind) };
});
// ─────────────────────────────────────────────────────────────────────────────
// getMatchDetail  (callable — signed-in users)
// Shared per-fixture detail cache with stale-while-revalidate guardrails.
// ─────────────────────────────────────────────────────────────────────────────
exports.getMatchDetail = (0, https_1.onCall)({ ...SHARED_CONFIG }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    }
    const fixtureId = Number(request.data?.fixtureId);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'fixtureId must be a positive number');
    }
    const apiKey = footballApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'FOOTBALL_API_KEY is not configured in Functions');
    }
    try {
        return await (0, fetchMatchData_1.runFetchMatchDetail)(db, apiKey, fixtureId, {
            force: Boolean(request.data?.force),
        });
    }
    catch (err) {
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// updateTeamPointsTrigger  (Firestore onCreate — fires automatically)
//
// Fires every time calculateGameweekScores writes a new playerScores/{key} doc.
// That doc contains roundNumber + season, which is all this function needs.
//
// Because five competitions each fire this trigger independently for the same
// round, the runner is idempotent: it re-reads ALL available pointsMaps for
// the round and recomputes deltas, so later triggers refine earlier results
// rather than double-counting.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTeamPointsTrigger = (0, firestore_1.onDocumentCreated)({
    document: 'playerScores/{gameweekKey}',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
}, async (event) => {
    const data = event.data?.data();
    if (!data) {
        console.warn('[updateTeamPointsTrigger] No data in event — skipping');
        return;
    }
    const roundNumber = data.roundNumber;
    const season = data.season;
    const gameweekKey = event.params.gameweekKey;
    if (!roundNumber || !season) {
        console.warn('[updateTeamPointsTrigger] Missing roundNumber or season in doc — skipping', data);
        return;
    }
    try {
        await (0, updateTeamPoints_1.runUpdateTeamPoints)(roundNumber, season, gameweekKey, db);
    }
    catch (err) {
        // Log so it appears in Cloud Functions logs but don't rethrow —
        // a thrown error here causes Firebase to retry the trigger indefinitely.
        console.error('[updateTeamPointsTrigger] Error:', err instanceof Error ? err.message : err);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// saveTeam  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
exports.saveTeam = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
    try {
        return await (0, teamBuilder_1.runSaveTeam)(request, db);
    }
    catch (err) {
        // Re-throw HttpsErrors as-is; wrap anything else
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// createLeague / joinLeague / leaveLeague  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
const LEAGUE_CONFIG = { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 };
exports.createLeague = (0, https_1.onCall)(LEAGUE_CONFIG, async (request) => {
    try {
        return await (0, leagueOperations_1.runCreateLeague)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
exports.joinLeague = (0, https_1.onCall)(LEAGUE_CONFIG, async (request) => {
    try {
        return await (0, leagueOperations_1.runJoinLeague)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
exports.leaveLeague = (0, https_1.onCall)(LEAGUE_CONFIG, async (request) => {
    try {
        return await (0, leagueOperations_1.runLeaveLeague)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// submitGameweekPicks  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
exports.submitGameweekPicks = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
    try {
        return await (0, gameweekPredictions_1.runSubmitGameweekPicks)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// scoreGameweekPredictions  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.scoreGameweekPredictions = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 120 }, async (request) => {
    try {
        return await (0, gameweekPredictions_1.runScoreGameweekPredictions)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// submitSlip  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
const SLIP_CONFIG = { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 };
exports.submitSlip = (0, https_1.onCall)(SLIP_CONFIG, async (request) => {
    try {
        return await (0, submitSlip_1.runSubmitSlip)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// cacheMatchResult  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.cacheMatchResult = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
    try {
        return await (0, submitSlip_1.runCacheMatchResult)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// scoreSlips / scoreH2H / updateUserStats  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────
const SCORE_CONFIG = { region: 'us-central1', memory: '512MiB', timeoutSeconds: 300 };
exports.scoreSlips = (0, https_1.onCall)(SCORE_CONFIG, async (request) => {
    try {
        return await (0, scoreSlips_1.runScoreSlips)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
exports.scoreH2H = (0, https_1.onCall)(SCORE_CONFIG, async (request) => {
    try {
        return await (0, scoreSlips_1.runScoreH2H)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
exports.updateUserStats = (0, https_1.onCall)(SCORE_CONFIG, async (request) => {
    try {
        return await (0, scoreSlips_1.runUpdateUserStats)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// generateH2HSchedule  (callable — league creator or admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.generateH2HSchedule = (0, https_1.onCall)(SLIP_CONFIG, async (request) => {
    try {
        return await (0, generateH2HSchedule_1.runGenerateH2HSchedule)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// seedSystemLeagues  (callable — admin only, scheduled daily)
// Creates/refreshes the hidden Fantasy system league catalog.
// ─────────────────────────────────────────────────────────────────────────────
exports.seedSystemLeagues = (0, https_1.onCall)({ ...SHARED_CONFIG }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in');
    if (!request.auth.token.admin)
        throw new https_1.HttpsError('permission-denied', 'Admin claim required');
    try {
        return await (0, systemLeagues_1.runSeedSystemLeagues)(db, footballApiKey.value());
    }
    catch (err) {
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
exports.seedSystemLeaguesScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 24 hours',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300,
    timeZone: 'UTC',
}, async () => {
    const result = await (0, systemLeagues_1.runSeedSystemLeagues)(db, footballApiKey.value());
    console.log('[seedSystemLeaguesScheduled]', result);
});
// ─────────────────────────────────────────────────────────────────────────────
// lockSlipsScheduled  (cron — every 5 minutes)
//
// Locks any slip whose earliest pick has a match that's now kicked off.
// Uses matchResultCache as the kickoff signal: if a result exists (even partial),
// the match has started and the slip must be locked.
// ─────────────────────────────────────────────────────────────────────────────
exports.lockSlipsScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
}, async () => {
    // Load all pending (not yet locked) slips
    const pendingSnap = await db
        .collection('slips')
        .where('locked', '==', false)
        .where('status', '==', 'pending')
        .get();
    if (pendingSnap.empty)
        return;
    // Collect all match IDs referenced by these slips
    const allMatchIds = new Set();
    for (const doc of pendingSnap.docs) {
        for (const pick of (doc.data().picks ?? [])) {
            allMatchIds.add(String(pick.matchId));
        }
    }
    // Check which matches have a cached result (= kicked off)
    const resultSnaps = await db.getAll(...[...allMatchIds].map((id) => db.collection('matchResultCache').doc(id)));
    const kickedOffIds = new Set(resultSnaps.filter((s) => s.exists).map((s) => s.id));
    if (kickedOffIds.size === 0)
        return;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    let count = 0;
    for (const doc of pendingSnap.docs) {
        const picks = doc.data().picks ?? [];
        const shouldLock = picks.some((p) => kickedOffIds.has(String(p.matchId)));
        if (!shouldLock)
            continue;
        batch.update(doc.ref, { locked: true, updatedAt: now });
        count++;
        if (count >= 499)
            break; // batch limit — next cron run will handle remainder
    }
    if (count > 0) {
        await batch.commit();
        console.log(`[lockSlips] Locked ${count} slip(s)`);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// calculateGameweekScoresScheduled  (cron — Tuesday 04:00 UTC)
//
// Processes all five competitions for the current round.
// Each runCalculateGameweekScores call writes a playerScores doc, which
// fires updateTeamPointsTrigger automatically — no manual chaining needed.
// ─────────────────────────────────────────────────────────────────────────────
exports.calculateGameweekScoresScheduled = (0, scheduler_1.onSchedule)({
    schedule: '0 4 * * 2', // Tuesday 04:00 UTC
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
}, async () => {
    process.env.FOOTBALL_API_KEY = footballApiKey.value();
    const configSnap = await db.collection('config').doc('fantasy').get();
    const currentRound = configSnap.data()?.currentGameweek ?? 1;
    const competitions = [
        { leagueId: 39, roundPrefix: 'Regular Season' },
        { leagueId: 140, roundPrefix: 'Regular Season' },
        { leagueId: 135, roundPrefix: 'Regular Season' },
        { leagueId: 78, roundPrefix: 'Regular Season' },
        { leagueId: 2, roundPrefix: 'League Stage' },
    ];
    console.log(`[scheduled] GW${currentRound} — processing ${competitions.length} competitions`);
    for (const comp of competitions) {
        try {
            const result = await (0, calculateGameweekScores_1.runCalculateGameweekScores)({ leagueId: comp.leagueId, season: currentSeason(), round: `${comp.roundPrefix} - ${currentRound}` }, db);
            console.log(`  ✓ league=${comp.leagueId} players=${result.playersScored}`);
            // updateTeamPointsTrigger fires automatically from the Firestore write above
        }
        catch (err) {
            console.error(`  ✗ league=${comp.leagueId}:`, err.message);
        }
    }
    // Advance the gameweek counter for next week's run
    await db.collection('config').doc('fantasy').set({ currentGameweek: currentRound + 1, lastScoredAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
});
// ─────────────────────────────────────────────────────────────────────────────
// fetchLiveScheduled  (cron — every 2 minutes)
// Keeps appData/live fresh for all clients during match hours.
// ─────────────────────────────────────────────────────────────────────────────
exports.fetchLiveScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 2 minutes',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
}, async () => {
    await (0, fetchMatchData_1.runFetchLive)(db, footballApiKey.value());
});
// ─────────────────────────────────────────────────────────────────────────────
// fetchUpcomingScheduled  (cron — every 6 hours)
// Keeps appData/upcoming covering the next 14 days for all clients.
// ─────────────────────────────────────────────────────────────────────────────
exports.fetchUpcomingScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 6 hours',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
}, async () => {
    await (0, fetchMatchData_1.runFetchUpcoming)(db, footballApiKey.value());
});
// ─────────────────────────────────────────────────────────────────────────────
// fetchResultsScheduled  (cron — every 30 minutes)
// Keeps appData/results covering the past 7 days for all clients.
// ─────────────────────────────────────────────────────────────────────────────
exports.fetchResultsScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 2 hours',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
}, async () => {
    await (0, fetchMatchData_1.runFetchResults)(db, footballApiKey.value());
});
// ─────────────────────────────────────────────────────────────────────────────
// commitTransfers  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
exports.commitTransfers = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
    try {
        return await (0, fantasyOperations_1.runCommitTransfers)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// activateChip  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
exports.activateChip = (0, https_1.onCall)({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 15 }, async (request) => {
    try {
        return await (0, fantasyOperations_1.runActivateChip)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// registerFcmToken  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────
exports.registerFcmToken = (0, https_1.onCall)({ region: 'us-central1', memory: '128MiB', timeoutSeconds: 10 }, async (request) => {
    try {
        return await (0, fantasyOperations_1.runRegisterFcmToken)(request, db);
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// refreshPlayerPool  (scheduled — every 6 hours)
// ─────────────────────────────────────────────────────────────────────────────
exports.refreshPlayerPoolScheduled = (0, scheduler_1.onSchedule)({ schedule: 'every 6 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 540, timeZone: 'UTC' }, async () => { await (0, fantasyScheduled_1.runRefreshPlayerPool)(db, footballApiKey.value()); });
// ─────────────────────────────────────────────────────────────────────────────
// refreshFixtures  (scheduled — every hour)
// ─────────────────────────────────────────────────────────────────────────────
exports.refreshFixturesScheduled = (0, scheduler_1.onSchedule)({ schedule: 'every 1 hours', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300, timeZone: 'UTC' }, async () => { await (0, fantasyScheduled_1.runRefreshFixtures)(db, footballApiKey.value()); });
// ─────────────────────────────────────────────────────────────────────────────
// processGameweekDeadline  (scheduled — every minute)
// ─────────────────────────────────────────────────────────────────────────────
exports.processGameweekDeadlineScheduled = (0, scheduler_1.onSchedule)({ schedule: 'every 1 minutes', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, timeZone: 'UTC' }, async () => { await (0, fantasyScheduled_1.runProcessGameweekDeadline)(db); });
// ─────────────────────────────────────────────────────────────────────────────
// onMessageCreated  (RTDB trigger — /chats/{chatId}/messages/{msgId})
// ─────────────────────────────────────────────────────────────────────────────
exports.onMessageCreatedTrigger = (0, database_1.onValueCreated)({ ref: '/chats/{chatId}/messages/{msgId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 }, async (event) => {
    try {
        await (0, fantasyMessaging_1.runOnMessageCreated)(event, db, admin.messaging());
    }
    catch (err) {
        console.error('[onMessageCreated]', err);
    }
});
//# sourceMappingURL=index.js.map