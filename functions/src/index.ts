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

import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onValueCreated } from 'firebase-functions/v2/database';
import { runCalculateGameweekScores } from './calculateGameweekScores';
import { runUpdateTeamPoints } from './updateTeamPoints';
import { runSaveTeam, SaveTeamRequest } from './teamBuilder';
import {
  runSubmitGameweekPicks,
  runScoreGameweekPredictions,
  SubmitPicksRequest,
  ScoreGameweekRequest,
} from './gameweekPredictions';
import {
  runCreateLeague,
  runJoinLeague,
  runLeaveLeague,
  CreateLeagueRequest,
  JoinLeagueRequest,
  LeaveLeagueRequest,
} from './leagueOperations';
import {
  runSubmitSlip,
  runCacheMatchResult,
  SubmitSlipRequest,
  CacheMatchResultRequest,
} from './submitSlip';
import {
  runScoreSlips,
  runScoreH2H,
  runUpdateUserStats,
  ScoreSlipsRequest,
  ScoreH2HRequest,
  UpdateUserStatsRequest,
} from './scoreSlips';
import {
  runGenerateH2HSchedule,
  GenerateH2HScheduleRequest,
} from './generateH2HSchedule';
import { runFetchLive, runFetchUpcoming, runFetchResults, runFetchMatchDetail } from './fetchMatchData';
import { runSeedSystemLeagues } from './systemLeagues';
import { runCommitTransfers, runActivateChip, runRegisterFcmToken } from './fantasyOperations';
import { runRefreshPlayerPool, runRefreshFixtures, runProcessGameweekDeadline } from './fantasyScheduled';
import { runOnMessageCreated } from './fantasyMessaging';

// ─── Init ─────────────────────────────────────────────────────────────────────

admin.initializeApp();
const db = admin.firestore();

const footballApiKey = { value: () => process.env.FOOTBALL_API_KEY ?? '' };

const SHARED_CONFIG = {
  region:          'us-central1' as const,
  memory:          '512MiB' as const,
  timeoutSeconds:  540,
};

