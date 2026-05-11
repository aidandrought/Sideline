// services/newsApi.ts
// Soccer/Football News API with Source Filtering
// Only US, UK, Spanish, French outlets - No Indian sources

import { API_CONFIG } from '../constants/config';
import { getCompetitionSearchTerms, NEWS_DISCOVERY_QUERIES } from '../constants/footballCompetitions';
import { NEWS_BLOCKLIST } from '../constants/newsFilterConfig';
import { analyticsService } from './analyticsService';
import { monitoringService } from './monitoringService';
import { readNewsCache, writeNewsCache } from './newsFirestoreCache';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  imageUrl?: string;
  source: string;
  author?: string;
  publishedAt: string;
  url: string;
  category: string;
  tags?: string[];
}

export type NewsDateRange = 'all' | '24h' | '3d' | '7d' | '30d';

export interface BrowseNewsParams {
  query?: string;
  league?: string;
  dateRange?: NewsDateRange;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export type NewsDiagnostics = {
  reason: 'missing_config' | 'http_error' | 'rate_limited' | 'provider_unavailable' | 'empty_response';
  message: string;
  status?: number;
  url?: string;
};

// In-memory cache to fix "Article not found" bug
let cachedArticles: NewsArticle[] = [];
const responseCache = new Map<string, { expiresAt: number; data: any }>();
const inFlight = new Map<string, Promise<any>>();
const TOP_NEWS_TTL_MS = 24 * 60 * 60 * 1000;
const MATCH_TTL_MS = 24 * 60 * 60 * 1000;
const MATCH_SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const PROVIDER_COOLDOWN_MS = 30 * 60 * 1000;
let cooldownUntil = 0;
let providerUnsupportedUntil = 0;
let lastNewsDiagnostics: NewsDiagnostics | null = null;

export class RateLimitError extends Error {
  retryAfter?: number;
  constructor(retryAfter?: number) {
    super('NewsAPI rate limited');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class NewsProviderUnavailableError extends Error {
  constructor(message = 'News provider unavailable for current API plan') {
    super(message);
    this.name = 'NewsProviderUnavailableError';
  }
}

const getRetryAfterSeconds = (response: Response): number | undefined => {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(1, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
};

const isAbortError = (error: unknown) => {
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || error || '').toLowerCase();
  return name === 'AbortError' || message === 'aborted' || message.includes('abort');
};

const getCachedResponse = (cacheKey: string) => {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  const isStale = Date.now() > entry.expiresAt;
  return { data: entry.data, isStale };
};

const setCachedResponse = (cacheKey: string, data: any, ttlMs: number) => {
  responseCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
};

const sanitizeUrlForLogs = (url?: string) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('api_token')) {
      parsed.searchParams.set('api_token', '[redacted]');
    }
    return parsed.toString();
  } catch {
    return url.replace(/api_token=[^&]+/gi, 'api_token=[redacted]');
  }
};

const normalizeQueryVariant = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(latest)(\s+\1)+\b/g, '$1')
    .replace(/\b(match news)(\s+\1)+\b/g, '$1')
    .replace(/\b(football)(\s+\1)+\b/g, '$1')
    .replace(/\b(soccer)(\s+\1)+\b/g, '$1')
    .replace(/\b(transfer injury lineup)(\s+\1)+\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeQueryVariants = (values: string[], limit: number) =>
  Array.from(new Set(values.map((value) => normalizeQueryVariant(value)).filter(Boolean))).slice(0, limit);

const setNewsDiagnostics = (diagnostics: NewsDiagnostics | null) => {
  lastNewsDiagnostics = diagnostics;
};

const getDefaultNewsMessage = () => lastNewsDiagnostics?.message || 'News is unavailable right now. Pull to refresh and try again.';

const logNewsRequest = (cacheKey: string, url: string) => {
  if (__DEV__) {
    if (__DEV__) console.log(`[news] request ${cacheKey}: ${sanitizeUrlForLogs(url)}`);
  }
};

const logNewsResponseFailure = (cacheKey: string, status: number, url: string) => {
  const sanitizedUrl = sanitizeUrlForLogs(url);
  console.warn(`[news] non-200 ${status} for ${cacheKey}: ${sanitizedUrl}`);
  monitoringService.warn('news_api_http_error', {
    cacheKey,
    status,
    url: sanitizedUrl,
  });
};

const enforceCooldown = () => {
  if (Date.now() < providerUnsupportedUntil) {
    throw new NewsProviderUnavailableError();
  }
  if (Date.now() < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    throw new RateLimitError(remaining);
  }
};

const fetchWithTimeout = async (url: string, signal?: AbortSignal, timeoutMs: number = 12000) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  }

  timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
};

const buildDirectProviderUrl = (params: {
  q: string;
  language?: string;
  sortBy?: string;
  pageSize?: number;
  page?: number;
  from?: string;
}) => {
  const apiToken = API_CONFIG.NEWS_API_KEY.trim();
  if (!apiToken) return '';

  const sortBy = params.sortBy === 'relevancy' ? 'relevance_score' : 'published_at';
  const pageSize = Math.max(1, Math.min(25, params.pageSize ?? 20));
  const page = Math.max(1, Math.min(100, params.page ?? 1));
  const search = new URLSearchParams({
    search: params.q,
    language: params.language || 'en',
    categories: 'sports',
    sort: sortBy,
    limit: String(pageSize),
    page: String(page),
    api_token: apiToken,
  });

  if (params.from) {
    search.set('published_after', params.from);
  }

  return `https://api.thenewsapi.com/v1/news/all?${search.toString()}`;
};

