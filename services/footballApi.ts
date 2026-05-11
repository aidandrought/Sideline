// services/footballApi.ts
// STRICT filtering - Only real top leagues, no youth/reserve teams
// UPDATED: Added community generation methods, league standings, and finished fixtures
import { getCachedValueAsync, getOrFetchCached, setCachedValue, withTimeout } from './cacheService';
import { isPregameWindow } from './matchTime';
import { API_CONFIG } from '../constants/config';
import {
  ALLOWED_COMPETITION_IDS,
  CORE_LEAGUE_COMPETITIONS,
  formatCompetitionLabel,
  RESULTS_COMPETITION_IDS,
} from '../constants/footballCompetitions';
import { getDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';

// ─── Firestore appData helpers ────────────────────────────────────────────────
// Max age (ms) before we consider a Firestore-stored match list stale and fall
// back to the legacy per-device API path.
const FIRESTORE_LIVE_STALE_MS     =  4 * 60 * 1000;   // 4 min  (function runs every 2 min)
const FIRESTORE_UPCOMING_STALE_MS = 12 * 60 * 60 * 1000; // 12 h (function runs every 6 h)
const FIRESTORE_RESULTS_STALE_MS  =  5 * 60 * 1000; // 5 min — keeps live→results transition fast
const functions = getFunctions();
let appMatchesCallableUnavailable = false;
let matchDetailCallableUnavailable = false;
const ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK =
  process.env.EXPO_PUBLIC_ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK !== '0';
const ENABLE_CLIENT_LEAGUE_DETAILS_ENRICHMENT =
  process.env.EXPO_PUBLIC_ENABLE_LEAGUE_DETAILS_ENRICHMENT === '1';
const ENABLE_FIREBASE_FUNCTION_CALLS =
  process.env.EXPO_PUBLIC_ENABLE_FIREBASE_FUNCTIONS !== '0';

const isCallableUnavailableError = (error: unknown) => {
  const code = String((error as { code?: unknown } | null)?.code || '').toLowerCase();
  const message = String((error as { message?: unknown } | null)?.message || '').toLowerCase();
  return code.includes('not-found') || message.includes('not-found');
};

async function readAppDataMatches(
  key: 'live' | 'upcoming' | 'results',
  staleMs: number,
): Promise<Match[] | null> {
  try {
    const snap = await getDoc(doc(db, 'appData', key));
    if (!snap.exists()) return null;
    const data = snap.data();
    // Check freshness via updatedAt (Firestore Timestamp)
    const updatedAt: number = data?.updatedAt?.toMillis?.() ?? 0;
    if (Date.now() - updatedAt > staleMs) return null;
    const matches: Match[] = (data?.matches ?? []) as Match[];
    return matches.length > 0 ? matches : null;
  } catch {
    return null;
  }
}

// Stale thresholds for the client-written shared Firestore cache.
// Looser than appData (server-written) since clients may write concurrently.
const CLIENT_CACHE_STALE: Record<'live' | 'upcoming' | 'results', number> = {
  live:     3 * 60 * 1000,        // 3 min
  upcoming: 60 * 60 * 1000,       // 1 hour
  results:  30 * 60 * 1000,       // 30 min
};

async function readClientMatchCache(key: 'live' | 'upcoming' | 'results'): Promise<Match[] | null> {
  try {
    const snap = await getDoc(doc(db, 'clientMatchCache', key));
    if (!snap.exists()) return null;
    const data = snap.data();
    const updatedAt: number = data?.updatedAt?.toMillis?.() ?? 0;
    if (Date.now() - updatedAt > CLIENT_CACHE_STALE[key]) return null;
    const matches: Match[] = (data?.matches ?? []) as Match[];
    return matches.length > 0 ? matches : null;
  } catch {
    return null;
  }
}

async function writeClientMatchCache(key: 'live' | 'upcoming' | 'results', matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  try {
    await setDoc(doc(db, 'clientMatchCache', key), {
      cacheKey: key,
      matches,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical — never block the main data path
  }
}

async function fetchAppDataMatchesViaFunction(
  key: 'live' | 'upcoming' | 'results',
): Promise<Match[] | null> {
  if (!ENABLE_FIREBASE_FUNCTION_CALLS) {
    return null;
  }
  if (appMatchesCallableUnavailable) {
    return null;
  }
  try {
    const fn = httpsCallable<
      { kind: 'live' | 'upcoming' | 'results'; refresh?: boolean },
      { matches?: Match[] }
    >(functions, 'getAppMatches');
    const result = await withTimeout(fn({ kind: key, refresh: true }), 25000);
    const matches = result.data?.matches ?? [];
    return matches.length > 0 ? matches : null;
  } catch (error) {
    if (isCallableUnavailableError(error)) {
      appMatchesCallableUnavailable = true;
      console.warn('[FootballAPI] callable getAppMatches unavailable; skipping future callable attempts');
      return null;
    }
    console.warn(`[FootballAPI] callable getAppMatches failed for ${key}:`, error);
    return null;
  }
}

async function fetchMatchDetailViaFunction(
  fixtureId: number,
  options: { force?: boolean } = {},
): Promise<boolean> {
  if (!ENABLE_FIREBASE_FUNCTION_CALLS) {
    return false;
  }
  if (matchDetailCallableUnavailable) {
    return false;
  }
  try {
    const fn = httpsCallable<
      { fixtureId: number; force?: boolean },
      { fixtureId: number; cacheHit: boolean; refreshed: boolean; status: string | null }
    >(functions, 'getMatchDetail');
    await withTimeout(fn({ fixtureId, force: Boolean(options.force) }), 25000);
    return true;
  } catch (error) {
    if (isCallableUnavailableError(error)) {
      matchDetailCallableUnavailable = true;
      console.warn('[FootballAPI] callable getMatchDetail unavailable; skipping future callable attempts');
      return false;
    }
    console.warn(`[FootballAPI] callable getMatchDetail failed for fixture ${fixtureId}:`, error);
    return false;
  }
}
export interface Match {
  id: number;
  home: string;
  away: string;
  homeShortName?: string;
  awayShortName?: string;
  homeCode?: string;
  awayCode?: string;
  score?: string;
  time?: string;
  league: string;
  status: 'live' | 'upcoming' | 'finished';
  minute?: string;
  date: string;
  homeLogo?: string;
  awayLogo?: string;
  homeId?: number;  // NEW: for community generation
  awayId?: number;  // NEW: for community generation
  leagueId?: number;  // NEW: for community generation
  venueName?: string;
  venueCity?: string;
}

export interface Lineup {
  team: string;
  formation: string;
  startXI: Player[];
  substitutes: Player[];
}

export interface Player {
  name: string;
  number: number;
  position: string;
}

export interface MatchEvent {
  time: string;
  type: 'goal' | 'card' | 'substitution';
  player: string;
  team: string;
  detail?: string;
}

// NEW: Community interfaces
export interface TeamCommunity {
  id: number;
  name: string;
  logo: string;
  leagueId: number;
  leagueName: string;
}

export interface LeagueCommunity {
  id: number;
  name: string;
  logo?: string;
  country: string;
}

export interface LeagueStanding {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  goalsDiff: number;
  form: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface LeagueStandingGroup {
  name: string;
  standings: LeagueStanding[];
}

export interface LeagueStandingsResponse {
  leagueId: number;
  season: number | null;
  groups: LeagueStandingGroup[];
}

const isTransientNetworkError = (error: unknown) => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('premature close') || message.includes('network request failed') || message.includes('aborted');
};

export interface CompetitionInfo {
  leagueId: number;
  season: number;
  leagueName: string;
  logo?: string;
}

export interface TeamRecord {
  wins: number;
  draws: number;
  losses: number;
  record: string;
}

export interface LeagueTeamInfo {
  id: number;
  name: string;
  logo?: string;
  country?: string;
  code?: string;
  national?: boolean;
}

export interface FinishedMatch {
  id: number;
  home: string;
  away: string;
  score: string;
  homeGoals?: number;
  awayGoals?: number;
  league: string;
  date: string;
  homeLogo?: string;
  awayLogo?: string;
  leagueId?: number;
  homeId?: number;
  awayId?: number;
}

export interface HeadToHeadMatch {
  id: number;
  home: string;
  away: string;
  score: string;
  date: string;
  league: string;
  homeLogo?: string;
  awayLogo?: string;
}

export interface SquadPlayer {
  id: number;
  name: string;
  number?: number | null;
  position?: string | null;
  photo?: string;
}

export interface LiveFixtureResponse {
  fixture: any | null;
  events: any[];
  statistics: any[];
  lineups: any[];
}

interface MatchDetailSnapshot {
  fixtureId?: number;
  status?: Match['status'];
  fixture: any | null;
  events: any[];
  statistics: any[];
  lineups: any[];
  updatedAt?: number;
  finalizedAt?: number;
}

const LIVE_TTL_MS = 60 * 1000;
const UPCOMING_TTL_MS = 10 * 60 * 1000;
const RECENT_RESULTS_TTL_MS = 30 * 60 * 1000;
const STANDINGS_TTL_MS = 6 * 60 * 60 * 1000;
const MATCH_DETAIL_TTL_MS = 20 * 60 * 1000;
const TEAM_RECORD_TTL_MS = 6 * 60 * 60 * 1000;
const EMPTY_FIXTURE_DETAIL_TTL_MS = 60 * 1000;
const API_REQUEST_GAP_MS = 450;
const API_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const LIVE_CACHE_KEYS = ['matches:live:v2', 'matches:live'] as const;
const UPCOMING_CACHE_KEYS = ['matches:upcoming:7d:v14', 'matches:upcoming:7d:v13'] as const;
const COMMUNITIES_FROM_MATCHES_CACHE_KEY = 'communities:from-matches:v3';

const readFirstCachedMatchList = async (keys: readonly string[], ttlMs: number): Promise<Match[] | null> => {
  for (const key of keys) {
    const cached = await getCachedValueAsync<Match[]>(key, ttlMs);
    if (cached && cached.length > 0) return cached;
  }
  return null;
};

const writeMatchListCaches = async (keys: readonly string[], matches: Match[]) => {
  await Promise.all(keys.map((key) => setCachedValue(key, matches)));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const matchToFixtureShape = (match: Match) => {
  const [homeScoreRaw, awayScoreRaw] = String(match.score || '').split('-');
  const homeScore = Number(homeScoreRaw);
  const awayScore = Number(awayScoreRaw);
  const statusShort =
    match.status === 'finished'
      ? 'FT'
      : match.status === 'live'
        ? 'LIVE'
        : 'NS';

  return {
    fixture: {
      id: match.id,
      date: match.date,
      status: {
        short: statusShort,
        long: match.status,
        elapsed: match.minute ? Number(String(match.minute).replace(/[^0-9]/g, '')) || null : null,
      },
      venue: {
        name: match.venueName,
        city: match.venueCity,
      },
    },
    league: {
      id: match.leagueId,
      name: match.league,
    },
    teams: {
      home: {
        id: match.homeId,
        name: match.home,
        logo: match.homeLogo,
        short_name: match.homeShortName,
        code: match.homeCode,
      },
      away: {
        id: match.awayId,
        name: match.away,
        logo: match.awayLogo,
        short_name: match.awayShortName,
        code: match.awayCode,
      },
    },
    goals: {
      home: Number.isFinite(homeScore) ? homeScore : null,
      away: Number.isFinite(awayScore) ? awayScore : null,
    },
  };
};

const hydrateFixtureDetailCaches = async (fixtureId: number, snapshot: MatchDetailSnapshot) => {
  const tasks: Promise<void>[] = [];
  if (snapshot.fixture) {
    tasks.push(setCachedValue(`fixture:base:${fixtureId}`, snapshot.fixture));
    tasks.push(setCachedValue(`fixture:${fixtureId}:base`, { response: [snapshot.fixture] }));
  }
  if (snapshot.events?.length) {
    tasks.push(setCachedValue(`fixture:events:raw:${fixtureId}`, snapshot.events));
    tasks.push(setCachedValue(`fixture:${fixtureId}:events`, { response: snapshot.events }));
  }
  if (snapshot.statistics?.length) {
    tasks.push(setCachedValue(`fixture:stats:raw:${fixtureId}`, snapshot.statistics));
    tasks.push(setCachedValue(`fixture:${fixtureId}:stats`, { response: snapshot.statistics }));
  }
  if (snapshot.lineups?.length) {
    tasks.push(setCachedValue(`fixture:lineups:raw:${fixtureId}`, snapshot.lineups));
    tasks.push(setCachedValue(`fixture:${fixtureId}:lineups`, { response: snapshot.lineups }));
    tasks.push(setCachedValue(`fixture:${fixtureId}:lineups:detail`, { response: snapshot.lineups }));
  }
  await Promise.all(tasks);
};

class FootballAPI {
  private baseURL = 'https://v3.football.api-sports.io';
  private apiKey = API_CONFIG.FOOTBALL_API_KEY;
  private readonly inFlightEndpointRequests = new Map<string, Promise<any | null>>();
  private readonly inFlightCacheRequests = new Map<string, Promise<any | null>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private rateLimitedUntil = 0;
  private lastRateLimitLogAt = 0;
  private readonly currentSeasonCache = new Map<number, { season: number; expiresAt: number }>();
  private readonly currentSeasonTtlMs = 12 * 60 * 60 * 1000;
  private readonly leagueDetailsCache = new Map<number, { data: LeagueCommunity; expiresAt: number }>();
  private readonly leagueDetailsTtlMs = 6 * 60 * 60 * 1000;
  private readonly competitionLogoOverrides = new Map<number, string>([
    [94, 'https://www.ligaportugal.pt/backoffice/assets/lgcomposito_ligabetclic_81feb84fd5.png'],
    [16, 'https://www.concacaf.com/media/32llf14z/ccc_secondary_color.png?width=400'],
  ]);

  // Competition IDs shown across the app.
  private allowedLeagueIds = ALLOWED_COMPETITION_IDS;

  private finishedResultsLeagueIds = Array.from(new Set([...RESULTS_COMPETITION_IDS, ...ALLOWED_COMPETITION_IDS]));

  // Blocked keywords (youth, reserves, friendlies, non-WC qualifiers, AFCON, etc.)
  private blockedKeywords = [
    'u18', 'u19', 'u20', 'u21', 'u23',
    'youth', 'reserve', 'b team', 'ii',
    'women', 'feminino', 'femenino',
    'premier serie',
    'ascenso',
    'segunda', 'third division', 'fourth division',
    'amateur', 'regional',
    'friendl',  // blocks "Friendlies", "Friendly", "Club Friendlies", "International Friendlies"
    'africa cup', // blocks AFCON and AFCON qualifiers
    'afcon',
    'qualifier', // blocks non-World-Cup qualifiers for now
    'national league', // blocks lower-tier English National League
  ];

  // League names that are qualifiers but NOT World Cup qualifiers — blocked from results
  private blockedQualifierLeagueNames = [
    /afcon.*qual/i,
    /africa.*cup.*qual/i,
    /caf.*qual/i,
    /asian cup.*qual/i,
    /afc.*asian.*qual/i,
    /copa america.*qual/i,
    /gold cup.*qual/i,
    /euro.*qual/i,
    /nations league.*qual/i,
  ];

  private isBlockedText(value: string): boolean {
    const normalized = String(value || '').toLowerCase();
    return this.blockedKeywords.some((keyword) => {
      if (keyword === 'ii') {
        return /\bii\b/.test(normalized);
      }
      if (keyword.startsWith('u') && keyword.length === 3) {
        return new RegExp(`\\b${keyword}\\b`, 'i').test(normalized);
      }
      return normalized.includes(keyword);
    });
  }

  private isBlockedQualifierLeague(leagueName: string): boolean {
    return this.blockedQualifierLeagueNames.some((pattern) => pattern.test(leagueName));
  }

  private async runThrottledRequest<T>(request: () => Promise<T>): Promise<T> {
    const run = this.requestQueue.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(
        0,
        this.lastRequestAt + API_REQUEST_GAP_MS - now,
        this.rateLimitedUntil - now
      );
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.lastRequestAt = Date.now();
      return request();
    });

    this.requestQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async fetch(endpoint: string) {
    const pending = this.inFlightEndpointRequests.get(endpoint);
    if (pending) {
      return pending;
    }

    const request = this.fetchEndpoint(endpoint);
    this.inFlightEndpointRequests.set(endpoint, request);

    try {
      return await request;
    } finally {
      if (this.inFlightEndpointRequests.get(endpoint) === request) {
        this.inFlightEndpointRequests.delete(endpoint);
      }
    }
  }

  private async fetchEndpoint(endpoint: string) {
    try {
      if (Date.now() < this.rateLimitedUntil) {
        return null;
      }

      const response = await this.runThrottledRequest(() =>
        withTimeout(fetch(`${this.baseURL}${endpoint}`, {
          method: 'GET',
          headers: {
            'x-apisports-key': this.apiKey
          }
        }), 20000)
      );

      if (response.ok) {
        const data = await response.json();
        // api-sports.io returns HTTP 200 even for errors — check the body
        if (data?.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
          const errors = JSON.stringify(data.errors);
          if (errors.toLowerCase().includes('ratelimit') || errors.toLowerCase().includes('too many requests')) {
            this.rateLimitedUntil = Date.now() + API_RATE_LIMIT_COOLDOWN_MS;
            if (Date.now() - this.lastRateLimitLogAt > API_RATE_LIMIT_COOLDOWN_MS) {
              console.warn('[FootballAPI] API per-minute rate limit hit; pausing direct football API calls briefly.');
              this.lastRateLimitLogAt = Date.now();
            }
            return null;
          }
          console.warn('[FootballAPI] API error in response body:', errors, 'endpoint:', endpoint);
          return null;
        }
        return data;
      } else {
        console.warn('[FootballAPI] HTTP error:', response.status, 'endpoint:', endpoint);
      }
    } catch (error) {
      if (!isTransientNetworkError(error)) {
        console.warn('[FootballAPI] fetch error:', error, 'endpoint:', endpoint);
      }
    }
    return null;
  }

  private async fetchCached<T>(cacheKey: string, ttlMs: number, endpoint: string): Promise<T | null> {
    const pending = this.inFlightCacheRequests.get(cacheKey);
    if (pending) {
      return pending as Promise<T | null>;
    }

    const request = getOrFetchCached<T | null>(cacheKey, ttlMs, () => this.fetch(endpoint));
    this.inFlightCacheRequests.set(cacheKey, request);

    try {
      return await request;
    } finally {
      if (this.inFlightCacheRequests.get(cacheKey) === request) {
        this.inFlightCacheRequests.delete(cacheKey);
      }
    }
  }

  private async getCachedFixtureShapeById(fixtureId: number): Promise<any | null> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cacheKeys = [
      ...LIVE_CACHE_KEYS,
      ...UPCOMING_CACHE_KEYS,
      'results:all:v4',
      'results:finished',
      'matches:finished:7d:v9',
      `matches:finished:date:14d:${today}:v2`,
      `matches:finished:date:14d:${yesterday}:v2`,
    ];

    for (const key of cacheKeys) {
      const matches = await getCachedValueAsync<Match[]>(key, 30 * 24 * 60 * 60 * 1000);
      const match = matches?.find((item) => Number(item?.id) === fixtureId);
      if (match) return matchToFixtureShape(match);
    }

    return null;
  }

  private mergeMatchesByRecency(...sources: Match[][]): Match[] {
    const byId = new Map<number, Match>();
    sources.flat().forEach((match) => {
      if (!match?.id) return;
      byId.set(match.id, match);
    });
    return Array.from(byId.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private resolveCompetitionLogo(leagueId?: number, leagueName?: string, fallbackLogo?: string) {
    if (typeof leagueId === 'number') {
      const direct = this.competitionLogoOverrides.get(leagueId);
      if (direct) return direct;
    }

    const normalized = formatCompetitionLabel(leagueName).toLowerCase();
    if (
      normalized === 'primeira liga' ||
      normalized === 'liga portugal' ||
      normalized === 'liga portugal betclic'
    ) {
      return this.competitionLogoOverrides.get(94) || fallbackLogo || '';
    }
    if (
      normalized === 'concacaf champions' ||
      normalized === 'concacaf champions league' ||
      normalized === 'concacaf champions cup'
    ) {
      return this.competitionLogoOverrides.get(16) || fallbackLogo || '';
    }

    return fallbackLogo || '';
  }

  private async readMatchDetailSnapshot(
    fixtureId: number,
    staleMs: number,
  ): Promise<MatchDetailSnapshot | null> {
    const cacheKey = `matchDetailCache:${fixtureId}`;
    const memoryCached = await getCachedValueAsync<MatchDetailSnapshot>(cacheKey, staleMs);
    if (memoryCached?.fixture) {
      await hydrateFixtureDetailCaches(fixtureId, memoryCached);
      return memoryCached;
    }

    try {
      const snap = await getDoc(doc(db, 'matchDetailCache', String(fixtureId)));
      if (!snap.exists()) return null;
      const data = snap.data() as any;
      const updatedAt = data?.updatedAt?.toMillis?.() ?? 0;
      const finalizedAt = data?.finalizedAt?.toMillis?.() ?? 0;
      const ageMs = updatedAt ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
      const isFinalized = Boolean(finalizedAt);
      if (!isFinalized && ageMs > staleMs) return null;

      const snapshot: MatchDetailSnapshot = {
        fixtureId: data?.fixtureId,
        status: data?.status,
        fixture: data?.fixture ?? null,
        events: Array.isArray(data?.events) ? data.events : [],
        statistics: Array.isArray(data?.statistics) ? data.statistics : [],
        lineups: Array.isArray(data?.lineups) ? data.lineups : [],
        updatedAt,
        finalizedAt,
      };
      await setCachedValue(cacheKey, snapshot);
      await hydrateFixtureDetailCaches(fixtureId, snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }

  private async ensureMatchDetailSnapshot(
    fixtureId: number,
    staleMs: number,
    options: { force?: boolean } = {}
  ): Promise<MatchDetailSnapshot | null> {
    const existing = await this.readMatchDetailSnapshot(fixtureId, staleMs);
    if (existing) return existing;

    const refreshed = await fetchMatchDetailViaFunction(fixtureId, options);
    if (!refreshed) {
      return existing;
    }

    return this.readMatchDetailSnapshot(fixtureId, staleMs);
  }

  private async getLeagueDetails(leagueId: number): Promise<LeagueCommunity | null> {
    const cached = this.leagueDetailsCache.get(leagueId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    try {
      const data = await this.fetch(`/leagues?id=${leagueId}`);
      const league = data?.response?.[0]?.league;
      if (!league) return null;
      const mapped: LeagueCommunity = {
        id: league.id,
        name: league.name,
        logo: this.resolveCompetitionLogo(league.id, league.name, league.logo),
        country: league.country
      };
      this.leagueDetailsCache.set(leagueId, {
        data: mapped,
        expiresAt: Date.now() + this.leagueDetailsTtlMs
      });
      return mapped;
    } catch (error) {
      console.error('Error fetching league details:', error);
      return null;
    }
  }

  private hasBlockedFixtureKeywords(fixture: any): boolean {
    const leagueName = String(fixture?.league?.name || '');
    const homeName = String(fixture?.teams?.home?.name || '').toLowerCase();
    const awayName = String(fixture?.teams?.away?.name || '').toLowerCase();
    const leagueId = Number(fixture?.league?.id);
    const isNationalTeamFixture = Boolean(fixture?.teams?.home?.national) || Boolean(fixture?.teams?.away?.national);
    const isWorldCupFixture = leagueId === 1;
    return (
      this.isBlockedText(leagueName.toLowerCase()) ||
      this.isBlockedQualifierLeague(leagueName) ||
      (isNationalTeamFixture && !isWorldCupFixture) ||
      this.isBlockedText(homeName) ||
      this.isBlockedText(awayName)
    );
  }

  private getDirectApiAvailable() {
    return Boolean(this.apiKey);
  }

  private filterAllowedFixtures(fixtures: any[]) {
    return fixtures.filter((fixture) => {
      const leagueId = fixture?.league?.id;
      if (!leagueId || !this.allowedLeagueIds.includes(leagueId)) return false;
      if (this.hasBlockedFixtureKeywords(fixture)) return false;
      return true;
    });
  }

  private filterAllowedFinishedFixtures(fixtures: any[]) {
    return fixtures.filter((fixture) => {
      const leagueId = fixture?.league?.id;
      if (!leagueId || !this.finishedResultsLeagueIds.includes(leagueId)) return false;
      if (this.hasBlockedFixtureKeywords(fixture)) return false;
      return true;
    });
  }

  private async fetchLiveMatchesDirect(): Promise<Match[]> {
    if (!this.getDirectApiAvailable()) return [];
    const data = await this.fetch('/fixtures?live=all');
    const fixtures = this.filterAllowedFixtures(data?.response ?? []);
    return this.formatMatches(fixtures, 'live');
  }

  private async fetchUpcomingMatchesDirect(): Promise<Match[]> {
    if (!this.getDirectApiAvailable()) return [];
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const allFixtures: any[] = [];
    for (let i = 0; i < dates.length; i += 5) {
      const batch = dates.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((date) => this.fetch(`/fixtures?date=${date}&status=NS`))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allFixtures.push(...(result.value?.response ?? []));
        }
      }
    }

    const deduped = Array.from(
      new Map(this.filterAllowedFixtures(allFixtures).map((fixture) => [fixture?.fixture?.id, fixture])).values()
    );

    return this
      .formatMatches(deduped, 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 300);
  }

  private async fetchFinishedMatchesDirect(daysBack: number): Promise<Match[]> {
    if (!this.getDirectApiAvailable()) return [];
    const dates: string[] = [];
    for (let i = 0; i <= daysBack; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const results = await Promise.allSettled(
      dates.map((date) => this.fetch(`/fixtures?date=${date}&status=FT-AET-PEN`))
    );
    const allFixtures: any[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allFixtures.push(...(result.value?.response ?? []));
      }
    }

    const deduped = Array.from(
      new Map(this.filterAllowedFinishedFixtures(allFixtures).map((fixture) => [fixture?.fixture?.id, fixture])).values()
    );

    return this
      .formatMatches(deduped, 'finished')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 300);
  }

  private async fetchFallbackTeamCommunities(): Promise<TeamCommunity[]> {
    if (!this.getDirectApiAvailable()) return [];

    const leagueTeams = await Promise.allSettled(
      CORE_LEAGUE_COMPETITIONS.map(async (competition) => {
        const season = await this.getCurrentSeasonForLeague(competition.id);
        let teams = await this.getTeamsByLeague(competition.id, season);
        if (teams.length === 0 && season > 0) {
          teams = await this.getTeamsByLeague(competition.id, season - 1);
        }

        return teams.map((team) => ({
          id: team.id,
          name: team.name,
          logo: team.logo || `https://media.api-sports.io/football/teams/${team.id}.png`,
          leagueId: competition.id,
          leagueName: formatCompetitionLabel(competition.shortName || competition.name),
        }));
      })
    );

    const byId = new Map<number, TeamCommunity>();
    leagueTeams.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((team) => {
        if (!byId.has(team.id)) byId.set(team.id, team);
      });
    });

    return Array.from(byId.values());
  }

  async getLiveMatches(options: { preferCache?: boolean } = {}): Promise<Match[]> {
    if (options.preferCache === false) {
      const directMatches = await this.fetchLiveMatchesDirect();
      if (directMatches.length > 0) {
        await writeMatchListCaches(LIVE_CACHE_KEYS, directMatches);
        return directMatches;
      }
    }

    // Primary: Firestore appData/live written by fetchLiveScheduled every 2 min
    const firestoreLive = await readAppDataMatches('live', FIRESTORE_LIVE_STALE_MS);
    if (firestoreLive) {
      await writeMatchListCaches(LIVE_CACHE_KEYS, firestoreLive);
      return firestoreLive;
    }

    // Firestore stale/missing — use device-local short-lived cache (no direct API call)
    const cachedLive = await readFirstCachedMatchList(LIVE_CACHE_KEYS, 5 * 60 * 1000);
    if (cachedLive) return cachedLive;

    // Last resort: accept slightly stale Firestore rather than hitting the API
    const staleFirestore = await readAppDataMatches('live', 30 * 60 * 1000);
    if (staleFirestore) {
      await writeMatchListCaches(LIVE_CACHE_KEYS, staleFirestore);
      return staleFirestore;
    }

    const clientCacheLive = await readClientMatchCache('live');
    if (clientCacheLive) {
      await writeMatchListCaches(LIVE_CACHE_KEYS, clientCacheLive);
      return clientCacheLive;
    }

    const functionMatches = await fetchAppDataMatchesViaFunction('live');
    if (functionMatches) {
      await writeMatchListCaches(LIVE_CACHE_KEYS, functionMatches);
      void writeClientMatchCache('live', functionMatches);
      return functionMatches;
    }

    const directMatches = await this.fetchLiveMatchesDirect();
    if (directMatches.length > 0) {
      await writeMatchListCaches(LIVE_CACHE_KEYS, directMatches);
      void writeClientMatchCache('live', directMatches);
      return directMatches;
    }
    return [];
  }

  async getLeagueDetailsById(leagueId: number): Promise<LeagueCommunity | null> {
    return this.getLeagueDetails(leagueId);
  }
  /**
 * Get cached recent results (from previously live matches that finished)
 */
async getCachedRecentResults(limit: number = 8): Promise<Match[]> {
  try {
    const cached = await getCachedValueAsync<Match[]>('results:finished', 7 * 24 * 60 * 60 * 1000); // 7 days
    if (cached && cached.length > 0) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = cached.filter((m) => {
        if (!m?.date || new Date(m.date).getTime() < cutoff) return false;
        // Filter out non-allowed leagues that may have been cached by older code
        if (m.leagueId && !this.finishedResultsLeagueIds.includes(m.leagueId)) return false;
        return true;
      });
      return recent.slice(0, limit);
    }
    return [];
  } catch (error) {
    console.error('Error getting cached results:', error);
    return [];
  }
}

/**
 * Store finished match in results cache
 */
private async storeFinishedMatch(match: Match): Promise<void> {
  try {
    const cached = await getCachedValueAsync<Match[]>('results:finished', 7 * 24 * 60 * 60 * 1000) || [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const nextById = new Map<number, Match>();
    nextById.set(match.id, match);
    cached.forEach((item) => {
      if (!item?.id || item.id === match.id) return;
      // Prune matches older than 30 days
      if (new Date(item.date).getTime() < cutoff) return;
      nextById.set(item.id, item);
    });

    const updated = Array.from(nextById.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 80);

    await setCachedValue('results:finished', updated);
    if (__DEV__) {
      if (__DEV__) console.log(`âœ… Stored finished match: ${match.home} ${match.score} ${match.away}`);
    }
  } catch (error) {
    console.error('Error storing finished match:', error);
  }
}
  async rememberFinishedMatch(match: Match): Promise<void> {
    if (!match?.id) return;
    if (match.status !== 'finished') return;
    if (!match.home || !match.away) return;
    await this.storeFinishedMatch(match);
  }
  async getUpcomingMatches(options: { preferCache?: boolean } = {}): Promise<Match[]> {
    if (options.preferCache === false) {
      const directMatches = await this.fetchUpcomingMatchesDirect();
      if (directMatches.length > 0) {
        await writeMatchListCaches(UPCOMING_CACHE_KEYS, directMatches);
        void writeClientMatchCache('upcoming', directMatches);
        return directMatches;
      }

      const functionMatches = await fetchAppDataMatchesViaFunction('upcoming');
      if (functionMatches && functionMatches.length >= 5) {
        await writeMatchListCaches(UPCOMING_CACHE_KEYS, functionMatches);
        void writeClientMatchCache('upcoming', functionMatches);
        return functionMatches;
      }
    }

    // Cache for 5 min — keeps newly-added fixtures (e.g. same-day UCL matches) appearing quickly.
    const UPCOMING_DIRECT_CACHE_TTL = 5 * 60 * 1000;
    const cached = await readFirstCachedMatchList(UPCOMING_CACHE_KEYS, UPCOMING_DIRECT_CACHE_TTL);
    if (cached && cached.length >= 5) return cached;

    // If Firestore has data (Blaze plan with Cloud Functions), use it.
    const firestoreUpcoming = await readAppDataMatches('upcoming', FIRESTORE_UPCOMING_STALE_MS);
    if (firestoreUpcoming && firestoreUpcoming.length >= 5) {
      await writeMatchListCaches(UPCOMING_CACHE_KEYS, firestoreUpcoming);
      return firestoreUpcoming;
    }

    const clientCacheUpcoming = await readClientMatchCache('upcoming');
    if (clientCacheUpcoming && clientCacheUpcoming.length >= 5) {
      await writeMatchListCaches(UPCOMING_CACHE_KEYS, clientCacheUpcoming);
      return clientCacheUpcoming;
    }

    const functionMatches = await fetchAppDataMatchesViaFunction('upcoming');
    if (functionMatches && functionMatches.length >= 5) {
      await writeMatchListCaches(UPCOMING_CACHE_KEYS, functionMatches);
      void writeClientMatchCache('upcoming', functionMatches);
      return functionMatches;
    }

    // Fetch directly from the football API (works on any plan).
    const directMatches = await this.fetchUpcomingMatchesDirect();
    if (directMatches.length > 0) {
      await writeMatchListCaches(UPCOMING_CACHE_KEYS, directMatches);
      void writeClientMatchCache('upcoming', directMatches);
      return directMatches;
    }

    // Stale local cache as a final fallback.
    const staleLocal = await readFirstCachedMatchList(UPCOMING_CACHE_KEYS, 24 * 60 * 60 * 1000);
    return staleLocal ?? [];
  }

  async getPregameMatches45m(): Promise<Match[]> {
    const upcoming = await this.getUpcomingMatches();
    const now = new Date();
    return upcoming.filter(match => {
      const kickoff = new Date(match.date);
      return !Number.isNaN(kickoff.getTime()) && isPregameWindow(kickoff, now);
    });
  }

  /**
   * Get finished fixtures from the last N days.
   * Queries by date (one call per day) instead of per-league to avoid rate limits.
   */
  async getFinishedFixtures(daysBack: number = 7, _options: { preferCache?: boolean } = {}): Promise<Match[]> {
    const today = new Date().toISOString().split('T')[0];
    // Older dates are stable — cache them for 24h.
    // Today's results change throughout the day, so only cache for 30 min.
    const OLDER_CACHE_TTL = 24 * 60 * 60 * 1000;
    const TODAY_CACHE_TTL = 30 * 60 * 1000;
    const cacheKey = `matches:finished:date:${daysBack}d:${today}:v2`;

    // Direct API is the only reliable source on the Spark plan (no Cloud Functions).
    // Try to hit it every time unless a recent full-dataset cache exists.
    const cached = await getCachedValueAsync<Match[]>(cacheKey, TODAY_CACHE_TTL);
    if (cached && cached.length >= 20) return cached;

    // Older date-keyed caches (from previous days) may still be valid.
    const olderCached = await getCachedValueAsync<Match[]>(cacheKey, OLDER_CACHE_TTL);
    if (olderCached && olderCached.length >= 20 && today !== new Date().toISOString().split('T')[0]) {
      return olderCached;
    }

    // Try Firestore (only populated if Cloud Functions are deployed on Blaze plan).
    const firestoreResults = await readAppDataMatches('results', FIRESTORE_RESULTS_STALE_MS);
    if (firestoreResults && firestoreResults.length >= 5) {
      await setCachedValue(cacheKey, firestoreResults);
      return firestoreResults;
    }

    const clientCacheResults = await readClientMatchCache('results');
    if (clientCacheResults && clientCacheResults.length >= 5) {
      await setCachedValue(cacheKey, clientCacheResults);
      return clientCacheResults;
    }

    const functionMatches = await fetchAppDataMatchesViaFunction('results');
    if (functionMatches && functionMatches.length >= 5) {
      await setCachedValue(cacheKey, functionMatches);
      void writeClientMatchCache('results', functionMatches);
      return functionMatches;
    }

    // Primary path on Spark plan: fetch directly from the football API.
    const directMatches = await this.fetchFinishedMatchesDirect(daysBack);
    if (directMatches.length > 0) {
      await setCachedValue(cacheKey, directMatches);
      await setCachedValue('results:finished', directMatches.slice(0, 80));
      void writeClientMatchCache('results', directMatches);
      return directMatches;
    }

    // Last resort: stale Firestore or local results:finished fallback
    const staleFirestore = await readAppDataMatches('results', 7 * 24 * 60 * 60 * 1000);
    if (staleFirestore && staleFirestore.length >= 5) return staleFirestore;

    return olderCached ?? [];
  }

  /**
   * Get recent finished fixtures with limit.
   * Uses a single 14-day window — avoids redundant multi-window API calls.
   */
  async getRecentFinishedFixtures(limit: number = 8, options: { preferCache?: boolean } = {}): Promise<Match[]> {
    const [fromApi, fromCache] = await Promise.all([
      this.getFinishedFixtures(14, options),
      this.getCachedRecentResults(Math.max(limit * 2, 40)),
    ]);
    return this.mergeMatchesByRecency(fromApi, fromCache).slice(0, limit);
  }

  // Scan the device's upcoming match cache for games that kicked off 115+ minutes
  // ago (definitely finished) but haven't appeared in the results feed yet.
  // Fetches their current fixture status via Firebase Functions and returns any
  // that the API confirms are finished.
  async getResultsFromPastUpcomingCache(): Promise<Match[]> {
    const FINISHED_THRESHOLD_MS = 115 * 60 * 1000;
    const now = Date.now();
    const TERMINAL = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

    const upcomingCached =
      (await getCachedValueAsync<Match[]>(UPCOMING_CACHE_KEYS[0], 24 * 60 * 60 * 1000)) ??
      (await getCachedValueAsync<Match[]>(UPCOMING_CACHE_KEYS[1], 24 * 60 * 60 * 1000)) ??
      [];

    const pastKickoff = upcomingCached
      .filter(m => {
        const kickoff = new Date(m.date).getTime();
        return Number.isFinite(kickoff) && now - kickoff >= FINISHED_THRESHOLD_MS;
      })
      .slice(0, 10);

    if (pastKickoff.length === 0) return [];

    const settled = await Promise.allSettled(
      pastKickoff.map(m => this.getFixtureById(Number(m.id)))
    );

    const rawFinished: any[] = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      if (TERMINAL.has(r.value.fixture?.status?.short)) rawFinished.push(r.value);
    }

    return this.formatMatches(rawFinished, 'finished');
  }

  /**
   * NEW: Extract unique teams and leagues from live + upcoming matches
   */
  async getCommunitiesFromMatches(): Promise<{
    teams: TeamCommunity[];
    leagues: LeagueCommunity[];
  }> {
    return getOrFetchCached<{ teams: TeamCommunity[]; leagues: LeagueCommunity[] }>(COMMUNITIES_FROM_MATCHES_CACHE_KEY, STANDINGS_TTL_MS, async () => {
      const getFallbackResult = async () => ({
        teams: await this.fetchFallbackTeamCommunities(),
        leagues: CORE_LEAGUE_COMPETITIONS.map((competition) => ({
          id: competition.id,
          name: formatCompetitionLabel(competition.shortName || competition.name),
          logo: `https://media.api-sports.io/football/leagues/${competition.id}.png`,
          country: competition.country,
        })),
      });

      try {
      if (__DEV__) {
        console.time('communities.matchesFetch');
      }
      const [liveMatches, upcomingMatches] = await Promise.all([
        this.getLiveMatches(),
        this.getUpcomingMatches()
      ]);
      if (__DEV__) {
        console.timeEnd('communities.matchesFetch');
      }

      const allMatches = [...liveMatches, ...upcomingMatches];

      if (__DEV__) {
        console.time('communities.extract');
      }
      const teamsMap = new Map<number, TeamCommunity>();
      const leaguesMap = new Map<number, LeagueCommunity>();
      const competitionPriority = (leagueName: string) => {
        const name = (leagueName || '').toLowerCase();
        if (name.includes('champions league')) return 80;
        if (name.includes('europa conference')) return 80;
        if (name.includes('europa league')) return 80;
        if (name.includes('super cup')) return 75;
        if (name.includes('world cup')) return 85;
        if (
          name.includes('premier league') ||
          name.includes('la liga') ||
          name.includes('serie a') ||
          name.includes('bundesliga') ||
          name.includes('ligue 1')
        ) {
          return 10;
        }
        if (name.includes('cup') || name.includes('copa') || name.includes('pokal')) return 40;
        return 25;
      };
      const upsertTeamCommunity = (
        id: number,
        next: TeamCommunity
      ) => {
        const existing = teamsMap.get(id);
        if (!existing) {
          teamsMap.set(id, next);
          return;
        }
        const existingPriority = competitionPriority(existing.leagueName || '');
        const nextPriority = competitionPriority(next.leagueName || '');
        // Prefer a club's primary domestic league over tournament/cup competition labels.
        if (nextPriority <= existingPriority) {
          teamsMap.set(id, next);
        }
      };

      for (const match of allMatches) {
        if (match.homeId && match.homeLogo) {
          upsertTeamCommunity(match.homeId, {
            id: match.homeId,
            name: match.home,
            logo: match.homeLogo,
            leagueId: match.leagueId || 0,
            leagueName: match.league
          });
        }
        if (match.awayId && match.awayLogo) {
          upsertTeamCommunity(match.awayId, {
            id: match.awayId,
            name: match.away,
            logo: match.awayLogo,
            leagueId: match.leagueId || 0,
            leagueName: match.league
          });
        }
        if (match.leagueId) {
          leaguesMap.set(match.leagueId, {
            id: match.leagueId,
            name: match.league,
            logo: '',
            country: ''
          });
        }
      }

      if (__DEV__) {
        console.timeEnd('communities.extract');
      }

      if (ENABLE_CLIENT_LEAGUE_DETAILS_ENRICHMENT) {
        const leagueIds = Array.from(leaguesMap.keys());
        if (__DEV__) {
          console.time('communities.leaguesFetch');
        }
        const leagueDetails = await Promise.all(
          leagueIds.map(id => this.getLeagueDetails(id))
        );
        if (__DEV__) {
          console.timeEnd('communities.leaguesFetch');
        }
        leagueDetails.forEach(detail => {
          if (detail) {
            leaguesMap.set(detail.id, detail);
          }
        });
      }

      if (__DEV__) {
        if (__DEV__) console.log(`Generated ${teamsMap.size} team communities and ${leaguesMap.size} league communities`);
      }

      const result = {
        teams: Array.from(teamsMap.values()),
        leagues: Array.from(leaguesMap.values())
      };
      if (result.teams.length === 0 && result.leagues.length === 0) {
        if (__DEV__) {
          console.warn('Community generation returned no match-derived results; using fallback league catalog.');
        }
        return getFallbackResult();
      }
      return result;
    } catch (error) {
      console.warn('Error getting communities from matches; using fallback league catalog:', error);
      return getFallbackResult();
    }
    }, 60000);
  }

  /**
   * NEW: Get league standings
   */
  async getLeagueStandings(leagueId: number, season: number = 2024): Promise<LeagueStanding[]> {
    return getOrFetchCached<LeagueStanding[]>(`standings:league:${leagueId}:season:${season}`, STANDINGS_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`standings:raw:${leagueId}:${season}`, STANDINGS_TTL_MS, `/standings?league=${leagueId}&season=${season}`);
        
        if (data?.response?.[0]?.league?.standings?.[0]) {
          const standings = data.response[0].league.standings[0];
          
          return standings.map((s: any) => ({
            rank: s.rank,
            team: {
              id: s.team.id,
              name: s.team.name,
              logo: s.team.logo
            },
            points: s.points,
            goalsDiff: s.goalsDiff,
            form: s.form,
            played: s.all.played,
            win: s.all.win,
            draw: s.all.draw,
            lose: s.all.lose,
            goalsFor: s.all.goals.for,
            goalsAgainst: s.all.goals.against
          }));
        }
      } catch (error) {
        console.error('Error fetching league standings:', error);
      }
      
      return [];
    });
  }

  /**
   * World Cup helpers (generic league endpoints)
   */
  async getCompetitionByName(name: string, season?: number): Promise<CompetitionInfo | null> {
    const query = encodeURIComponent(name);
    const data = await this.fetchCached<any>(`leagues:search:${query}`, STANDINGS_TTL_MS, `/leagues?search=${query}`);
    const responses: any[] = data?.response || [];
    if (responses.length === 0) return null;

    const normalized = name.toLowerCase();
    const scored = responses
      .map((entry) => {
        const league = entry?.league;
        const seasons = entry?.seasons || [];
        if (!league?.id || !league?.name) return null;
        const lname = String(league.name).toLowerCase();
        let score = 0;
        if (lname === normalized) score += 5;
        if (lname.includes(normalized)) score += 3;
        if (String(league.country || '').toLowerCase() === 'world') score += 2;
        if (String(league.type || '').toLowerCase() === 'cup') score += 1;
        return { league, seasons, score };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score);

    const best = scored[0];
    if (!best) return null;

    const seasons = best.seasons as { year: number; current?: boolean }[];
    if (!seasons || seasons.length === 0) return null;

    let resolvedSeason = season ?? seasons.find(s => s.current)?.year ?? Math.max(...seasons.map(s => s.year));
    if (!seasons.find(s => s.year === resolvedSeason)) {
      resolvedSeason = Math.max(...seasons.map(s => s.year));
    }

    return {
      leagueId: best.league.id,
      season: resolvedSeason,
      leagueName: best.league.name,
      logo: this.resolveCompetitionLogo(best.league.id, best.league.name, best.league.logo),
    };
  }

  async getTeamsByLeague(leagueId: number, season: number): Promise<LeagueTeamInfo[]> {
    const data = await this.fetchCached<any>(
      `teams:league:${leagueId}:season:${season}`,
      STANDINGS_TTL_MS,
      `/teams?league=${leagueId}&season=${season}`
    );
    const response: any[] = data?.response || [];
    return response
      .map(entry => entry?.team)
      .filter(Boolean)
      .map(team => ({
        id: team.id,
        name: team.name,
        logo: team.logo,
        country: team.country,
        code: team.code,
        national: team.national,
      }))
      .filter(team => Number.isFinite(team.id));
  }

  async searchTeamsByName(name: string): Promise<LeagueTeamInfo[]> {
    const query = encodeURIComponent(name.trim());
    if (!query) return [];
    const data = await this.fetchCached<any>(
      `teams:search:${query}`,
      STANDINGS_TTL_MS,
      `/teams?search=${query}`
    );
    const response: any[] = data?.response || [];
    return response
      .map(entry => entry?.team)
      .filter(Boolean)
      .map(team => ({
        id: team.id,
        name: team.name,
        logo: team.logo,
        country: team.country,
        code: team.code,
        national: team.national,
      }))
      .filter(team => Number.isFinite(team.id));
  }

  async getNationalTeamsByCountry(country: string): Promise<LeagueTeamInfo[]> {
    const query = encodeURIComponent(country.trim());
    if (!query) return [];
    const data = await this.fetchCached<any>(
      `teams:country:${query}`,
      STANDINGS_TTL_MS,
      `/teams?country=${query}`
    );
    const response: any[] = data?.response || [];
    return response
      .map(entry => entry?.team)
      .filter(Boolean)
      .map(team => ({
        id: team.id,
        name: team.name,
        logo: team.logo,
        country: team.country,
        code: team.code,
        national: team.national,
      }))
      .filter(team => Number.isFinite(team.id) && team.national);
  }

  async getFixturesByLeague(leagueId: number, season: number): Promise<any[]> {
    const data = await this.fetchCached<any>(
      `fixtures:league:${leagueId}:season:${season}`,
      UPCOMING_TTL_MS,
      `/fixtures?league=${leagueId}&season=${season}`
    );
    return data?.response || [];
  }

  async getStandingsByLeague(leagueId: number, season: number): Promise<any | null> {
    const data = await this.fetchCached<any>(
      `standings:league:${leagueId}:season:${season}`,
      STANDINGS_TTL_MS,
      `/standings?league=${leagueId}&season=${season}`
    );
    return data?.response?.[0] || null;
  }

  private async getCurrentSeasonForLeague(leagueId: number): Promise<number> {
    const cached = this.currentSeasonCache.get(leagueId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.season;
    }

    try {
      const data = await this.fetch(`/leagues?id=${leagueId}`);
      const seasons = Array.isArray(data?.response?.[0]?.seasons) ? data.response[0].seasons : [];
      const currentSeason = seasons.find((season: any) => season?.current === true)?.year;
      const latestSeason = seasons
        .map((season: any) => season?.year)
        .filter((year: unknown): year is number => typeof year === 'number')
        .sort((a: number, b: number) => b - a)[0];
      const resolvedSeason =
        typeof currentSeason === 'number'
          ? currentSeason
          : typeof latestSeason === 'number'
            ? latestSeason
            : new Date().getFullYear();
      this.currentSeasonCache.set(leagueId, {
        season: resolvedSeason,
        expiresAt: Date.now() + this.currentSeasonTtlMs
      });
      return resolvedSeason;
    } catch (error) {
      console.error('Error fetching current season:', error);
    }

    // Smart fallback: most European/world leagues run Aug→May, so before August
    // the current season year is (currentYear - 1). E.g. March 2025 → season 2024.
    const now = new Date();
    return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
  }

  async getLeagueStandingsByCurrentSeason(leagueId: number): Promise<LeagueStandingsResponse> {
    try {
      const season = await this.getCurrentSeasonForLeague(leagueId);
      return await getOrFetchCached<LeagueStandingsResponse>(`standings:league:${leagueId}:season:${season}`, STANDINGS_TTL_MS, async () => {
        const data = await this.fetchCached<any>(`standings:raw:${leagueId}:${season}`, STANDINGS_TTL_MS, `/standings?league=${leagueId}&season=${season}`);

        const rawStandings = data?.response?.[0]?.league?.standings;
        if (!rawStandings) {
          return { leagueId, season, groups: [] };
        }

        const groups: LeagueStandingGroup[] = rawStandings.map((group: any[]) => {
          const name = group?.[0]?.group || data?.response?.[0]?.league?.name || 'Standings';
          const standings = group.map((s: any) => ({
            rank: s.rank,
            team: {
              id: s.team.id,
              name: s.team.name,
              logo: s.team.logo
            },
            points: s.points,
            goalsDiff: s.goalsDiff,
            form: s.form,
            played: s.all.played,
            win: s.all.win,
            draw: s.all.draw,
            lose: s.all.lose,
            goalsFor: s.all.goals.for,
            goalsAgainst: s.all.goals.against
          }));

          return { name, standings };
        });

        return { leagueId, season, groups };
      });
    } catch (error) {
      console.error('Error fetching league standings:', error);
      return { leagueId, season: null, groups: [] };
    }
  }

  async getTeamSquad(teamId: number): Promise<SquadPlayer[]> {
    return getOrFetchCached<SquadPlayer[]>(`team:squad:${teamId}`, STANDINGS_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(
          `players:squads:${teamId}`,
          STANDINGS_TTL_MS,
          `/players/squads?team=${teamId}`
        );
        const squad = data?.response?.[0]?.players || [];
        return squad
          .filter((p: any) => p?.id && p?.name)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            number: p.number ?? null,
            position: p.position ?? null,
            photo: p.photo,
          }));
      } catch (error) {
        console.error('Error fetching team squad:', error);
        return [];
      }
    });
  }

  async getTeamSquadFresh(teamId: number): Promise<SquadPlayer[]> {
    try {
      const data = await this.fetch(`/players/squads?team=${teamId}`);
      const squad = data?.response?.[0]?.players || [];
      const mapped = squad
        .filter((p: any) => p?.id && p?.name)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          number: p.number ?? null,
          position: p.position ?? null,
          photo: p.photo,
        }));
      if (mapped.length > 0) {
        await setCachedValue(`team:squad:${teamId}`, mapped);
      }
      return mapped;
    } catch (error) {
      console.error('Error fetching team squad (fresh):', error);
      return [];
    }
  }

  async getTeamPlayersBySeason(teamId: number, season: number): Promise<SquadPlayer[]> {
    return getOrFetchCached<SquadPlayer[]>(`team:players:${teamId}:season:${season}`, STANDINGS_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(
          `players:team:${teamId}:season:${season}`,
          STANDINGS_TTL_MS,
          `/players?team=${teamId}&season=${season}`
        );
        const response: any[] = data?.response || [];
        return response
          .map((entry: any) => ({
            id: entry?.player?.id,
            name: entry?.player?.name,
            number: entry?.statistics?.[0]?.games?.number ?? null,
            position: entry?.statistics?.[0]?.games?.position ?? null,
            photo: entry?.player?.photo,
          }))
          .filter((player) => player.id && player.name);
      } catch (error) {
        console.error('Error fetching team players by season:', error);
        return [];
      }
    });
  }

  async getCurrentSeason(leagueId: number): Promise<number> {
    return this.getCurrentSeasonForLeague(leagueId);
  }

  async getFixtureLive(fixtureId: number): Promise<LiveFixtureResponse> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, 30 * 1000);
    if (snapshot?.fixture) {
      return {
        fixture: snapshot.fixture,
        events: snapshot.events || [],
        statistics: snapshot.statistics || [],
        lineups: snapshot.lineups || [],
      };
    }

    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) {
      return { fixture: null, events: [], statistics: [], lineups: [] };
    }

    return getOrFetchCached<LiveFixtureResponse>(`fixture:live:${fixtureId}`, LIVE_TTL_MS, async () => {
      try {
        const [fixtureData, eventsData, statsData, lineupsData] = await Promise.all([
          this.fetchCached<any>(`fixture:${fixtureId}:base`, LIVE_TTL_MS, `/fixtures?id=${fixtureId}`),
          this.fetchCached<any>(`fixture:${fixtureId}:events`, LIVE_TTL_MS, `/fixtures/events?fixture=${fixtureId}`),
          this.fetchCached<any>(`fixture:${fixtureId}:stats`, LIVE_TTL_MS, `/fixtures/statistics?fixture=${fixtureId}`),
          this.fetchCached<any>(`fixture:${fixtureId}:lineups`, LIVE_TTL_MS, `/fixtures/lineups?fixture=${fixtureId}`),
        ]);

        return {
          fixture: fixtureData?.response?.[0] ?? null,
          events: eventsData?.response ?? [],
          statistics: statsData?.response ?? [],
          lineups: lineupsData?.response ?? [],
        };
      } catch (error) {
        console.error('Error fetching live fixture:', error);
        return { fixture: null, events: [], statistics: [], lineups: [] };
      }
    });
  }

  async getFixtureForNotifications(fixtureId: number): Promise<Pick<LiveFixtureResponse, 'fixture' | 'events'>> {
    // Use a short stale window so each poll cycle gets a fresh Firestore read rather than
    // returning a 3-minute-old memory-cached snapshot that would miss recent goals.
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, 25 * 1000);
    if (snapshot?.fixture) {
      const statusShort = String(snapshot.fixture?.fixture?.status?.short || '').toUpperCase();
      const shouldUseEvents = ['1H', '2H', 'ET', 'HT', 'LIVE'].includes(statusShort);
      return { fixture: snapshot.fixture, events: shouldUseEvents ? (snapshot.events || []) : [] };
    }

    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) {
      return { fixture: null, events: [] };
    }

    const fixtureData = await this.fetchCached<any>(`fixture:${fixtureId}:base`, LIVE_TTL_MS, `/fixtures?id=${fixtureId}`);
    const fixture = fixtureData?.response?.[0] ?? null;
    if (!fixture) {
      return { fixture: null, events: [] };
    }

    const statusShort = String(fixture?.fixture?.status?.short || '').toUpperCase();
    const shouldFetchEvents = ['1H', '2H', 'ET', 'HT', 'LIVE'].includes(statusShort);
    if (!shouldFetchEvents) {
      return { fixture, events: [] };
    }

    const eventsData = await this.fetchCached<any>(`fixture:${fixtureId}:events`, LIVE_TTL_MS, `/fixtures/events?fixture=${fixtureId}`);
    const events = eventsData?.response ?? [];
    return { fixture, events };
  }

  async getFixtureLineupsRaw(fixtureId: number): Promise<any[]> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, MATCH_DETAIL_TTL_MS);
    if (snapshot?.lineups?.length) return snapshot.lineups;
    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) return [];
    return getOrFetchCached<any[]>(`fixture:lineups:raw:${fixtureId}`, MATCH_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixture:${fixtureId}:lineups:detail`, MATCH_DETAIL_TTL_MS, `/fixtures/lineups?fixture=${fixtureId}`);
        return data?.response ?? [];
      } catch (error) {
        console.error('Error fetching fixture lineups:', error);
        return [];
      }
    });
  }

  async getFixtureEvents(fixtureId: number): Promise<any[]> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, MATCH_DETAIL_TTL_MS);
    if (snapshot?.events?.length) return snapshot.events;
    const cacheKey = `fixture:events:raw:${fixtureId}`;
    const populated = await getCachedValueAsync<any[]>(cacheKey, MATCH_DETAIL_TTL_MS);
    if (populated && populated.length > 0) {
      return populated;
    }
    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) return populated ?? [];

    return getOrFetchCached<any[]>(cacheKey, EMPTY_FIXTURE_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixture:${fixtureId}:events`, EMPTY_FIXTURE_DETAIL_TTL_MS, `/fixtures/events?fixture=${fixtureId}`);
        const response = data?.response ?? [];
        await setCachedValue(cacheKey, response);
        return response;
      } catch (error) {
        console.error('Error fetching fixture events:', error);
        return populated ?? [];
      }
    });
  }

  async getFixtureLineups(fixtureId: number): Promise<any[]> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, MATCH_DETAIL_TTL_MS);
    if (snapshot?.lineups?.length) return snapshot.lineups;
    const cacheKey = `fixture:lineups:raw:${fixtureId}`;
    const populated = await getCachedValueAsync<any[]>(cacheKey, MATCH_DETAIL_TTL_MS);
    if (populated && populated.length > 0) {
      return populated;
    }
    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) return populated ?? [];

    return getOrFetchCached<any[]>(cacheKey, EMPTY_FIXTURE_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixture:${fixtureId}:lineups:detail`, EMPTY_FIXTURE_DETAIL_TTL_MS, `/fixtures/lineups?fixture=${fixtureId}`);
        const response = data?.response ?? [];
        await setCachedValue(cacheKey, response);
        return response;
      } catch (error) {
        console.error('Error fetching fixture lineups:', error);
        return populated ?? [];
      }
    });
  }

  async getFixtureStatistics(fixtureId: number): Promise<any[]> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, MATCH_DETAIL_TTL_MS);
    if (snapshot?.statistics?.length) return snapshot.statistics;
    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) return [];
    return getOrFetchCached<any[]>(`fixture:stats:raw:${fixtureId}`, MATCH_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixture:${fixtureId}:stats`, MATCH_DETAIL_TTL_MS, `/fixtures/statistics?fixture=${fixtureId}`);
        return data?.response ?? [];
      } catch (error) {
        console.error('Error fetching fixture stats:', error);
        return [];
      }
    });
  }

  async getTeamRecord(teamId: number, leagueId: number, season: number): Promise<TeamRecord | null> {
    return getOrFetchCached<TeamRecord | null>(`team:record:${teamId}:${leagueId}:${season}`, TEAM_RECORD_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(
          `team:stats:${teamId}:${leagueId}:${season}`,
          TEAM_RECORD_TTL_MS,
          `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`
        );
        const stats = data?.response;
        if (!stats) return null;
        const wins = stats?.fixtures?.wins?.total ?? 0;
        const draws = stats?.fixtures?.draws?.total ?? 0;
        const losses = stats?.fixtures?.loses?.total ?? 0;
        return { wins, draws, losses, record: `${wins}-${draws}-${losses}` };
      } catch (error) {
        console.error('Error fetching team record:', error);
        return null;
      }
    });
  }

  async getFixtureById(fixtureId: number): Promise<any | null> {
    const snapshot = await this.ensureMatchDetailSnapshot(fixtureId, MATCH_DETAIL_TTL_MS);
    if (snapshot?.fixture) return snapshot.fixture;
    if (!ENABLE_CLIENT_DIRECT_API_DETAIL_FALLBACK) return this.getCachedFixtureShapeById(fixtureId);
    return getOrFetchCached<any | null>(`fixture:base:${fixtureId}`, MATCH_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixture:${fixtureId}:base`, MATCH_DETAIL_TTL_MS, `/fixtures?id=${fixtureId}`);
        return data?.response?.[0] ?? await this.getCachedFixtureShapeById(fixtureId);
      } catch (error) {
        console.error('Error fetching fixture base:', error);
        return this.getCachedFixtureShapeById(fixtureId);
      }
    });
  }

  /**
   * NEW: Get team's last match result
   */
  async getTeamLastMatch(teamId: number): Promise<FinishedMatch | null> {
    return getOrFetchCached<FinishedMatch | null>(`team:last:${teamId}`, RECENT_RESULTS_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:team:${teamId}:last:1`, RECENT_RESULTS_TTL_MS, `/fixtures?team=${teamId}&last=1`);
        
        if (data?.response?.[0]) {
          const fixture = data.response[0];
          
          return {
            id: fixture.fixture.id,
            home: fixture.teams.home.name,
            away: fixture.teams.away.name,
            score: `${fixture.goals.home}-${fixture.goals.away}`,
            homeGoals: fixture.goals.home,
            awayGoals: fixture.goals.away,
            league: fixture.league.name,
            leagueId: fixture.league.id,
            date: fixture.fixture.date,
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo
          };
        }
      } catch (error) {
        console.error('Error fetching team last match:', error);
      }
      
      return null;
    });
  }

  /**
   * NEW: Get team's last fixtures
   */
  async getTeamLastFixtures(teamId: number, limit: number = 5): Promise<FinishedMatch[]> {
    const TEAM_FIXTURES_TTL = 4 * 60 * 60 * 1000; // 4h — past results don't change, save API quota
    return getOrFetchCached<FinishedMatch[]>(`team:last:${teamId}:${limit}`, TEAM_FIXTURES_TTL, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:team:${teamId}:last:${limit}`, TEAM_FIXTURES_TTL, `/fixtures?team=${teamId}&last=${limit}`);

        if (data?.response) {
          return data.response.map((fixture: any) => ({
            id: fixture.fixture.id,
            home: fixture.teams.home.name,
            away: fixture.teams.away.name,
            score: `${fixture.goals.home}-${fixture.goals.away}`,
            homeGoals: fixture.goals.home,
            awayGoals: fixture.goals.away,
            league: fixture.league.name,
            leagueId: fixture.league.id,
            date: fixture.fixture.date,
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo,
            homeId: fixture.teams.home.id,
            awayId: fixture.teams.away.id,
          }));
        }
      } catch (error) {
        console.error('Error fetching team last fixtures:', error);
      }

      return [];
    });
  }

  async getTeamCompetitionLastFinishedFixtures(
    teamId: number,
    leagueId: number,
    season: number,
    limit: number = 5
  ): Promise<FinishedMatch[]> {
    const fetchLimit = Math.max(limit * 3, 10);
    return getOrFetchCached<FinishedMatch[]>(
      `team:last:competition:${teamId}:${leagueId}:${season}:${limit}`,
      RECENT_RESULTS_TTL_MS,
      async () => {
        try {
          const data = await this.fetchCached<any>(
            `fixtures:team:${teamId}:league:${leagueId}:season:${season}:last:${fetchLimit}`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&last=${fetchLimit}`
          );

          const fixtures = (data?.response || [])
            .filter((fixture: any) => {
              const short = String(fixture?.fixture?.status?.short || '').toUpperCase();
              return short === 'FT' || short === 'AET' || short === 'PEN';
            })
            .sort(
              (a: any, b: any) =>
                new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime()
            )
            .slice(0, limit)
            .map((fixture: any) => ({
              id: fixture.fixture.id,
              home: fixture.teams.home.name,
              away: fixture.teams.away.name,
              score: `${fixture.goals.home}-${fixture.goals.away}`,
              homeGoals: fixture.goals.home,
              awayGoals: fixture.goals.away,
              league: fixture.league.name,
              leagueId: fixture.league.id,
              date: fixture.fixture.date,
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              homeId: fixture.teams.home.id,
              awayId: fixture.teams.away.id,
            }));

          return fixtures;
        } catch (error) {
          console.error('Error fetching team competition fixtures:', error);
          return [];
        }
      }
    );
  }

  /**
   * NEW: Get team's upcoming matches
   */
  async getTeamUpcomingMatches(teamId: number, limit: number = 5): Promise<Match[]> {
    return getOrFetchCached<Match[]>(`team:upcoming:${teamId}:${limit}`, UPCOMING_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:team:${teamId}:next:${limit}`, UPCOMING_TTL_MS, `/fixtures?team=${teamId}&next=${limit}`);
        
        if (data?.response) {
          return this.formatMatches(data.response, 'upcoming');
        }
      } catch (error) {
        console.error('Error fetching team upcoming matches:', error);
      }
      
      return [];
    });
  }

  async getHeadToHeadLastMeeting(homeTeamId: number, awayTeamId: number): Promise<HeadToHeadMatch | null> {
    return getOrFetchCached<HeadToHeadMatch | null>(
      `fixtures:h2h:last:v2:${homeTeamId}:${awayTeamId}`,
      RECENT_RESULTS_TTL_MS,
      async () => {
        try {
          const h2hPrimary = `${homeTeamId}-${awayTeamId}`;
          const h2hReverse = `${awayTeamId}-${homeTeamId}`;
          const isRequestedPair = (fixture: any) => {
            const homeId = fixture?.teams?.home?.id;
            const awayId = fixture?.teams?.away?.id;
            if (!homeId || !awayId) return false;
            return (
              (homeId === homeTeamId && awayId === awayTeamId) ||
              (homeId === awayTeamId && awayId === homeTeamId)
            );
          };
          const isFinishedFixture = (fixture: any) => {
            const short = String(fixture?.fixture?.status?.short || '').toUpperCase();
            const long = String(fixture?.fixture?.status?.long || '').toLowerCase();
            return short === 'FT' || short === 'AET' || short === 'PEN' || long.includes('finished');
          };
          const isFriendly = (fixture: any) => {
            const name = String(fixture?.league?.name || '').toLowerCase();
            return name.includes('friendly') || name.includes('friendlies') || name.includes('pre-season') || name.includes('preseason');
          };
          const toH2H = (fixture: any): HeadToHeadMatch => ({
            id: fixture.fixture.id,
            home: fixture.teams.home.name,
            away: fixture.teams.away.name,
            score: `${fixture.goals.home}-${fixture.goals.away}`,
            date: fixture.fixture.date,
            league: fixture.league.name,
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo,
          });
          const pickLatest = (fixtures: any[]): any | null => {
            if (!fixtures?.length) return null;
            const valid = fixtures
              .filter((f) => isRequestedPair(f) && isFinishedFixture(f))
              .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime());
            // Prefer competitive matches; only fall back to friendlies if nothing else exists
            return valid.find((f) => !isFriendly(f)) ?? valid[0] ?? null;
          };

          // Fast path.
          const dataPrimary = await this.fetchCached<any>(
            `fixtures:h2h:${h2hPrimary}:last:1`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hPrimary}&last=1`
          );
          const primaryCandidate = dataPrimary?.response?.[0];
          if (primaryCandidate && isRequestedPair(primaryCandidate) && isFinishedFixture(primaryCandidate) && !isFriendly(primaryCandidate)) {
            return toH2H(primaryCandidate);
          }

          const dataReverse = await this.fetchCached<any>(
            `fixtures:h2h:${h2hReverse}:last:1`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hReverse}&last=1`
          );
          const reverseCandidate = dataReverse?.response?.[0];
          if (reverseCandidate && isRequestedPair(reverseCandidate) && isFinishedFixture(reverseCandidate) && !isFriendly(reverseCandidate)) {
            return toH2H(reverseCandidate);
          }

          // Fallback 1: broader h2h pull without last constraint.
          const broadPrimary = await this.fetchCached<any>(
            `fixtures:h2h:${h2hPrimary}:broad`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hPrimary}`
          );
          const broadReverse = await this.fetchCached<any>(
            `fixtures:h2h:${h2hReverse}:broad`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hReverse}`
          );
          const broadLatest = pickLatest([...(broadPrimary?.response || []), ...(broadReverse?.response || [])]);
          if (broadLatest) return toH2H(broadLatest);

          // Fallback 2: explicit historical range (for very old meetings).
          const to = new Date().toISOString().split('T')[0];
          const historicPrimary = await this.fetchCached<any>(
            `fixtures:h2h:${h2hPrimary}:historic`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hPrimary}&from=1990-01-01&to=${to}`
          );
          const historicReverse = await this.fetchCached<any>(
            `fixtures:h2h:${h2hReverse}:historic`,
            RECENT_RESULTS_TTL_MS,
            `/fixtures/headtohead?h2h=${h2hReverse}&from=1990-01-01&to=${to}`
          );
          const historicLatest = pickLatest([...(historicPrimary?.response || []), ...(historicReverse?.response || [])]);
          if (historicLatest) return toH2H(historicLatest);

          return null;
        } catch (error) {
          console.error('Error fetching head-to-head last meeting:', error);
          return null;
        }
      }
    );
  }

  /**
   * NEW: Get league's recent matches (last N days)
   */
  async getLeagueRecentMatches(leagueId: number, days: number = 6): Promise<FinishedMatch[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];
    
    return getOrFetchCached<FinishedMatch[]>(`league:recent:${leagueId}:${from}:${to}`, RECENT_RESULTS_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:league:${leagueId}:from:${from}:to:${to}:status:FT`, RECENT_RESULTS_TTL_MS, `/fixtures?league=${leagueId}&from=${from}&to=${to}&status=FT`);
        
        if (data?.response) {
          return data.response.map((f: any) => ({
            id: f.fixture.id,
            home: f.teams.home.name,
            away: f.teams.away.name,
            score: `${f.goals.home}-${f.goals.away}`,
            homeGoals: f.goals.home,
            awayGoals: f.goals.away,
            league: f.league.name,
            date: f.fixture.date,
            homeLogo: f.teams.home.logo,
            awayLogo: f.teams.away.logo
          }));
        }
      } catch (error) {
        console.error('Error fetching league recent matches:', error);
      }
      
      return [];
    });
  }

  /**
   * NEW: Get league's upcoming matches
   */
  async getLeagueUpcomingMatches(leagueId: number, limit: number = 10): Promise<Match[]> {
    return getOrFetchCached<Match[]>(`league:upcoming:${leagueId}:${limit}`, UPCOMING_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:league:${leagueId}:next:${limit}`, UPCOMING_TTL_MS, `/fixtures?league=${leagueId}&next=${limit}`);
        
        if (data?.response) {
          return this.formatMatches(data.response, 'upcoming');
        }
      } catch (error) {
        console.error('Error fetching league upcoming matches:', error);
      }
      
      return [];
    });
  }

  /**
   * Sort matches by league importance
   */
  private sortByImportance(matches: Match[]): Match[] {
    const leagueRanking: { [key: string]: number } = {
      'UEFA Champions League': 1,
      'Premier League': 2,
      'La Liga': 3,
      'Serie A': 4,
      'Bundesliga': 5,
      'Ligue 1': 6,
      'UEFA Europa League': 7,
      'Conference League': 8,
      'MLS': 9,
      'Major League Soccer': 9,
      'Liga MX': 10,
      'Primeira Liga': 11,
      'CONCACAF Champions League': 13,
      'FA Cup': 14,
      'Copa del Rey': 16,
      'FIFA World Cup': 0,
      'UEFA European Championship': 0,
    };

    return matches.sort((a, b) => {
      const rankA = leagueRanking[formatCompetitionLabel(a.league)] ?? leagueRanking[a.league] ?? 99;
      const rankB = leagueRanking[formatCompetitionLabel(b.league)] ?? leagueRanking[b.league] ?? 99;
      return rankA - rankB;
    });
  }

  async getMatchLineup(matchId: number): Promise<{ home: Lineup; away: Lineup }> {
    return getOrFetchCached<{ home: Lineup; away: Lineup }>(`fixture:lineups:${matchId}`, MATCH_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:lineups:${matchId}`, MATCH_DETAIL_TTL_MS, `/fixtures/lineups?fixture=${matchId}`);
        
        if (data?.response && data.response.length >= 2) {
          return this.formatLineups(data.response);
        }
      } catch (error) {
        console.error('Error fetching lineup:', error);
      }
      
      return __DEV__ ? this.getMockLineup() : this.getEmptyLineup();
    });
  }

  async getMatchEvents(matchId: number): Promise<MatchEvent[]> {
    return getOrFetchCached<MatchEvent[]>(`fixture:events:${matchId}`, MATCH_DETAIL_TTL_MS, async () => {
      try {
        const data = await this.fetchCached<any>(`fixtures:events:${matchId}`, MATCH_DETAIL_TTL_MS, `/fixtures/events?fixture=${matchId}`);
        
        if (data?.response && data.response.length > 0) {
          return this.formatEvents(data.response);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      }
      
      return __DEV__ ? this.getMockEvents() : [];
    });
  }

  private formatMatches(fixtures: any[], status: Match['status']): Match[] {
    return fixtures.map((f) => {
      const homeGoals = f?.goals?.home ?? null;
      const awayGoals = f?.goals?.away ?? null;
      const homeTeam = f?.teams?.home ?? {};
      const awayTeam = f?.teams?.away ?? {};
      const fixtureMeta = f?.fixture ?? {};
      const league = f?.league ?? {};
      const fallbackHomeLogo = homeTeam?.id ? `https://media.api-sports.io/football/teams/${homeTeam.id}.png` : undefined;
      const fallbackAwayLogo = awayTeam?.id ? `https://media.api-sports.io/football/teams/${awayTeam.id}.png` : undefined;
      
      return {
        id: fixtureMeta.id,
        home: homeTeam.name || 'Home',
        away: awayTeam.name || 'Away',
        homeShortName: homeTeam.short_name || homeTeam.shortName,
        awayShortName: awayTeam.short_name || awayTeam.shortName,
        homeCode: homeTeam.code,
        awayCode: awayTeam.code,
        homeLogo: homeTeam.logo || fallbackHomeLogo,
        awayLogo: awayTeam.logo || fallbackAwayLogo,
        homeId: homeTeam.id,  // NEW: for communities
        awayId: awayTeam.id,  // NEW: for communities
        leagueId: league.id,    // NEW: for communities
        venueName: fixtureMeta?.venue?.name,
        venueCity: fixtureMeta?.venue?.city,
        score: homeGoals !== null ? `${homeGoals}-${awayGoals}` : undefined,
        league: league.name || 'League',
        status,
        minute: fixtureMeta?.status?.elapsed ? `${fixtureMeta.status.elapsed}'` : undefined,
        date: fixtureMeta.date,
        time: status === 'upcoming' && fixtureMeta.date ? new Date(fixtureMeta.date).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }) : undefined,
        // Active users derived from RTDB presence; do not hardcode here.
      };
    });
  }

  private formatLineups(data: any[]): { home: Lineup; away: Lineup } {
    const home = data[0];
    const away = data[1];

    return {
      home: {
        team: home.team.name,
        formation: home.formation,
        startXI: home.startXI.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        })),
        substitutes: home.substitutes.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        }))
      },
      away: {
        team: away.team.name,
        formation: away.formation,
        startXI: away.startXI.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        })),
        substitutes: away.substitutes.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        }))
      }
    };
  }

  private formatEvents(events: any[]): MatchEvent[] {
    return events.map(e => ({
      time: `${e.time.elapsed}'`,
      type: e.type.toLowerCase() === 'goal' ? 'goal' : 
            e.type.toLowerCase() === 'card' ? 'card' : 'substitution',
      player: e.player.name,
      team: e.team.name,
      detail: e.detail
    }));
  }

  private getMockUpcomingMatches(): Match[] {
    const now = Date.now();
    return [
      { 
        id: 9, 
        home: 'Arsenal', 
        away: 'Chelsea', 
        league: 'Premier League', 
        status: 'upcoming', 
        time: '3:00 PM', 
        date: new Date(now + 7200000).toISOString()
      },
      { 
        id: 10, 
        home: 'Real Madrid', 
        away: 'Barcelona', 
        league: 'La Liga', 
        status: 'upcoming', 
        time: '5:30 PM', 
        date: new Date(now + 10800000).toISOString()
      },
      { 
        id: 11, 
        home: 'Bayern Munich', 
        away: 'Borussia Dortmund', 
        league: 'Bundesliga', 
        status: 'upcoming', 
        time: '8:00 PM', 
        date: new Date(now + 14400000).toISOString()
      },
      { 
        id: 12, 
        home: 'Liverpool', 
        away: 'Manchester United', 
        league: 'Premier League', 
        status: 'upcoming', 
        time: '2:00 PM', 
        date: new Date(now + 18000000).toISOString()
      },
    ];
  }

  private getMockLineup(): { home: Lineup; away: Lineup } {
    return {
      home: {
        team: 'Home Team',
        formation: '4-3-3',
        startXI: [
          { name: 'Goalkeeper', number: 1, position: 'GK' },
          { name: 'Right Back', number: 2, position: 'RB' },
          { name: 'Center Back', number: 4, position: 'CB' },
          { name: 'Center Back', number: 5, position: 'CB' },
          { name: 'Left Back', number: 3, position: 'LB' },
          { name: 'Midfielder', number: 6, position: 'CM' },
          { name: 'Midfielder', number: 8, position: 'CM' },
          { name: 'Midfielder', number: 10, position: 'CM' },
          { name: 'Right Wing', number: 7, position: 'RW' },
          { name: 'Striker', number: 9, position: 'ST' },
          { name: 'Left Wing', number: 11, position: 'LW' }
        ],
        substitutes: [
          { name: 'Backup GK', number: 13, position: 'GK' },
          { name: 'Defender', number: 15, position: 'DF' },
          { name: 'Midfielder', number: 16, position: 'MF' }
        ]
      },
      away: {
        team: 'Away Team',
        formation: '4-3-3',
        startXI: [
          { name: 'Goalkeeper', number: 1, position: 'GK' },
          { name: 'Right Back', number: 2, position: 'RB' },
          { name: 'Center Back', number: 4, position: 'CB' },
          { name: 'Center Back', number: 5, position: 'CB' },
          { name: 'Left Back', number: 3, position: 'LB' },
          { name: 'Midfielder', number: 6, position: 'CM' },
          { name: 'Midfielder', number: 8, position: 'CM' },
          { name: 'Midfielder', number: 10, position: 'CM' },
          { name: 'Right Wing', number: 7, position: 'RW' },
          { name: 'Striker', number: 9, position: 'ST' },
          { name: 'Left Wing', number: 11, position: 'LW' }
        ],
        substitutes: [
          { name: 'Backup GK', number: 13, position: 'GK' },
          { name: 'Defender', number: 15, position: 'DF' }
        ]
      }
    };
  }

  private getEmptyLineup(): { home: Lineup; away: Lineup } {
    return {
      home: { team: '', formation: '', startXI: [], substitutes: [] },
      away: { team: '', formation: '', startXI: [], substitutes: [] },
    };
  }

  private getMockEvents(): MatchEvent[] {
    return [
      { time: "23'", type: 'goal', player: 'Forward', team: 'Home Team' },
      { time: "45'", type: 'card', player: 'Midfielder', team: 'Away Team', detail: 'Yellow Card' },
      { time: "67'", type: 'goal', player: 'Striker', team: 'Away Team' }
    ];
  }
}

export const footballAPI = new FootballAPI();