function currentSeason(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

async function readAppDataMatches(kind: 'live' | 'upcoming' | 'results') {
  const snap = await db.collection('appData').doc(kind).get();
  if (!snap.exists) return [];
  const data = snap.data();
  return Array.isArray(data?.matches) ? data.matches : [];
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pickFirstMatch = (html: string, pattern: RegExp) => {
  const match = html.match(pattern);
  return match?.[1]?.trim() || '';
};

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractArticlePayload = (html: string, sourceUrl: string) => {
  const title =
    pickFirstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pickFirstMatch(html, /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pickFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const leadImageUrl =
    pickFirstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pickFirstMatch(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const publishedAt =
    pickFirstMatch(html, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pickFirstMatch(html, /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["'][^>]*>/i);

  const articleHtml =
    pickFirstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i) ||
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

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
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
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Unsupported protocol');
      }
    } catch {
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
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Extractor failed' });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// calculateGameweekScores  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────

export const calculateGameweekScores = onCall(
  { ...SHARED_CONFIG },
  async (request: CallableRequest<{
    leagueId: number;
    season: number;
    round?: string;
    roundNumber?: number;
  }>) => {
    if (!request.auth)                  throw new HttpsError('unauthenticated',  'Must be signed in');
    if (!request.auth.token.admin)      throw new HttpsError('permission-denied', 'Admin claim required');

    process.env.FOOTBALL_API_KEY = footballApiKey.value();
    try {
      return await runCalculateGameweekScores(request.data, db);
    } catch (err) {
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// updateTeamPoints  (callable — admin only, for manual re-runs / backfill)
// ─────────────────────────────────────────────────────────────────────────────

export const updateTeamPoints = onCall(
  { ...SHARED_CONFIG },
  async (request: CallableRequest<{
    roundNumber: number;
    season: number;
    gameweekKey?: string;   // optional override; built automatically if omitted
  }>) => {
    if (!request.auth)             throw new HttpsError('unauthenticated',  'Must be signed in');
    if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin claim required');

    const { roundNumber, season } = request.data;
    if (!roundNumber || !season)   throw new HttpsError('invalid-argument', 'roundNumber and season are required');

    const gameweekKey = request.data.gameweekKey
      ?? `manual_GW${String(roundNumber).padStart(2, '0')}_${season}`;

    try {
      return await runUpdateTeamPoints(roundNumber, season, gameweekKey, db);
    } catch (err) {
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// getAppMatches  (callable — signed-in users)
// Reads appData/* and, if empty/stale on the client, can force a server fetch
// using the Football API key that now lives only in Functions env.
// ─────────────────────────────────────────────────────────────────────────────

export const getAppMatches = onCall(
  { ...SHARED_CONFIG },
  async (request: CallableRequest<{
    kind: 'live' | 'upcoming' | 'results';
    refresh?: boolean;
  }>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const kind = request.data?.kind;
    if (!kind || !['live', 'upcoming', 'results'].includes(kind)) {
      throw new HttpsError('invalid-argument', 'kind must be live, upcoming, or results');
    }

    const existing = await readAppDataMatches(kind);
    if (!request.data?.refresh && existing.length > 0) {
      return { matches: existing };
    }

    const apiKey = footballApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'FOOTBALL_API_KEY is not configured in Functions');
    }

    if (kind === 'live') {
      await runFetchLive(db, apiKey);
    } else if (kind === 'upcoming') {
      await runFetchUpcoming(db, apiKey);
    } else {
      await runFetchResults(db, apiKey);
    }

    return { matches: await readAppDataMatches(kind) };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// getMatchDetail  (callable — signed-in users)
// Shared per-fixture detail cache with stale-while-revalidate guardrails.
// ─────────────────────────────────────────────────────────────────────────────

export const getMatchDetail = onCall(
  { ...SHARED_CONFIG },
  async (request: CallableRequest<{
    fixtureId: number;
    force?: boolean;
  }>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const fixtureId = Number(request.data?.fixtureId);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      throw new HttpsError('invalid-argument', 'fixtureId must be a positive number');
    }

    const apiKey = footballApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'FOOTBALL_API_KEY is not configured in Functions');
    }

    try {
      return await runFetchMatchDetail(db, apiKey, fixtureId, {
        force: Boolean(request.data?.force),
      });
    } catch (err) {
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

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

export const updateTeamPointsTrigger = onDocumentCreated(
  {
    document:       'playerScores/{gameweekKey}',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      console.warn('[updateTeamPointsTrigger] No data in event — skipping');
      return;
    }

    const roundNumber: number = data.roundNumber;
    const season:      number = data.season;
    const gameweekKey: string = event.params.gameweekKey;

    if (!roundNumber || !season) {
      console.warn('[updateTeamPointsTrigger] Missing roundNumber or season in doc — skipping', data);
      return;
    }

    try {
      await runUpdateTeamPoints(roundNumber, season, gameweekKey, db);
    } catch (err) {
      // Log so it appears in Cloud Functions logs but don't rethrow —
      // a thrown error here causes Firebase to retry the trigger indefinitely.
      console.error('[updateTeamPointsTrigger] Error:', err instanceof Error ? err.message : err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// saveTeam  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

export const saveTeam = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request: CallableRequest<SaveTeamRequest>) => {
    try {
      return await runSaveTeam(request, db);
    } catch (err) {
      // Re-throw HttpsErrors as-is; wrap anything else
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// createLeague / joinLeague / leaveLeague  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

const LEAGUE_CONFIG = { region: 'us-central1' as const, memory: '256MiB' as const, timeoutSeconds: 30 };

export const createLeague = onCall(
  LEAGUE_CONFIG,
  async (request: CallableRequest<CreateLeagueRequest>) => {
    try {
      return await runCreateLeague(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

export const joinLeague = onCall(
  LEAGUE_CONFIG,
  async (request: CallableRequest<JoinLeagueRequest>) => {
    try {
      return await runJoinLeague(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

export const leaveLeague = onCall(
  LEAGUE_CONFIG,
  async (request: CallableRequest<LeaveLeagueRequest>) => {
    try {
      return await runLeaveLeague(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// submitGameweekPicks  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

export const submitGameweekPicks = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request: CallableRequest<SubmitPicksRequest>) => {
    try {
      return await runSubmitGameweekPicks(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// scoreGameweekPredictions  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────

export const scoreGameweekPredictions = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 120 },
  async (request: CallableRequest<ScoreGameweekRequest>) => {
    try {
      return await runScoreGameweekPredictions(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// submitSlip  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

const SLIP_CONFIG = { region: 'us-central1' as const, memory: '256MiB' as const, timeoutSeconds: 30 };

export const submitSlip = onCall(
  SLIP_CONFIG,
  async (request: CallableRequest<SubmitSlipRequest>) => {
    try {
      return await runSubmitSlip(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// cacheMatchResult  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────

export const cacheMatchResult = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request: CallableRequest<CacheMatchResultRequest>) => {
    try {
      return await runCacheMatchResult(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// scoreSlips / scoreH2H / updateUserStats  (callable — admin only)
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_CONFIG = { region: 'us-central1' as const, memory: '512MiB' as const, timeoutSeconds: 300 };

export const scoreSlips = onCall(
  SCORE_CONFIG,
  async (request: CallableRequest<ScoreSlipsRequest>) => {
    try {
      return await runScoreSlips(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

export const scoreH2H = onCall(
  SCORE_CONFIG,
  async (request: CallableRequest<ScoreH2HRequest>) => {
    try {
      return await runScoreH2H(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

export const updateUserStats = onCall(
  SCORE_CONFIG,
  async (request: CallableRequest<UpdateUserStatsRequest>) => {
    try {
      return await runUpdateUserStats(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// generateH2HSchedule  (callable — league creator or admin)
// ─────────────────────────────────────────────────────────────────────────────

export const generateH2HSchedule = onCall(
  SLIP_CONFIG,
  async (request: CallableRequest<GenerateH2HScheduleRequest>) => {
    try {
      return await runGenerateH2HSchedule(request, db);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// seedSystemLeagues  (callable — admin only, scheduled daily)
// Creates/refreshes the hidden Fantasy system league catalog.
// ─────────────────────────────────────────────────────────────────────────────

export const seedSystemLeagues = onCall(
  { ...SHARED_CONFIG },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
    if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin claim required');

    try {
      return await runSeedSystemLeagues(db, footballApiKey.value());
    } catch (err) {
      throw new HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
  },
);

export const seedSystemLeaguesScheduled = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 300,
    timeZone: 'UTC',
  },
  async () => {
    const result = await runSeedSystemLeagues(db, footballApiKey.value());
    console.log('[seedSystemLeaguesScheduled]', result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// lockSlipsScheduled  (cron — every 5 minutes)
//
// Locks any slip whose earliest pick has a match that's now kicked off.
// Uses matchResultCache as the kickoff signal: if a result exists (even partial),
// the match has started and the slip must be locked.
// ─────────────────────────────────────────────────────────────────────────────

export const lockSlipsScheduled = onSchedule(
  {
    schedule:       'every 5 minutes',
    region:         'us-central1',
    memory:         '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    // Load all pending (not yet locked) slips
    const pendingSnap = await db
      .collection('slips')
      .where('locked', '==', false)
      .where('status', '==', 'pending')
      .get();

    if (pendingSnap.empty) return;

    // Collect all match IDs referenced by these slips
    const allMatchIds = new Set<string>();
    for (const doc of pendingSnap.docs) {
      for (const pick of (doc.data().picks ?? [])) {
        allMatchIds.add(String(pick.matchId));
      }
    }

    // Check which matches have a cached result (= kicked off)
    const resultSnaps = await db.getAll(
      ...[...allMatchIds].map((id) => db.collection('matchResultCache').doc(id))
    );
    const kickedOffIds = new Set<string>(
      resultSnaps.filter((s) => s.exists).map((s) => s.id)
    );

    if (kickedOffIds.size === 0) return;

    const now   = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    let   count = 0;

    for (const doc of pendingSnap.docs) {
      const picks: Array<{ matchId: string }> = doc.data().picks ?? [];
      const shouldLock = picks.some((p) => kickedOffIds.has(String(p.matchId)));
      if (!shouldLock) continue;
      batch.update(doc.ref, { locked: true, updatedAt: now });
      count++;
      if (count >= 499) break;   // batch limit — next cron run will handle remainder
    }

    if (count > 0) {
      await batch.commit();
      console.log(`[lockSlips] Locked ${count} slip(s)`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// calculateGameweekScoresScheduled  (cron — Tuesday 04:00 UTC)
//
// Processes all five competitions for the current round.
// Each runCalculateGameweekScores call writes a playerScores doc, which
// fires updateTeamPointsTrigger automatically — no manual chaining needed.
// ─────────────────────────────────────────────────────────────────────────────

export const calculateGameweekScoresScheduled = onSchedule(
  {
    schedule:       '0 4 * * 2',    // Tuesday 04:00 UTC
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    process.env.FOOTBALL_API_KEY = footballApiKey.value();

    const configSnap   = await db.collection('config').doc('fantasy').get();
    const currentRound = (configSnap.data()?.currentGameweek as number | undefined) ?? 1;

    const competitions = [
      { leagueId: 39,  roundPrefix: 'Regular Season' },
      { leagueId: 140, roundPrefix: 'Regular Season' },
      { leagueId: 135, roundPrefix: 'Regular Season' },
      { leagueId: 78,  roundPrefix: 'Regular Season' },
      { leagueId: 2,   roundPrefix: 'League Stage'   },
    ];

    console.log(`[scheduled] GW${currentRound} — processing ${competitions.length} competitions`);

    for (const comp of competitions) {
      try {
        const result = await runCalculateGameweekScores(
          { leagueId: comp.leagueId, season: currentSeason(), round: `${comp.roundPrefix} - ${currentRound}` },
          db,
        );
        console.log(`  ✓ league=${comp.leagueId} players=${result.playersScored}`);
        // updateTeamPointsTrigger fires automatically from the Firestore write above
      } catch (err) {
        console.error(`  ✗ league=${comp.leagueId}:`, (err as Error).message);
      }
    }

    // Advance the gameweek counter for next week's run
    await db.collection('config').doc('fantasy').set(
      { currentGameweek: currentRound + 1, lastScoredAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// fetchLiveScheduled  (cron — every 2 minutes)
// Keeps appData/live fresh for all clients during match hours.
// ─────────────────────────────────────────────────────────────────────────────

export const fetchLiveScheduled = onSchedule(
  {
    schedule:       'every 2 minutes',
    region:         'us-central1',
    memory:         '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    await runFetchLive(db, footballApiKey.value());
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// fetchUpcomingScheduled  (cron — every 6 hours)
// Keeps appData/upcoming covering the next 14 days for all clients.
// ─────────────────────────────────────────────────────────────────────────────

export const fetchUpcomingScheduled = onSchedule(
  {
    schedule:       'every 6 hours',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    await runFetchUpcoming(db, footballApiKey.value());
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// fetchResultsScheduled  (cron — every 30 minutes)
// Keeps appData/results covering the past 7 days for all clients.
// ─────────────────────────────────────────────────────────────────────────────

export const fetchResultsScheduled = onSchedule(
  {
    schedule:       'every 2 hours',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    await runFetchResults(db, footballApiKey.value());
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// commitTransfers  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

export const commitTransfers = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    try { return await runCommitTransfers(request, db); }
    catch (err) { if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err instanceof Error ? err.message : String(err)); }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// activateChip  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

export const activateChip = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 15 },
  async (request) => {
    try { return await runActivateChip(request, db); }
    catch (err) { if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err instanceof Error ? err.message : String(err)); }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// registerFcmToken  (callable — authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

export const registerFcmToken = onCall(
  { region: 'us-central1', memory: '128MiB', timeoutSeconds: 10 },
  async (request) => {
    try { return await runRegisterFcmToken(request, db); }
    catch (err) { if (err instanceof HttpsError) throw err; throw new HttpsError('internal', err instanceof Error ? err.message : String(err)); }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// refreshPlayerPool  (scheduled — every 6 hours)
// ─────────────────────────────────────────────────────────────────────────────

export const refreshPlayerPoolScheduled = onSchedule(
  { schedule: 'every 6 hours', region: 'us-central1', memory: '512MiB', timeoutSeconds: 540, timeZone: 'UTC' },
  async () => { await runRefreshPlayerPool(db, footballApiKey.value()); },
);

// ─────────────────────────────────────────────────────────────────────────────
// refreshFixtures  (scheduled — every hour)
// ─────────────────────────────────────────────────────────────────────────────

export const refreshFixturesScheduled = onSchedule(
  { schedule: 'every 1 hours', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300, timeZone: 'UTC' },
  async () => { await runRefreshFixtures(db, footballApiKey.value()); },
);

// ─────────────────────────────────────────────────────────────────────────────
// processGameweekDeadline  (scheduled — every minute)
// ─────────────────────────────────────────────────────────────────────────────

export const processGameweekDeadlineScheduled = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, timeZone: 'UTC' },
  async () => { await runProcessGameweekDeadline(db); },
);

// ─────────────────────────────────────────────────────────────────────────────
// onMessageCreated  (RTDB trigger — /chats/{chatId}/messages/{msgId})
// ─────────────────────────────────────────────────────────────────────────────

export const onMessageCreatedTrigger = onValueCreated(
  { ref: '/chats/{chatId}/messages/{msgId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (event) => {
    try { await runOnMessageCreated(event, db, admin.messaging()); }
    catch (err) { console.error('[onMessageCreated]', err); }
  },
);