const fetchJsonWithCache = async (cacheKey: string, ttlMs: number, url: string, signal?: AbortSignal) => {
  const cached = getCachedResponse(cacheKey);
  if (cached && !cached.isStale) return { data: cached.data, isStale: false };
  if (cached && cached.isStale && Date.now() < cooldownUntil) {
    return { data: cached.data, isStale: true };
  }
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  if (!url) {
    const diagnostics = {
      reason: 'missing_config' as const,
      message: 'News API is not configured for this build.',
    };
    setNewsDiagnostics(diagnostics);
    if (__DEV__) {
      console.warn('[news] Missing EXPO_PUBLIC_NEWS_API_KEY; direct news requests are disabled.');
    }
    if (cached) {
      return { data: cached.data, isStale: true };
    }
    throw new NewsProviderUnavailableError(diagnostics.message);
  }

  enforceCooldown();

  const promise = (async () => {
    try {
      logNewsRequest(cacheKey, url);
      const response = await fetchWithTimeout(url, signal, 12000);
      if (response.status === 429) {
        analyticsService.track('news_rate_limited', { cacheKey });
        const retryAfter = getRetryAfterSeconds(response) ?? 60;
        cooldownUntil = Date.now() + retryAfter * 1000;
        setNewsDiagnostics({
          reason: 'rate_limited',
          message: 'News API is temporarily rate-limited. Showing cached stories when available.',
          status: response.status,
          url: sanitizeUrlForLogs(url),
        });
        if (cached && cached.isStale) {
          return { data: cached.data, isStale: true };
        }
        throw new RateLimitError(retryAfter);
      }
      if (response.status === 426) {
        providerUnsupportedUntil = Date.now() + PROVIDER_COOLDOWN_MS;
        analyticsService.track('news_provider_unsupported', { cacheKey, status: response.status });
        setNewsDiagnostics({
          reason: 'provider_unavailable',
          message: 'This news provider plan is unavailable for the current request.',
          status: response.status,
          url: sanitizeUrlForLogs(url),
        });
        if (cached) {
          return { data: cached.data, isStale: true };
        }
        throw new NewsProviderUnavailableError();
      }
      if (!response.ok) {
        setNewsDiagnostics({
          reason: 'http_error',
          message: `News request failed with status ${response.status}.`,
          status: response.status,
          url: sanitizeUrlForLogs(url),
        });
        logNewsResponseFailure(cacheKey, response.status, url);
        if (cached && cached.isStale) {
          return { data: cached.data, isStale: true };
        }
        throw new Error(`News API error ${response.status}`);
      }
      const data = await response.json();
      setNewsDiagnostics(null);
      if (ttlMs > 0) {
        setCachedResponse(cacheKey, data, ttlMs);
      }
      return { data, isStale: false };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (!(error instanceof RateLimitError) && !(error instanceof NewsProviderUnavailableError)) {
        monitoringService.warn('news_api_fetch_failed', {
          cacheKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (cached && cached.isStale) {
        return { data: cached.data, isStale: true };
      }
      throw error;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
};

const fetchNewsEverything = async (
  cacheKey: string,
  ttlMs: number,
  params: {
    q: string;
    language?: string;
    sortBy?: string;
    pageSize?: number;
    page?: number;
    from?: string;
  },
  signal?: AbortSignal
) => {
  const directUrl = buildDirectProviderUrl(params);
  return fetchJsonWithCache(cacheKey, ttlMs, directUrl, signal);
};

type ProviderArticle = {
  uuid?: string;
  title?: string;
  description?: string;
  snippet?: string;
  keywords?: string | string[];
  url?: string;
  image_url?: string;
  language?: string;
  published_at?: string;
  source?: string;
  categories?: string[];
  relevance_score?: number | null;
};

type ProviderResponse = {
  meta?: {
    found?: number;
    returned?: number;
    limit?: number;
    page?: number;
  };
  data?: ProviderArticle[];
  _sharedCache?: boolean;
};

class NewsAPI {
  // ALLOWED sources (US, UK, Spanish, French, major European)
  private allowedSources = [
    // US
    'ESPN', 'ESPN FC', 'espn.com', 'espn.co.uk', 'Fox Sports', 'foxsports.com', 'Yahoo Sports', 'Bleacher Report', 'CBS Sports', 'cbssports.com',
    'NBC Sports', 'nbcsports.com', 'The Athletic', 'theathletic.com', 'Sports Illustrated',
    // UK
    'BBC Sport', 'BBC', 'bbc.com', 'bbc.co.uk', 'BBC News', 'Sky Sports', 'skysports.com', 'The Guardian', 'theguardian.com', 'The Telegraph',
    'Daily Mail', 'Mirror', 'The Sun', 'Express', 'The Independent', 'independent.co.uk',
    'Evening Standard', 'Football London', 'Goal.com', 'goal.com', '90min', 'FourFourTwo', '101greatgoals.com',
    // Spanish
    'Marca', 'marca.com', 'AS', 'Mundo Deportivo', 'mundodeportivo.com', 'Sport', 'Diario AS', 'as.com',
    // French
    "L'Equipe", "L'Ã‰quipe", 'lequipe.fr', 'France Football', 'francefootball.fr', 'RMC Sport',
    // Italian (major)
    'Gazzetta dello Sport', 'gazzetta.it',
    // German (major)
    'Kicker', 'kicker.de', 'Bild', 'bild.de',
    // General football
    'UEFA', 'uefa.com', 'FIFA', 'fifa.com', 'Transfermarkt', 'transfermarkt.com', 'WhoScored', 'whoscored.com',
    'OneFootball', 'onefootball.com', 'Major League Soccer', 'MLSsoccer.com', 'mlssoccer.com',
    'The Analyst', 'theanalyst.com', 'Reuters', 'reuters.com', 'Associated Press', 'apnews.com',
  ];

  // BLOCKED sources (Indian outlets and others)
  private blockedSources = [
    'Times of India', 'Hindustan Times', 'NDTV', 'India Today', 
    'Indian Express', 'Sportskeeda', 'Firstpost', 'Deccan Herald',
    'Economic Times', 'Zee News', 'News18', 'Republic', 'WION',
    'DNA India', 'One India', 'Cricket Country', 'Cricbuzz', 
    'ESPNcricinfo', 'Mid-Day', 'Rediff', 'Scroll.in', 'The Quint',
    'The Print', 'Outlook India', 'Business Standard India',
    'Slashdot', 'Slashdot.org',
  ];

  private blockedDomains = [...NEWS_BLOCKLIST.domains];

  // Keywords to exclude (other sports)
  private excludedKeywords = [
    'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'super bowl', 'quarterback', 
    'touchdown', 'basketball', 'baseball', 'hockey', 'american football',
    'los angeles rams', 'rams football', 'nfc', 'afc', 'wide receiver', 'running back',
    'linebacker', 'tight end', 'field goal', 'end zone', 'kickoff return',
    'cricket', 'ipl', 'bcci', 'virat kohli', 'sachin', 'dhoni',
    'kabaddi', 'badminton', 'tennis', 'golf', 'f1', 'formula 1', 'college football',
    'olympic', 'olympics', 'winter olympics', 'stanley cup', 'nhl draft',
    'nba finals', 'nfl draft', 'march madness', 'ncaa basketball',
    'ufc', 'mma', 'boxing', 'wrestling', 'nascar', 'motorsport',
    'rugby', 'afl', 'aussie rules', 'lacrosse', 'field hockey',
    'darts', 'pdc', 'dartboard',
    "women's", 'womens', 'women soccer', 'women football', 'female football',
    'women super league', 'wsl', 'barclays wsl', 'nwsl', 'uwcl',
    'women champions league', 'frauen-bundesliga', 'liga f', 'division 1 feminine',
    'nadeshiko', 'lionesses', 'matildas women'
  ];

  // Soccer keywords to include
  private soccerKeywords = [
    'soccer', 'premier league', 'la liga', 'serie a',
    'bundesliga', 'ligue 1', 'champions league', 'europa league', 'world cup',
    'mls', 'major league soccer', 'liga mx',
    'primeira liga', 'liga portugal', 'portuguese league', 'leagues cup', 'concacaf champions league',
    'concacaf champions cup', 'liga bbva mx', 'apertura', 'clausura', 'campeones cup',
    'euros', 'euro 2024', 'euro 2025', 'euro 2026', 'fifa', 'uefa', 'messi', 'ronaldo', 'haaland', 'mbappe',
    'salah', 'real madrid', 'barcelona', 'manchester', 'liverpool',
    'chelsea', 'arsenal', 'bayern', 'psg', 'juventus',
    'inter miami', 'club america', 'monterrey', 'tigres', 'lafc',
    'sporting cp', 'benfica', 'porto',
    'striker', 'midfielder', 'goalkeeper', 'transfer', 'fa cup',
    'copa del rey', 'coppa italia', 'dfb pokal', 'dfb-pokal', 'coupe de france',
    'epl', 'ucl', 'el clasico', 'loan', 'matchday', 'football club',
    // International tournaments
    'copa america', 'gold cup', 'nations league', 'concacaf',
    'afcon', 'africa cup', 'african cup', 'caf', 'cup of nations',
    'asian cup', 'afc champions', 'afc asian',
    'libertadores', 'copa libertadores', 'sudamericana',
    'eredivisie', 'scottish premiership', 'super lig', 'a-league',
    'qualifier', 'qualification', 'world cup qualifier',
    'international break', 'international fixture', 'friendly',
    'klop', 'guardiola', 'mourinho', 'ancelotti', 'arteta',
  ];

  private footballContextKeywords = [
    'soccer', 'uefa', 'fifa', 'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1',
    'champions league', 'europa league', 'fa cup', 'ucl', 'epl', 'football club',
    'mls', 'major league soccer', 'liga mx',
    'primeira liga', 'liga portugal', 'portuguese league', 'leagues cup', 'concacaf champions league',
    'concacaf champions cup', 'liga bbva mx', 'apertura', 'clausura', 'campeones cup',
    'striker', 'midfielder', 'goalkeeper', 'manager', 'transfer window',
  ];

  private normalizeSearchText(query: string): string {
    return query.replace(/\s+/g, ' ').trim();
  }

  private toRecentDate(daysBack: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return date.toISOString().slice(0, 10);
  }

  private getDefaultPublishedAfter(): string {
    return this.toRecentDate(7);
  }

  private getProviderArticles(payload: ProviderResponse | undefined): ProviderArticle[] {
    return payload?.data || [];
  }

  private getProviderTotalResults(payload: ProviderResponse | undefined): number {
    return payload?.meta?.found || 0;
  }

  private normalizeSourceValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private tokenizeSearchQuery(query: string): string[] {
    return this.normalizeSearchText(query)
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[^a-z0-9]/g, ''))
      .filter((term) => term.length >= 2);
  }

  private buildSearchQueries(query: string): string[] {
    const normalized = this.normalizeSearchText(query);
    if (!normalized) return ['soccer football'];

    const tokens = this.tokenizeSearchQuery(normalized);
    const hasCompetitionTerm = tokens.some((term) => ['premier', 'league', 'champions', 'europa', 'laliga', 'serie', 'bundesliga', 'ligue', 'world', 'cup', 'euros', 'uefa', 'fifa', 'mls', 'liga', 'mx', 'primeira', 'portuguese', 'j1', 'leagues', 'concacaf'].includes(term));
    const base = normalized;
    const competitionTerms = getCompetitionSearchTerms(base).slice(0, 4);

    return dedupeQueryVariants([
      `${base} football`,
      `${base} soccer`,
      hasCompetitionTerm ? `${base} match news` : `${base} football news`,
      ...competitionTerms,
    ], 4);
  }

  private getFromDate(dateRange: NewsDateRange): string | undefined {
    if (dateRange === 'all') return this.getDefaultPublishedAfter();
    const now = new Date();
    const map: Record<Exclude<NewsDateRange, 'all'>, number> = {
      '24h': 1,
      '3d': 3,
      '7d': 7,
      '30d': 30,
    };
    now.setDate(now.getDate() - map[dateRange]);
    return now.toISOString().slice(0, 10);
  }

  private normalizeLeagueFilter(league?: string): string {
    const value = (league || '').trim();
    if (!value || value.toLowerCase() === 'all') return '';
    return value.replace(/^UEFA\s+/i, '');
  }

  private buildBrowseQueries(query: string, league?: string): string[] {
    const normalizedQuery = this.normalizeSearchText(query);
    const normalizedLeague = this.normalizeLeagueFilter(league);
    if (!normalizedQuery) {
      if (normalizedLeague) {
        return dedupeQueryVariants([
          ...getCompetitionSearchTerms(normalizedLeague).slice(0, 4),
          `${normalizedLeague} football`,
          `${normalizedLeague} soccer`,
          `${normalizedLeague} match news`,
        ], 4);
      }
      return NEWS_DISCOVERY_QUERIES;
    }

    const scoped = normalizedLeague ? `${normalizedQuery} ${normalizedLeague}` : normalizedQuery;
    return dedupeQueryVariants([
      `${scoped} football`,
      `${scoped} soccer`,
      `${scoped} match news`,
      ...getCompetitionSearchTerms(normalizedLeague || normalizedQuery).slice(0, 2),
    ], 4);
  }

  private scoreSearchArticle(article: NewsArticle, query: string): number {
    const terms = this.tokenizeSearchQuery(query);
    const title = (article.title || '').toLowerCase();
    const description = (article.description || '').toLowerCase();
    const content = (article.content || '').toLowerCase();
    const text = `${title} ${description} ${content}`;

    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 6;
      if (description.includes(term)) score += 3;
      if (content.includes(term)) score += 2;
      if (article.tags?.some((tag) => tag.toLowerCase().includes(term))) score += 2;
    }

    const normalizedQuery = this.normalizeSearchText(query).toLowerCase();
    if (normalizedQuery && title.includes(normalizedQuery)) score += 8;
    if (normalizedQuery && text.includes(normalizedQuery)) score += 4;

    const ageHours = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 3600000);
    score += Math.max(0, 24 - ageHours) * 0.05;
    return score;
  }

  private filterCachedSearchResults(query: string): NewsArticle[] {
    const terms = this.tokenizeSearchQuery(query);
    const normalizedQuery = this.normalizeSearchText(query).toLowerCase();

    const filtered = cachedArticles.filter((article) => {
      const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
      if (normalizedQuery && text.includes(normalizedQuery)) return true;
      if (terms.length === 0) return false;
      return terms.every((term) => text.includes(term)) || terms.some((term) => article.title.toLowerCase().includes(term));
    });

    return this.removeDuplicates(filtered).sort((a, b) => this.scoreSearchArticle(b, query) - this.scoreSearchArticle(a, query));
  }

  private filterCachedBrowseResults(query: string, league?: string, dateRange: NewsDateRange = 'all'): NewsArticle[] {
    const normalizedLeague = this.normalizeLeagueFilter(league).toLowerCase();
    const fromDate = this.getFromDate(dateRange);
    const base = query
      ? this.filterCachedSearchResults(query)
      : this.removeDuplicates(cachedArticles);

    return base.filter((article) => {
      const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
      if (normalizedLeague && !text.includes(normalizedLeague)) return false;
      if (fromDate && new Date(article.publishedAt).getTime() < new Date(fromDate).getTime()) return false;
      return true;
    });
  }

  private async searchNewsLoose({
    query,
    page = 1,
    pageSize = 20,
    signal,
  }: {
    query: string;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  }): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    this.sanitizeCachedArticles();
    const normalized = this.normalizeSearchText(query);
    const queries = this.buildSearchQueries(normalized);
    const upstreamPageSize = Math.max(pageSize, 25);
    const finalCacheKey = `search:final:${normalized.toLowerCase()}:${page}:${pageSize}`;

    const firestoreCached = await readNewsCache(finalCacheKey);
    if (firestoreCached) {
      const sliced = firestoreCached.slice(0, pageSize);
      if (sliced.length > 0) {
        cachedArticles = this.removeDuplicates([...sliced, ...cachedArticles]).slice(0, 120);
      }
      return { articles: sliced, totalResults: sliced.length >= pageSize ? page * pageSize + 1 : sliced.length, isStale: false };
    }

    try {
      const settled = await Promise.all(
        queries.map(async (variant, index) => {
          const cacheKey = `search-loose:${variant.toLowerCase()}:${page}:${upstreamPageSize}`;
          return fetchNewsEverything(cacheKey, SEARCH_TTL_MS, {
            q: variant,
            language: 'en',
            sortBy: index === 0 ? 'relevancy' : 'publishedAt',
            pageSize: upstreamPageSize,
            page,
            from: this.toRecentDate(14),
          }, signal);
        })
      );

      const rawArticles = settled.flatMap((result) => this.getProviderArticles(result.data as ProviderResponse));
      const isStale = settled.some((result) => result.isStale);
      const sourceFiltered = this.filterBySources(rawArticles);
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.removeDuplicates(this.formatArticles(soccerFiltered))
        .sort((a, b) => this.scoreSearchArticle(b, normalized) - this.scoreSearchArticle(a, normalized));

      const sliced = formatted.slice(0, pageSize);
      if (sliced.length > 0) {
        cachedArticles = this.removeDuplicates([...sliced, ...cachedArticles]).slice(0, 120);
        writeNewsCache(finalCacheKey, sliced);
      }

      const totalResults = formatted.length >= pageSize ? page * pageSize + 1 : formatted.length;
      return { articles: sliced, totalResults, isStale };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        const fallback = this.filterCachedSearchResults(normalized).slice(0, pageSize);
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      console.error('Error searching news:', error);
      throw error;
    }
  }

  private buildArticleText(article: { title?: string; description?: string; content?: string }): string {
    return `${article.title || ''} ${article.description || ''} ${article.content || ''}`.toLowerCase();
  }

  private normalizeTitleForDedup(title: string): string {
    return title
      .toLowerCase()
      .replace(/\s*\|\s*[^|]+$/g, '')
      .replace(/\s*-\s*[^-]+$/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(transfer|report|live|updates|update|latest|analysis|preview)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private diversifyBySource(articles: NewsArticle[]): NewsArticle[] {
    const arranged = [...articles];
    for (let i = 1; i < arranged.length; i += 1) {
      if (arranged[i].source !== arranged[i - 1].source) continue;
      const swapIndex = arranged.findIndex((candidate, index) => index > i && candidate.source !== arranged[i - 1].source);
      if (swapIndex === -1) continue;
      const [candidate] = arranged.splice(swapIndex, 1);
      arranged.splice(i, 0, candidate);
    }
    return arranged;
  }

  /**
   * Check if source is allowed
   */
  private isSourceAllowed(source: string): boolean {
    const sourceLower = source.toLowerCase();
    const normalizedSource = this.normalizeSourceValue(source);
    
    // Check if blocked first
    if ([...this.blockedSources, ...NEWS_BLOCKLIST.sources].some(blocked => 
      sourceLower.includes(blocked.toLowerCase())
    )) {
      return false;
    }
    
    // Check if in allowed list
    return this.allowedSources.some(allowed => 
      normalizedSource.includes(this.normalizeSourceValue(allowed)) ||
      this.normalizeSourceValue(allowed).includes(normalizedSource)
    );
  }

  private isBlockedArticle(article: any): boolean {
    const sourceName = String(article?.source?.name || article?.source || '').toLowerCase();
    const url = String(article?.url || '').toLowerCase();
    const imageUrl = this.getNormalizedImageUrl(article).toLowerCase();

    if ([...this.blockedSources, ...NEWS_BLOCKLIST.sources].some((blocked) => sourceName.includes(blocked.toLowerCase()))) {
      return true;
    }

    return this.blockedDomains.some((domain) => url.includes(domain) || imageUrl.includes(domain));
  }

  private isMockArticle(article: any): boolean {
    const id = String(article?.id || article?.uuid || '').toLowerCase();
    const url = String(article?.url || '').toLowerCase();
    return id.startsWith('mock_') || url.includes('fallback=');
  }

  private getNormalizedImageUrl(article: any): string {
    const candidates = [
      article?.urlToImage,
      article?.imageUrl,
      article?.image_url,
      article?.image,
      article?.thumbnail,
      article?.thumbnail_url,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (!/^https?:\/\//i.test(value)) continue;
      return value;
    }

    return '';
  }

  /**
   * Filter for soccer content only
   */
  private filterSoccerOnly(articles: any[]): any[] {
    return articles.filter(article => {
      const text = this.buildArticleText(article);
      
      // Exclude non-soccer sports
      const hasExcluded = this.excludedKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      if (hasExcluded) return false;

      // Must have soccer keywords
      const hasSoccer = this.soccerKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
      if (hasSoccer) return true;

      // Handle UK-style "football" headlines without letting NFL through.
      if (text.includes('football')) {
        return this.footballContextKeywords.some(keyword => text.includes(keyword));
      }

      return false;
    });
  }

  /**
   * Filter by allowed sources
   */
  private filterBySources(articles: any[]): any[] {
    const unblocked = articles.filter(article => {
      if (this.isBlockedArticle(article)) return false;
      const sourceName = String(article?.source?.name || article?.source || '');
      if (!sourceName) return false;
      return true;
    });

    if (unblocked.length === 0) {
      return [];
    }

    const allowed = unblocked.filter((article) => {
      const sourceName = String(article?.source?.name || article?.source || '');
      return this.isSourceAllowed(sourceName);
    });

    if (allowed.length >= Math.min(6, unblocked.length)) {
      return allowed;
    }

    return unblocked;
  }

  /**
   * Extract tags from article content
   */
  private extractTags(article: any): string[] {
    const tags: string[] = [];
    const text = `${article.title} ${article.description || ''} ${article.keywords || ''}`.toLowerCase();
    
    // Add category
    tags.push('news');
    
    // Check for team mentions
    const teams = [
      'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Man City',
      'Manchester United', 'Man United', 'Tottenham', 'Newcastle',
      'Real Madrid', 'Barcelona', 'Bayern Munich', 'PSG', 'Juventus',
      'Inter Milan', 'AC Milan', 'Dortmund', 'Atletico Madrid',
      'Crystal Palace', 'West Ham', 'Aston Villa', 'Brighton',
      'Everton', 'Wolves', 'Brentford', 'Fulham', 'Bournemouth',
    ];
    
    teams.forEach(team => {
      if (text.includes(team.toLowerCase()) && tags.length < 5) {
        tags.push(team);
      }
    });
    
    return tags;
  }

  /**
   * Determine article category
   */
  private determineCategory(article: any): string {
    const text = this.buildArticleText(article);
    
    if (text.includes('transfer') || text.includes('signs') || text.includes('deal')) {
      return 'Transfers';
    }
    if (text.includes('analysis') || text.includes('tactical')) {
      return 'Tactics and Analysis';
    }
    if (text.includes('injury') || text.includes('injured') || text.includes('out for')) {
      return 'Team News';
    }
    if (text.includes('preview') || text.includes('predicted')) {
      return 'Match Preview';
    }
    if (text.includes('result') || text.includes('beats') || text.includes('defeats')) {
      return 'Match Report';
    }
    if (text.includes('award') || text.includes('winner') || text.includes('best')) {
      return 'Awards';
    }
    return 'Features';
  }

  /**
   * Format articles with all required fields
   */
  private formatArticles(articles: any[]): NewsArticle[] {
    return articles
      .filter(a => a.title && a.title !== '[Removed]' && a.url && !this.isBlockedArticle(a) && !this.isMockArticle(a))
      .map((a) => ({
        id: a.uuid || `article_${(a.url || a.title).toLowerCase()}`,
        title: a.title,
        description: a.description || '',
        content: a.snippet || a.content || a.description || '',
        imageUrl: this.getNormalizedImageUrl(a) || undefined,
        source: a.source?.name || a.source || 'Unknown',
        author: a.author || 'Staff Writer',
        publishedAt: a.publishedAt || a.published_at || new Date().toISOString(),
        url: a.url,
        category: this.determineCategory(a),
        tags: this.extractTags(a),
      }));
  }

  /**
   * Remove duplicate articles
   */
  private removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const deduped = articles.filter(article => {
      if (this.isBlockedArticle(article) || this.isMockArticle(article)) return false;
      const urlKey = article.url.toLowerCase();
      if (seenUrls.has(urlKey)) return false;
      seenUrls.add(urlKey);
      const titleKey = this.normalizeTitleForDedup(article.title);
      if (titleKey && seenTitles.has(titleKey)) return false;
      if (titleKey) seenTitles.add(titleKey);
      return true;
    });
    return this.diversifyBySource(deduped);
  }

  private sanitizeCachedArticles() {
    if (cachedArticles.length === 0) return;
    cachedArticles = cachedArticles.filter((article) => !this.isBlockedArticle(article) && !this.isMockArticle(article));
  }

  sanitizeArticles<T extends { title?: string; description?: string; content?: string; url?: string; source?: string; imageUrl?: string }>(articles: T[]): T[] {
    return articles.filter((article) => {
      if (!article?.title || !article?.url) return false;
      if (this.isBlockedArticle(article) || this.isMockArticle(article)) return false;
      const text = this.buildArticleText(article);
      const hasExcluded = this.excludedKeywords.some((keyword) => text.includes(keyword));
      if (hasExcluded) return false;
      const hasSoccerKeyword = this.soccerKeywords.some((keyword) => text.includes(keyword));
      if (hasSoccerKeyword) return true;
      if (text.includes('football')) {
        return this.footballContextKeywords.some((keyword) => text.includes(keyword));
      }
      return false;
    });
  }

  /**
   * Get soccer news with source filtering
   */
  async getSoccerNews(): Promise<NewsArticle[]> {
    this.sanitizeCachedArticles();
    try {
      enforceCooldown();
      const queries = NEWS_DISCOVERY_QUERIES;

      const allArticles: any[] = [];

      for (const query of queries) {
        try {
          const cacheKey = `soccer:${query.toLowerCase()}`;
          const { data } = await fetchNewsEverything(cacheKey, TOP_NEWS_TTL_MS, {
            q: query,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: 15,
            page: 1,
            from: this.getDefaultPublishedAfter(),
          });
          allArticles.push(...this.getProviderArticles(data as ProviderResponse));
        } catch (err) {
          if (err instanceof RateLimitError) {
            throw err;
          }
          if (__DEV__) {
            if (__DEV__) console.log('Query failed, continuing...');
          }
        }
      }

      if (allArticles.length > 0) {
        const sourceFiltered = this.filterBySources(allArticles);
        const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
        const formatted = this.formatArticles(soccerFiltered);
        const unique = this.removeDuplicates(formatted);

        cachedArticles = unique.slice(0, 50);
        if (cachedArticles.length === 0) {
          setNewsDiagnostics({
            reason: 'empty_response',
            message: 'No football news was returned by the provider for the current filters.',
          });
        }
        return cachedArticles;
      }
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        if (cachedArticles.length > 0) {
          return cachedArticles;
        }
        return [];
      }
      if (__DEV__) {
        if (__DEV__) console.log('No soccer news available from provider');
      }
    }

    cachedArticles = [];
    return cachedArticles;
  }
  /**
   * Get article by ID - uses cache to fix "Article not found" bug
   */
  async getArticleById(id: string): Promise<NewsArticle | null> {
    this.sanitizeCachedArticles();
    // First check cache
    const cached = cachedArticles.find(a => a.id === id);
    if (cached) return cached;
    
    // If not in cache, reload and try again
    await this.getSoccerNews();
    return cachedArticles.find(a => a.id === id) || null;
  }

  /**
   * Search news
   */
  async searchNews(query: string, pageSize: number = 20, page: number = 1, signal?: AbortSignal): Promise<NewsArticle[]> {
    try {
      const result = await this.searchNewsLoose({ query, page, pageSize, signal });
      return result.articles;
    } catch (error) {
      if (isAbortError(error)) {
        return [];
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        return this.filterCachedSearchResults(query).slice(0, pageSize);
      }
      console.error('Error searching news:', error);
    }

    return this.filterCachedSearchResults(query).slice(0, pageSize);
  }

  /**
   * Get paged soccer news for infinite scroll
   */
  async getSoccerNewsPage(page: number = 1, pageSize: number = 20, signal?: AbortSignal): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    this.sanitizeCachedArticles();
    if (page === 1 && cachedArticles.length > 0) {
      const instant = cachedArticles.slice(0, pageSize);
      return { articles: instant, totalResults: Math.max(instant.length, cachedArticles.length), isStale: true };
    }
    try {
      const query = NEWS_DISCOVERY_QUERIES.join(' ');
      const cacheKey = `top-page:${page}:${pageSize}`;
      const { data, isStale } = await fetchNewsEverything(cacheKey, TOP_NEWS_TTL_MS, {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize,
        page,
        from: this.getDefaultPublishedAfter(),
      }, signal);
      const sourceFiltered = this.filterBySources(this.getProviderArticles(data as ProviderResponse));
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.formatArticles(soccerFiltered);
      const unique = this.removeDuplicates(formatted);
      if (unique.length > 0) {
        cachedArticles = this.removeDuplicates([...unique, ...cachedArticles]).slice(0, 80);
      } else {
        setNewsDiagnostics({
          reason: 'empty_response',
          message: 'No football news was returned by the provider for the current feed.',
        });
      }
      return { articles: unique, totalResults: this.getProviderTotalResults(data as ProviderResponse) || unique.length, isStale };
    } catch (error) {
      if (isAbortError(error)) {
        const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      console.error('Error fetching paged news:', error);
      const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
      return { articles: fallback, totalResults: fallback.length, isStale: true };
    }
  }

  /**
   * Search news with pagination metadata (page + pageSize)
   */
  async searchNewsPage(query: string, pageSize: number = 20, page: number = 1, signal?: AbortSignal): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    return this.searchNewsLoose({ query, page, pageSize, signal });
  }
  /**
   * Get top news with pagination metadata
   */
  async getTopNews({ page = 1, pageSize = 20, signal }: { page?: number; pageSize?: number; signal?: AbortSignal }): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    this.sanitizeCachedArticles();
    if (page === 1 && cachedArticles.length > 0) {
      const instant = cachedArticles.slice(0, pageSize);
      return { articles: instant, totalResults: Math.max(instant.length, cachedArticles.length), isStale: true };
    }
    try {
      const cacheKey = `top:${page}:${pageSize}`;
      const { data, isStale } = await fetchNewsEverything(cacheKey, TOP_NEWS_TTL_MS, {
        q: NEWS_DISCOVERY_QUERIES.join(' '),
        language: 'en',
        sortBy: 'publishedAt',
        pageSize,
        page,
        from: this.getDefaultPublishedAfter(),
      }, signal);
      const sourceFiltered = this.filterBySources(this.getProviderArticles(data as ProviderResponse));
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.formatArticles(soccerFiltered);
      const unique = this.removeDuplicates(formatted);
      if (unique.length > 0) {
        cachedArticles = this.removeDuplicates([...unique, ...cachedArticles]).slice(0, 80);
      } else {
        setNewsDiagnostics({
          reason: 'empty_response',
          message: 'No football news was returned by the provider for the current feed.',
        });
      }
      return { articles: unique, totalResults: this.getProviderTotalResults(data as ProviderResponse) || unique.length, isStale };
    } catch (error) {
      if (isAbortError(error)) {
        const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      console.error('Error fetching top news:', error);
      const fallback = cachedArticles.length > 0 ? cachedArticles.slice(0, pageSize) : [];
      return { articles: fallback, totalResults: fallback.length, isStale: true };
    }
  }

  /**
   * Search news with pagination metadata
   */
  async searchNewsQuery({ q, page = 1, pageSize = 20, signal }: { q: string; page?: number; pageSize?: number; signal?: AbortSignal }): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    return this.searchNewsLoose({ query: q, page, pageSize, signal });
  }

  async browseNews({
    query = '',
    league = 'All',
    dateRange = 'all',
    page = 1,
    pageSize = 25,
    signal,
  }: BrowseNewsParams): Promise<{ articles: NewsArticle[]; totalResults: number; isStale?: boolean }> {
    this.sanitizeCachedArticles();
    const normalizedQuery = this.normalizeSearchText(query);
    const normalizedLeague = this.normalizeLeagueFilter(league);
    const queries = this.buildBrowseQueries(normalizedQuery, normalizedLeague);
    const fromDate = this.getFromDate(dateRange);
    const upstreamPageSize = Math.max(pageSize, 25);

    try {
      const settled = await Promise.all(
        queries.map(async (variant, index) => {
          const cacheKey = `browse:${variant.toLowerCase()}:${dateRange}:${page}:${upstreamPageSize}`;
          return fetchNewsEverything(cacheKey, SEARCH_TTL_MS, {
            q: variant,
            language: 'en',
            sortBy: index === 0 ? 'publishedAt' : 'relevancy',
            pageSize: upstreamPageSize,
            page,
            from: fromDate,
          }, signal);
        })
      );

      const rawArticles = settled.flatMap((result) => this.getProviderArticles(result.data as ProviderResponse));
      const isStale = settled.some((result) => result.isStale);
      const sourceFiltered = this.filterBySources(rawArticles);
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      let formatted = this.removeDuplicates(this.formatArticles(soccerFiltered));

      if (normalizedLeague) {
        formatted = formatted.filter((article) => {
          const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
          return text.includes(normalizedLeague.toLowerCase());
        });
      }

      const scoreBasis = normalizedQuery || normalizedLeague;
      if (scoreBasis) {
        formatted = formatted.sort((a, b) => this.scoreSearchArticle(b, scoreBasis) - this.scoreSearchArticle(a, scoreBasis));
      } else {
        formatted = formatted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      }

      const sliced = formatted.slice(0, pageSize);
      if (sliced.length > 0) {
        cachedArticles = this.removeDuplicates([...sliced, ...cachedArticles]).slice(0, 140);
      } else {
        setNewsDiagnostics({
          reason: 'empty_response',
          message: 'No football news was returned by the provider for the current search.',
        });
      }

      const totalResults = formatted.length >= pageSize ? page * pageSize + 1 : formatted.length;
      return { articles: sliced, totalResults, isStale };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        const fallback = this.filterCachedBrowseResults(normalizedQuery, normalizedLeague, dateRange).slice(0, pageSize);
        return { articles: fallback, totalResults: fallback.length, isStale: true };
      }
      console.error('Error browsing news:', error);
      throw error;
    }
  }

  /**
   * Match news search with local filtering (no OR query)
   */
  async searchMatchNews({
    teamA,
    teamB,
    limit,
    page = 1,
    pageSize = 20
  }: {
    teamA: string;
    teamB: string;
    limit: number;
    page?: number;
    pageSize?: number;
  }): Promise<NewsArticle[]> {
    const normalizedA = teamA.trim();
    const normalizedB = teamB.trim();
    const cacheKey = `news:match:${normalizedA.toLowerCase()}:${normalizedB.toLowerCase()}:page:${page}`;
    const cached = getCachedResponse(cacheKey);
    if (cached && !cached.isStale) return cached.data as NewsArticle[];
    if (cached && cached.isStale && Date.now() < cooldownUntil) return cached.data as NewsArticle[];
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey) as Promise<NewsArticle[]>;

    const request = (async () => {
      const effectivePageSize = Math.max(pageSize, limit);
      const fetchPage = (pageToFetch: number) =>
        Promise.all([
          this.searchNewsQuery({ q: `${normalizedA} football`, page: pageToFetch, pageSize: effectivePageSize }),
          this.searchNewsQuery({ q: `${normalizedB} football`, page: pageToFetch, pageSize: effectivePageSize })
        ]);

      const [teamAResult, teamBResult] = await fetchPage(page);
      let merged = [...(teamAResult.articles || []), ...(teamBResult.articles || [])];
      const dedupedMap = new Map<string, NewsArticle>();
      merged.forEach(article => {
        const key = (article.url || `${article.title}-${article.publishedAt}`).toLowerCase();
        if (!dedupedMap.has(key)) {
          dedupedMap.set(key, article);
        }
      });

      const combinedTextIncludesTeam = (article: NewsArticle) => {
        const text = `${article.title} ${article.description}`.toLowerCase();
        return text.includes(normalizedA.toLowerCase()) || text.includes(normalizedB.toLowerCase());
      };

      let filtered = Array.from(dedupedMap.values()).filter(combinedTextIncludesTeam);
      if (filtered.length < limit) {
        const [teamAResultNext, teamBResultNext] = await fetchPage(page + 1);
        merged = [...merged, ...(teamAResultNext.articles || []), ...(teamBResultNext.articles || [])];
        const nextMap = new Map<string, NewsArticle>();
        merged.forEach(article => {
          const key = (article.url || `${article.title}-${article.publishedAt}`).toLowerCase();
          if (!nextMap.has(key)) {
            nextMap.set(key, article);
          }
        });
        filtered = Array.from(nextMap.values()).filter(combinedTextIncludesTeam);
      }
      const sorted = filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      const finalResults = sorted.slice(0, limit);
      setCachedResponse(cacheKey, finalResults, MATCH_SEARCH_TTL_MS);
      return finalResults;
    })();

    inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  /**
   * Match-specific news search (merged queries)
   */
    /**
   * Match-specific news search (combined query + fallback)
   */
  async matchNews({ teamA, teamB, competition, pageSize = 10 }: { teamA: string; teamB: string; competition?: string; pageSize?: number }): Promise<{ articles: NewsArticle[]; isStale?: boolean }> {
    const competitionTerms = getCompetitionSearchTerms(competition).slice(0, 3);
    const primaryCompetitionTerm = competitionTerms[0] || competition || '';
    const normalizedCompetition = competition ? competition.toLowerCase() : "";
    const resultKey = `match:final:${teamA.toLowerCase()}:${teamB.toLowerCase()}:${normalizedCompetition}`;

    // 1. In-memory cache (fastest — same device)
    const cachedResult = getCachedResponse(resultKey);
    if (cachedResult && !cachedResult.isStale) {
      return { articles: cachedResult.data, isStale: false };
    }
    if (cachedResult && cachedResult.isStale && Date.now() < cooldownUntil) {
      return { articles: cachedResult.data, isStale: true };
    }

    // 2. Shared Firestore cache (cross-device — another user already fetched this)
    const firestoreCached = await readNewsCache(resultKey);
    if (firestoreCached) {
      setCachedResponse(resultKey, firestoreCached, MATCH_TTL_MS);
      return { articles: firestoreCached.slice(0, pageSize), isStale: false };
    }

    const combinedQuery = [teamA, teamB, ...competitionTerms, 'football preview injury lineup transfer news']
      .filter(Boolean)
      .join(' ');
    const rawKey = `match:raw:${teamA.toLowerCase()}:${teamB.toLowerCase()}:${normalizedCompetition}`;
    try {
      const { data, isStale } = await fetchNewsEverything(rawKey, MATCH_TTL_MS, {
        q: combinedQuery,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 25,
        page: 1,
        from: this.toRecentDate(14),
      });
      const sourceFiltered = this.filterBySources(this.getProviderArticles(data as ProviderResponse));
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.removeDuplicates(this.formatArticles(soccerFiltered));
      const teamTerms = [teamA, teamB].map((term) => term.toLowerCase()).filter(Boolean);
      const competitionTextTerms = competitionTerms.map((term) => term.toLowerCase()).filter(Boolean);
      // Require at least one team name to appear — competition alone is not enough.
      // This prevents generic "Premier League latest" articles slipping through when
      // neither team is mentioned.
      const isRelevantMatchArticle = (article: NewsArticle) => {
        const text = this.buildArticleText(article);
        return teamTerms.some((term) => text.includes(term));
      };

      let combined = formatted.filter(isRelevantMatchArticle);
      if (combined.length < pageSize && !isStale) {
        try {
          const fallbackQueries = [
            [teamA, primaryCompetitionTerm, 'football preview injury lineup'].filter(Boolean).join(' '),
            [teamB, primaryCompetitionTerm, 'football preview injury lineup'].filter(Boolean).join(' '),
            ...competitionTerms.map((term) => `${term} football latest`),
          ].filter(Boolean);
          const settled = await Promise.all(
            fallbackQueries.map((query) => this.searchNewsQuery({ q: query, pageSize: 20, page: 1 }))
          );
          const fallback = settled.flatMap((result) => result.articles || []);
          combined = [...combined, ...fallback];
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
            // Skip fallback when rate-limited
          } else {
            console.error("Error fetching match fallback news:", error);
          }
        }
      }

      const deduped = this.removeDuplicates(combined).filter(isRelevantMatchArticle);

      const sorted = deduped.sort((a, b) => {
        const scoreA = this.scoreSearchArticle(a, `${teamA} ${teamB} ${primaryCompetitionTerm}`.trim());
        const scoreB = this.scoreSearchArticle(b, `${teamA} ${teamB} ${primaryCompetitionTerm}`.trim());
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

      const finalResults = sorted.slice(0, pageSize);
      setCachedResponse(resultKey, finalResults, MATCH_TTL_MS);
      // Persist to Firestore so other users get instant results
      writeNewsCache(resultKey, finalResults);
      return { articles: finalResults, isStale };
    } catch (error) {
      if (isAbortError(error)) {
        if (cachedResult) {
          return { articles: cachedResult.data, isStale: true };
        }
        return { articles: [], isStale: true };
      }
      if (error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        if (cachedResult) {
          return { articles: cachedResult.data, isStale: true };
        }
        return { articles: [], isStale: true };
      }
      console.error("Error fetching match news:", error);
      if (cachedResult) {
        return { articles: cachedResult.data, isStale: true };
      }
      return { articles: [], isStale: false };
    }
  }
  /**
   * Team-specific news — mirrors matchNews pipeline (single targeted query + fallback).
   * Replaces the old searchNewsQuery approach in teamCommunity which skipped source/soccer filtering.
   */
  /**
   * Returns multiple ways an article might reference a team.
   * e.g. "Manchester City" → ["manchester city", "man city", "manchester"]
   */
  private buildTeamNameVariants(teamName: string): string[] {
    const lower = teamName.toLowerCase().trim();
    const variants = new Set<string>([lower]);

    // Split name into individual words
    const words = lower.split(/[\s\-\/&]+/).filter((w) => w.length > 0);

    // Words too generic to use alone — would match unrelated articles
    const GENERIC = new Set([
      'fc', 'sc', 'ac', 'as', 'cf', 'af', 'bsc', 'rb', 'vfb',
      'city', 'united', 'town', 'rovers', 'wanderers', 'albion',
      'county', 'hotspur', 'wednesday', 'saint', 'saints',
      'vale', 'park', 'olympic', 'hove',
    ]);

    // Add significant individual words (≥5 chars, not generic)
    words.filter((w) => w.length >= 5 && !GENERIC.has(w)).forEach((w) => variants.add(w));

    // Known abbreviations and common alt names
    const ABBRS: Record<string, string[]> = {
      'manchester united': ['man united', 'man utd'],
      'manchester city':   ['man city'],
      'paris saint-germain': ['psg', 'paris sg'],
      'borussia dortmund': ['bvb', 'dortmund'],
      'atletico madrid':   ['atletico'],
      'tottenham hotspur': ['tottenham', 'spurs'],
      'wolverhampton wanderers': ['wolves', 'wolverhampton'],
      'west ham united':   ['west ham'],
      'crystal palace':    ['palace'],
      'newcastle united':  ['newcastle'],
      'nottingham forest': ['nottingham', 'forest'],
      'brighton & hove albion': ['brighton'],
      'inter milan':       ['inter', 'internazionale'],
      'ac milan':          ['milan'],
      'as roma':           ['roma'],
      'bayer leverkusen':  ['leverkusen'],
      'rb leipzig':        ['leipzig'],
      'ajax amsterdam':    ['ajax'],
      'sporting cp':       ['sporting', 'sporting lisbon'],
      'celtic fc':         ['celtic'],
      'rangers fc':        ['rangers'],
      'red bull salzburg': ['salzburg', 'rb salzburg'],
      'al-hilal':          ['hilal', 'al hilal'],
      'al-nassr':          ['nassr', 'al nassr'],
    };

    (ABBRS[lower] || []).forEach((a) => variants.add(a));
    return Array.from(variants);
  }

  async teamNews({
    teamName,
    leagueContext,
    pageSize = 10,
  }: {
    teamName: string;
    leagueContext?: string;
    pageSize?: number;
  }): Promise<{ articles: NewsArticle[]; isStale?: boolean }> {
    const normalized = teamName.toLowerCase();
    const cacheKey = `team:news:final:${normalized}:${(leagueContext || '').toLowerCase()}`;

    // 1. In-memory cache
    const cachedResult = getCachedResponse(cacheKey);
    if (cachedResult && !cachedResult.isStale) return { articles: cachedResult.data, isStale: false };
    if (cachedResult && cachedResult.isStale && Date.now() < cooldownUntil) return { articles: cachedResult.data, isStale: true };

    // 2. Shared Firestore cache
    const firestoreCached = await readNewsCache(cacheKey);
    if (firestoreCached) {
      setCachedResponse(cacheKey, firestoreCached, MATCH_TTL_MS);
      return { articles: firestoreCached.slice(0, pageSize), isStale: false };
    }

    const contextTerms = leagueContext ? getCompetitionSearchTerms(leagueContext).slice(0, 2) : [];
    const primaryQuery = [teamName, ...contextTerms, 'football transfer injury form latest']
      .filter(Boolean).join(' ');
    const rawKey = `team:news:raw:${normalized}`;

    try {
      const { data, isStale } = await fetchNewsEverything(rawKey, MATCH_TTL_MS, {
        q: primaryQuery,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 25,
        page: 1,
        from: this.toRecentDate(14),
      });
      const sourceFiltered = this.filterBySources(this.getProviderArticles(data as ProviderResponse));
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.removeDuplicates(this.formatArticles(soccerFiltered));

      // Match using name variants so "Man City" / "Man Utd" etc. are caught
      const nameVariants = this.buildTeamNameVariants(teamName);
      let relevant = formatted.filter((a) => {
        const t = `${a.title} ${a.description}`.toLowerCase();
        return nameVariants.some((v) => t.includes(v));
      });

      // Widen to full article text if title/description didn't match
      if (relevant.length < 3) {
        const fromContent = formatted.filter((a) => {
          if (relevant.includes(a)) return false;
          const text = this.buildArticleText(a);
          return nameVariants.some((v) => text.includes(v));
        });
        relevant = this.removeDuplicates([...relevant, ...fromContent]);
      }

      // Fallback: widen to include league context if too few results
      if (relevant.length < 3 && !isStale) {
        try {
          const fallbackQuery = contextTerms.length > 0
            ? `${teamName} ${contextTerms[0]} football news`
            : `${teamName} football news latest`;
          const fallback = await this.searchNewsQuery({ q: fallbackQuery, pageSize: 20, page: 1 });
          const extra = (fallback.articles || []).filter((a) => {
            const t = `${a.title} ${a.description}`.toLowerCase();
            return nameVariants.some((v) => t.includes(v));
          });
          relevant = this.removeDuplicates([...relevant, ...extra]);
        } catch { /* ignore fallback errors */ }
      }

      // Last resort: try a broader direct query with just team name
      if (relevant.length < 2 && !isStale) {
        try {
          const broadKey = `team:news:broad:${normalized}`;
          const { data: broadData } = await fetchNewsEverything(broadKey, MATCH_TTL_MS, {
            q: `${teamName} football`,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: 25,
            page: 1,
            from: this.toRecentDate(30),
          });
          const broadFormatted = this.removeDuplicates(
            this.formatArticles(this.filterSoccerOnly(this.filterBySources(this.getProviderArticles(broadData as ProviderResponse))))
          ).filter((a) => {
            const text = this.buildArticleText(a);
            return nameVariants.some((v) => text.includes(v));
          });
          relevant = this.removeDuplicates([...relevant, ...broadFormatted]);
        } catch { /* ignore */ }
      }

      const sorted = relevant.sort((a, b) => {
        const scoreA = this.scoreSearchArticle(a, teamName);
        const scoreB = this.scoreSearchArticle(b, teamName);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

      const result = sorted.slice(0, pageSize);
      setCachedResponse(cacheKey, result, MATCH_TTL_MS);
      writeNewsCache(cacheKey, result);
      return { articles: result, isStale };
    } catch (error) {
      if (cachedResult) return { articles: cachedResult.data, isStale: true };
      if (isAbortError(error) || error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        return { articles: [], isStale: true };
      }
      return { articles: [], isStale: false };
    }
  }

  /**
   * League-specific news — single focused query, scored, filtered.
   * Replaces the old approach of 14 parallel searchNewsQuery calls in leagueCommunity.
   */
  async leagueNews({
    leagueName,
    pageSize = 12,
  }: {
    leagueName: string;
    pageSize?: number;
  }): Promise<{ articles: NewsArticle[]; isStale?: boolean }> {
    const normalized = leagueName.toLowerCase();
    const cacheKey = `league:news:final:${normalized}`;
    const cachedResult = getCachedResponse(cacheKey);
    if (cachedResult && !cachedResult.isStale) return { articles: cachedResult.data, isStale: false };
    if (cachedResult && cachedResult.isStale && Date.now() < cooldownUntil) return { articles: cachedResult.data, isStale: true };

    // Shared Firestore cache
    const firestoreCached = await readNewsCache(cacheKey);
    if (firestoreCached) {
      setCachedResponse(cacheKey, firestoreCached, MATCH_TTL_MS);
      return { articles: firestoreCached.slice(0, pageSize), isStale: false };
    }

    const competitionTerms = getCompetitionSearchTerms(leagueName);
    const primaryTerm = competitionTerms[0] || leagueName;
    const primaryQuery = `${primaryTerm} football news transfer results standings`;
    const rawKey = `league:news:raw:${normalized}`;

    try {
      const { data, isStale } = await fetchNewsEverything(rawKey, MATCH_TTL_MS, {
        q: primaryQuery,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 30,
        page: 1,
        from: this.toRecentDate(7),
      });
      const sourceFiltered = this.filterBySources(this.getProviderArticles(data as ProviderResponse));
      const soccerFiltered = this.filterSoccerOnly(sourceFiltered);
      const formatted = this.removeDuplicates(this.formatArticles(soccerFiltered));

      // Must mention the league's primary term (or any short alias) in title or description
      const checkTerms = competitionTerms.slice(0, 3).map((t) => t.toLowerCase());
      let relevant = formatted.filter((a) => {
        const t = `${a.title} ${a.description}`.toLowerCase();
        return checkTerms.some((term) => t.includes(term));
      });

      // Widen to 14 days if too few
      if (relevant.length < 4 && !isStale) {
        try {
          const { data: wideData } = await fetchNewsEverything(`${rawKey}:wide`, MATCH_TTL_MS, {
            q: primaryQuery,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: 30,
            page: 1,
            from: this.toRecentDate(14),
          });
          const wideFormatted = this.removeDuplicates(
            this.formatArticles(this.filterSoccerOnly(this.filterBySources(this.getProviderArticles(wideData as ProviderResponse))))
          ).filter((a) => {
            const t = `${a.title} ${a.description}`.toLowerCase();
            return checkTerms.some((term) => t.includes(term));
          });
          relevant = this.removeDuplicates([...relevant, ...wideFormatted]);
        } catch { /* ignore */ }
      }

      const sorted = relevant.sort((a, b) => {
        const scoreA = this.scoreSearchArticle(a, primaryTerm);
        const scoreB = this.scoreSearchArticle(b, primaryTerm);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

      const result = sorted.slice(0, pageSize);
      setCachedResponse(cacheKey, result, MATCH_TTL_MS);
      writeNewsCache(cacheKey, result);
      return { articles: result, isStale };
    } catch (error) {
      if (cachedResult) return { articles: cachedResult.data, isStale: true };
      if (isAbortError(error) || error instanceof RateLimitError || error instanceof NewsProviderUnavailableError) {
        return { articles: [], isStale: true };
      }
      return { articles: [], isStale: false };
    }
  }

  getDiagnostics(): NewsDiagnostics | null {
    return lastNewsDiagnostics;
  }

  getFallbackMessage(): string {
    return getDefaultNewsMessage();
  }

}

export const newsAPI = new NewsAPI();
