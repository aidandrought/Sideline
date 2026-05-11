import { Community, communityService } from './communityService';
import { getCachedValueAsync, withTimeout } from './cacheService';
import { FeedSelections } from './feedPreferences';
import { footballAPI, Match } from './footballApi';
import { isLikelyFinishedFromLive } from './matchPhase';
import {
  getCachedHomeExploreNewsAllocation,
  getHomeExploreNewsAllocation,
  NewsAllocation,
} from './newsAllocationService';

export interface PrefetchedAppData {
  communities: Community[];
  liveMatches: Match[];
  upcomingMatches: Match[];
  resultsMatches: Match[];
  newsAllocation: NewsAllocation;
  completedAt: number;
  userId?: string;
}

const EMPTY_NEWS_ALLOCATION: NewsAllocation = {
  all: [],
  home: [],
  explore: [],
};
const PREFETCH_TIMEOUT_MS = {
  communities: 8000,
  liveMatches: 12000,
  upcomingMatches: 12000,
  resultsMatches: 28000,
  news: 10000,
} as const;

let prefetchedAppData: PrefetchedAppData | null = null;
const screenWarmAt = new Map<string, number>();
const SCREEN_WARM_TTL_MS = 45 * 1000;
let bootRefreshInFlight: Promise<PrefetchedAppData> | null = null;

const ensurePrefetchedAppData = (): PrefetchedAppData => {
  if (prefetchedAppData) return prefetchedAppData;
  prefetchedAppData = {
    communities: [],
    liveMatches: [],
    upcomingMatches: [],
    resultsMatches: [],
    newsAllocation: EMPTY_NEWS_ALLOCATION,
    completedAt: Date.now(),
  };
  return prefetchedAppData;
};

const loadCachedBootData = async () => {
  const [communities, liveMatches, upcomingMatches, resultsMatches, newsAllocation] = await Promise.all([
    communityService.getCachedAllCommunitiesAsync().then((snapshot) => snapshot?.data ?? []),
    getCachedValueAsync<Match[]>('matches:live:v2', 12 * 60 * 60 * 1000).then((value) => value ?? []),
    getCachedValueAsync<Match[]>('matches:upcoming:7d:v14', 12 * 60 * 60 * 1000).then((value) => value ?? []),
    (async () => {
      const today = new Date().toISOString().split('T')[0];
      const dateKey = `matches:finished:date:14d:${today}:v2`;
      const fresh = await getCachedValueAsync<Match[]>(dateKey, 12 * 60 * 60 * 1000);
      if (fresh && fresh.length > 0) return fresh;
      // Fallback to previous day's key (covers midnight boundary)
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const prevKey = `matches:finished:date:14d:${yesterday}:v2`;
      return (await getCachedValueAsync<Match[]>(prevKey, 36 * 60 * 60 * 1000)) ?? [];
    })(),
    getCachedHomeExploreNewsAllocation().then((value) => value ?? EMPTY_NEWS_ALLOCATION),
  ]);

  return {
    communities,
    liveMatches,
    upcomingMatches,
    resultsMatches,
    newsAllocation,
  };
};

const getFinishedFromLive = (liveMatches: Match[], activeLiveIds?: Set<string>) => {
  const now = new Date();
  return liveMatches.filter((match) => isLikelyFinishedFromLive(match, now, activeLiveIds));
};

const mergeRecentResults = (resultsMatches: Match[], liveMatches: Match[], activeLiveIds?: Set<string>) =>
  Array.from(
    new Map([...resultsMatches, ...getFinishedFromLive(liveMatches, activeLiveIds)].map((match) => [match.id, match])).values()
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const hasUsableBootData = (data: {
  communities: Community[];
  liveMatches: Match[];
  upcomingMatches: Match[];
  resultsMatches: Match[];
  newsAllocation: NewsAllocation;
}) =>
  data.upcomingMatches.length > 0 &&
  data.resultsMatches.length > 0 &&
  (((data.newsAllocation.home || []).length > 0) || ((data.newsAllocation.explore || []).length > 0));

const fetchFreshBootData = async (
  cached: {
    communities: Community[];
    liveMatches: Match[];
    upcomingMatches: Match[];
    resultsMatches: Match[];
    newsAllocation: NewsAllocation;
  },
  { userId, feedSelections }: { userId?: string; feedSelections?: FeedSelections } = {}
): Promise<PrefetchedAppData> => {
  const [liveMatches, upcomingMatches, resultsMatches, newsAllocation] = await Promise.all([
    withTimeout(footballAPI.getLiveMatches(), PREFETCH_TIMEOUT_MS.liveMatches).catch(() => cached.liveMatches),
    withTimeout(footballAPI.getUpcomingMatches(), PREFETCH_TIMEOUT_MS.upcomingMatches).catch(() => cached.upcomingMatches),
    withTimeout(footballAPI.getRecentFinishedFixtures(120), PREFETCH_TIMEOUT_MS.resultsMatches).catch(() => cached.resultsMatches),
    withTimeout(getHomeExploreNewsAllocation(userId, feedSelections), PREFETCH_TIMEOUT_MS.news).catch(() => cached.newsAllocation),
  ]);

  prefetchedAppData = {
    communities: cached.communities,
    liveMatches,
    upcomingMatches,
    resultsMatches: mergeRecentResults(
      resultsMatches,
      [...cached.liveMatches, ...liveMatches],
      new Set(liveMatches.map((match) => String(match.id)))
    ),
    newsAllocation,
    completedAt: Date.now(),
    userId,
  };

  return prefetchedAppData;
};

export const prefetchAppData = async (
  {
    userId,
    feedSelections,
    waitForFresh = false,
  }: { userId?: string; feedSelections?: FeedSelections; waitForFresh?: boolean } = {}
): Promise<PrefetchedAppData> => {
  const cached = await loadCachedBootData();
  if (waitForFresh) {
    if (!bootRefreshInFlight) {
      bootRefreshInFlight = fetchFreshBootData(cached, { userId, feedSelections }).finally(() => {
        bootRefreshInFlight = null;
      });
    }
    return bootRefreshInFlight;
  }
  if (hasUsableBootData(cached)) {
    prefetchedAppData = {
      ...cached,
      resultsMatches: mergeRecentResults(cached.resultsMatches, cached.liveMatches),
      completedAt: Date.now(),
      userId,
    };
    if (!bootRefreshInFlight) {
      bootRefreshInFlight = fetchFreshBootData(cached, { userId, feedSelections }).finally(() => {
        bootRefreshInFlight = null;
      });
    }
    return prefetchedAppData;
  }

  // No usable cache but waitForFresh=false: fire network fetch in background and
  // return immediately so the loading screen dismisses. Screens will show spinners
  // as data arrives rather than blocking behind a single network waterfall.
  if (!bootRefreshInFlight) {
    bootRefreshInFlight = fetchFreshBootData(cached, { userId, feedSelections }).finally(() => {
      bootRefreshInFlight = null;
    });
  }
  prefetchedAppData = {
    communities: [],
    liveMatches: [],
    upcomingMatches: [],
    resultsMatches: [],
    newsAllocation: EMPTY_NEWS_ALLOCATION,
    completedAt: Date.now(),
    userId,
  };
  return prefetchedAppData;
};

export const getPrefetchedNewsAllocation = (): NewsAllocation | null =>
  prefetchedAppData?.newsAllocation ?? null;

export const getPrefetchedAppData = (): PrefetchedAppData | null => prefetchedAppData;

export const warmScreenData = async (
  screen: 'live' | 'upcoming' | 'results' | 'news' | 'communities'
): Promise<void> => {
  const warmedAt = screenWarmAt.get(screen) ?? 0;
  if (Date.now() - warmedAt < SCREEN_WARM_TTL_MS) return;
  screenWarmAt.set(screen, Date.now());

  const current = ensurePrefetchedAppData();

  try {
    if (screen === 'live') {
      const [liveMatches, upcomingMatches] = await Promise.all([
        footballAPI.getLiveMatches(),
        footballAPI.getUpcomingMatches(),
      ]);
      prefetchedAppData = {
        ...current,
        liveMatches: liveMatches.length > 0 ? liveMatches : current.liveMatches,
        upcomingMatches: upcomingMatches.length > 0 ? upcomingMatches : current.upcomingMatches,
        completedAt: Date.now(),
      };
      return;
    }

    if (screen === 'upcoming') {
      const upcomingMatches = await footballAPI.getUpcomingMatches();
      prefetchedAppData = {
        ...current,
        upcomingMatches: upcomingMatches.length > 0 ? upcomingMatches : current.upcomingMatches,
        completedAt: Date.now(),
      };
      return;
    }

    if (screen === 'results') {
      const recent = await footballAPI.getRecentFinishedFixtures(120);
      const resultsMatches = recent.length > 0 ? recent : current.resultsMatches;
      prefetchedAppData = {
        ...current,
        resultsMatches: resultsMatches.length > 0 ? resultsMatches : current.resultsMatches,
        completedAt: Date.now(),
      };
      return;
    }

    if (screen === 'news') {
      const newsAllocation = await getHomeExploreNewsAllocation(current.userId);
      prefetchedAppData = {
        ...current,
        newsAllocation,
        completedAt: Date.now(),
      };
      return;
    }

    const communities = await communityService.getAllCommunities();
    prefetchedAppData = {
      ...current,
      communities: communities.length > 0 ? communities : current.communities,
      completedAt: Date.now(),
    };
  } catch {
    // Ignore warm-screen failures; the destination screen will still fetch normally.
  }
};
